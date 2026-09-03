// Verzija koda koji POSLUŽITELJ STVARNO VRTI, ne one u radnom stablu.
//
// Zašto postoji: eval harness komunicira s aplikacijom preko HTTP-a, pa mjeri
// ono što proces posluje — a taj proces zna biti stariji od datoteka na disku.
// Stvarno opaženo dvaput 2026-09-02: osirotjeli `node src/index.js` držao je
// port 3000 dok je nodemon ostao bez djeteta, pa su mjerenja išla protiv koda
// zamrznutog sat i pol ranije. Metapodaci runa tvrdili su jedno, mjerilo se
// drugo, i to se iz samog zapisa nije vidjelo.
//
// Vrijednost se čita JEDNOM pri pokretanju i keširа: git stanje u trenutku
// pokretanja je ono što proces nosi u memoriji; kasnije izmjene radnog stabla
// ne mijenjaju učitani kod, pa bi ih prijaviti bilo netočno.

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');

function git(args) {
  try {
    return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return null;
  }
}

function readBuildInfo() {
  const commit = git(['rev-parse', 'HEAD']);
  const status = git(['status', '--porcelain']);
  return {
    commit,
    // dirty === null znači da git nije bio dostupan — NIJE isto što i "čisto".
    // Protokol završnog mjerenja traži dirty === false, pa nepoznato stanje
    // mora pasti na provjeri umjesto da prođe kao uredno.
    dirty: status === null ? null : status.length > 0,
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    started_at: new Date().toISOString(),
    node_version: process.version,
  };
}

const BUILD_INFO = readBuildInfo();

module.exports = { BUILD_INFO };
