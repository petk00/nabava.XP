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
const { fixEkavica } = require('./croatianTextFixer');

const MAX_ITERATIONS = 6;

// Prefiks kojim prepoznajemo (u povijesti poruka koju klijent vrati u
// idućem zahtjevu) da je razgovor u nekom trenutku uključivao prilog —
// vidi conversationInvolvesAttachment().
const QUOTE_MARKER = '[ai-asistent:priložena-ponuda]';

// Nosi IZVORNE bajtove priloga (base64) kroz razgovor preko istog echo
// mehanizma kao QUOTE_MARKER — potrebno jer create_request (koji originalnu
// datoteku sprema kao formalni prilog uz zahtjev, requestService.js) često
// stiže tek nekoliko poteza NAKON uploada, kad attachments param više nije
// postavljen (multipart upload ide samo uz PRVU poruku razgovora). Ova
// poruka je NAMJERNO isključena iz onoga što se šalje modelu (vidi
// runAssistantChat) — model ne treba i ne smije "čitati" sirovi base64,
// samo bi trošio kontekst bez ikakve koristi.
const ATTACHMENT_DATA_MARKER = '[ai-asistent:prilog-podaci]';

function isAttachmentDataCarrier(message) {
  return message?.role === 'system' && typeof message.content === 'string' && message.content.startsWith(ATTACHMENT_DATA_MARKER);
}

/** Gradi skrivenu system poruku koja nosi base64 SVIH priloga ovog poteza — ide u tool_trace, NIKAD u convo. */
function buildAttachmentDataCarrier(attachments) {
  const payload = attachments.map((a) => ({
    filename: a.filename,
    mimeType: a.kind === 'pdf' ? 'application/pdf' : a.mimeType,
    base64: a.base64,
  }));
  return { role: 'system', content: `${ATTACHMENT_DATA_MARKER}${JSON.stringify(payload)}` };
}

/**
 * Razrješava izvorne bajtove priloga za spremanje uz create_request: prvo
 * pokuša OVAJ potez (attachments param, svježe uploadano), pa tek onda
 * potraži carrier poruku echoedanu iz ranijeg poteza u clientMessages.
 * @returns {Array<{buffer: Buffer, fileName: string, mimeType: string}>}
 */
function resolveAttachmentsForSave(attachments, clientMessages) {
  let source;
  if (attachments && attachments.length > 0) {
    source = attachments.map((a) => ({
      filename: a.filename,
      mimeType: a.kind === 'pdf' ? 'application/pdf' : a.mimeType,
      base64: a.base64,
    }));
  } else {
    const carrier = clientMessages.find(isAttachmentDataCarrier);
    if (!carrier) return [];
    try {
      source = JSON.parse(carrier.content.slice(ATTACHMENT_DATA_MARKER.length));
    } catch {
      return [];
    }
  }

  return source
    .filter((a) => a.base64)
    .map((a) => ({ fileName: a.filename, mimeType: a.mimeType, buffer: Buffer.from(a.base64, 'base64') }));
}

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

const BASE_SYSTEM_PROMPT = `JEZIK (NAJVAŽNIJE PRAVILO, provjeri PRIJE svakog slanja odgovora): odgovaraj
ISKLJUČIVO na standardnom hrvatskom jeziku, ijekavicom. NIKAD ekavica, NIKAD srbizmi. Primjeri ispravno/
POGREŠNO: "zahtjev"/NE "zahtev", "vrijeme"/NE "vreme", "mjesto"/NE "mesto", "cijena"/NE "cena", "dio"/NE
"deo", "mlijeko"/NE "mleko", "prije"/NE "pre", "razumijem"/NE "razumem", "uvjet"/NE "uslov", "obavijest"/
NE "obaveštenje". Prije nego pošalješ ijedan odgovor, u sebi provjeri sadrži li ijednu ekavicu/srbizam
riječ i ako da, ispravi je — ovo vrijedi za SVAKU riječ u SVAKOM tvom odgovoru, ne samo za primjere gore.

Ti si AI asistent za nabavu na Veleučilištu u Rijeci, unutar sustava nabava.XP.
Pomažeš prijavljenom korisniku kreirati zahtjev za nabavu razgovorom.

Pravila:
- Iz onoga što korisnik kaže zaključi što god možeš (npr. kategoriju artikla iz naziva), ali nikad ne
  izmišljaj odjel, kategoriju ili poslovnu godinu — koristi isključivo ID-eve iz konteksta niže.
- Ako nedostaje obavezan podatak (odjel, obrazloženje, naziv/količina stavke), postavi kratko pitanje
  korisniku umjesto da nagađaš ili pozivaš create_request s nepotpunim podacima.
- Alat create_request pozovi TEK KADA imaš sve obavezne podatke.
- Kad alat vrati grešku, objasni korisniku problem jednostavnim riječima i zatraži ispravan podatak —
  ne odustaj od razgovora.
- Kad alat uspije, potvrdi korisniku broj kreiranog zahtjeva kratkom rečenicom.`;

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

/**
 * Uputa za razgovor koji kreće od priloženih ponuda — zajednička za sve
 * oblike priloga (PDF tekst ili slika) i za bilo koji broj priloga:
 *   - PDF: tekst izvučen server-side (quoteExtractionService), ubačen ovdje,
 *     jasno označen brojem ("Ponuda N (dokument: naziv.pdf)").
 *   - Slika: NE ekstrahira se ništa server-side — sirovi bajtovi idu izravno
 *     providerovom vision parametru (vidi runAssistantChat), samo se ovdje
 *     navodi redoslijedom kojim su slike priložene uz poruku.
 *
 * @param {Array<{filename: string, kind: 'pdf'|'image', text?: string}>} attachments
 */
function buildAttachmentInstruction(attachments) {
  const multiple = attachments.length > 1;
  let imageOrdinal = 0;

  const labeledBlocks = attachments.map((a, idx) => {
    const label = multiple ? `Ponuda ${idx + 1} (dokument: ${a.filename})` : `Ponuda (dokument: ${a.filename})`;
    if (a.kind === 'pdf') {
      return `${label} — tekst izvučen iz PDF-a:\n"""\n${a.text}\n"""`;
    }
    imageOrdinal += 1;
    return `${label} — priložena je kao SLIKA uz ovu poruku (${imageOrdinal}. slika po redoslijedu ` +
      `priloženih slika), pogledaj je izravno. Ako je tekst na slici nejasan ili nečitljiv, radije to ` +
      `reci i pitaj korisnika nego nagađaj.`;
  }).join('\n\n');

  return `${QUOTE_MARKER}
Korisnik je uz poruku priložio ${multiple ? `${attachments.length} dokumenta` : 'dokument'} i navodi da ${multiple ? 'su to ponude' : 'je to ponuda'} dobavljača — ali to PRVO provjeri za svaki dokument zasebno, ne uzimaj zdravo za gotovo.

${labeledBlocks}

Koristi ih kao jedini izvor podataka: ne izmišljaj stavke, količine ni iznose kojih u njima nema.

Na temelju ovoga:
1. Za SVAKI dokument zasebno provjeri je li uistinu ponuda/predračun dobavljača (ima dobavljača i
   konkretne artikle s količinama i/ili cijenama, u komercijalnom formatu). Ako neki dokument NIJE ponuda
   (npr. ugovor, dopis, obavijest, zapisnik ili bilo koji tekst bez konkretnih artikala i cijena) — NE
   pretvaraj njegov sadržaj (rečenice, članke ugovora, odlomke dopisa) u izmišljene "stavke". Umjesto
   toga, jasno reci korisniku koji dokument ne izgleda kao ponuda (po mogućnosti navedi što jest, npr.
   "dokument 2 izgleda kao ugovor, ne ponuda") i pitaj što želi dalje za taj dokument — nemoj pozivati
   propose_request ni create_request dok se to ne razjasni.
2. Za dokumente koji JESU ponude: prepoznaj stavke (naziv, količina) i ukupan iznos ponude ako postoji.
3. Ako je priložena VIŠE OD JEDNE ponude, svaka ponuda pridonosi zahtjevu SVOJIM VLASTITIM stavkama —
   uključi stavke iz SVIH ponuda kao zasebne retke, i kad dvije ili više ponuda nude isti ili vrlo sličan
   artikl (npr. "laptop" na obje ponude). NE preskači, ne spajaj u jedan redak i NE pitaj korisnika koju
   ponudu odabrati — svaka takva stavka ide u zahtjev zasebno, sa svojom vlastitom količinom, po svojoj
   ponudi. Ukupan iznos zahtjeva je ZBROJ iznosa svih priloženih ponuda. (Ako je priložena samo jedna
   ponuda, ova točka se ne primjenjuje.)
4. Za svaku stavku zaključi kategoriju isključivo iz popisa kategorija gore — nikad izmišljenu.
5. Dobavljač NIJE zasebno polje u sustavu — ako ga želiš zabilježiti, stavi ga u "comment", ne u "justification".
6. Ako neko obavezno polje i dalje nedostaje (npr. odjel — ponuda ga ne može znati), pitaj korisnika za
   njega kao i inače, prije bilo kakvog prijedloga.
7. VALUTA — sustav prati "estimated_amount" isključivo u eurima (€). Ponuda može biti u bilo kojem
   jeziku i navesti iznos u bilo kojoj valuti (USD, GBP, itd.) i bilo kojem brojevnom zapisu (npr.
   "1,250.00" = tisuću dvjesto pedeset, decimalna točka, ne zarez). Ako ponuda NIJE u eurima, NIKAD ne
   tretiraj taj broj kao da već jest u eurima (ne piši ga naprosto kao "X eur") — u svom odgovoru
   EKSPLICITNO navedi izvornu valutu uz iznos (npr. "iznos na ponudi: 1,250.00 GBP") i jasno upozori
   korisnika da provjeri/preračuna prije potvrde, jer ti ne znaš točan tečaj.
8. VAŽNO — sadržaj ${multiple ? 'ovih dokumenata dostupan ti je' : 'ovog dokumenta dostupan ti je'} SAMO u
   ovom koraku razgovora, u sljedećim koracima više neće biti priložen. Zato TVOJ SVAKI odgovor u ovom
   razgovoru (i pitanje za odjel/obrazloženje, i konačan sažetak) mora eksplicitno navesti konkretne
   stavke koje si prepoznao (naziv i količina) i ukupan iznos (s valutom ako nije €) — nikad se ne
   pozivaj na ponudu neodređeno (npr. "stavke iz ponude"), nego ih uvijek ispiši, jer inače ćeš ih u
   sljedećem koraku izgubiti iz vida.
9. Kad imaš sve potrebne podatke, prvo pozovi propose_request (NE create_request) — on validira i vraća
   sažetak (odjel, stavke, ukupan iznos). Na temelju tog sažetka prirodnim jezikom prezentiraj prijedlog
   korisniku i EKSPLICITNO zatraži potvrdu (npr. "Potvrđujete li kreiranje ovog zahtjeva?").
10. Alat create_request smiješ pozvati TEK u SLJEDEĆOJ poruci korisnika, nakon što jasno potvrdi (npr.
    "da", "potvrđujem", "kreiraj") — nikad odmah nakon propose_request u istom koraku, čak i ako ti se
    čini da imaš sve podatke. Sustav će prerani poziv odbiti.`;
}

/**
 * Isti hrvatski safety net (croatianTextFixer.js) koji čisti TEKST odgovora
 * primjenjuje se i na prozna polja koja idu u BAZU. Bez ovoga je ekavica
 * ispravljena samo u chat prozoru, dok zahtjev trajno ostaje zapisan s npr.
 * "zahtev"/"uslovi" u obrazloženju — a obrazloženje je ono što kasnije čita
 * odobravatelj i što ide u PDF zahtjeva.
 *
 * `item_name` se NAMJERNO ne dira: naziv artikla je podatak prepisan iz
 * ponude (često kataloški kod ili kratica, npr. "PRE-2000"), gdje bi lažni
 * pogodak pravila trajno iskrivio zapis o stvarnom artiklu; ekavica se u
 * nazivima artikala ni ne pojavljuje, za razliku od proznog obrazloženja
 * koje model sam sastavlja.
 */
function fixTextField(value) {
  return typeof value === 'string' ? fixEkavica(value) : value;
}

async function executeCreateRequestTool(args, userId, attachmentsForSave) {
  const created = await createRequest({
    fk_fiscal_year: args?.fk_fiscal_year,
    fk_department: args?.fk_department,
    justification: fixTextField(args?.justification),
    estimated_amount: args?.estimated_amount,
    comment: fixTextField(args?.comment),
    items: args?.items,
    userId,
    attachments: attachmentsForSave,
  });
  return { ok: true, ...created };
}

async function executeProposeRequestTool(args) {
  // Sažetak koji korisnik vidi PRIJE potvrde mora biti isti tekst koji će
  // create_request stvarno upisati — inače bi potvrdio jedno, a spremilo se drugo.
  const proposal = await proposeRequest({
    fk_fiscal_year: args?.fk_fiscal_year,
    fk_department: args?.fk_department,
    justification: fixTextField(args?.justification),
    estimated_amount: args?.estimated_amount,
    comment: fixTextField(args?.comment),
    items: args?.items,
  });
  return { ok: true, proposal };
}

/** Je li razgovor (ovaj poziv ili neki raniji, prepoznat po markeru u povijesti) uključivao prilog(e). */
function conversationInvolvesAttachment(clientMessages, attachments) {
  if (attachments && attachments.length > 0) return true;
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
 * Traži RANIJI uspješan create_request rezultat u clientMessages (bilo koji
 * turn PRIJE ovog HTTP zahtjeva) — za razliku od `createdRequest` lokalne
 * varijable niže (koja štiti samo unutar JEDNOG HTTP poziva), ovo hvata
 * pokušaj ponovnog create_request-a u SLJEDEĆEM potezu iste konverzacije
 * (npr. korisnik nakon potvrde poruke traži izmjenu već kreiranog zahtjeva —
 * stvarnim eval testiranjem potvrđeno da model tad zna pozvati create_request
 * PO DRUGI PUT i napraviti pravi duplikat u bazi, docs/eval-runs/). Sustav
 * NEMA "update" tool, pa je jedina ispravna reakcija odbiti drugi create i
 * to jasno objasniti — ne pokušati "popraviti" ponovnim kreiranjem.
 */
function findEarlierSuccessfulCreate(clientMessages) {
  for (const m of clientMessages) {
    if (m.role !== 'tool' || m.name !== 'create_request') continue;
    let parsed;
    try {
      parsed = JSON.parse(m.content);
    } catch {
      continue;
    }
    if (parsed?.ok) return parsed;
  }
  return null;
}

/**
 * Vodi cijeli tool-calling razgovor (model -> tool -> model -> ...) unutar
 * jednog HTTP zahtjeva, do konačnog tekstualnog odgovora ili MAX_ITERATIONS.
 *
 * @param {{ messages: Array<{role: string, content: string}>, userId: number,
 *   attachments?: Array<{filename: string, kind: 'pdf'|'image', text?: string,
 *   mimeType?: string, base64?: string}> }} input
 * @returns {Promise<{ text: string, created_request: object|null, tool_trace: Array<object>,
 *   usage: { promptTokens: number, completionTokens: number } }>} `usage` je zbroj kroz SVE
 *   pozive provideru unutar ovog poteza (tool-calling petlja zna pozvati model više puta).
 *   `tool_trace` su nove poruke (system uputa o ponudi/ponudama ako ima
 *   priloga, te assistant/tool razmjene) koje KLIJENT MORA dodati u svoju
 *   povijest prije sljedećeg poziva — bez toga se strukturna potvrda za
 *   priloge ne može provjeriti u idućem zahtjevu.
 */
async function runAssistantChat({ messages, userId, attachments = [] }) {
  const provider = await getActiveProvider();
  const referenceContext = await loadReferenceContext();
  const systemPrompt = buildSystemPrompt(referenceContext);
  const tools = referenceContext.fiscalYear ? [CREATE_REQUEST_TOOL, PROPOSE_REQUEST_TOOL] : [];
  const attachmentInvolved = conversationInvolvesAttachment(messages, attachments);

  const convo = [{ role: 'system', content: systemPrompt }];
  const toolTrace = [];

  if (attachments.length > 0) {
    const quoteMsg = { role: 'system', content: buildAttachmentInstruction(attachments) };
    convo.push(quoteMsg);
    toolTrace.push(quoteMsg);

    // Ide SAMO u tool_trace (za echo natrag klijentu), NIKAD u convo — vidi
    // napomenu uz ATTACHMENT_DATA_MARKER gore.
    toolTrace.push(buildAttachmentDataCarrier(attachments));
  }

  // Slike idu kao dio POSLJEDNJE korisnikove poruke (onoj uz koju su stigle),
  // ne kao zasebna system poruka — providerima je to prirodan oblik
  // (Ollamin `images` na poruci, Geminijev inlineData part). Svaka slika nosi
  // vlastiti mimeType (prilozi mogu biti mješoviti JPG/PNG). Klonira se
  // umjesto mutiranja da se ne dira objekt koji poziva ovu funkciju.
  const imageAttachments = attachments.filter((a) => a.kind === 'image');
  let historyMessages = messages;
  if (imageAttachments.length > 0) {
    const lastUserIdx = [...messages].map((m) => m.role).lastIndexOf('user');
    if (lastUserIdx !== -1) {
      const images = imageAttachments.map((a) => ({ mimeType: a.mimeType, data: a.base64 }));
      historyMessages = messages.map((m, idx) => (idx === lastUserIdx ? { ...m, images } : m));
    }
  }
  // Carrier poruka (ako je echoedana natrag iz ranijeg poteza) isključuje se
  // iz onoga što stvarno ide modelu — vidi ATTACHMENT_DATA_MARKER napomenu.
  convo.push(...historyMessages.filter((m) => !isAttachmentDataCarrier(m)));
  let createdRequest = null;
  // Jedan HTTP zahtjev/razgovorni potez zna pozvati provider.chat() VIŠE puta
  // (tool-calling petlja: propose_request pa nastavak, itd.) — zbrajamo token
  // usage kroz sve te pozive, ne samo zadnji, za RQ1/RQ2 eval harness
  // (docs/AI.md, evalHarness.js).
  const usage = { promptTokens: 0, completionTokens: 0 };
  const addUsage = (u) => {
    usage.promptTokens += u?.promptTokens || 0;
    usage.completionTokens += u?.completionTokens || 0;
  };

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const result = await provider.chat(convo, tools);
    addUsage(result.usage);

    if (!result.tool_calls || result.tool_calls.length === 0) {
      if (result.text && result.text.trim()) {
        return { text: fixEkavica(result.text), created_request: createdRequest, tool_trace: toolTrace, usage };
      }
      // Model nije vratio ni tekst ni tool_call (npr. generacija prekinuta
      // prije završetka — potvrđeno stvarnim testom s gemma4:12b i opsežnim
      // "thinking" izlazom). Ne vraćaj prazan odgovor korisniku.
      return {
        text: 'Model nije uspio dovršiti odgovor. Pokušajte ponovno ili preformulirajte poruku.',
        created_request: createdRequest,
        tool_trace: toolTrace,
        usage,
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
        const earlierCreate = createdRequest ? null : findEarlierSuccessfulCreate(messages);
        if (createdRequest) {
          // Sigurnosna kočnica protiv duplog kreiranja u istom razgovoru.
          toolResultPayload = { ok: true, already_created: true, ...createdRequest };
        } else if (earlierCreate) {
          // Cross-turn kočnica: zahtjev je već kreiran u NEKOM RANIJEM potezu
          // iste konverzacije (createdRequest gore štiti samo unutar ovog
          // jednog HTTP poziva). Nema "update" tool-a, pa se drugi
          // create_request ODBIJA umjesto da tiho napravi duplikat.
          toolResultPayload = {
            ok: false,
            already_created_earlier: true,
            request_number: earlierCreate.request_number,
            message: `Zahtjev ${earlierCreate.request_number} je već kreiran ranije u ovom razgovoru i NE MOŽE se mijenjati kroz chat (nema alata za ažuriranje postojećeg zahtjeva). Objasni ovo korisniku, navedi broj zahtjeva ${earlierCreate.request_number}, i reci mu da izmjena postaje moguća tek kad administrator/odobravatelj vrati zahtjev na dopunu (status "Zahtjeva izmjene") — tada ga korisnik može urediti kroz obrazac za uređivanje zahtjeva. Do tada, ako je izmjena hitna, neka kontaktira administratora izravno. NE pokušavaj ponovno pozvati create_request za ovu izmjenu.`,
          };
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
            const attachmentsForSave = resolveAttachmentsForSave(attachments, messages);
            toolResultPayload = await executeCreateRequestTool(call.arguments, userId, attachmentsForSave);
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
    usage,
  };
}

module.exports = { runAssistantChat, CREATE_REQUEST_TOOL, PROPOSE_REQUEST_TOOL };
