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
const { putAttachments, getAttachments, dropAttachments } = require('./assistantAttachmentStore');

const MAX_ITERATIONS = 6;

// Prefiks kojim prepoznajemo (u povijesti poruka koju klijent vrati u
// idućem zahtjevu) da je razgovor u nekom trenutku uključivao prilog —
// vidi conversationInvolvesAttachment().
const QUOTE_MARKER = '[ai-asistent:priložena-ponuda]';

// Nosi REFERENCU (neprozirni ID) na izvorne bajtove priloga kroz razgovor,
// preko istog echo mehanizma kao QUOTE_MARKER — potrebno jer create_request
// (koji originalnu datoteku sprema kao formalni prilog uz zahtjev,
// requestService.js) često stiže tek nekoliko poteza NAKON uploada, kad
// attachments param više nije postavljen (multipart upload ide samo uz PRVU
// poruku razgovora). Sami bajtovi ostaju SERVER-SIDE
// (assistantAttachmentStore.js) i nikad ne putuju kroz klijenta — vidi
// obrazloženje na vrhu tog modula. Ova poruka je uz to NAMJERNO isključena iz
// onoga što se šalje modelu (vidi runAssistantChat): model nema što raditi s
// internim ID-em, samo bi trošio kontekst.
const ATTACHMENT_DATA_MARKER = '[ai-asistent:prilog-podaci]';

function isAttachmentDataCarrier(message) {
  return message?.role === 'system' && typeof message.content === 'string' && message.content.startsWith(ATTACHMENT_DATA_MARKER);
}

/** Kanonski oblik priloga za spremanje uz zahtjev (attachmentService.saveAttachmentBuffer). */
function toStorableFiles(attachments) {
  return attachments
    .filter((a) => a.base64)
    .map((a) => ({
      fileName: a.filename,
      mimeType: a.kind === 'pdf' ? 'application/pdf' : a.mimeType,
      buffer: Buffer.from(a.base64, 'base64'),
    }));
}

/**
 * Sprema bajtove priloga ovog poteza server-side i gradi skrivenu system
 * poruku koja nosi SAMO njihov ID — ide u tool_trace, NIKAD u convo.
 * @returns {{ message: object, storeId: string }|null} null ako nema što spremiti
 */
function buildAttachmentDataCarrier(attachments, userId) {
  const storeId = putAttachments(userId, toStorableFiles(attachments));
  if (!storeId) return null;
  return { message: { role: 'system', content: `${ATTACHMENT_DATA_MARKER}${storeId}` }, storeId };
}

/** ID iz carrier poruke koju je klijent echoedao iz ranijeg poteza (ili null). */
function findCarrierStoreId(clientMessages) {
  const carrier = clientMessages.find(isAttachmentDataCarrier);
  if (!carrier) return null;
  return carrier.content.slice(ATTACHMENT_DATA_MARKER.length).trim() || null;
}

/**
 * Razrješava izvorne bajtove priloga za spremanje uz create_request: prvo
 * pokuša OVAJ potez (attachments param, svježe uploadano), pa tek onda
 * spremište po ID-u iz carrier poruke echoedane iz ranijeg poteza.
 *
 * Nepoznat, istekao ili tuđi ID daje prazan niz (getAttachments) — zahtjev se
 * kreira bez priloga umjesto da padne ili, još gore, priloži tuđi dokument.
 *
 * @returns {{ files: Array<{buffer: Buffer, fileName: string, mimeType: string}>, storeId: string|null }}
 */
function resolveAttachmentsForSave(attachments, clientMessages, userId) {
  if (attachments && attachments.length > 0) {
    return { files: toStorableFiles(attachments), storeId: null };
  }
  const storeId = findCarrierStoreId(clientMessages);
  return { files: getAttachments(storeId, userId), storeId };
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
- OBAVEZNA polja su SAMO: odjel, obrazloženje i stavke (naziv + količina + kategorija). Iznos
  ("estimated_amount") je NEOBAVEZAN — ako ga korisnik nije naveo, jednostavno ga izostavi i nastavi.
  NIKAD ne traži iznos kao uvjet za prijedlog ili kreiranje zahtjeva, i nikad ne zaustavljaj razgovor
  zbog njega.
- IZNOS ("estimated_amount") je uvijek KONAČAN IZNOS ZA UPLATU — onaj koji ustanova stvarno plaća,
  dakle nakon svih rabata i uključujući PDV. Ponuda često nudi više iznosa (osnovica, iznos nakon
  rabata, PDV, ukupno za uplatu) — uzmi ISKLJUČIVO zadnji, onaj označen kao "za uplatu", "ukupno za
  platiti" ili istoznačno. NIKAD osnovicu ni međuzbroj.
- POPUST/RABAT NIJE STAVKA. Ako se u tablici pojavljuje kao redak s negativnim iznosom, NE upisuj ga
  među stavke zahtjeva — on je već uračunat u konačan iznos. Stavke su samo artikli i usluge koji se
  stvarno nabavljaju.
- BEZ PRILOGA (korisnik je podatke naveo sam, u razgovoru): kad imaš sva obavezna polja, pozovi
  create_request IZRAVNO. NE pozivaj propose_request i NE traži dodatnu potvrdu — korisnik je upravo
  sam izdiktirao te podatke i vidi ih u svojoj poruci. Dvostruka potvrda je obavezna SAMO kad je
  priložena ponuda, jer su tada podaci pročitani iz dokumenta i korisnik ih nije sam potvrdio.
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

// Dodaje se u system prompt kad aktivni model uopće ne podržava pozivanje
// alata (npr. Ollamin qwen2.5vl:7b — vidi OLLAMA_MODELS u llm/ollamaModels.js).
// Bez ove upute model nema načina saznati da alata nema, pa zna "potvrditi"
// kreiranje zahtjeva koje se nikad nije dogodilo.
const NO_TOOLS_NOTE = `NAPOMENA O OGRANIČENJU: trenutno odabrani model ne podržava pozivanje alata, pa u
ovom razgovoru zahtjev za nabavu NE MOŽE biti kreiran. Možeš i dalje pročitati priložene ponude,
objasniti ih, izračunati iznose i pomoći korisniku pripremiti podatke. Ali NIKAD ne tvrdi da si zahtjev
kreirao niti izmišljaj njegov broj — ako korisnik traži kreiranje, reci mu da administrator za to mora
prebaciti model asistenta na onaj koji podržava alate (gemma4:12b) ili na Gemini.`;

function buildSystemPrompt({ fiscalYear, departments, categories }, { toolsSupported = true } = {}) {
  if (!toolsSupported) {
    // Ide PRIJE provjere poslovne godine: bez alata je nemogućnost kreiranja
    // ista i kad godina postoji, a kontekst odjela/kategorija modelu i dalje
    // koristi za objašnjavanje ponuda.
    return `${buildSystemPrompt({ fiscalYear, departments, categories })}\n\n${NO_TOOLS_NOTE}`;
  }

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
Korisnik je priložio ${multiple ? `${attachments.length} dokumenta` : 'dokument'} i tvrdi da ${multiple ? 'su to ponude' : 'je to ponuda'} dobavljača — provjeri to sam, za svaki dokument zasebno.

${labeledBlocks}

Priloženo je JEDINI izvor podataka: ne izmišljaj stavke, količine ni iznose kojih u njemu nema.

Pravila:
1. PROVJERA — je li dokument doista ponuda/predračun (dobavljač + artikli s količinama i/ili cijenama)?
   Ako nije (ugovor, dopis, obavijest, zapisnik…), NE pretvaraj njegov tekst u izmišljene stavke. Reci
   korisniku koji dokument nije ponuda i što izgleda da jest, pa pitaj što dalje — bez propose_request
   i create_request dok se ne razjasni.
2. STAVKE — iz svake prave ponude izvuci naziv, količinu i ukupan iznos ako postoji.
3. VIŠE PONUDA — svaka ponuda daje SVOJE stavke kao zasebne retke, čak i kad nude isti artikl. Ne
   preskači, ne spajaj i NE pitaj korisnika koju ponudu odabrati. Ukupan iznos = zbroj svih ponuda.
4. KATEGORIJA — isključivo iz popisa kategorija gore, nikad izmišljena.
5. DOBAVLJAČ — nije polje u sustavu; ako ga bilježiš, ide u "comment", nikad u "justification".
6. NEDOSTAJE PODATAK — obavezan podatak koji ponuda ne može znati (npr. odjel) zatraži od korisnika
   prije prijedloga. Iznos NIJE obavezan i zbog njega nikad ne zastaj.
7. VALUTA — "estimated_amount" je uvijek u eurima. Ako ponuda nije u eurima, NIKAD ne prepiši broj kao
   da jest: navedi izvornu valutu uz iznos (npr. "1,250.00 GBP") i upozori korisnika da provjeri tečaj.
   Pazi na zapis: "1,250.00" je tisuću dvjesto pedeset, decimalna točka.
8. PAMĆENJE — sadržaj ${multiple ? 'dokumenata' : 'dokumenta'} imaš SAMO u ovom koraku, dalje ga nemaš.
   Zato u SVAKOM svom odgovoru ispiši konkretne stavke (naziv i količinu) i ukupan iznos s valutom —
   nikad neodređeno "stavke iz ponude", jer ćeš ih inače izgubiti.
9. REDOSLIJED — kad imaš sve, pozovi propose_request (NE create_request), prezentiraj vraćeni sažetak
   svojim riječima i izričito pitaj za potvrdu. create_request smiješ pozvati TEK nakon što korisnik
   potvrdi u SLJEDEĆOJ poruci ("da", "potvrđujem", "kreiraj") — nikad u istom koraku, sustav to odbija.`;
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
    // Prijedlog je mogao nastati na dva načina: model je uredno pozvao
    // propose_request, ILI je preskočio taj korak pa je brava njegov
    // create_request pretvorila u prijedlog (ok:false + awaiting_confirmation
    // + proposal). Oba su ravnopravna — u oba slučaja je korisnik vidio
    // VALIDIRAN sažetak i potvrđuje ga tek u sljedećoj poruci.
    .filter((m) => m.role === 'tool' && (m.name === 'propose_request' || m.name === 'create_request'))
    .some((m) => {
      let parsed;
      try {
        parsed = JSON.parse(m.content);
      } catch {
        return false;
      }
      if (!parsed?.proposal) return false;
      // propose_request: ok === true. Pretvoreni create_request: ok === false
      // uz awaiting_confirmation (nikad nije pisao u bazu).
      const isProposal = parsed.ok === true || parsed.awaiting_confirmation === true;
      return isProposal && proposalMatchesArgs(parsed.proposal, args);
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

// Obrasci kojima model TVRDI da je zahtjev nastao. Namjerno samo SVRŠENI
// oblici ("kreiran je", "uspješno kreiran", "broj zahtjeva je") — buduće i
// uvjetne najave ("kreirat ću", "mogu kreirati", "želite li da kreiram")
// su legitimne i ne smiju se dirati.
const FALSE_CREATION_PATTERNS = [
  /zahtjev\s+(je\s+)?(uspješno\s+)?kreiran/i,
  /(uspješno\s+)?(sam\s+)?kreirao\s+(sam\s+)?zahtjev/i,
  /zahtjev\s+za\s+nabavu\s+je\s+(uspješno\s+)?(kreiran|zaprimljen|poslan)/i,
  /broj\s+(vašeg\s+)?zahtjeva\s+je/i,
];

/**
 * Sigurnosna mreža protiv LAŽNE potvrde kreiranja.
 *
 * Stvarno opaženo (eval run 2026-08-31, gemma4:e4b, scenarij 2): model nije
 * pozvao NIJEDAN alat, ali je korisniku javio "Vaš zahtjev za nabavu je
 * uspješno kreiran. Vaš broj zahtjeva je **N/A**." Ništa nije nastalo —
 * korisnik bi otišao uvjeren da ima zahtjev.
 *
 * Strukturna brava to ne hvata: ona presreće POZIV create_request bez
 * prijedloga, a ovdje poziva uopće nije bilo — samo rečenica. Zato se
 * provjerava sam tekst odgovora, i to za SVE modele (dosadašnji NO_TOOLS_NOTE
 * štiti samo modele bez alata, a e4b alate ima).
 *
 * Kad createdRequest postoji, tekst se NE dira — tad je tvrdnja istinita.
 */
function guardFalseCreationClaim(text, createdRequest) {
  if (createdRequest || !text) return text;
  if (!FALSE_CREATION_PATTERNS.some((re) => re.test(text))) return text;

  console.warn('[assistant] model je tvrdio da je zahtjev kreiran, a nije — odgovor zamijenjen.');
  return 'Zahtjev NIJE kreiran — u prethodnom odgovoru je došlo do pogreške. ' +
    'Nijedan zahtjev nije spremljen u sustav. Molim ponovite zahtjev ili ga ' +
    'kreirajte kroz obrazac "Novi zahtjev".';
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
  // Provider javlja može li aktivni model uopće pozivati alate (Ollamin
  // toggle modela zna birati i model bez te sposobnosti). Stariji/mockani
  // provideri bez getCapabilities() tretiraju se kao da mogu — to je bilo
  // jedino ponašanje prije ovog toggle-a.
  const capabilities = provider.getCapabilities ? await provider.getCapabilities() : { supportsTools: true };
  const toolsSupported = capabilities.supportsTools !== false;
  const systemPrompt = buildSystemPrompt(referenceContext, { toolsSupported });
  const tools = referenceContext.fiscalYear && toolsSupported ? [CREATE_REQUEST_TOOL, PROPOSE_REQUEST_TOOL] : [];
  const attachmentInvolved = conversationInvolvesAttachment(messages, attachments);

  const convo = [{ role: 'system', content: systemPrompt }];
  const toolTrace = [];
  // ID pod kojim su bajtovi priloga OVOG poteza spremljeni server-side —
  // treba ga se osloboditi čim je prilog stvarno spremljen uz zahtjev.
  let currentTurnStoreId = null;

  if (attachments.length > 0) {
    const quoteMsg = { role: 'system', content: buildAttachmentInstruction(attachments) };
    convo.push(quoteMsg);
    toolTrace.push(quoteMsg);

    // Ide SAMO u tool_trace (za echo natrag klijentu), NIKAD u convo — vidi
    // napomenu uz ATTACHMENT_DATA_MARKER gore.
    const carrier = buildAttachmentDataCarrier(attachments, userId);
    if (carrier) {
      toolTrace.push(carrier.message);
      currentTurnStoreId = carrier.storeId;
    }
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
  // Je li propose_request već uspješno pozvan unutar OVOG HTTP poziva — vidi
  // granu s pretvorbom create_request-a u prijedlog niže.
  let proposedInThisTurn = false;
  // Postavlja se čim modelu kažemo da mora pričekati korisnikovu potvrdu u
  // NOVOJ poruci. Tad u ovom potezu više nema ništa smisleno za napraviti —
  // vidi napomenu uz provjeru ispod petlje po tool pozivima.
  let awaitingUserConfirmation = false;
  // Uz tokene se zbraja i vrijeme provedeno U MODELU te broj poziva modelu.
  // Harness mjeri trajanje cijelog scenarija, u kojem su i HTTP put, PDF
  // ekstrakcija i upis u bazu — bez ovoga se ne može reći koliko od te brojke
  // otpada na sam model, što je nužno za poštenu usporedbu lokalnog i cloud
  // providera (docs/AI.md, RQ2).
  const usage = { promptTokens: 0, completionTokens: 0, modelLatencyMs: 0, modelCalls: 0 };
  const addUsage = (u) => {
    usage.promptTokens += u?.promptTokens || 0;
    usage.completionTokens += u?.completionTokens || 0;
    usage.modelLatencyMs += u?.latencyMs || 0;
    usage.modelCalls += 1;
  };

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const result = await provider.chat(convo, tools);
    addUsage({ ...result.usage, latencyMs: result.latencyMs });

    if (!result.tool_calls || result.tool_calls.length === 0) {
      if (result.text && result.text.trim()) {
        return {
          text: guardFalseCreationClaim(fixEkavica(result.text), createdRequest),
          created_request: createdRequest,
          tool_trace: toolTrace,
          usage,
        };
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
          // Model je prijedlog VEĆ dobio u ovom potezu — treba samo pričekati
          // korisnikovu potvrdu, pa se create_request niže ne pretvara ponovno.
          proposedInThisTurn = true;
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
          //
          // Brava NE piše ništa u bazu, ali poziv se ne odbija ni golo: model
          // koji preskoči propose_request (stvarno opaženo kod qwen3.5:9b —
          // uvijek zove create_request izravno) tad je znao prijedlog samo
          // PREPRIČATI u prozi. Kako proza nije tool rezultat, sljedeći potez
          // opet nije imao poklapajući prijedlog i razgovor je ulazio u
          // beskonačnu petlju "evo prijedloga, potvrdite?" bez ijednog
          // kreiranog zahtjeva. Zato se poziv PRETVARA u prijedlog: ista
          // validacija koju bi propose_request napravio, isti sažetak natrag
          // modelu, i dalje bez upisa. Jamstvo ostaje netaknuto — zahtjev
          // nastaje tek nakon korisnikove potvrde u SLJEDEĆOJ poruci, jer se
          // ovaj rezultat u povijesti tad prepoznaje kao valjan prijedlog
          // (vidi hasMatchingEarlierProposal).
          if (proposedInThisTurn) {
            // Prijedlog je već predan modelu ranije u ovom istom potezu —
            // pretvorba bi bila suvišna druga validacija istih podataka.
            // Ovdje fali SAMO korisnikova potvrda u novoj poruci.
            toolResultPayload = {
              ok: false,
              message: 'Prijedlog si već prezentirao. Pričekaj izričitu potvrdu korisnika u NOVOJ poruci prije ponovnog poziva create_request.',
            };
            awaitingUserConfirmation = true;
          } else {
            try {
              const converted = await executeProposeRequestTool(call.arguments);
              toolResultPayload = {
                ok: false,
                awaiting_confirmation: true,
                proposal: converted.proposal,
                message: 'Zahtjev NIJE kreiran. Prijedlog je provjeren i nalazi se u "proposal" — prezentiraj ga korisniku i zatraži izričitu potvrdu. Tek kad korisnik potvrdi u SLJEDEĆOJ poruci, ponovno pozovi create_request s ISTIM podacima.',
              };
              awaitingUserConfirmation = true;
            } catch (error) {
              if (error instanceof RequestValidationError) {
                toolResultPayload = { ok: false, message: error.message };
              } else {
                console.error('[assistant] konverzija create_request -> prijedlog nije uspjela:', error);
                toolResultPayload = {
                  ok: false,
                  message: 'Prvo prezentiraj prijedlog korisniku pozivom propose_request i pričekaj eksplicitnu potvrdu u novoj poruci.',
                };
              }
            }
          }
        } else {
          try {
            const resolved = resolveAttachmentsForSave(attachments, messages, userId);
            toolResultPayload = await executeCreateRequestTool(call.arguments, userId, resolved.files);
            createdRequest = {
              id_purchase_request: toolResultPayload.id_purchase_request,
              request_number: toolResultPayload.request_number,
              fk_request_status: toolResultPayload.fk_request_status,
            };
            // Prilog je sad trajno na disku uz zahtjev — privremena kopija u
            // memoriji više nema svrhu (inače bi ležala do isteka TTL-a).
            dropAttachments(resolved.storeId);
            dropAttachments(currentTurnStoreId);
            currentTurnStoreId = null;
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

    // Modelu je rečeno da čeka korisnikovu potvrdu — u OVOM potezu više nema
    // što napraviti, preostaje mu samo prezentirati prijedlog riječima.
    // Bez ovog izlaza model zna uporno ponavljati create_request dok ne
    // potroši MAX_ITERATIONS (stvarno opaženo, eval run 2026-08-31: scenariji
    // 1 i 9 pali su upravo tako — "propose ×2, create ×4" — pa je potez
    // završio bez ijednog odgovora, a model je zatim izmislio potvrdu koju je
    // morao presresti guardFalseCreationClaim). Dopušta se TOČNO JEDAN
    // dodatni poziv, samo da model sroči tekst; eventualne nove tool pozive
    // u njemu namjerno ignoriramo.
    if (awaitingUserConfirmation) {
      const closing = await provider.chat(convo, tools);
      addUsage({ ...closing.usage, latencyMs: closing.latencyMs });
      const closingText = closing.text && closing.text.trim()
        ? closing.text
        : 'Prijedlog zahtjeva je pripremljen, ali ga nisam uspio sažeti. Potvrdite kreiranje ili ponovite podatke.';
      return {
        text: guardFalseCreationClaim(fixEkavica(closingText), createdRequest),
        created_request: createdRequest,
        tool_trace: toolTrace,
        usage,
      };
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
