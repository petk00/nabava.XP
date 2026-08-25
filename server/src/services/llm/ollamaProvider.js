// LlmProvider implementacija za lokalni Ollama (docs/AI.md).
// Sučelje: async chat(messages, tools) -> { text, tool_calls }.
//
// Tool-calling potvrđen ručnim probnim pozivima na Ollama 0.32.15 +
// gemma4:12b (vidi razgovor uz Fazu function-callinga) — model dosljedno
// vraća message.tool_calls s već parsiranim `arguments` objektom (ne
// stringom), i ispravno nastavlja razgovor kad mu se tool rezultat vrati
// kao poruka role: 'tool'.

const OLLAMA_MODEL = 'gemma4:12b';

// Ollamin runtime default num_ctx (obično 2048-4096) je premalen za ovaj
// slučaj — referentni kontekst (odjeli/kategorije) + tekst priložene ponude
// + gemma4:12b-ov opširan "thinking" izlaz znaju zajedno prijeći default,
// pa generacija zna stati usred rečenice (done_reason: "length") bez ijednog
// znaka konačnog odgovora. Potvrđeno stvarnim testom s mikrotron_M.pdf.
const OLLAMA_NUM_CTX = 8192;

/** Kanonski tools (docs/AI.md) -> Ollamin OpenAI-kompatibilni format. */
function toOllamaTools(tools) {
  return tools.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/**
 * Kanonske poruke -> Ollamin format. Kanonski oblik (vidi
 * assistantOrchestrator.js):
 *   { role: 'assistant', content, tool_calls: [{ id, name, arguments }] }
 *   { role: 'tool', tool_call_id, name, content: '<JSON string>' }
 *   { role: 'user', content, images: [{ mimeType, data: '<base64, bez data: prefiksa>' }] }
 */
function toOllamaMessages(messages) {
  return messages.map((m) => {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      return {
        role: 'assistant',
        content: m.content || '',
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.tool_call_id, content: m.content };
    }
    const out = { role: m.role, content: m.content };
    if (Array.isArray(m.images) && m.images.length > 0) {
      // Ollamin `images` je flat niz base64 stringova, bez mimeType-a po slici
      // (ne razlikuje JPG/PNG) — mimeType se ovdje odbacuje.
      out.images = m.images.map((img) => img.data);
    }
    return out;
  });
}

/** Ollamin message.tool_calls -> kanonski oblik [{ id, name, arguments }]. */
function normalizeToolCalls(rawToolCalls) {
  if (!Array.isArray(rawToolCalls) || rawToolCalls.length === 0) return null;

  return rawToolCalls.map((tc, idx) => {
    const fn = tc.function || {};
    let args = fn.arguments;
    if (typeof args === 'string') {
      try {
        args = JSON.parse(args);
      } catch {
        args = {};
      }
    }
    return { id: tc.id || `call_${idx}`, name: fn.name, arguments: args || {} };
  });
}

async function chat(messages, tools = []) {
  const baseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

  const body = {
    model: OLLAMA_MODEL,
    messages: toOllamaMessages(messages),
    stream: false,
    options: { num_ctx: OLLAMA_NUM_CTX },
  };
  if (tools.length > 0) {
    body.tools = toOllamaTools(tools);
  }

  let res;
  try {
    res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (networkError) {
    throw new Error(`Ollama nije dostupan na ${baseUrl}: ${networkError.message}`);
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Ollama API greška (${res.status}): ${errBody || res.statusText}`);
  }

  const data = await res.json();
  return {
    text: data?.message?.content || null,
    tool_calls: normalizeToolCalls(data?.message?.tool_calls),
  };
}

module.exports = { chat };
