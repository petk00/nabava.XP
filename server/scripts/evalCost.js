#!/usr/bin/env node
/**
 * Trošak po ponudi i točka pokrića (docs/mjerni-plan.md, tvrdnja H7).
 *
 * Sve pretpostavke stoje u `server/eval/cost-assumptions.json`, ne u kodu —
 * cijena tokena s datumom i izvorom, nabavna cijena uređaja, amortizacija,
 * tarifa kWh i snaga. Skripta NE računa trošak udaljene izvedbe dok su cijene
 * `null`: radije nema brojke nego brojka bez izvora.
 *
 * Tokeni i trajanja dolaze iz STVARNO IZMJERENIH runova (eval-results/*.jsonl),
 * ne iz procjene.
 *
 * TOČKA POKRIĆA SE NE ISKAZUJE KAO JEDAN BROJ. Cijena oblaka se mijenja, a s
 * njom i cijeli zaključak, pa se računa krivulja preko raspona 0,25×–2× cijene
 * iz cjenika. Jedan broj bi tvrdio preciznost koje nema.
 *
 * DVA RAČUNA, NE JEDAN. Ista mjerenja daju dva poštena, a vrlo različita odgovora,
 * ovisno o tome pripisuje li se uređaj zaključivanju:
 *
 *   PUNI RAČUN — cijela amortizacija uređaja tereti zaključivanje. Odgovara
 *   pitanju „isplati li se KUPITI uređaj radi ove funkcije".
 *
 *   GRANIČNI RAČUN — uređaj je ionako u pogonu jer na njemu rade aplikacija i
 *   baza, pa zaključivanju pripada samo utrošena energija. Odgovara pitanju
 *   „isplati li se DODATI ovu funkciju na uređaj koji već postoji".
 *
 * Razlika između njih JEST nalaz i oba idu u rad; iskazati samo jedan značilo bi
 * odabrati odgovor prije nego se postavi pitanje.
 *
 * Uporaba:
 *   node scripts/evalCost.js                       (najnoviji run po izvedbi)
 *   node scripts/evalCost.js run_A.jsonl run_B.jsonl
 */

const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, '..', 'eval-results');
const ASSUMPTIONS = path.join(__dirname, '..', 'eval', 'cost-assumptions.json');

const median = (xs) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function readRows(files) {
  return files.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n')
    .filter((l) => l.trim()).map((l) => JSON.parse(l)));
}

function resolveFiles(args) {
  const named = args.filter((a) => !a.startsWith('--'));
  if (named.length > 0) return named.map((f) => (path.isAbsolute(f) ? f : path.join(RESULTS_DIR, f)));
  // Bez argumenta uzima SAMO najnoviji run. Zbrajanje svih runova miješalo bi
  // mjerenja iz različitih inačica aparata i različitih postavki — za rad se
  // ionako citira jedan run_id.
  const all = fs.readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.jsonl')).sort();
  if (all.length === 0) return [];
  console.log(`(bez argumenta: uzet je samo najnoviji run — ${all[all.length - 1]})`);
  return [path.join(RESULTS_DIR, all[all.length - 1])];
}

/** Po izvedbi: medijan ulaznih/izlaznih tokena i trajanja modela po ponudi. */
function perProvider(rows) {
  const out = {};
  for (const r of rows) {
    if (!r.provider) continue;
    (out[r.provider] ||= { prompt: [], completion: [], modelMs: [], e2eMs: [], n: 0 });
    const p = out[r.provider];
    p.n += 1;
    if (r.prompt_tokens != null) p.prompt.push(r.prompt_tokens);
    if (r.completion_tokens != null) p.completion.push(r.completion_tokens);
    if (r.model_latency_ms != null) p.modelMs.push(r.model_latency_ms);
    if (r.latency_ms != null) p.e2eMs.push(r.latency_ms);
  }
  for (const p of Object.values(out)) {
    p.promptMedian = median(p.prompt);
    p.completionMedian = median(p.completion);
    p.modelMsMedian = median(p.modelMs);
    p.e2eMsMedian = median(p.e2eMs);
  }
  return out;
}

function main() {
  const a = JSON.parse(fs.readFileSync(ASSUMPTIONS, 'utf8'));
  const files = resolveFiles(process.argv.slice(2));
  if (files.length === 0) { console.error('Nema .jsonl runova.'); process.exit(1); }
  const rows = readRows(files).filter((r) => r.scenario_id);
  const stats = perProvider(rows);

  console.log(`Runova: ${files.length} | pokušaja: ${rows.length}`);
  console.log(`Pretpostavke: ${path.relative(process.cwd(), ASSUMPTIONS)}\n`);

  console.log('IZMJERENO (medijani po pokušaju)');
  console.log('izvedba   pokušaja   ulaz tok   izlaz tok   model s    e2e s');
  for (const [name, p] of Object.entries(stats)) {
    console.log(`${name.padEnd(9)} ${String(p.n).padStart(8)} ${String(p.promptMedian ?? '—').padStart(10)} `
      + `${String(p.completionMedian ?? '—').padStart(11)} ${((p.modelMsMedian ?? 0) / 1000).toFixed(1).padStart(9)} `
      + `${((p.e2eMsMedian ?? 0) / 1000).toFixed(1).padStart(8)}`);
  }

  // ── lokalna izvedba: struja + amortizacija ──
  const hw = a.hardver;
  const en = a.energija;
  const tarifa = en.tarife_eur_kwh[en.zadana_tarifa];
  const local = stats.ollama;
  let localEnergyPerQuote = null;
  if (local?.modelMsMedian != null) {
    localEnergyPerQuote = (en.snaga_pod_opterecenjem_w * (local.modelMsMedian / 3600000) / 1000) * tarifa;
  }
  const amortPerYear = (hw.nabavna_cijena_eur - (hw.ostatak_vrijednosti_eur || 0)) / hw.vijek_godina;

  console.log('\nLOKALNA IZVEDBA');
  if (localEnergyPerQuote == null) {
    console.log('  nema izmjerenog trajanja modela za ollama — trošak struje se ne računa');
  } else {
    console.log(`  struja po ponudi        : ${localEnergyPerQuote.toFixed(6)} EUR  `
      + `(${en.snaga_pod_opterecenjem_w} W × ${(local.modelMsMedian / 1000).toFixed(1)} s × ${tarifa} EUR/kWh)`);
    if (!en.izmjereno) console.log('  !! snaga NIJE izmjerena — 65 W je PRETPOSTAVKA (v. cost-assumptions.json)');
  }
  console.log(`  amortizacija godišnje   : ${amortPerYear.toFixed(2)} EUR  `
    + `(${hw.nabavna_cijena_eur} EUR / ${hw.vijek_godina} god.)`);

  // ── udaljena izvedba: samo ako cijene postoje ──
  const modelKey = Object.keys(a.cijene_tokena).find((k) => !k.startsWith('_'));
  const price = a.cijene_tokena[modelKey];
  const cloud = stats.gemini;
  let cloudPerQuote = null;
  console.log('\nUDALJENA IZVEDBA');
  // Cjenik je u USD, a trošak se iskazuje u EUR. Bez tečaja s datumom i izvorom
  // brojka ne bi imala provjerljivu vrijednost, pa se ne računa.
  const fx = a.tecaj || {};
  const needsFx = String(price.valuta_cjenika || '').toUpperCase() !== 'EUR';
  if (price.ulaz == null || price.izlaz == null) {
    console.log(`  cijena tokena za "${modelKey}" NIJE upisana u cost-assumptions.json.`);
    console.log('  Trošak udaljene izvedbe i točka pokrića se NE računaju — brojka bez izvora ne ide u rad.');
  } else if (needsFx && fx.usd_u_eur == null) {
    console.log(`  cijena je u ${price.valuta_cjenika} (${price.ulaz} / ${price.izlaz} po milijunu, `
      + `cjenik ${price.datum_provjere}, ${price.izvor}),`);
    console.log('  ali TEČAJ nije upisan (cost-assumptions.json -> tecaj). Trošak i točka pokrića se NE računaju.');
  } else if (!cloud?.promptMedian) {
    console.log('  nema izmjerenih tokena za gemini u ovim runovima');
  } else {
    const rate = needsFx ? fx.usd_u_eur : 1;
    cloudPerQuote = ((cloud.promptMedian * price.ulaz + cloud.completionMedian * price.izlaz) / 1e6) * rate;
    console.log(`  trošak po ponudi        : ${cloudPerQuote.toFixed(6)} EUR  `
      + `(${cloud.promptMedian} ulaznih × ${price.ulaz} + ${cloud.completionMedian} izlaznih × ${price.izlaz} `
      + `${price.valuta_cjenika}/M${needsFx ? `, tečaj ${rate}` : ''})`);
    console.log(`  cjenik provjeren        : ${price.datum_provjere || '—'} | izvor: ${price.izvor || '—'}`);
    if (needsFx) console.log(`  tečaj                   : ${fx.datum || '—'} | izvor: ${fx.izvor || '—'}`);
  }

  // ── dva računa i dvije krivulje ──
  console.log('\nDVA RAČUNA');
  if (cloudPerQuote == null || localEnergyPerQuote == null) {
    console.log('  Ne mogu se izračunati dok cijena tokena nije upisana i dok nema izmjerenog');
    console.log('  trajanja lokalne izvedbe.');
    return;
  }

  const volumen = a.volumen || {};
  const volumeni = volumen.raspon_za_analizu_osjetljivosti
    || [volumen.ponuda_godisnje_procjena].filter(Boolean);

  console.log('  PUNI     — cijela amortizacija tereti zaključivanje;');
  console.log('             pitanje je "isplati li se KUPITI uređaj radi ove funkcije".');
  console.log('  GRANIČNI — uređaj je ionako u pogonu (aplikacija i baza), pa zaključivanju');
  console.log('             pripada samo energija; pitanje je "isplati li se DODATI funkciju".');

  console.log('\n  Godišnji trošak pri stvarnom opterećenju');
  console.log('  ponuda/god.        oblak        lokalno (puni)   lokalno (granični)');
  for (const v of volumeni) {
    const cloudYear = cloudPerQuote * v;
    const localFull = amortPerYear + localEnergyPerQuote * v;
    const localMarginal = localEnergyPerQuote * v;
    console.log(`  ${String(v).padStart(11)}   ${cloudYear.toFixed(2).padStart(10)} EUR   `
      + `${localFull.toFixed(2).padStart(12)} EUR   ${localMarginal.toFixed(2).padStart(14)} EUR`);
  }

  console.log('\n  KRIVULJA — volumen pri kojem lokalna izvedba postaje jeftinija od udaljene\n');
  console.log('  množitelj   cijena oblaka/ponuda   točka pokrića PUNI      točka pokrića GRANIČNI');
  for (const k of a.krivulja_isplativosti.mnozitelji_cijene_oblaka) {
    const cloudK = cloudPerQuote * k;
    const perQuoteDiff = cloudK - localEnergyPerQuote;
    // Puni račun: fiksni trošak je amortizacija, pa točka pokrića postoji.
    const beFull = perQuoteDiff > 0 ? Math.ceil(amortPerYear / perQuoteDiff) : null;
    // Granični račun: fiksnog troška NEMA, pa je lokalno jeftinije od prve ponude
    // čim je energija po ponudi ispod cijene oblaka po ponudi.
    const beMarginal = perQuoteDiff > 0 ? 'od prve ponude' : 'nikad';
    console.log(`  ${String(k).padStart(9)}   ${cloudK.toFixed(6).padStart(20)}   `
      + `${(beFull === null ? 'nikad' : beFull.toLocaleString('hr')).padStart(20)}   ${beMarginal.padStart(20)}`);
  }
  console.log(`\n  Puni:     točka pokrića = amortizacija (${amortPerYear.toFixed(2)} EUR/god.) / `
    + '(oblak po ponudi − struja po ponudi).');
  console.log('  Granični: nema fiksnog troška, pa je lokalno jeftinije čim je struja po ponudi');
  console.log(`            (${localEnergyPerQuote.toFixed(6)} EUR) ispod cijene oblaka po ponudi.`);
  console.log('\n  Razlika između ta dva računa JEST nalaz — oba idu u rad.');
}

main();
