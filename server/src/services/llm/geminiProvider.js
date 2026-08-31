// LlmProvider implementacija za Gemini API (docs/AI.md).
// Sučelje: async chat(messages, tools) -> { text, tool_calls }.
//
// Tool-calling ovdje prati službenu Gemini "Function calling" specifikaciju
// (functionDeclarations / functionCall / functionResponse), a slika ide kroz
// inlineData part (Gemini "Image understanding" spec) — NIJE ručno testirano
// uživo (nema GEMINI_API_KEY u ovom okruženju), za razliku od
// OllamaProvider-a. Preporuka: prije korištenja u evaluaciji za diplomski,
// napraviti barem jedan probni poziv sa stvarnim ključem.
//
// GEMINI_API_KEY namjerno NIJE u REQUIRED_ENV (server/src/index.js) — sustav
// mora raditi s Ollama providerom bez ijednog Gemini env parametra. Ključ se
// provjerava tek ovdje, u trenutku stvarnog poziva.

const { getSetting, SETTING_KEYS } = require('../../config/appSettings');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Kanonski JSON-schema tip (lowercase) -> Gemini Schema.type (UPPERCASE). */
function toGeminiSchema(schema) {
  if (!schema) return undefined;

  const out = { type: String(schema.type || 'string').toUpperCase() };
  if (schema.description) out.description = schema.description;

  if (schema.properties) {
    out.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      out.properties[key] = toGeminiSchema(value);
    }
  }
  if (schema.items) out.items = toGeminiSchema(schema.items);
  if (schema.required) out.required = schema.required;

  return out;
}

/** Kanonski tools (docs/AI.md) -> Geminin functionDeclarations format. */
function toGeminiTools(tools) {
  return [{
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: toGeminiSchema(t.parameters),
    })),
  }];
}

/**
 * Kanonske poruke -> Geminin `contents` format (system se šalje odvojeno
 * kao system_instruction, ne kao dio contents). Kanonski oblik (vidi
 * assistantOrchestrator.js):
 *   { role: 'assistant', content, tool_calls: [{ id, name, arguments }] }
 *   { role: 'tool', tool_call_id, name, content: '<JSON string>' }
 *   { role: 'user', content, images: [{ mimeType: 'image/png', data: '<base64>' }] }
 */
function toGeminiContents(messages) {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        return {
          role: 'model',
          parts: m.tool_calls.map((tc) => ({
            functionCall: { name: tc.name, args: tc.arguments },
          })),
        };
      }
      if (m.role === 'tool') {
        let response;
        try {
          response = JSON.parse(m.content);
        } catch {
          response = { text: m.content };
        }
        return {
          role: 'function',
          parts: [{ functionResponse: { name: m.name, response } }],
        };
      }

      const parts = [];
      if (m.content) parts.push({ text: m.content });
      if (Array.isArray(m.images) && m.images.length > 0) {
        for (const image of m.images) {
          parts.push({ inlineData: { mimeType: image.mimeType || 'image/png', data: image.data } });
        }
      }

      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts,
      };
    });
}

/** Geminin candidates[0].content.parts -> kanonski { text, tool_calls, usage }. */
function parseResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];

  const text = parts
    .filter((p) => typeof p.text === 'string')
    .map((p) => p.text)
    .join('') || null;

  const toolCallParts = parts.filter((p) => p.functionCall);
  const tool_calls = toolCallParts.length > 0
    ? toolCallParts.map((p, idx) => ({
        id: `call_${idx}`,
        name: p.functionCall.name,
        arguments: p.functionCall.args || {},
      }))
    : null;

  // usageMetadata.promptTokenCount/candidatesTokenCount (docs.generativelanguage
  // API) — koristi se za RQ1/RQ2 eval harness (docs/AI.md, evalHarness.js).
  // NIJE ručno provjereno uživo (nema aktivne kvote na GEMINI_API_KEY u ovom
  // okruženju u trenutku pisanja) — vidi napomenu na vrhu ovog file-a.
  const usage = {
    promptTokens: data?.usageMetadata?.promptTokenCount ?? null,
    completionTokens: data?.usageMetadata?.candidatesTokenCount ?? null,
  };

  return { text, tool_calls, usage };
}

async function chat(messages, tools = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY nije postavljen. Postavi ga u server/.env da bi Gemini provider radio.');
  }

  const model = await getSetting(SETTING_KEYS.GEMINI_MODEL);

  const systemText = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n');

  const body = {
    contents: toGeminiContents(messages),
    ...(systemText ? { system_instruction: { parts: [{ text: systemText }] } } : {}),
    ...(tools.length > 0 ? { tools: toGeminiTools(tools) } : {}),
  };

  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;

  // Bez ovoga zahtjev koji Google nikad ne odgovori (opaženo stvarnim testom)
  // visi neograničeno i blokira cijeli tool-calling turn.
  const REQUEST_TIMEOUT_MS = 30000;
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: abortController.signal,
    });
  } catch (networkError) {
    if (networkError.name === 'AbortError') {
      throw new Error(`Gemini API nije odgovorio u ${REQUEST_TIMEOUT_MS / 1000}s.`);
    }
    throw new Error(`Gemini API nije dostupan: ${networkError.message}`);
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Gemini API greška (${res.status}): ${errBody || res.statusText}`);
  }

  const data = await res.json();
  return parseResponse(data);
}

/**
 * Dio LlmProvider sučelja (docs/AI.md) — parnjak istoimene funkcije u
 * ollamaProvider.js. Svi Gemini modeli iz toggle-a podržavaju function
 * calling, pa je odgovor konstanta.
 */
async function getCapabilities() {
  return { model: await getSetting(SETTING_KEYS.GEMINI_MODEL), supportsTools: true };
}

module.exports = { chat, getCapabilities };
