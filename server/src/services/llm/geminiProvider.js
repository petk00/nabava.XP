// LlmProvider implementacija za Gemini API (docs/AI.md).
// Sučelje: async chat(messages, tools) -> { text, tool_calls }.
//
// Tool-calling ovdje prati službenu Gemini "Function calling" specifikaciju
// (functionDeclarations / functionCall / functionResponse) — NIJE ručno
// testirano uživo (nema GEMINI_API_KEY u ovom okruženju), za razliku od
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
      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      };
    });
}

/** Geminin candidates[0].content.parts -> kanonski { text, tool_calls }. */
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

  return { text, tool_calls };
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

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (networkError) {
    throw new Error(`Gemini API nije dostupan: ${networkError.message}`);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Gemini API greška (${res.status}): ${errBody || res.statusText}`);
  }

  const data = await res.json();
  return parseResponse(data);
}

module.exports = { chat };
