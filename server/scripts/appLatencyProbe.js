#!/usr/bin/env node
// Odziv običnih operacija aplikacije u mirovanju i pod obradom
// (docs/mjerni-plan.md, tvrdnja H4 — suživot komponenti na jednom čvoru).
//
// Pitanje na koje odgovara: usporava li zaključivanje ostatak sustava kad model,
// aplikacija i baza dijele isti uređaj. Mjere se tri svakodnevne operacije:
//
//   popis    GET  /api/requests          (dohvat popisa zahtjeva)
//   otvaranje GET /api/requests/:id      (otvaranje jednog zahtjeva)
//   spremanje PUT /api/requests/:id      (spremanje izmjene)
//
// Najprije u MIROVANJU, pa ponovno DOK obrada ponude traje.
//
// RITAM JE IZJEDNAČEN u obje faze (--pause, zadano 250 ms između krugova).
// Bez toga bi faza pod obradom vrtjela stotine krugova u sekundi i mjerila
// vlastito opterećenje umjesto utjecaja modela — prvo mjerenje dalo je 1.568
// krugova u 18 s naspram 8 u mirovanju, što nije usporedivo.
//
// Uporaba:
//   node scripts/appLatencyProbe.js --provider=ollama
//   node scripts/appLatencyProbe.js --provider=ollama --rounds=15

const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');
const { SCENARIOS } = require('./evalScenarios');

const BASE_URL = process.env.EVAL_BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.EVAL_ADMIN_EMAIL || 'admin@veleri.hr';
const ADMIN_PASSWORD = process.env.EVAL_ADMIN_PASSWORD || '12345678';
const MIME_BY_EXT = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

function arg(name, fallback) {
  const found = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

const median = (xs) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const percentile = (xs, p) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.max(0, Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1))];
};

async function login() {
  const r = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!r.ok) throw new Error(`Prijava neuspješna (${r.status})`);
  return (r.headers.get('set-cookie') || '').match(/token=([^;]+)/)[1];
}

async function timed(fn) {
  const t = Date.now();
  const ok = await fn();
  return { ms: Date.now() - t, ok };
}

/** Jedan krug triju običnih operacija. */
async function oneRound(token, targetId, reference) {
  const H = { Authorization: `Bearer ${token}` };
  const popis = await timed(async () => (await fetch(`${BASE_URL}/api/requests`, { headers: H })).ok);
  const otvaranje = await timed(async () => (await fetch(`${BASE_URL}/api/requests/${targetId}`, { headers: H })).ok);
  const spremanje = await timed(async () => (await fetch(`${BASE_URL}/api/requests/${targetId}`, {
    method: 'PUT', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fk_department: reference.departmentId,
      justification: `Mjerenje odziva ${Date.now()}`,
      items: [{ fk_item_category: reference.categoryId, item_name: 'Stavka za mjerenje odziva', quantity: 1 }],
    }),
  })).ok);
  return { popis, otvaranje, spremanje };
}

async function loadReference() {
  const [[fy]] = await db.query('SELECT id_fiscal_year FROM FiscalYear WHERE is_closed = 0 ORDER BY year DESC LIMIT 1');
  const [[d]] = await db.query('SELECT id_department FROM Department WHERE fk_fiscal_year = ? AND is_active = 1 ORDER BY id_department LIMIT 1', [fy.id_fiscal_year]);
  const [[c]] = await db.query('SELECT id_item_category FROM ItemCategory WHERE fk_fiscal_year = ? AND is_active = 1 ORDER BY id_item_category LIMIT 1', [fy.id_fiscal_year]);
  return { fiscalYearId: fy.id_fiscal_year, departmentId: d.id_department, categoryId: c.id_item_category };
}

async function createRequest(token, reference, justification) {
  const r = await fetch(`${BASE_URL}/api/requests`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fk_fiscal_year: reference.fiscalYearId,
      fk_department: reference.departmentId,
      justification,
      items: [{ fk_item_category: reference.categoryId, item_name: 'Polazna stavka (proba)', quantity: 1 }],
    }),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(`Zahtjev nije stvoren: ${JSON.stringify(b)}`);
  return b.id_purchase_request;
}

async function attach(token, requestId, filePath) {
  const form = new FormData();
  form.append('document_type', 'Ponuda');
  const ext = path.extname(filePath).toLowerCase();
  form.append('file', new File([fs.readFileSync(filePath)], path.basename(filePath),
    { type: MIME_BY_EXT[ext] || 'application/octet-stream' }));
  const r = await fetch(`${BASE_URL}/api/requests/${requestId}/attachments`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  });
  if (!r.ok) throw new Error(`Prilaganje nije uspjelo (${r.status})`);
}

function summarize(rows, key) {
  const xs = rows.map((r) => r[key].ms);
  return { n: xs.length, median: median(xs), p95: percentile(xs, 95), min: Math.min(...xs), max: Math.max(...xs) };
}

async function main() {
  const provider = arg('provider', 'ollama');
  const rounds = Number(arg('rounds', '12'));
  const pauseMs = Number(arg('pause', '250'));
  const scenarioId = arg('scenario', 'scenario2_visestranicna'); // dulja obrada = širi prozor
  const scenario = SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`Nepoznat scenarij: ${scenarioId}`);

  const token = await login();
  const reference = await loadReference();

  const targetId = await createRequest(token, reference, 'Meta mjerenja odziva aplikacije.');
  const loadId = await createRequest(token, reference, 'Zahtjev nad kojim traje obrada ponude.');
  for (const f of scenario.attachments) await attach(token, loadId, f);

  console.log(`[appLatency] Izvedba: ${provider} | scenarij opterećenja: ${scenarioId} | `
    + `krugova u mirovanju: ${rounds} | pauza između krugova: ${pauseMs} ms (ista u obje faze)`);
  console.log(`[appLatency] Meta zahtjev: ${targetId} | zahtjev pod obradom: ${loadId}\n`);

  console.log('[appLatency] Mjerim U MIROVANJU...');
  const idle = [];
  for (let i = 0; i < rounds; i++) {
    idle.push(await oneRound(token, targetId, reference));
    await new Promise((r) => { setTimeout(r, pauseMs); });
  }

  console.log('[appLatency] Pokrećem obradu ponude i mjerim TIJEKOM nje...');
  const loadStarted = new Date().toISOString();
  let processingMs = null;
  const processing = (async () => {
    const t = Date.now();
    const r = await fetch(`${BASE_URL}/api/requests/${loadId}/ai-items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    processingMs = Date.now() - t;
    return r.status;
  })();

  const busy = [];
  let done = false;
  processing.then(() => { done = true; });
  while (!done) {
    busy.push(await oneRound(token, targetId, reference));
    await new Promise((r) => { setTimeout(r, pauseMs); });
  }
  const processingStatus = await processing;

  const out = { provider, scenario: scenarioId, rounds, pause_ms: pauseMs, load_started_at: loadStarted,
    processing_ms: processingMs, processing_status: processingStatus,
    idle: {}, busy: {}, increase_pct: {} };

  console.log(`\n[appLatency] Obrada je trajala ${(processingMs / 1000).toFixed(1)} s (HTTP ${processingStatus}); `
    + `u tom prozoru stalo je ${busy.length} krugova.\n`);
  console.log('operacija     mirovanje med/p95     pod obradom med/p95    porast medijana');
  for (const key of ['popis', 'otvaranje', 'spremanje']) {
    const a = summarize(idle, key);
    const b = summarize(busy, key);
    out.idle[key] = a; out.busy[key] = b;
    const inc = a.median > 0 ? ((b.median - a.median) / a.median) * 100 : null;
    out.increase_pct[key] = inc === null ? null : Number(inc.toFixed(1));
    console.log(`${key.padEnd(13)} ${String(a.median).padStart(5)} / ${String(a.p95).padStart(5)} ms`
      + `        ${String(b.median).padStart(5)} / ${String(b.p95).padStart(5)} ms`
      + `        ${inc === null ? '—' : `${inc > 0 ? '+' : ''}${inc.toFixed(1)} %`}`);
  }

  const outDir = path.join(__dirname, '..', 'eval-results');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `app_latency_${provider}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  console.log(`\n[appLatency] Zapisano: ${outFile}`);
}

main().catch((e) => { console.error('[appLatency] Greška:', e.message); process.exitCode = 1; })
  .finally(() => db.end());
