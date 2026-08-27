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
//
// CLI/env parametri (svi opcionalni):
//   --provider=ollama|gemini   koji provider runner OČEKUJE da je aktivan
//                              (default: env EVAL_PROVIDER ili 'ollama').
//                              Ako su postavljeni EVAL_ADMIN_EMAIL/PASSWORD,
//                              runner GA I POSTAVI preko PUT /api/assistant/settings
//                              prije pokretanja — inače samo pretpostavlja
//                              da je već ručno postavljen i bilježi ga kao takvog.
//   --only=id1,id2             pokreni samo navedene scenario ID-jeve (pila
//                              za brzu provjeru prije punog runa)
//   --repeat=N                 override repeatCount za SVE scenarije u ovom runu
//   EVAL_BASE_URL, EVAL_USER_EMAIL, EVAL_USER_PASSWORD — isto kao dosad

const fs = require('fs');
const path = require('path');
const http = require('node:http');
const { SCENARIOS } = require('./evalScenarios');

const BASE_URL = process.env.EVAL_BASE_URL || 'http://localhost:3000';
const USER_EMAIL = process.env.EVAL_USER_EMAIL || 'zaposlenik@veleri.hr';
const USER_PASSWORD = process.env.EVAL_USER_PASSWORD || '12345678';
const ADMIN_EMAIL = process.env.EVAL_ADMIN_EMAIL || null;
const ADMIN_PASSWORD = process.env.EVAL_ADMIN_PASSWORD || null;
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL_NAME = 'gemma4:12b'; // vidi ollamaProvider.js OLLAMA_MODEL

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
  const args = { provider: process.env.EVAL_PROVIDER || 'ollama', only: null, repeat: null };
  for (const arg of process.argv.slice(2)) {
    const [key, value] = arg.replace(/^--/, '').split('=');
    if (key === 'provider') args.provider = value;
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

/** Ako su admin kredencijali dostupni, stvarno postavlja provider preko settings API-ja. */
async function ensureProvider(providerArg) {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log(`[evalHarness] EVAL_ADMIN_EMAIL/PASSWORD nisu postavljeni — pretpostavljam da je provider "${providerArg}" već ručno postavljen.`);
    return { provider: providerArg, autoSet: false };
  }
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  const res = await fetch(`${BASE_URL}/api/assistant/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ provider: providerArg }),
  });
  if (!res.ok) {
    throw new Error(`Postavljanje providera na "${providerArg}" neuspješno (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  console.log(`[evalHarness] Provider postavljen preko settings API-ja: ${data.provider}`);
  return { provider: data.provider, autoSet: true };
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
      body: JSON.stringify({ model: OLLAMA_MODEL_NAME }),
    });
    if (!res.ok) return { source: 'unavailable', temperature: null };
    const data = await res.json();
    const match = /temperature\s+([\d.]+)/.exec(data.parameters || '');
    return {
      source: 'ollama /api/show, Modelfile default (ollamaProvider.js ne postavlja "temperature" eksplicitno u options)',
      temperature: match ? Number(match[1]) : null,
      raw_parameters: data.parameters || null,
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
        summary.push({ role: 'assistant_tool_call', name: call.name });
        if (call.name === 'propose_request') {
          if (!createCalled) proposeCalled = true;
        }
        if (call.name === 'create_request') {
          createCalled = true;
          if (proposeBeforeCreate === null) proposeBeforeCreate = proposeCalled;
        }
      }
    } else if (msg.role === 'tool') {
      summary.push({ role: 'tool_result', name: msg.name });
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

/** Jedan pokušaj JEDNOG scenarija — može uključivati više turnova (echo tool_trace/povijesti). */
async function runOneAttempt(scenario, token, provider, attemptNumber) {
  const startedAt = new Date().toISOString();
  const start = process.hrtime.bigint();

  let conversation = [];
  let allToolTrace = [];
  const usage = { promptTokens: 0, completionTokens: 0 };
  let lastResponseText = null;
  let httpStatus = null;
  let errorMessage = null;

  try {
    for (let turnIdx = 0; turnIdx < scenario.turns.length; turnIdx++) {
      const turnText = scenario.turns[turnIdx];
      const isFirstTurn = turnIdx === 0;
      const hasAttachments = isFirstTurn && scenario.attachments.length > 0;

      let res;
      if (hasAttachments) {
        const { bodyBuffer, contentType } = await buildAttachmentsBody(turnText, scenario.attachments);
        res = await postChat({
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
          bodyBuffer,
        });
      } else {
        conversation.push({ role: 'user', content: turnText });
        const bodyBuffer = Buffer.from(JSON.stringify({ messages: conversation }), 'utf8');
        res = await postChat({
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          bodyBuffer,
        });
      }

      httpStatus = res.status;
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
      lastResponseText = body.text ?? null;
    }
  } catch (networkError) {
    errorMessage = networkError.message;
  }

  const latencyMs = Math.round(Number(process.hrtime.bigint() - start) / 1e6);
  const { tool_trace_summary, propose_request_called, create_request_called, propose_before_create } =
    summarizeToolTrace(allToolTrace);

  return {
    scenario_id: scenario.id,
    scenario_description: scenario.description,
    attempt: attemptNumber,
    provider,
    timestamp: startedAt,
    turns_sent: scenario.turns,
    attachments: scenario.attachments.map((p) => path.basename(p)),
    expects_propose_before_create: scenario.expectsProposeBeforeCreate,
    latency_ms: latencyMs,
    http_status: httpStatus,
    success: httpStatus === 200 && !errorMessage,
    error: errorMessage,
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    propose_request_called,
    create_request_called,
    propose_before_create,
    tool_trace_summary,
    final_response_text: lastResponseText,
  };
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
  const metaFile = path.join(outputDir, `run_${runStartedAt}.meta.json`);

  console.log(`[evalHarness] Prijava kao ${USER_EMAIL}...`);
  const token = await login(USER_EMAIL, USER_PASSWORD);

  const { provider, autoSet } = await ensureProvider(args.provider);

  const temperatureNote = provider === 'ollama' ? await getOllamaTemperatureNote() : { source: 'n/a (provider nije ollama)', temperature: null };
  console.log(`[evalHarness] Provider: ${provider} (auto-postavljen preko API-ja: ${autoSet})`);
  console.log(`[evalHarness] Temperature napomena: ${JSON.stringify(temperatureNote)}`);

  const totalAttempts = scenarios.reduce((sum, s) => sum + s.repeatCount, 0);
  console.log(`[evalHarness] Scenariji: ${scenarios.map((s) => s.id).join(', ')}`);
  console.log(`[evalHarness] Ukupno pokušaja: ${totalAttempts}`);
  console.log(`[evalHarness] Izlaz: ${outputFile}`);

  fs.writeFileSync(metaFile, JSON.stringify({
    run_started_at: runStartedAt,
    provider,
    provider_auto_set: autoSet,
    ollama_temperature_note: temperatureNote,
    scenarios: scenarios.map((s) => ({ id: s.id, description: s.description, repeat_count: s.repeatCount, turns: s.turns.length, attachments: s.attachments.length })),
    total_attempts: totalAttempts,
  }, null, 2));

  const writeStream = fs.createWriteStream(outputFile, { flags: 'a' });
  let completed = 0;

  for (const scenario of scenarios) {
    console.log(`\n[evalHarness] === ${scenario.id} — ${scenario.description} (${scenario.repeatCount}x) ===`);
    for (let attempt = 1; attempt <= scenario.repeatCount; attempt++) {
      completed += 1;
      process.stdout.write(`[evalHarness] (${completed}/${totalAttempts}) ${scenario.id} pokušaj ${attempt}/${scenario.repeatCount}... `);
      const record = await runOneAttempt(scenario, token, provider, attempt);
      writeStream.write(`${JSON.stringify(record)}\n`);
      console.log(record.success ? `OK (${record.latency_ms}ms, create=${record.create_request_called})` : `FAIL (${record.error})`);
    }
  }

  await new Promise((resolve) => writeStream.end(resolve));
  console.log(`\n[evalHarness] Gotovo. Rezultati u ${outputFile}`);
  console.log(`[evalHarness] Metapodaci u ${metaFile}`);
}

main().catch((error) => {
  console.error('[evalHarness] Greška:', error.message);
  process.exit(1);
});
