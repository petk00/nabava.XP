// Orkestracija AI asistenta (docs/AI.md, function-calling faza).
// Petlja: model -> eventualni tool_call -> izvršenje alata -> rezultat natrag
// modelu -> ponovi dok ne dođe čisti tekstualni odgovor ili se dosegne
// MAX_ITERATIONS. Provider-agnostično — oslanja se isključivo na kanonski
// LlmProvider oblik { text, tool_calls } koji ollamaProvider/geminiProvider
// izlažu (vidi docs/AI.md).
//
// create_request tool NIKAD ne prima userId od modela — uvijek se uzima iz
// autenticiranog req.user prosljeđenog u runAssistantChat(), tako da AI
// agent nema veća prava nego korisnik koji s njim razgovara.

const db = require('../config/db');
const { getActiveProvider } = require('./llm/providerSelector');
const { createRequest, RequestValidationError } = require('./requestService');

const MAX_ITERATIONS = 6;

const CREATE_REQUEST_TOOL = {
  name: 'create_request',
  description:
    'Kreira zahtjev za nabavu u ime prijavljenog korisnika. Pozovi TEK KADA imaš SVE obavezne ' +
    'podatke iz razgovora ili konteksta — nikad s praznim, pogađanim ili izmišljenim vrijednostima. ' +
    'Ako nešto nedostaje, postavi korisniku kratko pitanje umjesto pozivanja ovog alata.',
  parameters: {
    type: 'object',
    properties: {
      fk_fiscal_year: {
        type: 'integer',
        description: 'ID poslovne godine — koristi ID aktivne poslovne godine iz konteksta.',
      },
      fk_department: {
        type: 'integer',
        description: 'ID odjela — isključivo iz popisa odjela danog u kontekstu, nikad izmišljen.',
      },
      justification: {
        type: 'string',
        description: 'Kratko obrazloženje nabave.',
      },
      estimated_amount: {
        type: 'number',
        description: 'Procijenjeni iznos u eurima. Izostavi ako korisnik nije naveo iznos.',
      },
      comment: {
        type: 'string',
        description: 'Dodatna napomena uz zahtjev. Izostavi ako je nema.',
      },
      items: {
        type: 'array',
        description: 'Stavke zahtjeva, barem jedna.',
        items: {
          type: 'object',
          properties: {
            fk_item_category: {
              type: 'integer',
              description: 'ID kategorije artikla — isključivo iz popisa kategorija danog u kontekstu.',
            },
            item_name: { type: 'string', description: 'Naziv artikla.' },
            quantity: { type: 'integer', description: 'Količina, cijeli broj veći od 0.' },
          },
          required: ['fk_item_category', 'item_name', 'quantity'],
        },
      },
    },
    required: ['fk_fiscal_year', 'fk_department', 'justification', 'items'],
  },
};

const BASE_SYSTEM_PROMPT = `Ti si AI asistent za nabavu na Veleučilištu u Rijeci, unutar sustava nabava.XP.
Pomažeš prijavljenom korisniku kreirati zahtjev za nabavu razgovorom.

Pravila:
- Iz onoga što korisnik kaže zaključi što god možeš (npr. kategoriju artikla iz naziva), ali nikad ne
  izmišljaj odjel, kategoriju ili poslovnu godinu — koristi isključivo ID-eve iz konteksta niže.
- Ako nedostaje obavezan podatak (odjel, obrazloženje, naziv/količina stavke), postavi kratko pitanje
  korisniku umjesto da nagađaš ili pozivaš create_request s nepotpunim podacima.
- Alat create_request pozovi TEK KADA imaš sve obavezne podatke.
- Kad alat vrati grešku, objasni korisniku problem jednostavnim riječima i zatraži ispravan podatak —
  ne odustaj od razgovora.
- Kad alat uspije, potvrdi korisniku broj kreiranog zahtjeva kratkom rečenicom.
- Odgovaraj na hrvatskom jeziku.`;

async function loadReferenceContext() {
  const [fyRows] = await db.query(
    'SELECT id_fiscal_year, year FROM FiscalYear WHERE is_closed = 0 ORDER BY year DESC LIMIT 1'
  );
  const fiscalYear = fyRows[0] || null;

  if (!fiscalYear) {
    return { fiscalYear: null, departments: [], categories: [] };
  }

  const [departments] = await db.query(
    `SELECT d.id_department, d.name
     FROM Department d
     INNER JOIN FiscalYear fy ON d.fk_fiscal_year = fy.id_fiscal_year
     WHERE fy.is_closed = 0 AND d.is_active = 1
     ORDER BY d.name ASC`
  );

  const [categories] = await db.query(
    `SELECT ic.id_item_category, ic.name
     FROM ItemCategory ic
     INNER JOIN FiscalYear fy ON ic.fk_fiscal_year = fy.id_fiscal_year
     WHERE fy.is_closed = 0 AND ic.is_active = 1
     ORDER BY ic.name ASC`
  );

  return { fiscalYear, departments, categories };
}

function buildSystemPrompt({ fiscalYear, departments, categories }) {
  if (!fiscalYear) {
    return `${BASE_SYSTEM_PROMPT}\n\nNAPOMENA: Trenutno ne postoji aktivna (otvorena) poslovna godina — ` +
      'zahtjevi se ne mogu kreirati. Ako korisnik traži kreiranje zahtjeva, objasni mu ovo umjesto ' +
      'pozivanja alata.';
  }

  const deptList = departments.map((d) => `- ${d.name} (fk_department=${d.id_department})`).join('\n') || '(nema aktivnih odjela)';
  const catList = categories.map((c) => `- ${c.name} (fk_item_category=${c.id_item_category})`).join('\n') || '(nema aktivnih kategorija)';

  return `${BASE_SYSTEM_PROMPT}

Kontekst (koristi TOČNO ove ID-eve, nikad izmišljene):
Aktivna poslovna godina: ${fiscalYear.year} (fk_fiscal_year=${fiscalYear.id_fiscal_year})

Odjeli:
${deptList}

Kategorije artikala:
${catList}`;
}

async function executeCreateRequestTool(args, userId) {
  const created = await createRequest({
    fk_fiscal_year: args?.fk_fiscal_year,
    fk_department: args?.fk_department,
    justification: args?.justification,
    estimated_amount: args?.estimated_amount,
    comment: args?.comment,
    items: args?.items,
    userId,
  });
  return { ok: true, ...created };
}

/**
 * Vodi cijeli tool-calling razgovor (model -> tool -> model -> ...) unutar
 * jednog HTTP zahtjeva, do konačnog tekstualnog odgovora ili MAX_ITERATIONS.
 *
 * @param {{ messages: Array<{role: string, content: string}>, userId: number }} input
 * @returns {Promise<{ text: string, created_request: object|null }>}
 */
async function runAssistantChat({ messages, userId }) {
  const provider = await getActiveProvider();
  const referenceContext = await loadReferenceContext();
  const systemPrompt = buildSystemPrompt(referenceContext);
  const tools = referenceContext.fiscalYear ? [CREATE_REQUEST_TOOL] : [];

  const convo = [{ role: 'system', content: systemPrompt }, ...messages];
  let createdRequest = null;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const result = await provider.chat(convo, tools);

    if (!result.tool_calls || result.tool_calls.length === 0) {
      return { text: result.text || '', created_request: createdRequest };
    }

    convo.push({ role: 'assistant', content: result.text || '', tool_calls: result.tool_calls });

    for (const call of result.tool_calls) {
      let toolResultPayload;

      if (call.name !== 'create_request') {
        toolResultPayload = { ok: false, message: `Nepoznat alat: "${call.name}".` };
      } else if (createdRequest) {
        // Sigurnosna kočnica protiv duplog kreiranja u istom razgovoru.
        toolResultPayload = { ok: true, already_created: true, ...createdRequest };
      } else {
        try {
          toolResultPayload = await executeCreateRequestTool(call.arguments, userId);
          createdRequest = {
            id_purchase_request: toolResultPayload.id_purchase_request,
            request_number: toolResultPayload.request_number,
            fk_request_status: toolResultPayload.fk_request_status,
          };
        } catch (error) {
          if (error instanceof RequestValidationError) {
            // Očekivana poslovna greška — vraća se modelu, ne korisniku kao HTTP error,
            // da agent može zatražiti ispravan podatak i nastaviti razgovor.
            toolResultPayload = { ok: false, message: error.message };
          } else {
            console.error('[assistant] create_request tool error:', error);
            toolResultPayload = { ok: false, message: 'Neočekivana greška pri kreiranju zahtjeva.' };
          }
        }
      }

      convo.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.name,
        content: JSON.stringify(toolResultPayload),
      });
    }
  }

  return {
    text: 'Nisam uspio dovršiti razgovor u zadanom broju koraka. Pokušajte preformulirati poruku ili ' +
      'unesite podatke izravno kroz obrazac za novi zahtjev.',
    created_request: createdRequest,
  };
}

module.exports = { runAssistantChat, CREATE_REQUEST_TOOL };
