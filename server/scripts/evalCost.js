#!/usr/bin/env node
/**
 * Trošak jednog eval runa (RQ2), izračunat iz STVARNO izmjerenih tokena u
 * eval-results/*.jsonl — ne iz procjene.
 *
 * Cijene NISU dio mjerenja i ovdje se ne mogu provjeriti: mijenjaju se, ovise
 * o razini računa i regiji. Zato stoje u PRICES kao podatak koji korisnik
 * upisuje i potvrđuje iz službenog cjenika, a skripta jasno kaže odakle su.
 * Lokalni modeli namjerno imaju cijenu 0 po tokenu — njihov trošak nije token
 * nego vrijeme i struja, pa se iskazuje zasebno.
 *
 * Uporaba:  node scripts/evalCost.js [put/do/run.jsonl]
 *           (bez argumenta uzima najnoviji run)
 */

const fs = require('fs');
const path = require('path');

// USD za 1.000.000 tokena. PROVJERI I UPIŠI iz službenog cjenika prije
// citiranja brojki — vrijednosti niže su placeholderi, ne mjerenje.
const PRICES = {
  'gemini-3.5-flash': { input: null, output: null },
};

// Parametri lokalnog hardvera — podatci vlasnika uređaja (Mac mini M4),
// ne procjena skripte. Vijek od 5 godina odražava stvarno očekivano trajanje.
const LOCAL_WATTS = 65;
const HARDWARE_EUR = 800;
const HARDWARE_LIFE_YEARS = 5;

// Cjenik HEP-a. Zadana je jedinstvena tarifa; ostale se ispisuju kao raspon,
// jer isti run noću i danju ne košta isto.
const TARIFFS_EUR_KWH = {
  jedinstvena: 0.0913,
  visa_dan: 0.0972,
  niza_noc: 0.0477,
};
const DEFAULT_TARIFF = 'jedinstvena';

function newestRun(dir) {
  const files = fs.readdirSync(dir).filter((f) => /^run_.*\.jsonl$/.test(f)).sort();
  if (files.length === 0) throw new Error(`Nema runova u ${dir}`);
  return path.join(dir, files[files.length - 1]);
}

function loadRun(file) {
  const rows = fs.readFileSync(file, 'utf8').split('\n')
    .filter((l) => l.trim()).map((l) => JSON.parse(l))
    .filter((r) => r.scenario_id);
  const metaFile = file.replace(/\.jsonl$/, '.meta.json');
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
  return { rows, meta };
}

function main() {
  const file = process.argv[2] || newestRun(path.join(__dirname, '..', 'eval-results'));
  const { rows, meta } = loadRun(file);

  const promptTokens = rows.reduce((s, r) => s + (r.prompt_tokens || 0), 0);
  const completionTokens = rows.reduce((s, r) => s + (r.completion_tokens || 0), 0);
  const wallMs = rows.reduce((s, r) => s + (r.latency_ms || 0), 0);
  const modelName = meta.provider === 'ollama' ? meta.ollama_model : (meta.gemini_model || 'gemini-3.5-flash');

  console.log(`Run:       ${path.basename(file)}`);
  console.log(`Provider:  ${meta.provider || '?'} / ${modelName || '?'}`);
  console.log(`Scenarija: ${rows.length}`);
  console.log(`Trajanje:  ${(wallMs / 60000).toFixed(1)} min`);
  console.log(`Tokeni:    ulaz ${promptTokens.toLocaleString('hr')} | izlaz ${completionTokens.toLocaleString('hr')}`);

  if (meta.provider === 'ollama') {
    const hours = wallMs / 3600000;
    const kwh = (LOCAL_WATTS / 1000) * hours;
    const amortPerHour = HARDWARE_EUR / (HARDWARE_LIFE_YEARS * 365 * 24);
    const amort = amortPerHour * hours;
    const power = kwh * TARIFFS_EUR_KWH[DEFAULT_TARIFF];
    const total = power + amort;

    console.log(`\nTrošak API-ja:  0 (model se vrti lokalno)`);
    console.log(`Energija:       ${kwh.toFixed(5)} kWh (${LOCAL_WATTS} W × ${hours.toFixed(4)} h)`);
    console.log(`Struja:         ${power.toFixed(5)} EUR  (${DEFAULT_TARIFF}, `
      + `${TARIFFS_EUR_KWH[DEFAULT_TARIFF]} EUR/kWh)`);
    for (const [name, price] of Object.entries(TARIFFS_EUR_KWH)) {
      if (name === DEFAULT_TARIFF) continue;
      console.log(`                ${(kwh * price).toFixed(5)} EUR  (${name}, ${price} EUR/kWh)`);
    }
    console.log(`Amortizacija:   ${amort.toFixed(5)} EUR  (${HARDWARE_EUR} EUR / `
      + `${HARDWARE_LIFE_YEARS} god = ${amortPerHour.toFixed(5)} EUR/h)`);
    console.log(`UKUPNO:         ${total.toFixed(5)} EUR po runu`);
    if (rows.length) console.log(`Po scenariju:   ${(total / rows.length).toFixed(5)} EUR`);
    console.log(`\nUdio: struja ${(power / total * 100).toFixed(0)}% | `
      + `amortizacija ${(amort / total * 100).toFixed(0)}%`);
    console.log('Napomena: 65 W je deklarirana potrošnja, nije mjerena instrumentom na utičnici.');
    return;
  }

  const price = PRICES[modelName];
  if (!price || price.input === null || price.output === null) {
    console.log(`\nCijena za "${modelName}" nije upisana u PRICES (scripts/evalCost.js).`);
    console.log('Upiši USD za 1.000.000 tokena iz službenog cjenika, pa ponovi.');
    console.log('\nIzračun koji će se primijeniti:');
    console.log(`  ulaz:  ${promptTokens} / 1e6 × cijena_ulaza`);
    console.log(`  izlaz: ${completionTokens} / 1e6 × cijena_izlaza`);
    return;
  }

  const inCost = (promptTokens / 1e6) * price.input;
  const outCost = (completionTokens / 1e6) * price.output;
  console.log(`\nUlaz:   ${inCost.toFixed(4)} USD  (${promptTokens} × ${price.input}/1M)`);
  console.log(`Izlaz:  ${outCost.toFixed(4)} USD  (${completionTokens} × ${price.output}/1M)`);
  console.log(`UKUPNO: ${(inCost + outCost).toFixed(4)} USD po runu`);
}

main();
