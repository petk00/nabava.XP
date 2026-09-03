#!/usr/bin/env node
// Bodovanje TOČNOSTI/KVALITETE (RQ1) za jedan ili više eval runova (docs/AI.md,
// docs/EVAL_SCENARIOS.md) — nadopuna aggregateEvalResults.js, koji mjeri
// isplativost/trošak (latenciju, tokene — RQ2), ne i je li AI stvarno napravio
// ISPRAVAN zahtjev.
//
// Uspoređuje STVARNO spremljeno stanje zahtjeva iz baze (evalHarness.js
// polje "actual_created_request", upisano NAKON create_request poziva —
// vidi fetchCreatedRequest u evalHarness.js) s ručno utvrđenim ground
// truthom po scenariju (evalScenarios.js polje "expectedResult").
//
// NIJE potpuno automatski bodovač: nazivi stavki koje AI izvuče iz ponude
// gotovo nikad neće biti slovo-po-slovo isti kao u expectedResult (model
// parafrazira, skraćuje, ponekad prevodi) — pa se automatski provjerava samo
// ono što je mehanički provjerljivo (je li create_request uopće pozvan kad je
// trebao, odjel, BROJ stavki, ukupan iznos unutar prihvatljivog raspona), a
// SADRŽAJ stavki (jesu li to STVARNO iste stavke) ostaje prazno polje u
// izlaznom markdownu za RUČNU procjenu uz checklistu — vidi dogovorenu
// rubriku u razgovoru koji je proizveo ovaj skript.
//
// Korištenje:
//   node scripts/scoreEvalResults.js                          (svi .jsonl u eval-results/)
//   node scripts/scoreEvalResults.js run_A.jsonl               (samo navedeni)
//   node scripts/scoreEvalResults.js run_A.jsonl --out=custom.md

const fs = require('fs');
const path = require('path');
const { SCENARIOS } = require('./evalScenarios');
// Ground truth dolazi iz eval/ground-truth/*.json, ISTOG izvora koji koristi
// evalHarness.js. Ranije je svaka skripta imala vlastitu kopiju očekivanja
// (evalScenarios.expectedResult ovdje, ista struktura ondje), pa su se dvije
// implementacije istog mjerila mogle tiho razići.
const { loadGroundTruthForScoring } = require('./groundTruth');

const RESULTS_DIR = path.join(__dirname, '..', 'eval-results');
const SCENARIO_BY_ID = new Map(SCENARIOS.map((s) => [s.id, s]));
const AMOUNT_TOLERANCE = 0.01;

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

function amountMatches(actual, acceptableList) {
  if (acceptableList === null || acceptableList === undefined) return actual === null || actual === undefined;
  if (actual === null || actual === undefined) return false;
  return acceptableList.some((v) => Math.abs(v - actual) <= AMOUNT_TOLERANCE);
}

function checkbox(value) {
  if (value === null) return '[ ]'; // nije mehanički provjerljivo — ostaje ručno
  return value ? '[x]' : '[ ]';
}

/** Mehanički provjerljiv dio bodovanja za JEDAN pokušaj. Vraća null gdje provjera zahtijeva ljudsku prosudbu. */
function autoScore(row, expected) {
  if (!expected) return null;

  const created = row.actual_created_request;
  const expectsCreate = expected.decision === 'create';
  const decisionOk = expectsCreate ? row.create_request_called === true : row.create_request_called === false;

  let departmentOk = null;
  let itemCountOk = null;
  let totalOk = null;

  if (expectsCreate && created) {
    departmentOk = expected.department_name ? created.department_name === expected.department_name : null;
    itemCountOk = expected.items ? created.items.length === expected.items.length : null;
    totalOk = amountMatches(created.total_amount, expected.total_amount_acceptable);
  }

  return { decisionOk, departmentOk, itemCountOk, totalOk };
}

function formatItemList(items) {
  if (!items || items.length === 0) return '_(nema stavki)_';
  return items.map((i) => `- ${i.item_name} (${i.quantity})`).join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const outArg = args.find((a) => a.startsWith('--out='));
  const outPath = outArg
    ? path.resolve(outArg.slice('--out='.length))
    : path.join(__dirname, '..', '..', 'docs', 'eval-runs', 'scoring-worksheet.md');
  const files = resolveInputFiles(args);

  if (files.length === 0) {
    console.error('Nema .jsonl datoteka za bodovanje.');
    process.exit(1);
  }

  const allRows = files.flatMap(readRows);
  const byScenario = new Map();
  for (const row of allRows) {
    if (!byScenario.has(row.scenario_id)) byScenario.set(row.scenario_id, []);
    byScenario.get(row.scenario_id).push(row);
  }

  const lines = [
    '# Radni list za bodovanje točnosti (RQ1)',
    '',
    `Generirano: ${new Date().toISOString()}`,
    `Uključeni runovi: ${files.map((f) => path.basename(f)).join(', ')}`,
    '',
    '**Kako čitati:** `[x]`/`[ ]` uz "Odluka", "Odjel", "Broj stavki", "Iznos" su AUTOMATSKI izračunati',
    '(usporedba s ground truthom iz eval/ground-truth/). Redak "Sadržaj stavki" NIJE automatski —',
    'usporedi "STVARNE STAVKE" sa "OČEKIVANE STAVKE" ispod i ručno označi. Prazan `[ ]` kod automatskih',
    'polja gdje scenarij ne kreira zahtjev (ask/refuse) znači "nije primjenjivo", ne "netočno".',
    '',
  ];

  let autoTotals = { decision: 0, department: 0, itemCount: 0, total: 0, applicable: 0 };

  for (const [scenarioId, rows] of [...byScenario.entries()].sort()) {
    const scenario = SCENARIO_BY_ID.get(scenarioId);
    const expected = loadGroundTruthForScoring(row.scenario_id);
    lines.push(`## ${scenarioId}`, '');
    if (!expected) {
      lines.push('_Nema ground trutha za ovaj scenarij (eval/ground-truth/) — preskočeno._', '');
      continue;
    }
    lines.push(`**Očekivano:** odluka=\`${expected.decision}\`, odjel=\`${expected.department_name ?? '-'}\`, ${expected.items.length} stavki, iznos∈${JSON.stringify(expected.total_amount_acceptable)}`);
    if (expected.notes) lines.push(`> ${expected.notes}`);
    lines.push('', 'OČEKIVANE STAVKE:', formatItemList(expected.items), '');

    for (const row of rows.sort((a, b) => a.attempt - b.attempt)) {
      const score = autoScore(row, expected);
      const created = row.actual_created_request;
      lines.push(`### Pokušaj ${row.attempt} (${row._run})`, '');
      if (!row.success) {
        lines.push(`- Pokušaj NIJE uspio na razini poziva (error: \`${row.error}\`) — bodovanje točnosti se ne primjenjuje, pouzdanost/latencija se prati u aggregateEvalResults.js (RQ2).`, '');
        continue;
      }
      lines.push(`- ${checkbox(score.decisionOk)} Odluka: create_request pozvan=${row.create_request_called} (očekivano: ${expected.decision})`);
      if (score.departmentOk !== null) {
        lines.push(`- ${checkbox(score.departmentOk)} Odjel: "${created?.department_name}" (očekivano: "${expected.department_name}")`);
        autoTotals.department += score.departmentOk ? 1 : 0;
      }
      if (score.itemCountOk !== null) {
        lines.push(`- ${checkbox(score.itemCountOk)} Broj stavki: ${created?.items.length} (očekivano: ${expected.items.length})`);
        autoTotals.itemCount += score.itemCountOk ? 1 : 0;
      }
      if (score.totalOk !== null) {
        lines.push(`- ${checkbox(score.totalOk)} Iznos: ${created?.total_amount ?? 'null'} (prihvatljivo: ${JSON.stringify(expected.total_amount_acceptable)})`);
        autoTotals.total += score.totalOk ? 1 : 0;
      }
      if (expected.decision === 'create') {
        lines.push(`- [ ] Sadržaj stavki točan (RUČNA PROCJENA)`);
      }
      autoTotals.decision += score.decisionOk ? 1 : 0;
      autoTotals.applicable += 1;

      if (created) {
        lines.push('', 'STVARNE STAVKE:', formatItemList(created.items), '');
      } else if (row.create_request_called) {
        lines.push('', '_(create_request pozvan, ali actual_created_request nedostupan — stariji run prije ove nadogradnje harnessa)_', '');
      }
      lines.push(`- Bilješka: _${row.final_response_text ? row.final_response_text.slice(0, 200).replace(/\n/g, ' ') : ''}_`, '');
    }
  }

  lines.push(
    '---',
    '',
    '## Sažetak automatskih provjera',
    '',
    `- Odluka (create/ne-create) ispravna: ${autoTotals.decision}/${autoTotals.applicable}`,
    `- Odjel ispravan (gdje primjenjivo): ${autoTotals.department}`,
    `- Broj stavki ispravan (gdje primjenjivo): ${autoTotals.itemCount}`,
    `- Iznos u prihvatljivom rasponu (gdje primjenjivo): ${autoTotals.total}`,
    '',
    '_Sadržaj stavki (jesu li to STVARNO iste stavke, ne samo isti broj) i finije razlike ask_clarification vs refuse ostaju za ručnu procjenu iznad._',
    ''
  );

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(`[scoreEvalResults] Radni list zapisan: ${outPath}`);
  console.log(`[scoreEvalResults] Odluka ispravna: ${autoTotals.decision}/${autoTotals.applicable}`);
}

main();
