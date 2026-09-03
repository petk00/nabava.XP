#!/usr/bin/env node
// Eval harness za RQ1/RQ2 podatke (docs/AI.md, docs/EVAL_SCENARIOS.md).
//
// Generički runner: iterira kroz SVE scenarije definirane u evalScenarios.js
// (podaci, ne kod po scenariju), za svaki poziva stvarni POST
// /api/assistant/chat izravno (bez UI-a), po potrebi kroz VIŠE turnova
// (echo tool_trace/povijesti kako to stvarno radi klijent — vidi
// assistantOrchestrator.js), i za svaki pokušaj upisuje JEDAN red u JSON
// Lines izlaznu datoteku. NE boduje točnost — samo pouzdano sirovo hvatanje
// podataka (transkript sažetak, latencija, token usage, tool pozivi).
//
// Korištenje:
//   node scripts/evalHarness.js --provider=ollama
//   node scripts/evalHarness.js --provider=ollama --only=scenario1_pdf_tekst,scenario5_sve_u_jednoj_recenici
//   node scripts/evalHarness.js --provider=gemini --repeat=3
//   node scripts/evalHarness.js --provider=ollama --model=gemma4:e2b
//
// CLI/env parametri (svi opcionalni):
//   --provider=ollama|gemini   koji provider runner OČEKUJE da je aktivan
//                              (default: env EVAL_PROVIDER ili 'ollama').
//                              Ako su postavljeni EVAL_ADMIN_EMAIL/PASSWORD,
//                              runner GA I POSTAVI preko PUT /api/assistant/settings
//                              prije pokretanja — inače samo pretpostavlja
//                              da je već ručno postavljen i bilježi ga kao takvog.
//   --model=naziv              koji LOKALNI Ollama model evaluirati
//                              (AppSetting.ollama_model, katalog u
//                              llm/ollamaModels.js). Postavlja se istim
//                              settings API-jem kao provider, pa vrijedi ista
//                              ovisnost o EVAL_ADMIN_EMAIL/PASSWORD. Bez
//                              ovoga se evaluira model koji je trenutno
//                              zapisan u bazi.
//   --only=id1,id2             pokreni samo navedene scenario ID-jeve (pila
//                              za brzu provjeru prije punog runa)
//   --repeat=N                 override repeatCount za SVE scenarije u ovom runu
//   EVAL_BASE_URL, EVAL_USER_EMAIL, EVAL_USER_PASSWORD — isto kao dosad

const fs = require('fs');
const path = require('path');
const http = require('node:http');
const db = require('../src/config/db');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { DEFAULT_OLLAMA_MODEL } = require('../src/services/llm/ollamaModels');
const {
  getSamplingConfig, PROVIDER_SUPPORT, equalizedKeys, UNEQUALIZED_NOTE,
} = require('../src/services/llm/samplingConfig');
const { DEFAULT_VARIANT } = require('../src/services/promptVariant');
const {
  OLLAMA_NUM_CTX: OLLAMA_NUM_CTX_APPLIED,
  OLLAMA_KEEP_ALIVE: OLLAMA_KEEP_ALIVE_APPLIED,
} = require('../src/services/llm/ollamaProvider');
const { SCENARIOS, CLARIFICATIONS, MAX_CLARIFICATIONS } = require('./evalScenarios');

const BASE_URL = process.env.EVAL_BASE_URL || 'http://localhost:3000';
const USER_EMAIL = process.env.EVAL_USER_EMAIL || 'zaposlenik@veleri.hr';
const USER_PASSWORD = process.env.EVAL_USER_PASSWORD || '12345678';
const ADMIN_EMAIL = process.env.EVAL_ADMIN_EMAIL || null;
const ADMIN_PASSWORD = process.env.EVAL_ADMIN_PASSWORD || null;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
// Model NIJE više konstanta — bira se runtime postavkom AppSetting.ollama_model
// (vidi llm/ollamaModels.js). Fallback je katalogov default, NE tvrdo upisano
// ime: ranije je ovdje stajao 'gemma4:12b', model odavno izbačen iz kataloga,
// pa su svi runovi bez --model bili u metapodacima označeni krivim modelom
// (stvarno opaženo 2026-09-02 — mjerenja su bila ispravna, ali pripisana
// pogrešnom modelu, što je za usporedbu modela gore od pada runa).
// `ollamaModelSource` bilježi je li ime POTVRĐENO ili samo pretpostavljeno.
let ollamaModelName = DEFAULT_OLLAMA_MODEL;
let ollamaModelSource = `katalog default (pretpostavka — run nije proslijedio --model)`;

// Node-ov fetch (undici) ima tvrdi default headersTimeout/bodyTimeout od
// 300000ms (5 min), kraći od backendova VLASTITOG 10-min budžeta za čekanje
// na Ollamu (ollamaProvider.js REQUEST_TIMEOUT_MS) — spor ali uredan odgovor
// (npr. scenariji s više priloga) zato ispadne kao "fetch failed" iako
// backend nikad nije ni pao. Taj se limit ne može pouzdano nadjačati preko
// fetch()-ove "dispatcher" opcije (isprobano: vanjski 'undici' paket kao
// dispatcher baca UND_ERR_INVALID_ARG zbog neusklađenosti internih
// handler-sučelja s undici-jem ugrađenim u ovu Node verziju), pa poziv prema
// /api/assistant/chat ide preko node:http izravno — taj modul nema takav
// default, čeka koliko mu kažemo preko "timeout" opcije.
const CHAT_FETCH_TIMEOUT_MS = 11 * 60 * 1000;

/** POST prema /api/assistant/chat preko node:http (vidi napomenu gore zašto ne fetch). */
function postChat({ headers, bodyBuffer }) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}/api/assistant/chat`);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: 'POST',
        headers: { ...headers, 'Content-Length': bodyBuffer.length },
        timeout: CHAT_FETCH_TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: res.statusCode,
            ok: res.statusCode >= 200 && res.statusCode < 300,
            statusText: res.statusMessage,
            json: async () => JSON.parse(text),
          });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error(`Backend nije odgovorio u ${CHAT_FETCH_TIMEOUT_MS / 60000} min.`)));
    req.on('error', reject);
    req.write(bodyBuffer);
    req.end();
  });
}

function parseArgs() {
  const args = {
    provider: process.env.EVAL_PROVIDER || 'ollama',
    model: process.env.EVAL_OLLAMA_MODEL || null,
    only: null,
    repeat: null,
    kind: null,
  };
  for (const arg of process.argv.slice(2)) {
    // split('=') bi na "gemma4:e2b" bio bezopasan, ali naziv modela smije
    // sadržavati '=' u principu — uzmi sve iza prvog znaka jednakosti.
    const raw = arg.replace(/^--/, '');
    const eq = raw.indexOf('=');
    const key = eq === -1 ? raw : raw.slice(0, eq);
    const value = eq === -1 ? '' : raw.slice(eq + 1);
    if (key === 'provider') args.provider = value;
    if (key === 'kind') args.kind = value;
    // --attempts je alias za --repeat (brief traži oba naziva)
    if (key === 'attempts') args.repeat = Number(value) || null;
    if (key === 'model') args.model = value;
    if (key === 'only') args.only = value.split(',').map((s) => s.trim());
    if (key === 'repeat') args.repeat = Number(value);
  }
  return args;
}

const MIME_BY_EXT = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

async function login(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`Prijava (${email}) neuspješna (${res.status}): ${await res.text()}`);
  }
  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/token=([^;]+)/);
  if (!match) {
    throw new Error(`Prijava (${email}) uspjela, ali "token" cookie nije pronađen.`);
  }
  return match[1];
}

/**
 * Ako su admin kredencijali dostupni, stvarno postavlja provider (i, kad je
 * zadan, lokalni Ollama model) preko settings API-ja. Bez kredencijala samo
 * ČITA što je zapisano, da run metapodaci nose stvarno evaluirani model, a ne
 * pretpostavku — inače se rezultati ne mogu pripisati modelu.
 */
async function ensureProvider(providerArg, modelArg) {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log(`[evalHarness] EVAL_ADMIN_EMAIL/PASSWORD nisu postavljeni — pretpostavljam da je provider "${providerArg}" već ručno postavljen.`);
    if (modelArg) {
      throw new Error('--model zahtijeva EVAL_ADMIN_EMAIL/EVAL_ADMIN_PASSWORD (model se mijenja admin rutom).');
    }
    return { provider: providerArg, model: null, autoSet: false };
  }
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const body = { provider: providerArg };
  if (modelArg) body.ollama_model = modelArg;
  const res = await fetch(`${BASE_URL}/api/assistant/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Postavljanje providera na "${providerArg}"${modelArg ? ` / modela "${modelArg}"` : ''} neuspješno (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  console.log(`[evalHarness] Provider postavljen preko settings API-ja: ${data.provider}, lokalni model: ${data.ollama_model}`);
  return { provider: data.provider, model: data.ollama_model, autoSet: true };
}

/**
 * Ollamin /api/chat NEMA eksplicitno postavljen "temperature" u
 * ollamaProvider.js (samo num_ctx) — model koristi svoj Modelfile default.
 * Ovdje se taj default upita uživo preko /api/show, za RQ1/RQ2 metodološku
 * napomenu o varijanci (isti prompt zna dati vrlo različitu duljinu/sadržaj
 * odgovora upravo zbog visoke temperature).
 */
async function getOllamaTemperatureNote() {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: ollamaModelName }),
    });
    if (!res.ok) return { source: 'unavailable', temperature: null };
    const data = await res.json();
    const match = /temperature\s+([\d.]+)/.exec(data.parameters || '');
    const sampling = getSamplingConfig();
    return {
      // Modelfile default je ono što model NOSI; ollamaProvider.js ga od
      // uvođenja llm/samplingConfig.js PREGAZI eksplicitnim options. Oboje se
      // bilježi da se vidi što je zatečeno, a što stvarno primijenjeno.
      source: 'ollama /api/show (Modelfile default) — provider ga pregazi vrijednostima iz llm/samplingConfig.js',
      modelfile_temperature: match ? Number(match[1]) : null,
      applied_temperature: sampling.temperature,
      raw_parameters: data.parameters || null,
      top_k: (/top_k\s+(\d+)/.exec(data.parameters || '') || [])[1] ?? null,
      parameter_size: data.details?.parameter_size || null,
      quantization_level: data.details?.quantization_level || null,
      family: data.details?.family || null,
      // num_ctx i seed su ono što provider STVARNO šalje, ne ono što model nudi.
      num_ctx: OLLAMA_NUM_CTX_APPLIED,
      seed: sampling.seed,
      // KV cache modela PREŽIVLJAVA pokušaje (keep_alive), pa context_reset u
      // zapisu znači "nova povijest razgovora", ne "model bez ikakvog stanja".
      keep_alive: OLLAMA_KEEP_ALIVE_APPLIED,
    };
  } catch (error) {
    return { source: 'unavailable', temperature: null, error: error.message };
  }
}

/**
 * Gradi multipart/form-data tijelo za prvi turn (prilozi). Koristi FormData/
 * Response samo kao serijalizator u memoriji (bez mreže) da dobijemo ispravno
 * enkodirane bajtove + boundary za slanje preko node:http (vidi postChat).
 */
async function buildAttachmentsBody(turnText, attachmentPaths) {
  const form = new FormData();
  form.append('messages', JSON.stringify([{ role: 'user', content: turnText }]));
  for (const filePath of attachmentPaths) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = MIME_BY_EXT[ext] || 'application/octet-stream';
    const buffer = fs.readFileSync(filePath);
    form.append('file', new File([buffer], path.basename(filePath), { type: mimeType }));
  }
  const serialized = new Response(form);
  const bodyBuffer = Buffer.from(await serialized.arrayBuffer());
  const contentType = serialized.headers.get('content-type');
  return { bodyBuffer, contentType };
}

/** Skenira tool_trace za propose_request/create_request pozive (samo bilježenje, ne bodovanje). */
function summarizeToolTrace(toolTrace) {
  const summary = [];
  let proposeCalled = false;
  let createCalled = false;
  let proposeBeforeCreate = null;

  for (const msg of toolTrace) {
    if (msg.role === 'assistant' && Array.isArray(msg.tool_calls)) {
      for (const call of msg.tool_calls) {
        // Argumenti se NAMJERNO spremaju uz ime poziva: rubrika bodovanja
        // (docs kriterij_bodovanja.md, dimenzije A i E) razlikuje što je model
        // POSLAO od onoga što je SPREMLJENO u bazi. Bez argumenata se ne može
        // razlučiti je li model krivo pročitao ponudu ili je validacija/brava
        // odbila ispravan poziv.
        summary.push({ role: 'assistant_tool_call', name: call.name, arguments: call.arguments });
        if (call.name === 'propose_request') {
          if (!createCalled) proposeCalled = true;
        }
        if (call.name === 'create_request') {
          createCalled = true;
          if (proposeBeforeCreate === null) proposeBeforeCreate = proposeCalled;
        }
      }
    } else if (msg.role === 'tool') {
      // ISHOD poziva, ne samo činjenica da se dogodio. Bez ovoga se iz zapisa
      // ne može razlikovati poziv koji je alat prihvatio od onoga koji je
      // odbijen — a to je razlika između "model je pogriješio" i "brava je
      // odradila svoje". Poruka se krati jer služi za razvrstavanje, ne za
      // čitanje; puni tekst je i dalje u samom razgovoru.
      let ok = null;
      let awaiting = false;
      let message = null;
      try {
        const payload = JSON.parse(msg.content);
        if (typeof payload?.ok === 'boolean') ok = payload.ok;
        awaiting = payload?.awaiting_confirmation === true;
        if (typeof payload?.message === 'string') message = payload.message.slice(0, 120);
      } catch {
        // neparsabilan sadržaj ostaje bez ishoda
      }
      summary.push({
        role: 'tool_result',
        name: msg.name,
        ok,
        ...(awaiting ? { awaiting_confirmation: true } : {}),
        ...(message ? { message } : {}),
        // Skraćeni SADRŽAJ rezultata, ne samo poruka: bez njega se ne vidi je
        // li create_request pretvoren u prijedlog ili je zahtjev stvarno
        // nastao, pa ni propose_before_create nije provjerljiv iz zapisa
        // (nalaz C-probe, docs/c-proba.md).
        content: typeof msg.content === 'string' ? msg.content.slice(0, 2000) : null,
      });
    } else if (msg.role === 'system') {
      summary.push({ role: 'system', note: 'attachment_instruction' });
    }
  }

  return {
    tool_trace_summary: summary,
    propose_request_called: proposeCalled || summary.some((s) => s.name === 'propose_request'),
    create_request_called: createCalled,
    propose_before_create: proposeBeforeCreate,
  };
}

/** Izvuče "request_number" iz uspješnog create_request tool rezultata u tool_trace-u (ili null). */
function extractCreatedRequestNumber(toolTrace) {
  for (const msg of toolTrace) {
    if (msg.role === 'tool' && msg.name === 'create_request') {
      try {
        const payload = JSON.parse(msg.content);
        if (payload?.ok && payload.request_number) return payload.request_number;
      } catch {
        // ignoriraj neparsabilan sadržaj
      }
    }
  }
  return null;
}

/**
 * Dohvaća STVARNO spremljeno stanje kreiranog zahtjeva iz baze (ne ono što
 * je model TVRDIO da je poslao, nego ono što je requestService.js zaista
 * upisao) — nužno za bodovanje točnosti (usporedba s expectedResult u
 * evalScenarios.js), pošto tool_trace sam po sebi ne nosi nazive
 * odjela/kategorija ni potvrdu da je transakcija uistinu prošla.
 */
async function fetchCreatedRequest(requestNumber) {
  if (!requestNumber) return null;
  const [[request]] = await db.query(
    `SELECT pr.total_amount, pr.justification, d.name AS department_name
     FROM PurchaseRequest pr
     JOIN Department d ON d.id_department = pr.fk_department
     WHERE pr.request_number = ?`,
    [requestNumber]
  );
  if (!request) return null;
  const [items] = await db.query(
    `SELECT pri.item_name, pri.quantity, c.name AS category_name
     FROM PurchaseRequestItem pri
     JOIN ItemCategory c ON c.id_item_category = pri.fk_item_category
     JOIN PurchaseRequest pr ON pr.id_purchase_request = pri.fk_purchase_request
     WHERE pr.request_number = ?
     ORDER BY pri.id_purchase_request_item`,
    [requestNumber]
  );
  return {
    request_number: requestNumber,
    department_name: request.department_name,
    justification: request.justification,
    total_amount: request.total_amount === null ? null : Number(request.total_amount),
    items: items.map((i) => ({ item_name: i.item_name, quantity: i.quantity, category_name: i.category_name })),
  };
}

/**
 * Traži pojašnjenje koje odgovara na modelovo pitanje (evalScenarios.js:
 * CLARIFICATIONS). Vraća null ako model nije postavio pitanje ili ako se ni
 * jedno pojašnjenje ne poklapa — tada se ide na sljedeći korak skripte.
 */
function resolveClarification(responseText, alreadyUsed) {
  if (!responseText || !responseText.includes('?')) return null;
  for (const c of CLARIFICATIONS) {
    if (alreadyUsed.has(c.answer)) continue;
    if (c.match.test(responseText)) return c.answer;
  }
  return null;
}

/** Multiset količina, za usporedbu neovisnu o redoslijedu stavki. */
function quantitiesOf(items) {
  return (items || []).map((i) => Number(i?.quantity)).sort((a, b) => a - b);
}

/**
 * Mehanička provjera TOČNOSTI spremljenog zahtjeva (RQ1) — ono što harness
 * dosad NIJE radio, pa je scenarij s izmišljenim stavkama prolazio kao uspjeh
 * samo zato što je zahtjev nastao (stvarno opaženo: gemma4:e2b, scenarij 3,
 * "Kartuže za tonere HP 205A" na ponudi za uredski materijal).
 *
 * Uspoređuje se SAMO ono što je mehanički provjerljivo — broj stavki, količine
 * i odjel. Nazivi se NAMJERNO ne uspoređuju: model legitimno parafrazira
 * ("ETIK.45,7x21,2mm" -> "etikete"), pa bi doslovna usporedba lažno prijavila
 * greške. Nazivi ostaju na ručnoj provjeri (scoreEvalResults.js).
 */

const GROUND_TRUTH_DIR = path.join(__dirname, '..', 'eval', 'ground-truth');

/**
 * Ground truth se čita ISKLJUČIVO iz eval/ground-truth/<id>.json — verzioniranog
 * artefakta koji ide u prilog rada. Ranije je živio kao `expectedResult` unutar
 * evalScenarios.js, dakle kao logika zakopana u kodu, pa se nije mogao ni
 * citirati ni neovisno provjeriti.
 *
 * Nedostajuća datoteka je TVRDA GREŠKA, ne tihi preskok: scenarij bez mjerila
 * ne smije proći kao da je izmjeren.
 */
function loadGroundTruth(scenarioId) {
  const file = path.join(GROUND_TRUTH_DIR, `${scenarioId}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Nema ground trutha za "${scenarioId}" (${file}). `
      + 'Scenarij se ne smije mjeriti bez mjerila.');
  }
  const gt = JSON.parse(fs.readFileSync(file, 'utf8'));
  const items = (gt.fields?.items || []).map((it) => ({
    item_name: it.item_name?.value ?? null,
    quantity: it.quantity?.value ?? null,
    category_name: it.category_name?.value ?? null,
    acceptable_categories: it.category_name?.acceptable_categories || [],
    category_ambiguous: it.category_name?.ambiguous === true,
  }));
  return {
    decision: gt.expected_decision,
    expects_refusal: gt.expects_refusal === true,
    input_modality: gt.input_modality || null,
    department_name: gt.fields?.department_name?.value ?? null,
    total_amount: gt.fields?.total_amount?.value ?? null,
    total_amount_acceptable: gt.fields?.total_amount?.acceptable ?? null,
    items,
    category_codebook_sha256: gt.category_codebook_sha256_16 || null,
  };
}

/**
 * Točnost dodjele kategorije — ZASEBNA mjera, ne dio provjere utemeljenosti:
 * šifrarničko polje ne može biti izmišljeno, samo krivo dodijeljeno.
 *
 * Boduje se dvojako (docs/mjerni-plan.md §6): STROGO priznaje samo očekivanu
 * kategoriju, BLAGO bilo koju iz acceptable_categories. Razlika između te dvije
 * brojke mjeri koliko dodjela ovisi o konvenciji ustanove, a koliko o
 * prepoznavanju predmeta.
 *
 * Uspoređuje se po REDOSLIJEDU stavaka; kad se broj stavaka ne poklapa, mjera
 * nije definirana (null) umjesto da se poravnava nagađanjem.
 */
function checkCategoryAssignment(actual, expectedItems) {
  const actualItems = actual?.items || [];
  if (!expectedItems.length || actualItems.length !== expectedItems.length) {
    return { checked: 0, strict: null, lenient: null, mismatches: [] };
  }
  let strict = 0;
  let lenient = 0;
  const mismatches = [];
  expectedItems.forEach((exp, i) => {
    const got = actualItems[i]?.category_name ?? null;
    const isStrict = got === exp.category_name;
    const isLenient = (exp.acceptable_categories || [exp.category_name]).includes(got);
    if (isStrict) strict += 1;
    if (isLenient) lenient += 1;
    if (!isLenient) {
      mismatches.push({
        item_name: exp.item_name,
        expected: exp.category_name,
        acceptable: exp.acceptable_categories,
        actual: got,
      });
    }
  });
  return { checked: expectedItems.length, strict, lenient, mismatches };
}

function checkAccuracy(actual, expected) {
  if (!expected) return null;
  // Scenariji s decision:'refuse' (npr. scenario7_nije_ponuda) su TOČNI upravo
  // kad zahtjev NE nastane. Bez ove grane bilo je obratno: ispravno odbijanje
  // bilježilo se kao created:false, dakle kao pad, a scenarij bi "prošao" samo
  // da je sustav popustio i kreirao zahtjev iz dokumenta koji nije ponuda.
  //
  // `created` ostaje ČINJENICA (je li zahtjev nastao), a ocjena scenarija je
  // `decision_match` — namjerno se ne preslikava uspjeh u `created`, jer bi
  // "created: true" uz nepostojeći zahtjev krivo čitao svatko tko gleda JSONL.
  // Zato zbrajanje točnih scenarija mora gledati decision_match kad postoji.
  // Očekuje li scenarij odbijanje čita se iz IZRIČITE zastavice, ne zaključuje
  // iz `decision` — zastavica je dio ground trutha i vidljiva je u zapisu.
  if (expected.expects_refusal) {
    return {
      created: Boolean(actual),
      decision_match: !actual,
      item_count_match: null,
      quantities_match: null,
      department_match: null,
    };
  }
  if (!actual) {
    return { created: false, item_count_match: null, quantities_match: null, department_match: null };
  }
  const expectedQty = quantitiesOf(expected.items);
  const actualQty = quantitiesOf(actual.items);
  // Iznos: expectedResult.total_amount_acceptable je niz prihvatljivih
  // vrijednosti (ponuda zna imati više iznosa), null kad iznos nije zadan.
  let amountMatch = null;
  if (Array.isArray(expected.total_amount_acceptable)) {
    const actualAmount = actual.total_amount === null || actual.total_amount === undefined
      ? null
      : Number(actual.total_amount);
    amountMatch = actualAmount !== null
      && expected.total_amount_acceptable.some((a) => Math.abs(a - actualAmount) < 0.01);
  }

  return {
    created: true,
    item_count_match: (expected.items || []).length === (actual.items || []).length,
    quantities_match: expectedQty.length === actualQty.length
      && expectedQty.every((q, i) => q === actualQty[i]),
    department_match: expected.department_name
      ? String(actual.department_name || '').trim() === expected.department_name
      : null,
    amount_match: amountMatch,
  };
}

/** Jedan pokušaj JEDNOG scenarija — može uključivati više turnova (echo tool_trace/povijesti). */
async function runOneAttempt(scenario, token, provider, attemptNumber, runId, promptStore) {
  const groundTruth = loadGroundTruth(scenario.id);
  const startedAt = new Date().toISOString();
  const start = process.hrtime.bigint();

  let conversation = [];
  let allToolTrace = [];
  const usage = {
    promptTokens: 0, completionTokens: 0, modelLatencyMs: 0, modelCalls: 0,
    modelCallLatenciesMs: [], rateLimitWaitMs: 0,
    finishReasons: [], truncated: false, modelVersion: null, modelVersionsSeen: [],
  };
  let lastResponseText = null;
  let httpStatus = null;
  let errorMessage = null;

  // Skripta scenarija + eventualna umetnuta pojašnjenja (vidi
  // resolveClarification): red čekanja umjesto fiksne petlje, da se odgovor na
  // modelovo pitanje može ubaciti IZMEĐU koraka.
  const pending = [...scenario.turns];
  const turnsSent = [];
  const usedClarifications = new Set();
  let clarificationsUsed = 0;
  // Odziv kakav korisnik osjeti: od slanja poruke do PRVOG odgovora, uključujući
  // ekstrakciju priloga i sve pozive modelu unutar tog poteza. Nije isto što i
  // trajanje prvog poziva modelu (model_call_latencies_ms[0]).
  let timeToFirstResponseMs = null;
  const promptHashes = new Set();
  let promptVariant = null;
  let codebookSha = null;

  try {
    for (let turnIdx = 0; pending.length > 0; turnIdx++) {
      const turnText = pending.shift();
      turnsSent.push(turnText);
      const isFirstTurn = turnIdx === 0;
      const hasAttachments = isFirstTurn && scenario.attachments.length > 0;

      let res;
      if (hasAttachments) {
        const { bodyBuffer, contentType } = await buildAttachmentsBody(turnText, scenario.attachments);
        res = await postChat({
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': contentType,
            'X-Include-System-Prompt': '1',
          },
          bodyBuffer,
        });
      } else {
        conversation.push({ role: 'user', content: turnText });
        const bodyBuffer = Buffer.from(JSON.stringify({ messages: conversation }), 'utf8');
        res = await postChat({
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Include-System-Prompt': '1',
          },
          bodyBuffer,
        });
      }

      httpStatus = res.status;
      if (timeToFirstResponseMs === null) {
        timeToFirstResponseMs = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        errorMessage = body?.message || res.statusText;
        break;
      }

      if (hasAttachments) {
        // Multipart prvi turn: server sam gradi povijest od "messages" polja
        // (JSON string) — klijent za sljedeći turn mora ručno sastaviti punu
        // povijest (poruka + tool_trace), isto kao svaki idući turn ovdje.
        conversation = [{ role: 'user', content: turnText }];
      }

      conversation.push(...(body.tool_trace || []));
      conversation.push({ role: 'assistant', content: body.text || '' });

      allToolTrace.push(...(body.tool_trace || []));
      usage.promptTokens += body.usage?.promptTokens || 0;
      usage.completionTokens += body.usage?.completionTokens || 0;
      usage.modelLatencyMs += body.usage?.modelLatencyMs || 0;
      usage.modelCalls += body.usage?.modelCalls || 0;
      usage.rateLimitWaitMs += body.usage?.rateLimitWaitMs || 0;
      usage.modelCallLatenciesMs.push(...(body.usage?.modelCallLatenciesMs || []));
      usage.finishReasons.push(...(body.usage?.finishReasons || []));
      if (body.usage?.truncated) usage.truncated = true;
      if (body.usage?.modelVersion) {
        usage.modelVersion = body.usage.modelVersion;
        for (const v of body.usage.modelVersionsSeen || []) {
          if (!usage.modelVersionsSeen.includes(v)) usage.modelVersionsSeen.push(v);
        }
      }
      lastResponseText = body.text ?? null;
      // Prompt se sastavlja po zahtjevu (kategorije iz baze, uvjetna uputa o
      // prilogu), pa se hash bilježi po POKUŠAJU, a puni tekst jednom po
      // jedinstvenom hashu — inače bi se 3 kB ponavljalo u svakom retku.
      if (body.system_prompt_hash) {
        promptHashes.add(body.system_prompt_hash);
        promptVariant = body.prompt_variant ?? promptVariant;
        codebookSha = body.category_codebook_sha256 ?? codebookSha;
        if (body.system_prompt && promptStore && !promptStore[body.system_prompt_hash]) {
          promptStore[body.system_prompt_hash] = body.system_prompt;
        }
      }

      // Zahtjev je kreiran — preostali koraci skripte nemaju svrhu. Bez ovoga
      // se nakon uspjeha slao još jedan "potvrđujem", što je trošilo poziv
      // modelu i još ga poticalo da pokuša kreirati DRUGI zahtjev (sustav to
      // odbija, vidi findEarlierSuccessfulCreate, ali vrijeme se potroši).
      // Scenariji koji mjere ponašanje NAKON kreiranja (npr. traži li korisnik
      // izmjenu pa model pokuša duplikat) moraju dobiti preostale korake —
      // njima rani izlaz poništava upravo ono što testiraju.
      if (!scenario.continueAfterCreate && extractCreatedRequestNumber(allToolTrace)) break;

      // Model je postavio pitanje, a zahtjev još nije kreiran — umetni odgovor
      // kao dodatni korak umjesto da se ide dalje po skripti (koja na to
      // pitanje nema odgovor). Ograničeno MAX_CLARIFICATIONS-om.
      if (clarificationsUsed < MAX_CLARIFICATIONS && !extractCreatedRequestNumber(allToolTrace)) {
        const answer = resolveClarification(lastResponseText, usedClarifications);
        if (answer) {
          usedClarifications.add(answer);
          clarificationsUsed += 1;
          pending.unshift(answer);
        }
      }
    }
  } catch (networkError) {
    errorMessage = networkError.message;
  }

  const latencyMs = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
  const { tool_trace_summary, propose_request_called, create_request_called, propose_before_create } =
    summarizeToolTrace(allToolTrace);

  let actualCreatedRequest = null;
  if (create_request_called) {
    const requestNumber = extractCreatedRequestNumber(allToolTrace);
    actualCreatedRequest = await fetchCreatedRequest(requestNumber);
  }

  return {
    run_id: runId,
    scenario_id: scenario.id,
    scenario_description: scenario.description,
    attempt: attemptNumber,
    // Svaki pokušaj kreće iz PRAZNE povijesti razgovora (conversation = [])
    // i sam pribavlja prilog. Što se NE resetira: baza (zahtjevi iz ranijih
    // pokušaja ostaju) i KV cache lokalnog modela (keep_alive) — vidi
    // ollama_keep_alive u manifestu i docs/mjerni-plan.md.
    context_reset: true,
    provider,
    timestamp: startedAt,
    turns_sent: turnsSent,
    attachments: scenario.attachments.map((p) => path.basename(p)),
    expects_propose_before_create: scenario.expectsProposeBeforeCreate,
    latency_ms: latencyMs,
    http_status: httpStatus,
    success: httpStatus === 200 && !errorMessage,
    error: errorMessage,
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    // latency_ms je trajanje CIJELOG scenarija (HTTP, PDF ekstrakcija, baza,
    // svi turnovi). model_latency_ms je samo ono provedeno u modelu, a
    // model_calls koliko je puta model pozvan — bez toga se ne zna je li
    // scenarij spor zbog modela ili zbog broja koraka.
    model_latency_ms: usage.modelLatencyMs,
    model_calls: usage.modelCalls,
    // Trajanje SVAKOG poziva zasebno — medijan i p95 po pozivu se iz zbroja
    // ne mogu izračunati.
    model_call_latencies_ms: usage.modelCallLatenciesMs,
    rate_limit_wait_ms: usage.rateLimitWaitMs,
    time_to_first_response_ms: timeToFirstResponseMs,
    // Odrezan odgovor (num_predict / maxOutputTokens) je artefakt mjerne
    // postavke, ne svojstvo modela. U završnom runu je razlog za poništenje.
    finish_reasons: usage.finishReasons,
    truncated: usage.truncated,
    model_version_reported: usage.modelVersion,
    model_versions_seen: usage.modelVersionsSeen,
    // Koliko je puta harness morao odgovoriti na modelovo pitanje. Model koji
    // zadatak riješi bez ijednog pojašnjenja bolji je od onog kojem su trebala
    // tri, iako oba završe s kreiranim zahtjevom.
    clarifications_used: clarificationsUsed,
    turns_total: turnsSent.length,
    prompt_variant: promptVariant,
    // Više hasheva u jednom pokušaju znači da se prompt mijenjao između
    // koraka — očekivano kod priloga (uputa se dodaje), sumnjivo inače.
    system_prompt_hash: promptHashes.size === 1 ? [...promptHashes][0] : [...promptHashes],
    system_prompt_hash_count: promptHashes.size,
    category_codebook_sha256: codebookSha,
    propose_request_called,
    create_request_called,
    propose_before_create,
    // Mehanička provjera točnosti spremljenog zahtjeva (checkAccuracy):
    // razdvaja "zahtjev je nastao" od "zahtjev je ISPRAVAN".
    input_modality: groundTruth.input_modality,
    expects_refusal: groundTruth.expects_refusal,
    accuracy: checkAccuracy(actualCreatedRequest, groundTruth),
    // Zasebna mjera, uz strogo i blago bodovanje (docs/mjerni-plan.md §6).
    category_assignment: checkCategoryAssignment(actualCreatedRequest, groundTruth.items),
    ground_truth_codebook_sha256: groundTruth.category_codebook_sha256,
    tool_trace_summary,
    final_response_text: lastResponseText,
    actual_created_request: actualCreatedRequest,
  };
}

/** Git stanje radnog stabla iz kojeg se harness pokreće. */
function harnessGitInfo() {
  const run = (args) => {
    try {
      return execFileSync('git', args, {
        cwd: path.join(__dirname, '..', '..'), encoding: 'utf8', timeout: 5000,
      }).trim();
    } catch { return null; }
  };
  const status = run(['status', '--porcelain']);
  return {
    commit: run(['rev-parse', 'HEAD']),
    dirty: status === null ? null : status.length > 0,
    branch: run(['rev-parse', '--abbrev-ref', 'HEAD']),
  };
}

/**
 * Verzija koda koji POSLUŽITELJ vrti (GET /version) naspram one iz koje se
 * harness pokreće. Neslaganje znači da se mjeri nešto drugo od onoga što
 * metapodaci tvrde — stvarno opaženo dvaput 2026-09-02, kad je osirotjeli
 * proces držao port s kodom starim sat i pol. Kod --kind=final to je TVRDI
 * PREKID, ne upozorenje (docs/mjerni-plan.md, protokol završnog mjerenja).
 */
async function checkServerVersion(harnessGit, runKind) {
  let server = null;
  try {
    const res = await fetch(`${BASE_URL}/version`);
    if (res.ok) server = await res.json();
  } catch { /* server bez /version rute — stariji build */ }

  if (!server) {
    const msg = '[evalHarness] Poslužitelj ne izlaže /version — verzija koda koji vrti NIJE provjerljiva.';
    if (runKind === 'final') throw new Error(`${msg} Završni run se ne pokreće bez te provjere.`);
    console.warn(`${msg} (nastavljam jer run_kind nije "final")`);
    return {
      server: null, matches: null, variantMatches: null,
      intendedVariant: process.env.PROMPT_VARIANT || DEFAULT_VARIANT,
    };
  }

  const matches = server.commit === harnessGit.commit;
  console.log(`[evalHarness] Poslužitelj: ${String(server.commit).slice(0, 8)} `
    + `(dirty=${server.dirty}), harness: ${String(harnessGit.commit).slice(0, 8)} (dirty=${harnessGit.dirty})`);

  // prompt_variant je varijabla koju rad MJERI — pretpostaviti je jednako je
  // opasno kao pretpostaviti commit. Bez ove provjere cijeli 2×2 nacrt počiva
  // na tome da se netko sjetio izvezti pravu varijablu okoline.
  const intended = process.env.PROMPT_VARIANT || DEFAULT_VARIANT;
  const variantMatches = server.prompt_variant === intended;
  console.log(`[evalHarness] prompt_variant — poslužitelj: ${server.prompt_variant}, `
    + `harness očekuje: ${intended}`);

  if (runKind === 'final') {
    if (!variantMatches) {
      throw new Error(`Poslužitelj vrti prompt_variant="${server.prompt_variant}", `
        + `harness očekuje "${intended}". Završni run traži isti uvjet na obje strane.`);
    }
    if (!matches) {
      throw new Error(`Poslužitelj vrti commit ${server.commit}, harness ${harnessGit.commit}. `
        + 'Završni run traži isti commit — restartaj poslužitelj.');
    }
    if (server.dirty !== false || harnessGit.dirty !== false) {
      throw new Error('Završni run traži čisto radno stablo (dirty=false) na obje strane. '
        + `Poslužitelj: ${server.dirty}, harness: ${harnessGit.dirty}.`);
    }
  } else {
    if (!matches) {
      console.warn('[evalHarness] UPOZORENJE: poslužitelj i harness NISU na istom commitu — '
        + 'mjeri se kod koji proces već ima učitan, ne onaj na disku.');
    }
    if (!variantMatches) {
      console.warn(`[evalHarness] UPOZORENJE: prompt_variant se razlikuje `
        + `(poslužitelj "${server.prompt_variant}", očekivano "${intended}").`);
    }
  }
  return { server, matches, variantMatches, intendedVariant: intended };
}

/**
 * Rječnici koje je model VIDIO u sustavnom promptu, snimljeni uz run.
 * Bez ovoga category_name nije provjerljiv iz samog zapisa: popis kategorija
 * ulazi kroz buildSystemPrompt, a tool_trace ga ne bilježi (nalaz C-probe).
 */
async function snapshotCodebooks() {
  try {
    const [categories] = await db.query(
      `SELECT c.id_item_category, c.name, c.is_active, f.year
         FROM ItemCategory c JOIN FiscalYear f ON f.id_fiscal_year = c.fk_fiscal_year
        ORDER BY c.id_item_category`
    );
    const [departments] = await db.query(
      `SELECT d.id_department, d.name, f.year
         FROM Department d JOIN FiscalYear f ON f.id_fiscal_year = d.fk_fiscal_year
        ORDER BY d.id_department`
    );
    return { fetched_at: new Date().toISOString(), categories, departments };
  } catch (error) {
    return { fetched_at: new Date().toISOString(), error: error.message };
  }
}

/** Stanje baze relevantno za scenarije, prije i poslije pokušaja. */
async function snapshotDbState() {
  try {
    const [[row]] = await db.query(
      `SELECT COUNT(*) AS request_count, MAX(request_number) AS last_request_number
         FROM PurchaseRequest`
    );
    const [[items]] = await db.query('SELECT COUNT(*) AS item_count FROM PurchaseRequestItem');
    return {
      request_count: Number(row.request_count),
      last_request_number: row.last_request_number,
      item_count: Number(items.item_count),
    };
  } catch (error) {
    return { error: error.message };
  }
}


/**
 * Zagrijavanje prije mjerenja.
 *
 * Prvi poziv lokalnom modelu nosi učitavanje težina u memoriju, pa bi se to
 * vrijeme pripisalo prvom scenariju i lokalna izvedba ispala sporija nego što
 * jest. Stvarno opaženo u pilot runu: trajanja poziva unutar jednog pokušaja
 * bila su [26257, 12677, 15831] ms — prvi dvostruko sporiji od drugog.
 *
 * Zagrijava se IZRAVNO preko Ollame, ne kroz aplikaciju: cilj je učitati model,
 * a ne stvoriti zahtjev u bazi ni potrošiti korak scenarija.
 *
 * Za Gemini se ne radi: nema učitavanja modela, a poziv bi trošio dnevnu kvotu
 * (besplatna razina: 20 poziva/dan). Razlog se zapisuje umjesto da polje ostane
 * prazno bez objašnjenja.
 */
async function warmUpModel(provider, modelName) {
  if (provider !== 'ollama') {
    return {
      performed: false,
      reason: `provider "${provider}" nema učitavanje modela; poziv bi trošio kvotu`,
      ms: null,
    };
  }
  const started = process.hrtime.bigint();
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: 'ok' }],
        stream: false,
        options: { num_predict: 1 },
      }),
    });
    const ms = Number((process.hrtime.bigint() - started) / 1000000n);
    if (!res.ok) return { performed: false, reason: `HTTP ${res.status}`, ms };
    return { performed: true, reason: null, ms, model: modelName };
  } catch (error) {
    return { performed: false, reason: error.message, ms: null };
  }
}

async function main() {
  const args = parseArgs();
  const scenarios = args.only ? SCENARIOS.filter((s) => args.only.includes(s.id)) : SCENARIOS;
  if (scenarios.length === 0) {
    throw new Error(`Nijedan scenarij ne odgovara --only=${args.only?.join(',')}`);
  }
  if (args.repeat) {
    for (const s of scenarios) s.repeatCount = args.repeat;
  }

  const outputDir = path.join(__dirname, '..', 'eval-results');
  fs.mkdirSync(outputDir, { recursive: true });
  const runStartedAt = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = path.join(outputDir, `run_${runStartedAt}.jsonl`);
  // .meta.json ostaje pod starim imenom da stariji runovi i evalCost.js i dalje
  // rade; run_manifest.json je ista datoteka pod imenom iz mjernog plana.
  const metaFile = path.join(outputDir, `run_${runStartedAt}.meta.json`);
  const manifestFile = path.join(outputDir, `run_${runStartedAt}.run_manifest.json`);

  console.log(`[evalHarness] Prijava kao ${USER_EMAIL}...`);
  const token = await login(USER_EMAIL, USER_PASSWORD);

  const { provider, model, autoSet } = await ensureProvider(args.provider, args.model);
  // /api/show i metapodaci moraju gledati STVARNO aktivan model.
  if (provider === 'ollama' && model) {
    ollamaModelName = model;
    ollamaModelSource = 'settings API (potvrđeno)';
  }

  const temperatureNote = provider === 'ollama' ? await getOllamaTemperatureNote() : { source: 'n/a (provider nije ollama)', temperature: null };
  console.log(`[evalHarness] Provider: ${provider} (auto-postavljen preko API-ja: ${autoSet})`);
  if (provider === 'ollama') console.log(`[evalHarness] Lokalni model: ${ollamaModelName}`);
  console.log(`[evalHarness] Temperature napomena: ${JSON.stringify(temperatureNote)}`);

  // run_kind odlučuje ulazi li run u rad. Default je NAMJERNO 'smoke': mjerenje
  // koje ide u rad mora biti izričito označeno, da se probni prolaz nikad ne
  // nađe u konačnoj tablici zato što je netko zaboravio zastavicu.
  const runKind = args.kind || 'smoke';
  if (!['pilot', 'final', 'sensitivity', 'smoke'].includes(runKind)) {
    throw new Error(`--kind mora biti pilot|final|sensitivity|smoke (dobiveno: "${runKind}")`);
  }

  // Zastavice stoje na DVA mjesta: u scenariju (za filtriranje i izvještaje) i
  // u ground truthu (kao mjerilo). Ako se raziđu, izvještaj bi grupirao po
  // jednoj vrijednosti a bodovao po drugoj — ista zamka kao zastarjeli server.
  for (const sc of scenarios) {
    const gt = loadGroundTruth(sc.id);
    if (sc.inputModality !== gt.input_modality || sc.expectsRefusal !== gt.expects_refusal) {
      throw new Error(`Scenarij "${sc.id}" i njegov ground truth se ne slažu: `
        + `scenarij (modality=${sc.inputModality}, refusal=${sc.expectsRefusal}) vs `
        + `ground truth (modality=${gt.input_modality}, refusal=${gt.expects_refusal}).`);
    }
  }

  const runId = crypto.randomUUID();
  const harnessGit = harnessGitInfo();
  const serverVersion = await checkServerVersion(harnessGit, runKind);
  const codebooks = await snapshotCodebooks();
  const dbBefore = await snapshotDbState();

  const sampling = getSamplingConfig();
  const equalized = equalizedKeys();
  const totalAttempts = scenarios.reduce((sum, s) => sum + s.repeatCount, 0);
  console.log(`[evalHarness] Scenariji: ${scenarios.map((s) => s.id).join(', ')}`);
  console.log(`[evalHarness] Ukupno pokušaja: ${totalAttempts}`);
  console.log(`[evalHarness] Izlaz: ${outputFile}`);

  const manifest = {
    run_id: runId,
    run_started_at: runStartedAt,
    run_kind: runKind,
    // Obje strane, ne jedna: harness i poslužitelj mogu biti na različitom kodu.
    git_harness: harnessGit,
    git_server: serverVersion.server,
    git_matches: serverVersion.matches,
    // Izvor istine je ono što POSLUŽITELJ javlja; namjera harnessa se bilježi
    // zasebno, da se neslaganje vidi i naknadno.
    prompt_variant: serverVersion.server?.prompt_variant ?? null,
    prompt_variant_intended: serverVersion.intendedVariant,
    prompt_variant_matches: serverVersion.variantMatches,
    category_codebook_sha256: serverVersion.server?.category_codebook_sha256 ?? null,
    codebook_excerpt_sha256: serverVersion.server?.codebook_excerpt_sha256 ?? null,
    // Rječnici koje je model vidio — bez njih category_name nije provjerljiv.
    codebooks,
    db_state_before: dbBefore,
    provider,
    provider_auto_set: autoSet,
    // Parametri uzorkovanja stvarno primijenjeni na OBA pružatelja
    // (llm/samplingConfig.js). `sampling_equalized` je true samo za parametre
    // koje oba podržavaju — Gemini nema seed, pa determinizam nije izjednačen
    // i to se ne smije prešutjeti.
    sampling_config: sampling,
    sampling_equalized: equalized.length > 0,
    sampling_equalized_keys: equalized,
    sampling_provider_support: PROVIDER_SUPPORT,
    sampling_unequalized: UNEQUALIZED_NOTE,
    // Bez ovoga se JSONL redovi ne mogu pripisati konkretnom lokalnom modelu
    // (od uvođenja AppSetting.ollama_model provider više ne implicira model).
    ollama_model: provider === 'ollama' ? ollamaModelName : null,
    ollama_model_source: provider === 'ollama' ? ollamaModelSource : null,
    ollama_temperature_note: temperatureNote,
    scenarios: scenarios.map((s) => ({ id: s.id, description: s.description, repeat_count: s.repeatCount, turns: s.turns.length, attachments: s.attachments.length })),
    total_attempts: totalAttempts,
  };
  fs.writeFileSync(metaFile, JSON.stringify(manifest, null, 2));

  const warmup = await warmUpModel(provider, ollamaModelName);
  console.log(`[evalHarness] Zagrijavanje: ${warmup.performed ? `${warmup.ms} ms` : `preskočeno (${warmup.reason})`}`);
  manifest.warmup = warmup;

  const writeStream = fs.createWriteStream(outputFile, { flags: 'a' });
  const truncatedAttempts = [];
  const promptStore = {};
  let completed = 0;

  // KRUGOVI, ne nizovi. Vrtjeti scenarij deset puta zaredom pa prijeći na
  // sljedeći znači da se s rednim brojem pokušaja sustavno poklapaju dvije
  // stvari: predmemorija modela je najhladnija na prvom pokušaju svakog
  // scenarija, a baza najpunija na zadnjima. Oboje se uvlači u mjeru brzine i
  // dosljednosti. Jedan prolaz kroz sve scenarije, pa ponovo — što ujedno
  // bolje odgovara stvarnoj uporabi. Vidi docs/mjerni-plan.md.
  const maxRounds = Math.max(...scenarios.map((s) => s.repeatCount));
  for (let round = 1; round <= maxRounds; round++) {
    console.log(`\n[evalHarness] ===== KRUG ${round}/${maxRounds} =====`);
    for (const scenario of scenarios) {
      if (round > scenario.repeatCount) continue;
      const attempt = round;
      completed += 1;
      process.stdout.write(`[evalHarness] (${completed}/${totalAttempts}) krug ${round} — ${scenario.id} pokušaj ${attempt}/${scenario.repeatCount}... `);
      const record = await runOneAttempt(scenario, token, provider, attempt, runId, promptStore);
      record.round = round;
      record.position_in_run = completed;
      writeStream.write(`${JSON.stringify(record)}\n`);
      console.log(record.success ? `OK (${record.latency_ms}ms, create=${record.create_request_called})` : `FAIL (${record.error})`);
      if (record.truncated) {
        truncatedAttempts.push(`${scenario.id}#${attempt}`);
        console.warn(`[evalHarness] !!! ODREZAN ODGOVOR (${record.finish_reasons.join(',')}) — `
          + `pokušaj je udario u max_output_tokens. Bodovanje bi to zabilježilo kao grešku modela.`);
      }
    }
  }

  await new Promise((resolve) => writeStream.end(resolve));
  manifest.db_state_after = await snapshotDbState();
  // Po jedan unos za svaki jedinstveni hash koji se u runu pojavio. Više
  // hasheva nego što uvjeti predviđaju znači da se prompt mijenjao ispod ruke
  // i run je sumnjiv — analyze.js to prijavljuje kao upozorenje.
  manifest.system_prompts = promptStore;
  manifest.system_prompt_hash_count = Object.keys(promptStore).length;
  fs.writeFileSync(metaFile, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  console.log(`\n[evalHarness] Gotovo. Rezultati u ${outputFile}`);
  console.log(`[evalHarness] Metapodaci u ${metaFile}`);
  if (truncatedAttempts.length > 0) {
    console.warn(`\n[evalHarness] !!! ${truncatedAttempts.length} pokušaja s ODREZANIM odgovorom: `
      + `${truncatedAttempts.join(', ')}`);
    if (runKind === 'final') {
      console.warn('[evalHarness] !!! Ovo je run_kind=final — prema protokolu mjerenja run se PONIŠTAVA '
        + 'i vrti ispočetka, ne krpa. Vidi docs/mjerni-plan.md.');
      process.exitCode = 2;
    }
  }
}

main()
  .catch((error) => {
    console.error('[evalHarness] Greška:', error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
