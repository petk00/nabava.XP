#!/usr/bin/env node
// Uzorkovač memorije i procesorskog opterećenja čvora (docs/mjerni-plan.md).
//
// ŠTO MJERI I ŠTO NE. Mjeri rezidentnu memoriju i procesorsko opterećenje
// procesa koji čine samoposluženu izvedbu: model (`llama-server`), Ollamu,
// bazu (`mysqld`) i sam poslužitelj aplikacije. Mjeri i zauzeće memorije
// cijelog sustava iz `vm_stat`.
//
// NE MJERI GRAFIČKI PROCESOR. Lokalni model radi 100 % na GPU-u, pa
// uzorkovanje procesora o njegovu opterećenju govori vrlo malo. GPU i potrošnja
// u vatima uzimaju se `powermetrics`-om, koji traži sudo — pokreće se RUČNO u
// zasebnom terminalu, usporedo s kampanjom, i spaja se po vremenu:
//
//   sudo powermetrics --samplers gpu_power -i 500 --show-process-gpu \
//     | ts '%Y-%m-%dT%H:%M:%S%z' > gpu.log
//
// Harness namjerno NE zove sudo: mjerni put mora ostati istovjetan pogonskom.
//
// OGRANIČENJE MJERE PROCESORA: `ps` na macOS-u ne daje trenutno opterećenje
// nego opadajući prosjek od pokretanja procesa. Vrijednost je zato pokazatelj
// trenda, ne trenutna vrijednost; memorija (RSS) je točna.
//
// Uporaba:
//   node scripts/sampleResources.js --out=uzorci.csv           (do Ctrl+C)
//   node scripts/sampleResources.js --out=uzorci.csv --seconds=300
//
// Izlaz je CSV s vremenskom oznakom u ISO obliku, pa se spaja s JSONL zapisom
// pokušaja (`timestamp` i `finished_at`) i s vanjskim GPU zapisom.

const fs = require('fs');
const { execFileSync } = require('child_process');

const INTERVAL_MS = 500;

// Skupine procesa. Prva regexp koja se poklopi s punom naredbom odlučuje —
// redoslijed je bitan (llama-server prije općeg ollama uzorka).
const GROUPS = [
  ['model',   /llama-server|ollama[_-]?runner/i],
  ['ollama',  /ollama/i],
  ['baza',    /mysqld/i],
  // nodemon se izuzima — nadzire poslužitelj, nije on.
  ['app',     /^(?!.*nodemon).*node.*src\/index\.js/i],
];

function pageSize() {
  const head = execFileSync('vm_stat', { encoding: 'utf8' }).split('\n')[0];
  const m = /page size of (\d+) bytes/.exec(head);
  return m ? Number(m[1]) : 4096;
}
const PAGE = pageSize();

/** Zauzeće memorije cijelog sustava — aktivno + wired + komprimirano. */
function systemMemoryMb() {
  const out = execFileSync('vm_stat', { encoding: 'utf8' });
  const get = (label) => {
    const m = new RegExp(`${label}:\\s+(\\d+)`).exec(out);
    return m ? Number(m[1]) : 0;
  };
  const active = get('Pages active');
  const wired = get('Pages wired down');
  const compressed = get('Pages occupied by compressor');
  const free = get('Pages free');
  return {
    used: ((active + wired + compressed) * PAGE) / 1048576,
    compressed: (compressed * PAGE) / 1048576,
    free: (free * PAGE) / 1048576,
  };
}

/** Jedan snimak: RSS i %cpu po skupini procesa. */
function sampleProcesses() {
  const out = execFileSync('ps', ['-Ao', 'pid=,rss=,%cpu=,command='], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const acc = Object.fromEntries(GROUPS.map(([name]) => [name, { rssMb: 0, cpu: 0, procs: 0 }]));
  for (const line of out.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/.exec(line);
    if (!m) continue;
    const [, , rssKb, cpu, command] = m;
    // Sam uzorkovač se ne broji u "app".
    if (command.includes('sampleResources.js')) continue;
    const group = GROUPS.find(([, re]) => re.test(command));
    if (!group) continue;
    const g = acc[group[0]];
    g.rssMb += Number(rssKb) / 1024;
    g.cpu += Number(cpu);
    g.procs += 1;
  }
  return acc;
}

function main() {
  const args = process.argv.slice(2);
  const outArg = args.find((a) => a.startsWith('--out='));
  const secArg = args.find((a) => a.startsWith('--seconds='));
  const outPath = outArg ? outArg.slice('--out='.length) : `resources_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
  const seconds = secArg ? Number(secArg.slice('--seconds='.length)) : null;

  const cols = ['ts_iso', 'ts_ms'];
  for (const [name] of GROUPS) cols.push(`${name}_rss_mb`, `${name}_cpu_pct`, `${name}_procs`);
  cols.push('sys_used_mb', 'sys_compressed_mb', 'sys_free_mb');

  const stream = fs.createWriteStream(outPath, { flags: 'w' });
  stream.write(`${cols.join(',')}\n`);
  console.log(`[sampleResources] Uzorkujem svakih ${INTERVAL_MS} ms u ${outPath}`);
  console.log('[sampleResources] GPU NIJE obuhvaćen — vidi zaglavlje skripte (powermetrics, ručno).');
  if (seconds) console.log(`[sampleResources] Trajanje: ${seconds} s`);
  else console.log('[sampleResources] Ctrl+C za kraj.');

  const started = Date.now();
  const tick = () => {
    const now = new Date();
    let procs;
    let mem;
    try {
      procs = sampleProcesses();
      mem = systemMemoryMb();
    } catch (error) {
      console.error('[sampleResources] uzorak preskočen:', error.message);
      return;
    }
    const row = [now.toISOString(), now.getTime()];
    for (const [name] of GROUPS) {
      row.push(procs[name].rssMb.toFixed(1), procs[name].cpu.toFixed(1), procs[name].procs);
    }
    row.push(mem.used.toFixed(1), mem.compressed.toFixed(1), mem.free.toFixed(1));
    stream.write(`${row.join(',')}\n`);
    if (seconds && Date.now() - started >= seconds * 1000) stop();
  };

  const timer = setInterval(tick, INTERVAL_MS);
  tick();

  function stop() {
    clearInterval(timer);
    stream.end(() => {
      const lines = fs.readFileSync(outPath, 'utf8').trim().split('\n').length - 1;
      console.log(`\n[sampleResources] Gotovo: ${lines} uzoraka u ${outPath}`);
      process.exit(0);
    });
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

if (require.main === module) main();

module.exports = { sampleProcesses, systemMemoryMb, INTERVAL_MS };
