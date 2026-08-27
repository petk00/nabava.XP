// Deterministički "safety net" protiv ekavica/srbizam proklizivanja u AI
// odgovorima (docs/AI.md) — sam prompt (BASE_SYSTEM_PROMPT, assistantOrchestrator.js)
// eksplicitno instruira model na ijekavicu, ali stvarnim testiranjem potvrđeno
// da manji lokalni model (gemma4:12b) tu uputu ne poštuje 100% pouzdano (zna
// proklizniti čak i unutar iste rečenice). Ovo NIJE zamjena za prompt uputu
// (koja i dalje smanjuje UČESTALOST), nego dodatni determinstički prolaz koji
// GARANTIRANO ispravi poznate riječi prije nego korisnik vidi odgovor.
//
// Namjerno pokriva samo riječi za koje postoji potvrđen/vjerojatan rizik u
// ovoj domeni (nabava/administracija), ne cijeli hrvatsko-srpski rječnik —
// proširiti listu po potrebi kad se uoči nova riječ.

/** Vraća zamjenu s ISTOM početnom velikom/malom slovu kao match. */
function matchCase(replacement, original) {
  if (original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

// Prava jat-refleks varijanta iste riječi (ekavica osnova -> ijekavica osnova),
// primjenjuje se preko osnova + zatvoren skup hrvatskih nastavaka (\b na kraju
// sprječava lažne pogotke unutar duljih, nepovezanih riječi, npr. "cenzura").
const STEM_RULES = [
  { ekavica: 'zahtev', ijekavica: 'zahtjev', suffixes: ['', 'a', 'u', 'om', 'i', 'ima', 'e'] },
  { ekavica: 'mest', ijekavica: 'mjest', suffixes: ['o', 'a', 'u', 'om', 'ima'] },
  { ekavica: 'cen', ijekavica: 'cijen', suffixes: ['a', 'e', 'u', 'om', 'i', 'ama'] },
];

// Potpuno druga riječ (ne jat-varijanta), pa se navode gotovi parovi oblika.
const WORD_PAIRS = [
  ['vreme', 'vrijeme'],
  ['pre', 'prije'],
  ['uslov', 'uvjet'],
  ['uslova', 'uvjeta'],
  ['uslovu', 'uvjetu'],
  ['uslovom', 'uvjetom'],
  ['uslovi', 'uvjeti'],
  ['uslovima', 'uvjetima'],
];

const RULES = [
  ...STEM_RULES.flatMap(({ ekavica, ijekavica, suffixes }) =>
    suffixes.map((suffix) => ({
      pattern: new RegExp(`\\b${ekavica}${suffix}\\b`, 'gi'),
      replacement: `${ijekavica}${suffix}`,
    }))
  ),
  ...WORD_PAIRS.map(([ekavica, ijekavica]) => ({
    pattern: new RegExp(`\\b${ekavica}\\b`, 'gi'),
    replacement: ijekavica,
  })),
];

/**
 * Zamjenjuje poznate ekavica/srbizam riječi ijekavicom, čuvajući veliko/malo
 * početno slovo. Ne dira null/undefined (vraća ih nepromijenjene).
 */
function fixEkavica(text) {
  if (!text) return text;
  let result = text;
  for (const { pattern, replacement } of RULES) {
    result = result.replace(pattern, (match) => matchCase(replacement, match));
  }
  return result;
}

module.exports = { fixEkavica };
