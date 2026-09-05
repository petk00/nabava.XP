#!/usr/bin/env node
// Strojna provjera provenancea u ground truthu (docs/mjerni-plan.md § 5).
//
// Mjerni plan tvrdi da je svaki citat bajt-jednak izvoru i da se to provjerava
// strojno. Ova skripta je ta provjera — do 6. 9. 2026. postojala je samo kao
// tvrdnja, bez koda u repozitoriju.
//
// Tekst se izvlači ISTIM putem kojim ga izvlači mjerena ruta
// (quoteExtractionService -> pdfExtractWorker, pdf-parse u zasebnom procesu).
// Bilo koji drugi način čitanja PDF-a dao bi drukčiji tekst — razmaci, redoslijed
// stupaca, prijelomi redaka — pa bi provjera potvrđivala citate za tekst koji
// model nikad ne vidi.
//
// Za svaki lokator provjeravaju se DVIJE stvari:
//   1. je li `quote` doslovan podniz izvučenog teksta (bajt po bajt, bez ikakve
//      normalizacije — nedjeljivi razmak U+00A0 nije obični razmak)
//   2. pada li na redak koji `line` navodi
//
// KONVENCIJA REDAKA: `line` je NULA-INDEKSIRAN redak nad `text.split('\n')`.
// Nigdje nije bila zapisana; utvrđena je 6. 9. 2026. mjerenjem nad svih 125
// lokatora koji pokazuju na prilog — svi se poklapaju uz nula-bazirano brojanje
// i nijedan uz jedinično. Izvučeni tekst ne počinje praznim retkom, pa razlika
// nije artefakt vodećeg prijeloma nego odabrana konvencija autora ground trutha.
// Zapisano je ovdje i u mjernom planu § 5 da se ne mora ponovno otkrivati.
//
// Uporaba:
//   node scripts/verifyProvenance.js                       (sve datoteke)
//   node scripts/verifyProvenance.js scenario3_rabat_pdv    (samo navedene)
//   node scripts/verifyProvenance.js --quiet                (samo sažetak i greške)
//
// Izlazni kod 1 kad ijedan lokator padne — da se može zvati iz protokola prije
// mjerne kampanje.

const fs = require('fs');
const path = require('path');
const { extractQuoteText } = require('../src/services/quoteExtractionService');
const { GROUND_TRUTH_DIR } = require('./groundTruth');

const FIXTURES_DIR = path.join(__dirname, '..', 'eval-scenarios', 'fixtures');

/** Nevidljivi znakovi koji su stvarni uzrok promašaja — vidi § 5 mjernog plana. */
const INVISIBLES = [
  [/ /g, '⍽'],   // nedjeljivi razmak
  [/ /g, '⍽ᵗ'],  // uski nedjeljivi razmak
  [/ /g, '␉'],   // tanki razmak
  [/\t/g, '⇥'],
  [/\r/g, '⏎'],
];

function visible(s) {
  if (s === null || s === undefined) return String(s);
  return INVISIBLES.reduce((acc, [re, ch]) => acc.replace(re, ch), s);
}

const textCache = new Map();

/** Tekst priloga, izvučen istim putem kojim ga izvlači ruta. */
async function attachmentText(fileName) {
  if (textCache.has(fileName)) return textCache.get(fileName);
  const filePath = path.join(FIXTURES_DIR, fileName);
  let entry;
  if (!fs.existsSync(filePath)) {
    entry = { ok: false, reason: `prilog ne postoji: ${filePath}` };
  } else {
    try {
      const text = await extractQuoteText(fs.readFileSync(filePath));
      entry = { ok: true, text, lines: text.split('\n') };
    } catch (error) {
      entry = { ok: false, reason: error.message };
    }
  }
  textCache.set(fileName, entry);
  return entry;
}

/**
 * Skuplja SVE lokatore, uključujući one ugniježđene u `provenance.from`
 * (izvedene vrijednosti). Bez toga bi izvedeni iznos scenarija 4 bio jedan
 * lokator umjesto dva — odatle i razlika u ranijim brojkama.
 */
function collectLocators(node, fieldPath, out) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectLocators(v, `${fieldPath}[${i}]`, out));
    return;
  }
  if (!node || typeof node !== 'object') return;

  const prov = node.provenance;
  if (prov && typeof prov === 'object') {
    if (Array.isArray(prov.from)) {
      prov.from.forEach((sub, i) => out.push({ fieldPath: `${fieldPath}.provenance.from[${i}]`, prov: sub, derived: prov }));
    } else {
      out.push({ fieldPath, prov, derived: null });
    }
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === 'provenance') continue;
    collectLocators(v, fieldPath ? `${fieldPath}.${k}` : k, out);
  }
}

function resolveInputFiles(args) {
  const names = args.filter((a) => !a.startsWith('--'));
  const all = fs.readdirSync(GROUND_TRUTH_DIR).filter((f) => f.endsWith('.json')).sort();
  if (names.length === 0) return all.map((f) => path.join(GROUND_TRUTH_DIR, f));
  return names.map((n) => path.join(GROUND_TRUTH_DIR, n.endsWith('.json') ? n : `${n}.json`));
}

async function main() {
  const args = process.argv.slice(2);
  const quiet = args.includes('--quiet');
  const files = resolveInputFiles(args);

  const tally = {
    total: 0, withQuote: 0, checked: 0, passed: 0,
    failedQuote: 0, failedLine: 0,
    skippedCodebook: 0, skippedTurn: 0, unreadable: 0,
  };
  const failures = [];
  const perScenario = [];

  for (const file of files) {
    const gt = JSON.parse(fs.readFileSync(file, 'utf8'));
    const locators = [];
    collectLocators(gt, '', locators);

    const s = { id: gt.scenario_id, total: locators.length, checked: 0, passed: 0, failed: 0, turn: 0, codebook: 0 };

    for (const { fieldPath, prov } of locators) {
      tally.total += 1;

      if (prov.source === 'codebook') {
        tally.skippedCodebook += 1; s.codebook += 1;
        continue;
      }
      if (typeof prov.quote !== 'string') {
        // Izvedena vrijednost sama nema citat — nose ga njeni izvori, koji su
        // već skupljeni zasebno.
        continue;
      }
      tally.withQuote += 1;

      if (prov.source === 'turn') {
        // Lokator pokazuje na tekst korisnikove poruke. Scenariji od uklanjanja
        // chata nemaju poruke, pa se taj citat NEMA na čemu provjeriti. Nije
        // promašaj nego neprovjerljivo — i ta polja se ionako ne boduju.
        tally.skippedTurn += 1; s.turn += 1;
        continue;
      }

      if (prov.source !== 'attachment') {
        failures.push({ scenario: gt.scenario_id, fieldPath, kind: 'nepoznat izvor',
          expected: String(prov.source), found: '—' });
        tally.failedQuote += 1; s.failed += 1;
        continue;
      }

      const doc = await attachmentText(prov.file);
      if (!doc.ok) {
        tally.unreadable += 1;
        failures.push({ scenario: gt.scenario_id, fieldPath, kind: 'prilog nečitljiv',
          expected: prov.file, found: doc.reason });
        s.failed += 1;
        continue;
      }

      tally.checked += 1; s.checked += 1;
      const idx = doc.text.indexOf(prov.quote);
      if (idx === -1) {
        tally.failedQuote += 1; s.failed += 1;
        // Najbliži redak po prvih 20 znakova citata — da se vidi ŠTO stvarno piše.
        const probe = prov.quote.slice(0, 20);
        const near = doc.lines.findIndex((l) => l.includes(probe));
        failures.push({
          scenario: gt.scenario_id, fieldPath, kind: 'citat nije doslovan podniz',
          expected: prov.quote,
          found: near === -1 ? '(nema ni približnog retka)' : `redak ${near + 1}: ${doc.lines[near]}`,
        });
        continue;
      }

      // Citat se traži NA NAVEDENOM RETKU, ne samo bilo gdje u dokumentu —
      // inače bi lokator koji pokazuje na krivi redak prošao svaki put kad se
      // isti niz pojavljuje i drugdje (npr. "Ukupno za uplatu" u dvije ponude).
      if (prov.line !== undefined) {
        const stated = doc.lines[prov.line];
        const onStatedLine = prov.quote.includes('\n')
          ? doc.lines.slice(prov.line, prov.line + prov.quote.split('\n').length).join('\n').includes(prov.quote)
          : (stated !== undefined && stated.includes(prov.quote));
        if (!onStatedLine) {
          const actualLine = doc.text.slice(0, idx).split('\n').length - 1; // nula-indeksirano
          tally.failedLine += 1; s.failed += 1;
          failures.push({
            scenario: gt.scenario_id, fieldPath, kind: 'citat je točan, redak nije',
            expected: `line: ${prov.line} — ondje piše: ${stated === undefined ? '(redak ne postoji)' : stated}`,
            found: `prvo pojavljivanje na retku ${actualLine}: ${doc.lines[actualLine]}`,
          });
          continue;
        }
      }

      tally.passed += 1; s.passed += 1;
    }

    perScenario.push(s);
  }

  if (!quiet) {
    console.log('Provjera provenancea — citat mora biti bajt-jednak tekstu koji izvuče mjerena ruta.');
    console.log('Redak (`line`) je nula-indeksiran nad text.split(\'\\n\').\n');
    console.log('scenarij                            lokatora  provjereno  prolazi  pada  turn  codebook');
    for (const s of perScenario) {
      console.log(
        `${s.id.padEnd(34)} ${String(s.total).padStart(8)} ${String(s.checked).padStart(11)} `
        + `${String(s.passed).padStart(8)} ${String(s.failed).padStart(5)} ${String(s.turn).padStart(5)} ${String(s.codebook).padStart(9)}`
      );
    }
    console.log();
  }

  if (failures.length > 0) {
    console.log(`NESLAGANJA (${failures.length}):\n`);
    for (const f of failures) {
      console.log(`  ${f.scenario} — ${f.fieldPath}`);
      console.log(`    ${f.kind}`);
      console.log(`    očekivano: ${visible(f.expected)}`);
      console.log(`    zatečeno : ${visible(f.found)}`);
      console.log();
    }
  }

  console.log('SAŽETAK');
  console.log(`  lokatora ukupno (uključujući ugniježđene u izvedenim vrijednostima): ${tally.total}`);
  console.log(`  od toga s citatom                                                  : ${tally.withQuote}`);
  console.log(`  provjereno protiv teksta priloga                                   : ${tally.checked}`);
  console.log(`  prolazi                                                            : ${tally.passed}`);
  console.log(`  pada — citat nije doslovan podniz                                  : ${tally.failedQuote}`);
  console.log(`  pada — citat točan, redak pogrešan                                 : ${tally.failedLine}`);
  console.log(`  neprovjerljivo — izvor je poruka razgovora (chat uklonjen)         : ${tally.skippedTurn}`);
  console.log(`  bez citata — dodjela iz codebooka                                  : ${tally.skippedCodebook}`);
  console.log(`  prilog nečitljiv                                                   : ${tally.unreadable}`);

  const failed = tally.failedQuote + tally.failedLine + tally.unreadable;
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[verifyProvenance] Greška:', error.message);
  process.exitCode = 1;
});
