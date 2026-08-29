// LlmProvider implementacija za lokalni Ollama (docs/AI.md).
// Sučelje: async chat(messages, tools) -> { text, tool_calls }.
//
// Tool-calling potvrđen ručnim probnim pozivima na Ollama 0.32.15 +
// gemma4:12b (vidi razgovor uz Fazu function-callinga) — model dosljedno
// vraća message.tool_calls s već parsiranim `arguments` objektom (ne
// stringom), i ispravno nastavlja razgovor kad mu se tool rezultat vrati
// kao poruka role: 'tool'.

const http = require('node:http');
const https = require('node:https');

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

// Za razliku od geminiProvider.js (30s), ovdje je limit namjerno velikodušan:
// stvarnim eval harness testiranjem (docs/eval-runs/) potvrđeno da gemma4:12b
// uz temperature:1 zna legitimno "razmišljati" nekoliko minuta (najduže
// uspješno opaženo ~8.5 min) — kratak timeout bi prekidao stvarne, samo spore
// odgovore. 10 min je sigurnosna mreža protiv prave patologije (opažen jedan
// slučaj ~40 min bez ikakvog napretka), ne protiv normalne spore generacije.
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

// Stvarnim eval runom (docs/eval-runs/2026-08-26-ollama-5x.md) potvrđeno u
// Ollaminim vlastitim logovima: scheduler zna usred rada REloadati model pod
// memorijskim pritiskom (npr. -c 8192 -> 4096 pa natrag), prekidajući baš
// zahtjev koji je tad u tijeku — vidljivo kod nas kao mrežna greška (ne HTTP
// error status). Reload traje par sekundi do ~16s, pa JEDAN retry nakon
// kratke pauze pokriva ovaj slučaj — namjerno SAMO na brzu network-level
// grešku, ne na HTTP error status (stvaran problem, ne treba ga maskirati)
// ni na TimeoutError iz REQUEST_TIMEOUT_MS (već smo čekali 10 min, dodatni
// retry tu ne bi imao smisla).
const NETWORK_RETRY_DELAY_MS = 3000;

// NAMJERNO node:http/https umjesto fetch(): Node-ov fetch (undici) ima tvrd,
// nepromjenjiv default headersTimeout/bodyTimeout od 5 min koji se aktivira
// PRIJE gornjeg REQUEST_TIMEOUT_MS-a (10 min) i baca grešku koja izgleda kao
// "mrežni problem" (upada u NETWORK_RETRY_DELAY_MS granu ispod). Retry tad
// šalje POTPUNO nov zahtjev — Ollama otkazuje generiranje prekinutog
// zahtjeva na disconnect (Go http.Server context cancellation), pa se cijeli
// prompt (uključujući velik prilog) obrađuje iznova od nule. Stvaran
// izmjeren obrazac: 5 min (uzalud) + 3s pauza + 5 min (uzalud) = ~605s,
// UVIJEK, bez obzira koliko je REQUEST_TIMEOUT_MS postavljen — otkriveno
// dijagnostikom 2026-08-29 (docs/eval-runs/). node:http/https nema taj
// ugrađeni limit — čeka jedan neprekinut pokušaj do REQUEST_TIMEOUT_MS.
async function performChatRequest(baseUrl, body) {
  const bodyBuffer = Buffer.from(JSON.stringify(body), 'utf8');
  const url = new URL(`${baseUrl}/api/chat`);
  const transport = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': bodyBuffer.length },
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            statusText: res.statusMessage,
            text: async () => text,
            json: async () => JSON.parse(text),
          });
        });
      }
    );
    req.on('timeout', () => {
      const timeoutError = new Error('timeout');
      timeoutError.name = 'TimeoutError';
      req.destroy(timeoutError);
    });
    req.on('error', (err) => reject(err));
    req.write(bodyBuffer);
    req.end();
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
    res = await performChatRequest(baseUrl, body);
  } catch (networkError) {
    if (networkError.name === 'TimeoutError') {
      throw new Error(`Ollama nije odgovorio u ${REQUEST_TIMEOUT_MS / 60000} min.`);
    }
    console.warn(`[ollamaProvider] mrežna greška, pokušavam ponovno za ${NETWORK_RETRY_DELAY_MS}ms:`, networkError.message);
    await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_DELAY_MS));
    try {
      res = await performChatRequest(baseUrl, body);
    } catch (retryError) {
      if (retryError.name === 'TimeoutError') {
        throw new Error(`Ollama nije odgovorio u ${REQUEST_TIMEOUT_MS / 60000} min.`);
      }
      throw new Error(`Ollama nije dostupan na ${baseUrl}: ${retryError.message}`);
    }
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Ollama API greška (${res.status}): ${errBody || res.statusText}`);
  }

  const data = await res.json();
  return {
    text: data?.message?.content || null,
    tool_calls: normalizeToolCalls(data?.message?.tool_calls),
    // prompt_eval_count/eval_count su Ollamin naziv za prompt/completion
    // tokene (docs.ollama.ai/api) — koristi se za RQ1/RQ2 eval harness
    // (docs/AI.md, evalHarness.js), ne izravno u chat odgovoru korisniku.
    usage: {
      promptTokens: data?.prompt_eval_count ?? null,
      completionTokens: data?.eval_count ?? null,
    },
  };
}

module.exports = { chat };
