// Eksperimentalni uvjet sastavljanja sustavnog prompta.
//
// Tablica ItemCategory ima SAMO stupac `name` — nigdje u aplikaciji, bazi ni
// dokumentaciji ne postoji opis kategorije. Model u zatečenom stanju dobiva
// goli popis od šest naziva i mora sam pogoditi što svaki obuhvaća. Dio krivih
// dodjela zato nije slabost modela nego propust sustava.
//
// Uvjet `with_definitions` umeće definicije doslovno iz zamrznutog codebooka
// (eval/category-codebook.md), koji je ujedno i pravilo po kojem je određen
// ground truth. Zato se uz prompt zapisuje i hash te datoteke: mora se vidjeti
// da je prompt sastavljen od ISTE inačice priručnika koja je i mjerilo.
//
// Mehanizam intervencije nije da model postane sposobniji, nego da mu se
// priopći konvencija ustanove koju iz samog naziva kategorije nije mogao
// izvesti (docs/mjerni-plan.md, §3).
//
// Uvjet se bira varijablom okoline PROMPT_VARIANT. Čita se pri svakom
// sastavljanju prompta, ne jednom pri pokretanju, da se između uvjeta ne mora
// ponovno pokretati poslužitelj. Efektivna vrijednost vraća se klijentu uz
// odgovor, jer harness je zaseban proces i ne može znati okolinu poslužitelja.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VARIANTS = ['names_only', 'with_definitions'];
const DEFAULT_VARIANT = 'names_only';

const CODEBOOK_PATH = path.join(__dirname, '..', '..', 'eval', 'category-codebook.md');

/** Efektivni uvjet; nepoznata vrijednost pada na zatečeno stanje. */
function getPromptVariant() {
  const raw = (process.env.PROMPT_VARIANT || '').trim();
  return VARIANTS.includes(raw) ? raw : DEFAULT_VARIANT;
}

let cachedCodebook = null;

/**
 * Definicije kategorija iz codebooka, spremne za umetanje u prompt.
 *
 * Iz dokumenta se uzimaju SAMO definicije i pravila razgraničenja — ne i
 * odjeljci o postupku (zapis o postanku, druga procjena), koji su metodologija
 * rada i modelu ne znače ništa. Rez je na naslovu "## Zapis o postanku".
 */
function loadCodebookDefinitions() {
  if (cachedCodebook) return cachedCodebook;
  try {
    const raw = fs.readFileSync(CODEBOOK_PATH, 'utf8');
    const cut = raw.indexOf('## Zapis o postanku');
    const body = cut === -1 ? raw : raw.slice(0, cut);
    const text = body.trim();
    cachedCodebook = {
      text,
      // Hash CIJELE datoteke — veže prompt uz onu inačicu priručnika koja je i
      // ground truth.
      sha256: crypto.createHash('sha256').update(raw, 'utf8').digest('hex').slice(0, 16),
      // Hash ONOGA ŠTO JE STVARNO UMETNUTO. U prompt idu samo definicije i
      // pravila, a odjeljci o postupku su odrezani — bez zasebnog hasha bi
      // manifest tvrdio da je model vidio više nego što jest.
      excerptSha256: crypto.createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16),
    };
  } catch (error) {
    // Nedostupan codebook NE smije tiho pretvoriti uvjet u names_only —
    // mjerenje bi tvrdilo da je intervencija primijenjena, a ne bi bila.
    throw new Error(`PROMPT_VARIANT=with_definitions, a codebook nije čitljiv (${CODEBOOK_PATH}): ${error.message}`);
  }
  return cachedCodebook;
}

/** Blok koji se umeće u sustavni prompt; prazan string za zatečeno stanje. */
function categoryDefinitionsBlock(variant) {
  if (variant !== 'with_definitions') {
    return { text: '', codebookSha256: null, codebookExcerptSha256: null };
  }
  const cb = loadCodebookDefinitions();
  return {
    text: `\n\nDEFINICIJE KATEGORIJA — pravila ustanove, primijeni ih pri odabiru kategorije:\n\n${cb.text}`,
    codebookSha256: cb.sha256,
    codebookExcerptSha256: cb.excerptSha256,
  };
}

module.exports = {
  VARIANTS, DEFAULT_VARIANT, getPromptVariant, categoryDefinitionsBlock, CODEBOOK_PATH,
};
