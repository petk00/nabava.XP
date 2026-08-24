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
//
// Dvofazna potvrda (propose_request -> create_request) je STRUKTURNA, ne
// samo prompt-uputa: kad je razgovor krenuo od priložene ponude/dokumenta,
// server odbija izvršiti create_request osim ako u POVIJESTI poruka koju je
// klijent poslao (dakle iz RANIJEG HTTP zahtjeva, ne unutar iste petlje) već
// postoji odgovarajući uspješan propose_request rezultat. Tekstualni
// razgovor bez priloga ostaje potpuno nepromijenjen — create_request se i
// dalje zove izravno, bez ikakve provjere.

const db = require('../config/db');
const { getActiveProvider } = require('./llm/providerSelector');
const { createRequest, proposeRequest, RequestValidationError } = require('./requestService');

const MAX_ITERATIONS = 6;

// Prefiks kojim prepoznajemo (u povijesti poruka koju klijent vrati u
// idućem zahtjevu) da je razgovor u nekom trenutku uključivao prilog —
// vidi conversationInvolvesAttachment().
const QUOTE_MARKER = '[ai-asistent:priložena-ponuda]';

const REQUEST_PARAMETERS_SCHEMA = {
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
};

const CREATE_REQUEST_TOOL = {
  name: 'create_request',
  description:
    'Kreira zahtjev za nabavu u ime prijavljenog korisnika. Pozovi TEK KADA imaš SVE obavezne ' +
    'podatke iz razgovora ili konteksta — nikad s praznim, pogađanim ili izmišljenim vrijednostima. ' +
    'Ako nešto nedostaje, postavi korisniku kratko pitanje umjesto pozivanja ovog alata. Ako je ' +
    'razgovor krenuo od priložene ponude/dokumenta, ovaj alat MORA biti pozvan tek nakon ' +
    'propose_request i eksplicitne korisnikove potvrde u sljedećoj poruci — sustav će ga inače odbiti.',
  parameters: REQUEST_PARAMETERS_SCHEMA,
};

const PROPOSE_REQUEST_TOOL = {
  name: 'propose_request',
  description:
    'Provjerava potencijalni zahtjev za nabavu (ista pravila kao create_request) i vraća sažetak ' +
    '(naziv odjela, stavke s nazivima kategorija, ukupan iznos) — NE piše ništa u bazu. Koristi ovo ' +
    'da prezentiraš prijedlog korisniku i zatražiš potvrdu PRIJE create_request; obavezno kad je ' +
    'razgovor krenuo od priložene ponude/dokumenta.',
  parameters: REQUEST_PARAMETERS_SCHEMA,
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
- Odgovaraj isključivo na standardnom hrvatskom jeziku (ijekavica) — npr. "zahtjev", "vrijeme", "mjesto",
  NIKAD ekavica ili srbizmi (npr. "zahtev", "vreme", "mesto").`;

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

function buildQuoteInstruction(quoteText) {
  return `${QUOTE_MARKER}
Korisnik je priložio ponudu dobavljača — ovo je tekst izvučen iz PDF-a (ne izvorni dokument).
Koristi GA kao jedini izvor podataka o ponudi: ne izmišljaj stavke, količine ni iznose kojih u njemu nema.

"""
${quoteText}
"""

Na temelju ovoga:
1. Prepoznaj stavke (naziv, količina) i ukupan iznos ponude ako postoji.
2. Za svaku stavku zaključi kategoriju isključivo iz popisa kategorija gore — nikad izmišljenu.
3. Dobavljač NIJE zasebno polje u sustavu — ako ga želiš zabilježiti, stavi ga u "comment", ne u "justification".
4. Ako neko obavezno polje i dalje nedostaje (npr. odjel — ponuda ga ne može znati), pitaj korisnika za
   njega kao i inače, prije bilo kakvog prijedloga.
5. VAŽNO — tekst ove ponude dostupan ti je SAMO u ovom koraku razgovora, u sljedećim koracima više neće
   biti priložen. Zato TVOJ SVAKI odgovor u ovom razgovoru (i pitanje za odjel/obrazloženje, i konačan
   sažetak) mora eksplicitno navesti konkretne stavke koje si prepoznao (naziv i količina) i ukupan
   iznos — nikad se ne pozivaj na ponudu neodređeno (npr. "stavke iz ponude"), nego ih uvijek ispiši, jer
   inače ćeš ih u sljedećem koraku izgubiti iz vida.
6. Kad imaš sve potrebne podatke, prvo pozovi propose_request (NE create_request) — on validira i vraća
   sažetak (odjel, stavke, ukupan iznos). Na temelju tog sažetka prirodnim jezikom prezentiraj prijedlog
   korisniku i EKSPLICITNO zatraži potvrdu (npr. "Potvrđujete li kreiranje ovog zahtjeva?").
7. Alat create_request smiješ pozvati TEK u SLJEDEĆOJ poruci korisnika, nakon što jasno potvrdi (npr.
   "da", "potvrđujem", "kreiraj") — nikad odmah nakon propose_request u istom koraku, čak i ako ti se
   čini da imaš sve podatke. Sustav će prerani poziv odbiti.`;
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

async function executeProposeRequestTool(args) {
  const proposal = await proposeRequest({
    fk_fiscal_year: args?.fk_fiscal_year,
    fk_department: args?.fk_department,
    justification: args?.justification,
    estimated_amount: args?.estimated_amount,
    comment: args?.comment,
    items: args?.items,
  });
  return { ok: true, proposal };
}

/** Je li razgovor (ovaj poziv ili neki raniji, prepoznat po markeru u povijesti) uključivao prilog. */
function conversationInvolvesAttachment(clientMessages, quoteText) {
  if (quoteText) return true;
  return clientMessages.some(
    (m) => m.role === 'system' && typeof m.content === 'string' && m.content.startsWith(QUOTE_MARKER)
  );
}

function normalizeItemsForMatch(items) {
  return (items || [])
    .map((i) => `${i?.fk_item_category}::${i?.quantity}`)
    .sort();
}

function itemsMatch(a, b) {
  const na = normalizeItemsForMatch(a);
  const nb = normalizeItemsForMatch(b);
  return na.length === nb.length && na.every((v, i) => v === nb[i]);
}

/** Približno poklapanje: ista godina, isti odjel, isti multiset stavki (kategorija+količina). */
function proposalMatchesArgs(proposal, args) {
  if (!proposal || !args) return false;
  if (Number(proposal.fk_fiscal_year) !== Number(args.fk_fiscal_year)) return false;
  if (Number(proposal.fk_department) !== Number(args.fk_department)) return false;
  return itemsMatch(proposal.items, args.items);
}

/**
 * Traži uspješan propose_request rezultat KOJI SE POKLAPA s args u
 * clientMessages — namjerno se pretražuje samo ulazni `messages` (ono što je
 * klijent poslao, tj. iz ranijeg HTTP zahtjeva), nikad `convo` koji raste
 * unutar trenutne petlje — time propose+create u istom requestu nikad ne
 * prolazi (vidi conversationInvolvesAttachment i poziv u petlji niže).
 */
function hasMatchingEarlierProposal(clientMessages, args) {
  return clientMessages
    .filter((m) => m.role === 'tool' && m.name === 'propose_request')
    .some((m) => {
      let parsed;
      try {
        parsed = JSON.parse(m.content);
      } catch {
        return false;
      }
      return parsed?.ok && proposalMatchesArgs(parsed.proposal, args);
    });
}

/**
 * Vodi cijeli tool-calling razgovor (model -> tool -> model -> ...) unutar
 * jednog HTTP zahtjeva, do konačnog tekstualnog odgovora ili MAX_ITERATIONS.
 *
 * @param {{ messages: Array<{role: string, content: string}>, userId: number, quoteText?: string|null }} input
 * @returns {Promise<{ text: string, created_request: object|null, tool_trace: Array<object> }>}
 *   `tool_trace` su nove poruke (system uputa o ponudi ako ima priloga, te
 *   assistant/tool razmjene) koje KLIJENT MORA dodati u svoju povijest prije
 *   sljedećeg poziva — bez toga se strukturna potvrda za priloge ne može
 *   provjeriti u idućem zahtjevu.
 */
async function runAssistantChat({ messages, userId, quoteText = null }) {
  const provider = await getActiveProvider();
  const referenceContext = await loadReferenceContext();
  const systemPrompt = buildSystemPrompt(referenceContext);
  const tools = referenceContext.fiscalYear ? [CREATE_REQUEST_TOOL, PROPOSE_REQUEST_TOOL] : [];
  const attachmentInvolved = conversationInvolvesAttachment(messages, quoteText);

  const convo = [{ role: 'system', content: systemPrompt }];
  const toolTrace = [];

  if (quoteText) {
    const quoteMsg = { role: 'system', content: buildQuoteInstruction(quoteText) };
    convo.push(quoteMsg);
    toolTrace.push(quoteMsg);
  }
  convo.push(...messages);
  let createdRequest = null;

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const result = await provider.chat(convo, tools);

    if (!result.tool_calls || result.tool_calls.length === 0) {
      if (result.text && result.text.trim()) {
        return { text: result.text, created_request: createdRequest, tool_trace: toolTrace };
      }
      // Model nije vratio ni tekst ni tool_call (npr. generacija prekinuta
      // prije završetka — potvrđeno stvarnim testom s gemma4:12b i opsežnim
      // "thinking" izlazom). Ne vraćaj prazan odgovor korisniku.
      return {
        text: 'Model nije uspio dovršiti odgovor. Pokušajte ponovno ili preformulirajte poruku.',
        created_request: createdRequest,
        tool_trace: toolTrace,
      };
    }

    const assistantMsg = { role: 'assistant', content: result.text || '', tool_calls: result.tool_calls };
    convo.push(assistantMsg);
    toolTrace.push(assistantMsg);

    for (const call of result.tool_calls) {
      let toolResultPayload;

      if (call.name === 'propose_request') {
        try {
          toolResultPayload = await executeProposeRequestTool(call.arguments);
        } catch (error) {
          if (error instanceof RequestValidationError) {
            toolResultPayload = { ok: false, message: error.message };
          } else {
            console.error('[assistant] propose_request tool error:', error);
            toolResultPayload = { ok: false, message: 'Neočekivana greška pri provjeri prijedloga.' };
          }
        }
      } else if (call.name === 'create_request') {
        if (createdRequest) {
          // Sigurnosna kočnica protiv duplog kreiranja u istom razgovoru.
          toolResultPayload = { ok: true, already_created: true, ...createdRequest };
        } else if (attachmentInvolved && !hasMatchingEarlierProposal(messages, call.arguments)) {
          // Strukturna brava: razgovor je krenuo od priloga, a odgovarajući
          // propose_request iz RANIJEG zahtjeva ne postoji (ili se poklapa
          // samo propose_request unutar OVE iste petlje, što se namjerno ne
          // broji — vidi hasMatchingEarlierProposal).
          toolResultPayload = {
            ok: false,
            message: 'Prvo prezentiraj prijedlog korisniku pozivom propose_request i pričekaj eksplicitnu potvrdu u novoj poruci.',
          };
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
      } else {
        toolResultPayload = { ok: false, message: `Nepoznat alat: "${call.name}".` };
      }

      const toolMsg = {
        role: 'tool',
        tool_call_id: call.id,
        name: call.name,
        content: JSON.stringify(toolResultPayload),
      };
      convo.push(toolMsg);
      toolTrace.push(toolMsg);
    }
  }

  return {
    text: 'Nisam uspio dovršiti razgovor u zadanom broju koraka. Pokušajte preformulirati poruku ili ' +
      'unesite podatke izravno kroz obrazac za novi zahtjev.',
    created_request: createdRequest,
    tool_trace: toolTrace,
  };
}

module.exports = { runAssistantChat, CREATE_REQUEST_TOOL, PROPOSE_REQUEST_TOOL };
