#!/usr/bin/env node
// Agregacija eval rezultata KROZ VIŠE runova (docs/AI.md, docs/EVAL_SCENARIOS.md).
//
// evalHarness.js proizvodi jedan .jsonl po runu (jedan red po pokušaju) —
// ovaj skript čita SVE (ili navedene) .jsonl datoteke iz eval-results/,
// grupira po scenario_id, i za svaki ispisuje agregatnu statistiku
// (stopa uspjeha, medijan/prosjek latencije, prosjek tokena) KROZ SVE
// uključene runove, PLUS raščlambu po pojedinom run fileu — namjerno, jer
// ako se ponašanje promijenilo između runova (npr. popravak bug-a, docs/
// eval runova nakon popravka bug-a), slijepo miješanje
// starih i novih brojeva u jedan prosjek bi zavaralo. Raščlamba po runu čini
// takvu promjenu vidljivom, umjesto da je sakrije — odluka koje runove
// citirati u konačnim rezultatima ostaje na autoru (ne automatski bodovano,
// isti princip kao i sam harness).
//
// Korištenje:
//   node scripts/aggregateEvalResults.js                    (svi .jsonl u eval-results/)
//   node scripts/aggregateEvalResults.js run_A.jsonl run_B.jsonl   (samo navedeni, imena datoteka ili pune putanje)
//   node scripts/aggregateEvalResults.js --md                (dodatno zapiše docs/eval-runs/aggregate-summary.md)

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', 'eval-results');

function resolveInputFiles(args) {
  const fileArgs = args.filter((a) => !a.startsWith('--'));
  if (fileArgs.length === 0) {
    return fs.readdirSync(RESULTS_DIR)
      .filter((f) => f.endsWith('.jsonl'))
      .sort()
      .map((f) => path.join(RESULTS_DIR, f));
  }
  return fileArgs.map((f) => (path.isAbsolute(f) ? f : path.join(RESULTS_DIR, f)));
}

function readRows(filePath) {
  const runLabel = path.basename(filePath, '.jsonl');
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => ({ ...JSON.parse(line), _run: runLabel }));
}

function median(nums) {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(nums) {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function round(n, decimals = 1) {
  return n === null || n === undefined ? null : Number(n.toFixed(decimals));
}

/** Statistika za jedan niz redaka (bilo cijeli scenarij kroz sve runove, bilo jedan run unutar scenarija). */
function summarize(rows) {
  const ok = rows.filter((r) => r.success);
  const latenciesSec = ok.map((r) => r.latency_ms / 1000);
  const promptToks = ok.map((r) => r.prompt_tokens).filter((v) => v != null);
  const complToks = ok.map((r) => r.completion_tokens).filter((v) => v != null);

  return {
    attempts: rows.length,
    successes: ok.length,
    successRate: round((ok.length / rows.length) * 100, 0),
    medianLatencySec: round(median(latenciesSec)),
    meanLatencySec: round(mean(latenciesSec)),
    minLatencySec: latenciesSec.length ? round(Math.min(...latenciesSec)) : null,
    maxLatencySec: latenciesSec.length ? round(Math.max(...latenciesSec)) : null,
    meanPromptTokens: round(mean(promptToks), 0),
    meanCompletionTokens: round(mean(complToks), 0),
    createCalledRate: round((rows.filter((r) => r.create_request_called).length / rows.length) * 100, 0),
  };
}

function formatRow(label, s) {
  return [
    label.padEnd(38),
    `${s.successes}/${s.attempts}`.padEnd(7),
    `${s.successRate}%`.padEnd(6),
    String(s.medianLatencySec ?? '-').padEnd(8),
    `${s.minLatencySec ?? '-'}-${s.maxLatencySec ?? '-'}`.padEnd(12),
    String(s.meanPromptTokens ?? '-').padEnd(8),
    String(s.meanCompletionTokens ?? '-').padEnd(8),
  ].join(' ');
}

function main() {
  const args = process.argv.slice(2);
  const writeMd = args.includes('--md');
  const files = resolveInputFiles(args);

  if (files.length === 0) {
    console.error('Nema .jsonl datoteka za agregaciju.');
    process.exit(1);
  }

  console.log(`[aggregate] Uključeni runovi (${files.length}):`);
  files.forEach((f) => console.log(`  - ${path.basename(f)}`));
  console.log();

  const allRows = files.flatMap(readRows);
  const byScenario = new Map();
  for (const row of allRows) {
    if (!byScenario.has(row.scenario_id)) byScenario.set(row.scenario_id, []);
    byScenario.get(row.scenario_id).push(row);
  }

  const header = [
    'scenarij'.padEnd(38),
    'ok/N'.padEnd(7),
    '%'.padEnd(6),
    'med(s)'.padEnd(8),
    'min-max(s)'.padEnd(12),
    'prompt~'.padEnd(8),
    'compl~'.padEnd(8),
  ].join(' ');
  console.log(header);
  console.log('-'.repeat(header.length));

  const mdLines = ['# Agregirani eval rezultati kroz sve runove', '', `Generirano: ${new Date().toISOString()}`, '', `Uključeni runovi: ${files.map((f) => path.basename(f)).join(', ')}`, ''];

  for (const [scenarioId, rows] of [...byScenario.entries()].sort()) {
    const overall = summarize(rows);
    console.log(formatRow(scenarioId, overall));

    mdLines.push(`## ${scenarioId}`, '', `**Ukupno (svi runovi): ${overall.successes}/${overall.attempts} (${overall.successRate}%)**, medijan latencije ${overall.medianLatencySec}s (raspon ${overall.minLatencySec}-${overall.maxLatencySec}s), ~${overall.meanPromptTokens} prompt / ~${overall.meanCompletionTokens} completion tokena.`, '');

    const byRun = new Map();
    for (const row of rows) {
      if (!byRun.has(row._run)) byRun.set(row._run, []);
      byRun.get(row._run).push(row);
    }
    if (byRun.size > 1) {
      mdLines.push('| Run | N | Uspjeh | Medijan (s) | Raspon (s) |', '|---|---|---|---|---|');
      for (const [runLabel, runRows] of byRun.entries()) {
        const s = summarize(runRows);
        console.log(`    └─ ${runLabel.padEnd(50)} ${s.successes}/${s.attempts} (${s.successRate}%)  med=${s.medianLatencySec}s`);
        mdLines.push(`| ${runLabel} | ${s.attempts} | ${s.successes}/${s.attempts} (${s.successRate}%) | ${s.medianLatencySec} | ${s.minLatencySec}-${s.maxLatencySec} |`);
      }
      mdLines.push('');
    }
  }

  if (writeMd) {
    const outPath = path.join(__dirname, '..', '..', 'docs', 'eval-runs', 'aggregate-summary.md');
    fs.writeFileSync(outPath, mdLines.join('\n'));
    console.log(`\n[aggregate] Zapisano: ${outPath}`);
  }
}

main();
