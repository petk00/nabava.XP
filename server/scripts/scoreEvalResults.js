#!/usr/bin/env node
// Bodovanje TOČNOSTI čitanja ponude za jedan ili više eval runova
// (docs/mjerni-plan.md) — nadopuna aggregateEvalResults.js, koji mjeri brzinu i
// potrošnju, ne i je li model stavke pročitao ispravno.
//
// Mjeri se ono što vrati ruta POST /api/requests/:id/ai-items: popis stavki
// (naziv, količina, kategorija) i ukupan iznos pročitan iz ponude. Usporedba
// ide protiv ground trutha u eval/ground-truth/<scenario_id>.json.
//
// NIJE potpuno automatski bodovač. Nazivi stavki gotovo nikad nisu slovo po
// slovo isti kao u ground truthu (model parafrazira, skraćuje, izbacuje šifre),
// pa se automatski provjerava samo ono što je mehanički provjerljivo — je li
// stavaka izvučeno koliko treba, poklapaju li se količine, je li iznos u
// prihvatljivom rasponu i je li kategorija ispravno dodijeljena. SADRŽAJ
// stavki ostaje prazno polje za RUČNU procjenu uz usporedni ispis.
//
// Korištenje:
//   node scripts/scoreEvalResults.js                          (svi .jsonl u eval-results/)
//   node scripts/scoreEvalResults.js run_A.jsonl               (samo navedeni)
//   node scripts/scoreEvalResults.js run_A.jsonl --out=custom.md

const fs = require('fs');
const path = require('path');
// Ground truth dolazi iz eval/ground-truth/*.json, ISTOG izvora koji koristi
// evalHarness.js. Prije je svaka skripta imala vlastitu kopiju očekivanja, pa
// su se dvije implementacije istog mjerila mogle tiho razići.
const { loadGroundTruthForScoring } = require('./groundTruth');

const RESULTS_DIR = path.join(__dirname, '..', 'eval-results');
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

function sortedQuantities(items) {
  return (items || []).map((i) => Number(i?.quantity)).sort((a, b) => a - b);
}

/**
 * Mehanički provjerljiv dio bodovanja za JEDAN pokušaj.
 * Vraća null ondje gdje provjera nije primjenjiva.
 */
function autoScore(row, expected) {
  if (!expected) return null;

  // Scenarij koji očekuje odbijanje točan je upravo kad stavaka nema.
  if (expected.expects_refusal) {
    return {
      decisionOk: row.items_returned === null || row.items_returned === 0,
      itemCountOk: null,
      quantitiesOk: null,
      amountOk: null,
    };
  }

  const extracted = row.extracted_items;
  if (!extracted) {
    return { decisionOk: false, itemCountOk: null, quantitiesOk: null, amountOk: null };
  }

  const expectedQty = sortedQuantities(expected.items);
  const actualQty = sortedQuantities(extracted);

  return {
    decisionOk: true,
    itemCountOk: expected.items.length === extracted.length,
    quantitiesOk: expectedQty.length === actualQty.length && expectedQty.every((q, i) => q === actualQty[i]),
    amountOk: amountMatches(row.amount_read, expected.total_amount_acceptable),
  };
}

function formatItemList(items, withCategory = false) {
  if (!items || items.length === 0) return '_(nema stavki)_';
  return items
    .map((i) => `- ${i.item_name} (${i.quantity})${withCategory && i.category_name ? ` — ${i.category_name}` : ''}`)
    .join('\n');
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
    '# Radni list za bodovanje točnosti čitanja ponude',
    '',
    `Generirano: ${new Date().toISOString()}`,
    `Uključeni runovi: ${files.map((f) => path.basename(f)).join(', ')}`,
    '',
    '**Kako čitati:** `[x]`/`[ ]` uz "Ishod", "Broj stavki", "Količine", "Iznos" i "Kategorije" su',
    'AUTOMATSKI izračunati (usporedba s ground truthom iz eval/ground-truth/). Redak "Sadržaj stavki"',
    'NIJE automatski — usporedi "PROČITANE STAVKE" s "OČEKIVANE STAVKE" i ručno označi. Prazan `[ ]`',
    'kod automatskih polja znači "nije primjenjivo", ne "netočno".',
    '',
    'Kategorije se boduju dvojako: STROGO priznaje samo očekivanu kategoriju, BLAGO bilo koju iz',
    'popisa prihvatljivih. Razlika mjeri koliko dodjela ovisi o konvenciji ustanove, a koliko o',
    'prepoznavanju predmeta.',
    '',
  ];

  const totals = {
    applicable: 0, decision: 0,
    itemCountApplicable: 0, itemCount: 0,
    quantitiesApplicable: 0, quantities: 0,
    amountApplicable: 0, amount: 0,
    categoriesChecked: 0, categoriesStrict: 0, categoriesLenient: 0,
  };

  for (const [scenarioId, rows] of [...byScenario.entries()].sort()) {
    const expected = loadGroundTruthForScoring(scenarioId);
    lines.push(`## ${scenarioId}`, '');
    if (!expected) {
      lines.push('_Nema ground trutha za ovaj scenarij (eval/ground-truth/) — preskočeno._', '');
      continue;
    }
    lines.push(
      `**Očekivano:** ${expected.expects_refusal ? 'odbijanje (dokument nije ponuda)' : `${expected.items.length} stavki`}`
        + `, iznos∈${JSON.stringify(expected.total_amount_acceptable)}`
    );
    if (expected.notes) lines.push(`> ${expected.notes}`);
    lines.push('', 'OČEKIVANE STAVKE:', formatItemList(expected.items, true), '');

    for (const row of rows.sort((a, b) => a.attempt - b.attempt)) {
      const score = autoScore(row, expected);
      lines.push(`### Pokušaj ${row.attempt} — ${row.provider}/${row.model ?? '?'} (${row._run})`, '');

      if (!row.success && !row.refused) {
        lines.push(
          `- Pokušaj NIJE uspio na razini poziva (error: \`${row.error}\`) — bodovanje točnosti se ne `
            + 'primjenjuje; pouzdanost i latencija prate se u aggregateEvalResults.js.',
          ''
        );
        continue;
      }

      lines.push(`- ${checkbox(score.decisionOk)} Ishod: ${row.refused ? 'odbijeno' : `${row.items_returned} stavki`}`
        + ` (očekivano: ${expected.expects_refusal ? 'odbijanje' : `${expected.items.length} stavki`})`);
      totals.decision += score.decisionOk ? 1 : 0;
      totals.applicable += 1;

      if (row.refused) {
        lines.push(`- Poruka modela: _${(row.refusal_message || '').slice(0, 300).replace(/\n/g, ' ')}_`, '');
        continue;
      }

      if (score.itemCountOk !== null) {
        lines.push(`- ${checkbox(score.itemCountOk)} Broj stavki: ${row.items_returned} (očekivano: ${expected.items.length})`);
        totals.itemCountApplicable += 1;
        totals.itemCount += score.itemCountOk ? 1 : 0;
      }
      if (score.quantitiesOk !== null) {
        lines.push(`- ${checkbox(score.quantitiesOk)} Količine se poklapaju`);
        totals.quantitiesApplicable += 1;
        totals.quantities += score.quantitiesOk ? 1 : 0;
      }
      if (score.amountOk !== null) {
        lines.push(`- ${checkbox(score.amountOk)} Iznos: ${row.amount_read ?? 'null'}`
          + ` (prihvatljivo: ${JSON.stringify(expected.total_amount_acceptable)}, status: ${row.amount_status ?? '-'})`);
        totals.amountApplicable += 1;
        totals.amount += score.amountOk ? 1 : 0;
      }

      const cat = row.category_accuracy;
      if (cat && cat.checked > 0) {
        lines.push(`- ${checkbox(cat.strict === cat.checked)} Kategorije STROGO: ${cat.strict}/${cat.checked}`
          + ` — BLAGO: ${cat.lenient}/${cat.checked}`);
        totals.categoriesChecked += cat.checked;
        totals.categoriesStrict += cat.strict;
        totals.categoriesLenient += cat.lenient;
        for (const m of cat.mismatches || []) {
          lines.push(`  - promašaj: "${m.item_name}" → dobiveno "${m.actual}", očekivano "${m.expected}"`);
        }
      } else {
        lines.push('- [ ] Kategorije: broj stavki se ne poklapa, mjera nije definirana');
      }

      lines.push('- [ ] Sadržaj stavki točan (RUČNA PROCJENA)');
      if ((row.warnings || []).length > 0) {
        lines.push(`- Upozorenja: ${row.warnings.join(' | ')}`);
      }
      lines.push('', 'PROČITANE STAVKE:', formatItemList(row.extracted_items, true), '');
    }
  }

  lines.push(
    '---',
    '',
    '## Sažetak automatskih provjera',
    '',
    `- Ishod ispravan: ${totals.decision}/${totals.applicable}`,
    `- Broj stavki ispravan: ${totals.itemCount}/${totals.itemCountApplicable}`,
    `- Količine ispravne: ${totals.quantities}/${totals.quantitiesApplicable}`,
    `- Iznos u prihvatljivom rasponu: ${totals.amount}/${totals.amountApplicable}`,
    `- Kategorije STROGO: ${totals.categoriesStrict}/${totals.categoriesChecked}`,
    `- Kategorije BLAGO: ${totals.categoriesLenient}/${totals.categoriesChecked}`,
    '',
    '_Sadržaj stavki (jesu li to STVARNO iste stavke, ne samo isti broj) ostaje za ručnu procjenu iznad._',
    ''
  );

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(`[scoreEvalResults] Radni list zapisan: ${outPath}`);
  console.log(`[scoreEvalResults] Ishod ispravan: ${totals.decision}/${totals.applicable}`);
}

main();
