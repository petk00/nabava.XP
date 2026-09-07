#!/usr/bin/env node
// Eval harness za mjerenje AI čitanja ponude (docs/mjerni-plan.md).
//
// PREDMET MJERENJA JE PROMIJENJEN. Chat asistenta je uklonjen iz sustava, pa
// harness više ne vodi razgovor s modelom. Mjeri se jedini put kojim model
// danas dira podatke: POST /api/requests/:id/ai-items — model pročita ponudu
// priloženu uz postojeći zahtjev i njome zamijeni stavke i ukupan iznos.
//
// Za svaki scenarij harness JEDNOM pripremi zahtjev (kreira ga i priloži mu
// ponude iz fixtures/), pa taj isti zahtjev obrađuje N puta. Ponavljanja su
// neovisna: promptu ulaze samo tekst ponude i šifrarnik kategorija, nikad
// zatečene stavke — pa prethodni pokušaj ne može utjecati na sljedeći.
//
// Jedan red u JSONL izlazu = jedan pokušaj. Harness NE boduje nazive stavki
// (model ih legitimno parafrazira) — to ostaje na scoreEvalResults.js.
//
// Korištenje:
//   node scripts/evalHarness.js --provider=ollama
//   node scripts/evalHarness.js --provider=gemini --repeat=30 --kind=final
//   node scripts/evalHarness.js --provider=ollama --model=gemma4:e2b --only=scenario1_standardna
//
// CLI/env parametri (svi opcionalni osim admin kredencijala):
//   --provider=ollama|gemini   koja se izvedba mjeri. Ruta provider prima PO
//                              POZIVU, pa se postavka poslužitelja ne dira i
//                              dvije izvedbe se mogu mjeriti naizmjence.
//   --model=naziv              koji LOKALNI Ollama model evaluirati
//                              (AppSetting.ollama_model, katalog u
//                              llm/ollamaModels.js). Mijenja se admin rutom, pa
//                              traži EVAL_ADMIN_EMAIL/PASSWORD.
//   --only=id1,id2             pokreni samo navedene scenarije
//   --repeat=N                 override repeatCount za SVE scenarije u runu
//   --kind=pilot|final|sensitivity|smoke   ulazi li run u rad (default smoke)
//   EVAL_BASE_URL, EVAL_ADMIN_EMAIL, EVAL_ADMIN_PASSWORD
//
// Mjerenje se izvodi kao ADMINISTRATOR: ruta traži ista prava pisanja kao
// ručno uređivanje zahtjeva, a zaposlenik smije mijenjati stavke tek kad je
// zahtjev vraćen na dopunu. Admin ta prava ima u svakom nezaključanom statusu,
// pa priprema scenarija ostaje jednostavna i ne mjeri se workflow nego model.

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
const { SCENARIOS } = require('./evalScenarios');

const BASE_URL = process.env.EVAL_BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.EVAL_ADMIN_EMAIL || 'admin@veleri.hr';
const ADMIN_PASSWORD = process.env.EVAL_ADMIN_PASSWORD || '12345678';
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
// (npr. scenarij s dvije ponude) zato ispadne kao "fetch failed" iako
// backend nikad nije ni pao. Taj se limit ne može pouzdano nadjačati preko
// fetch()-ove "dispatcher" opcije (isprobano: vanjski 'undici' paket kao
// dispatcher baca UND_ERR_INVALID_ARG zbog neusklađenosti internih
// handler-sučelja s undici-jem ugrađenim u ovu Node verziju), pa poziv prema
// aplikaciju ide preko node:http izravno — taj modul nema takav
// default, čeka koliko mu kažemo preko "timeout" opcije.
const AI_REQUEST_TIMEOUT_MS = 11 * 60 * 1000;

/**
 * HTTP poziv prema aplikaciji preko node:http (vidi napomenu gore zašto ne
 * fetch). Isti put koristi i dugi poziv /ai-items i kratke pripremne pozive,
 * da priprema i mjerenje ne idu različitim mrežnim slojevima.
 */
function requestJson(method, urlPath, { token = null, body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${urlPath}`);
    const payload = body === null ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname + url.search,
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        timeout: AI_REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = JSON.parse(text); } catch { /* nije JSON — ostaje null, tekst je sačuvan */ }
          resolve({ status: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, json, text });
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error(`Poslužitelj nije odgovorio u ${AI_REQUEST_TIMEOUT_MS / 60000} min.`)));
    req.on('error', reject);
    if (payload) req.write(payload);
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
 * Provider se od uklanjanja chata bira PO POZIVU (tijelo zahtjeva), pa ga
 * harness ne mora ni postavljati ni čitati iz postavke. Ostaje samo LOKALNI
 * MODEL, koji je i dalje runtime postavka (AppSetting.ollama_model): ako je
 * zadan preko --model, postavlja se ovdje; u svakom slučaju se očitava, da run
 * metapodaci nose stvarno evaluirani model, a ne pretpostavku.
 */
async function ensureModel(adminToken, modelArg) {
  if (modelArg) {
    const put = await requestJson('PUT', '/api/assistant/settings', {
      token: adminToken,
      body: { ollama_model: modelArg },
    });
    if (!put.ok) {
      throw new Error(`Postavljanje modela "${modelArg}" nije uspjelo (${put.status}): ${put.text}`);
    }
  }
  const get = await requestJson('GET', '/api/assistant/settings', { token: adminToken });
  if (!get.ok) {
    throw new Error(`Čitanje AI postavki nije uspjelo (${get.status}): ${get.text}`);
  }
  return {
    ollamaModel: get.json.ollama_model,
    geminiModel: get.json.gemini_model,
    modelSetHere: Boolean(modelArg),
  };
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
 * Šifrarnički ID-evi potrebni da se uopće stvori zahtjev nad kojim se mjeri.
 * Čitaju se izravno iz baze, ne kroz API — polazno stanje zahtjeva nije
 * predmet mjerenja, pa nema razloga da ovisi o obliku odgovora ijedne rute.
 */
async function loadReference() {
  const [[fiscalYear]] = await db.query(
    'SELECT id_fiscal_year, year FROM FiscalYear WHERE is_closed = 0 ORDER BY year DESC LIMIT 1'
  );
  if (!fiscalYear) throw new Error('Nema otvorene poslovne godine — zahtjev za mjerenje se ne može stvoriti.');
  const [[department]] = await db.query(
    'SELECT id_department, name FROM Department WHERE fk_fiscal_year = ? AND is_active = 1 ORDER BY id_department LIMIT 1',
    [fiscalYear.id_fiscal_year]
  );
  const [[category]] = await db.query(
    'SELECT id_item_category, name FROM ItemCategory WHERE fk_fiscal_year = ? AND is_active = 1 ORDER BY id_item_category LIMIT 1',
    [fiscalYear.id_fiscal_year]
  );
  if (!department || !category) throw new Error('Poslovna godina nema aktivan odjel ili kategoriju.');
  return {
    fiscalYearId: fiscalYear.id_fiscal_year,
    departmentId: department.id_department,
    departmentName: department.name,
    placeholderCategoryId: category.id_item_category,
  };
}

/** Prilaže jednu ponudu uz zahtjev, istim putem kojim ide i ručni upload. */
async function uploadPonuda(requestId, token, filePath) {
  const form = new FormData();
  form.append('document_type', 'Ponuda');
  const ext = path.extname(filePath).toLowerCase();
  const buffer = fs.readFileSync(filePath);
  form.append('file', new File([buffer], path.basename(filePath), { type: MIME_BY_EXT[ext] || 'application/octet-stream' }));
  const res = await fetch(`${BASE_URL}/api/requests/${requestId}/attachments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Prilaganje "${path.basename(filePath)}" nije uspjelo (${res.status}): ${await res.text()}`);
  }
}

/**
 * Polazno stanje jednog scenarija: nov zahtjev s jednom stavkom-mjestodržačem
 * i priloženim ponudama. Radi se JEDNOM po scenariju, prije mjerenja.
 *
 * Mjestodržač postoji jer zahtjev bez ijedne stavke ne prolazi validaciju, a
 * mjerenje upravo provjerava hoće li ga model zamijeniti stavkama iz ponude.
 * Njegova kategorija i naziv nisu dio mjerila.
 */
async function prepareScenarioRequest(scenario, token, reference) {
  const created = await requestJson('POST', '/api/requests', {
    token,
    body: {
      fk_fiscal_year: reference.fiscalYearId,
      fk_department: reference.departmentId,
      justification: `Mjerni scenarij ${scenario.id} — polazno stanje prije AI obrade ponude.`,
      items: [{
        fk_item_category: reference.placeholderCategoryId,
        item_name: 'Polazna stavka (mjerenje)',
        quantity: 1,
      }],
    },
  });
  if (!created.ok) {
    throw new Error(`Zahtjev za "${scenario.id}" nije stvoren (${created.status}): ${created.text}`);
  }
  for (const filePath of scenario.attachments) {
    await uploadPonuda(created.json.id_purchase_request, token, filePath);
  }
  return {
    id: created.json.id_purchase_request,
    number: created.json.request_number,
    attachments: scenario.attachments.map((f) => path.basename(f)),
  };
}

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

/**
 * Mehanička provjera točnosti onoga što je model pročitao iz ponude.
 *
 * `extracted` je ČINJENICA (je li ruta uopće vratila stavke), a ocjena
 * scenarija je `decision_match`. Kod scenarija koji očekuje odbijanje
 * (dokument nije ponuda) ispravan je ishod da stavaka NEMA — bez ove grane
 * ispravno odbijanje bilježilo bi se kao pad.
 *
 * Odjel se više ne provjerava: ruta ga namjerno ne dira, pa bi svaka mjera nad
 * njim mjerila polazno stanje zahtjeva, ne model.
 */
function checkAccuracy(actual, expected) {
  if (!expected) return null;
  if (expected.expects_refusal) {
    return {
      extracted: Boolean(actual),
      decision_match: !actual,
      item_count_match: null,
      quantities_match: null,
      amount_match: null,
    };
  }
  if (!actual) {
    return { extracted: false, decision_match: false, item_count_match: null, quantities_match: null, amount_match: null };
  }

  const expectedQty = quantitiesOf(expected.items);
  const actualQty = quantitiesOf(actual.items);
  // Iznos: ground truth nosi niz prihvatljivih vrijednosti (ponuda zna imati
  // više iznosa), null kad iznos nije zadan. `actual.total_amount` je ono što
  // je model PROČITAO — null i kad ponuda iznos ne navodi i kad nije u eurima
  // (tada ruta iznos zahtjeva ne dira), pa se te dvije situacije razlikuju
  // preko amount_status u samom zapisu.
  let amountMatch = null;
  if (Array.isArray(expected.total_amount_acceptable)) {
    const actualAmount = actual.total_amount === null || actual.total_amount === undefined
      ? null
      : Number(actual.total_amount);
    amountMatch = actualAmount !== null
      && expected.total_amount_acceptable.some((a) => Math.abs(a - actualAmount) < 0.01);
  }

  return {
    extracted: true,
    decision_match: true,
    item_count_match: (expected.items || []).length === (actual.items || []).length,
    quantities_match: expectedQty.length === actualQty.length
      && expectedQty.every((q, i) => q === actualQty[i]),
    amount_match: amountMatch,
  };
}

/**
 * Jedan pokušaj jednog scenarija: jedan HTTP poziv rute koja pročita ponudu i
 * zamijeni stavke. `latency_ms` je trajanje CIJELOG poziva (HTTP, ekstrakcija
 * PDF-a, model, upis u bazu), a `model_latency_ms` samo ono provedeno u
 * modelu — bez oboje se ne zna koliko od trajanja otpada na sam model.
 */
async function runOneAttempt(scenario, prepared, token, provider, attemptNumber, runId, promptStore) {
  const startedAt = new Date().toISOString();
  const expected = loadGroundTruth(scenario.id);

  const start = process.hrtime.bigint();
  let res = null;
  let networkError = null;
  try {
    res = await requestJson('POST', `/api/requests/${prepared.id}/ai-items`, {
      token,
      body: { provider },
      headers: { 'X-Include-System-Prompt': '1' },
    });
  } catch (error) {
    networkError = error.message;
  }
  const latencyMs = Math.round(Number(process.hrtime.bigint() - start) / 1e6);

  const body = res?.json ?? null;
  const ok = Boolean(res?.ok);
  // 422 nije kvar nego ishod: model je odbio pretvoriti dokument u stavke.
  // Za scenarij koji odbijanje i očekuje to je TOČAN odgovor, pa se ne smije
  // brojati u greške — vidi checkAccuracy.
  const refused = res?.status === 422;
  const errorMessage = networkError
    || (ok || refused ? null : (body?.message || res?.text || 'nepoznata greška'));

  const usage = body?.usage || {};
  const actual = ok
    ? { items: body.items || [], total_amount: body.new_amount ?? null }
    : null;

  if (body?.system_prompt_hash && body.system_prompt && promptStore && !promptStore[body.system_prompt_hash]) {
    promptStore[body.system_prompt_hash] = body.system_prompt;
  }

  return {
    run_id: runId,
    scenario_id: scenario.id,
    scenario_description: scenario.description,
    attempt: attemptNumber,
    provider,
    model: body?.model ?? null,
    // Zahtjev nad kojim se mjeri je isti kroz sve pokušaje scenarija; stavke
    // se pri svakom pokušaju zamjenjuju, a prompt ih nikad ne vidi.
    request_id: prepared.id,
    request_number: prepared.number,
    attachments: prepared.attachments,
    input_modality: scenario.inputModality,
    expects_refusal: scenario.expectsRefusal,
    timestamp: startedAt,
    latency_ms: latencyMs,
    http_status: res?.status ?? null,
    success: ok,
    refused,
    // Poruka kojom je model objasnio zašto stavke nije izvukao — kod scenarija
    // koji odbijanje očekuje to je jedini sadržaj ishoda.
    refusal_message: refused ? (body?.message ?? null) : null,
    error: errorMessage,
    prompt_tokens: usage.promptTokens ?? null,
    completion_tokens: usage.completionTokens ?? null,
    model_latency_ms: usage.modelLatencyMs ?? null,
    // Sirovo trajanje prije odbijanja čekanja na kvotu, i samo čekanje.
    // Kvota je operativno ograničenje udaljene usluge i zaseban je nalaz, pa se
    // ne smije stopiti s mjerom brzine modela.
    model_latency_raw_ms: usage.modelLatencyRawMs ?? null,
    rate_limit_wait_ms: usage.rateLimitWaitMs ?? null,
    // Verzija koju prijavljuje sam odgovor. Endpoint iza istog imena zna se
    // tiho promijeniti između poziva.
    model_version_reported: usage.modelVersion ?? null,
    model_versions_seen: usage.modelVersionsSeen ?? [],
    // Misaoni tokeni nisu odvojeni u API-ju; bilježi se udio u znakovima i
    // zastavica da su uključeni u completion_tokens.
    thinking_chars: usage.thinkingChars ?? null,
    content_chars: usage.contentChars ?? null,
    completion_tokens_include_thinking: usage.completionTokensIncludeThinking ?? null,
    model_calls: usage.modelCalls ?? null,
    // Trajanje SVAKOG poziva zasebno — medijan i p95 po pozivu se iz zbroja ne
    // mogu izračunati. Više od jednog poziva znači da se model ispravljao.
    model_call_latencies_ms: usage.modelCallLatenciesMs ?? [],
    // Odrezan odgovor je artefakt mjerne postavke (max_output_tokens), ne
    // svojstvo modela. U završnom runu je razlog za poništenje.
    truncated: usage.truncated === true,
    items_returned: ok ? (body.items || []).length : null,
    extracted_items: ok
      ? (body.items || []).map((it) => ({
        item_name: it.item_name,
        quantity: it.quantity,
        category_name: it.category_name,
      }))
      : null,
    previous_count: body?.previous_count ?? null,
    // Je li model dobio tekst koji je izvukao poslužitelj (PDF) ili je sam čitao
    // sliku. Kad je false, ulaz NIJE izjednačen među izvedbama i rezultat ide u
    // zasebnu tablicu točnosti, s odvojenim brojanjem tokena.
    server_text_extraction: body?.server_text_extraction ?? null,
    input_kinds: body?.input_kinds ?? null,
    amount_read: body?.new_amount ?? null,
    amount_status: body?.amount_status ?? null,
    warnings: body?.warnings ?? [],
    prompt_variant: body?.prompt_variant ?? null,
    system_prompt_hash: body?.system_prompt_hash ?? null,
    category_codebook_sha256: body?.category_codebook_sha256 ?? null,
    accuracy: checkAccuracy(actual, expected),
    category_accuracy: checkCategoryAssignment(actual, expected.items),
  };
}

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

  const provider = args.provider;
  if (!['ollama', 'gemini'].includes(provider)) {
    throw new Error(`--provider mora biti ollama ili gemini (dobiveno: "${provider}")`);
  }

  console.log(`[evalHarness] Prijava kao ${ADMIN_EMAIL}...`);
  const token = await login(ADMIN_EMAIL, ADMIN_PASSWORD);

  const { ollamaModel, geminiModel, modelSetHere } = await ensureModel(token, args.model);
  // /api/show i metapodaci moraju gledati STVARNO aktivan model.
  if (ollamaModel) {
    ollamaModelName = ollamaModel;
    ollamaModelSource = modelSetHere ? 'settings API (postavljeno ovim runom)' : 'settings API (očitano)';
  }

  const temperatureNote = provider === 'ollama' ? await getOllamaTemperatureNote() : { source: 'n/a (provider nije ollama)', temperature: null };
  console.log(`[evalHarness] Izvedba: ${provider} (šalje se uz svaki poziv, postavka poslužitelja se ne dira)`);
  console.log(`[evalHarness] Model: ${provider === 'ollama' ? ollamaModelName : geminiModel}`);
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
    // Izvedba se šalje uz svaki poziv; runtime postavka poslužitelja nije dirana.
    provider_selection: 'per-request',
    gemini_model: provider === 'gemini' ? geminiModel : null,
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
    // Razmišljanje je predmet odluke O2; bilježi se efektivna vrijednost i
    // odakle dolazi, da se probni prolaz može pripisati postavci.
    ollama_think: provider === 'ollama' ? await require('../src/services/llm/ollamaProvider').getEffectiveThink() : null,
    scenarios: scenarios.map((s) => ({
      id: s.id,
      description: s.description,
      repeat_count: s.repeatCount,
      attachments: s.attachments.length,
      input_modality: s.inputModality,
      expects_refusal: s.expectsRefusal,
    })),
    total_attempts: totalAttempts,
  };
  fs.writeFileSync(metaFile, JSON.stringify(manifest, null, 2));

  // Polazno stanje: po jedan zahtjev sa svojim ponudama, JEDNOM po scenariju.
  // Stvara se prije zagrijavanja da vrijeme pripreme ni slučajno ne uđe u
  // prvo mjerenje.
  const reference = await loadReference();
  const preparedByScenario = {};
  for (const scenario of scenarios) {
    const prepared = await prepareScenarioRequest(scenario, token, reference);
    preparedByScenario[scenario.id] = prepared;
    console.log(`[evalHarness] Pripremljen ${prepared.number} za ${scenario.id} (${prepared.attachments.join(', ')})`);
  }
  manifest.reference = reference;
  manifest.prepared_requests = preparedByScenario;

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
      const record = await runOneAttempt(
        scenario, preparedByScenario[scenario.id], token, provider, attempt, runId, promptStore
      );
      record.round = round;
      record.position_in_run = completed;
      writeStream.write(`${JSON.stringify(record)}\n`);
      if (record.success) {
        console.log(`OK (${record.latency_ms}ms, stavki=${record.items_returned}, iznos=${record.amount_read ?? '—'})`);
      } else if (record.refused) {
        console.log(`ODBIJENO (${record.latency_ms}ms) — ${record.expects_refusal ? 'očekivano' : 'NEOČEKIVANO'}`);
      } else {
        console.log(`FAIL (${record.error})`);
      }
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
