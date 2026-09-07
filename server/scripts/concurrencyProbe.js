#!/usr/bin/env node
// Pokretač istodobnih obrada (docs/mjerni-plan.md, tvrdnja H3).
//
// Mjeri kako se odziv i memorija ponašaju pri 1, 3 i 5 istodobnih obrada
// ponude. Svaka istodobna obrada ide nad SVOJIM zahtjevom: ruta prije upisa
// zaključava redak (`FOR UPDATE`), pa bi istodobni pozivi nad istim zahtjevom
// bili serijalizirani i mjerili bi bravu, ne čvor.
//
// Vršna memorija dolazi iz istog uzorkovača koji se koristi i za resursni
// otisak (sampleResources.js). GPU nije obuhvaćen — vidi ondje.
//
// Uporaba:
//   node scripts/concurrencyProbe.js --provider=ollama
//   node scripts/concurrencyProbe.js --provider=gemini --levels=1,3,5 --scenario=scenario1_standardna

const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');
const { SCENARIOS } = require('./evalScenarios');
const { sampleProcesses, systemMemoryMb } = require('./sampleResources');

const BASE_URL = process.env.EVAL_BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.EVAL_ADMIN_EMAIL || 'admin@veleri.hr';
const ADMIN_PASSWORD = process.env.EVAL_ADMIN_PASSWORD || '12345678';
const MIME_BY_EXT = { '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
const COOLDOWN_MS = 10000;

function arg(name, fallback) {
  const found = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function login() {
  const r = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!r.ok) throw new Error(`Prijava neuspješna (${r.status})`);
  return (r.headers.get('set-cookie') || '').match(/token=([^;]+)/)[1];
}

async function prepareRequest(token, scenario, reference, label) {
  const H = { Authorization: `Bearer ${token}` };
  const cr = await fetch(`${BASE_URL}/api/requests`, {
    method: 'POST', headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fk_fiscal_year: reference.fiscalYearId,
      fk_department: reference.departmentId,
      justification: `Proba istodobnosti ${label} — polazno stanje.`,
      items: [{ fk_item_category: reference.categoryId, item_name: 'Polazna stavka (proba)', quantity: 1 }],
    }),
  });
  const req = await cr.json();
  if (!cr.ok) throw new Error(`Zahtjev nije stvoren: ${JSON.stringify(req)}`);
  for (const filePath of scenario.attachments) {
    const form = new FormData();
    form.append('document_type', 'Ponuda');
    const ext = path.extname(filePath).toLowerCase();
    form.append('file', new File([fs.readFileSync(filePath)], path.basename(filePath),
      { type: MIME_BY_EXT[ext] || 'application/octet-stream' }));
    const up = await fetch(`${BASE_URL}/api/requests/${req.id_purchase_request}/attachments`, {
      method: 'POST', headers: H, body: form,
    });
    if (!up.ok) throw new Error(`Prilaganje nije uspjelo (${up.status})`);
  }
  return req.id_purchase_request;
}

async function loadReference() {
  const [[fy]] = await db.query('SELECT id_fiscal_year FROM FiscalYear WHERE is_closed = 0 ORDER BY year DESC LIMIT 1');
  const [[d]] = await db.query('SELECT id_department FROM Department WHERE fk_fiscal_year = ? AND is_active = 1 ORDER BY id_department LIMIT 1', [fy.id_fiscal_year]);
  const [[c]] = await db.query('SELECT id_item_category FROM ItemCategory WHERE fk_fiscal_year = ? AND is_active = 1 ORDER BY id_item_category LIMIT 1', [fy.id_fiscal_year]);
  return { fiscalYearId: fy.id_fiscal_year, departmentId: d.id_department, categoryId: c.id_item_category };
}

/** Jedan poziv rute; vraća trajanje i ishod, nikad ne baca. */
async function callAiItems(token, requestId, provider) {
  const started = Date.now();
  try {
    const r = await fetch(`${BASE_URL}/api/requests/${requestId}/ai-items`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    });
    const body = await r.json().catch(() => null);
    return {
      ms: Date.now() - started,
      status: r.status,
      ok: r.ok,
      items: body?.items?.length ?? null,
      message: r.ok ? null : (body?.message || '').slice(0, 120),
    };
  } catch (error) {
    return { ms: Date.now() - started, status: null, ok: false, items: null, message: error.message };
  }
}

async function main() {
  const provider = arg('provider', 'ollama');
  const levels = arg('levels', '1,3,5').split(',').map(Number);
  const scenarioId = arg('scenario', 'scenario1_standardna');
  const scenario = SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`Nepoznat scenarij: ${scenarioId}`);

  const token = await login();
  const reference = await loadReference();
  const maxLevel = Math.max(...levels);

  console.log(`[concurrency] Izvedba: ${provider} | scenarij: ${scenarioId} | razine: ${levels.join(', ')}`);
  console.log(`[concurrency] Pripremam ${maxLevel} zahtjeva (svaka istodobna obrada ide nad svojim)...`);
  const requestIds = [];
  for (let i = 0; i < maxLevel; i++) {
    requestIds.push(await prepareRequest(token, scenario, reference, `#${i + 1}`));
  }
  console.log(`[concurrency] Pripremljeni zahtjevi: ${requestIds.join(', ')}\n`);

  const results = [];
  for (const level of levels) {
    // Vršna memorija se prati tijekom same razine, u istom procesu.
    let peakModelRss = 0;
    let peakSysUsed = 0;
    const timer = setInterval(() => {
      try {
        const p = sampleProcesses();
        const m = systemMemoryMb();
        peakModelRss = Math.max(peakModelRss, p.model.rssMb);
        peakSysUsed = Math.max(peakSysUsed, m.used);
      } catch { /* uzorak preskočen */ }
    }, 500);

    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    const calls = await Promise.all(
      requestIds.slice(0, level).map((id) => callAiItems(token, id, provider))
    );
    const wallMs = Date.now() - t0;
    clearInterval(timer);

    const okCalls = calls.filter((c) => c.ok);
    const lat = okCalls.map((c) => c.ms);
    const row = {
      level,
      started_at: startedAt,
      wall_ms: wallMs,
      ok: okCalls.length,
      failed: calls.length - okCalls.length,
      p50_ms: percentile(lat, 50),
      p95_ms: percentile(lat, 95),
      min_ms: lat.length ? Math.min(...lat) : null,
      max_ms: lat.length ? Math.max(...lat) : null,
      peak_model_rss_mb: Number(peakModelRss.toFixed(1)),
      peak_sys_used_mb: Number(peakSysUsed.toFixed(1)),
      statuses: calls.map((c) => c.status),
      failures: calls.filter((c) => !c.ok).map((c) => `${c.status}: ${c.message}`),
    };
    results.push(row);
    console.log(`[concurrency] razina ${level}: ukupno ${(wallMs / 1000).toFixed(1)} s | `
      + `uspjelo ${row.ok}/${level} | p50 ${row.p50_ms} ms | p95 ${row.p95_ms} ms | `
      + `vršno model ${row.peak_model_rss_mb} MB, sustav ${row.peak_sys_used_mb} MB`);
    row.failures.forEach((f) => console.log(`               pad: ${f}`));

    if (level !== levels[levels.length - 1]) {
      console.log(`[concurrency] hlađenje ${COOLDOWN_MS / 1000} s...`);
      await new Promise((r) => { setTimeout(r, COOLDOWN_MS); });
    }
  }

  const outDir = path.join(__dirname, '..', 'eval-results');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `concurrency_${provider}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(outFile, JSON.stringify({
    provider, scenario: scenarioId, levels, request_ids: requestIds, results,
    note: 'Svaka istodobna obrada ide nad svojim zahtjevom; GPU nije obuhvaćen (powermetrics, ručno).',
  }, null, 2));
  console.log(`\n[concurrency] Zapisano: ${outFile}`);
}

main().catch((e) => { console.error('[concurrency] Greška:', e.message); process.exitCode = 1; })
  .finally(() => db.end());
