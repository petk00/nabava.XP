// Jedan izvor istine za parametre uzorkovanja, zajednički za SVE pružatelje.
//
// Zašto postoji: bez izjednačenih parametara mjerenje ne uspoređuje modele nego
// postavke dekodiranja. Ollama je do sad vrtjela na Modelfile defaultu
// (temperature 1, top_k 64, top_p 0.95), a Gemini uopće nije slao
// generationConfig — dakle dvije različite, nigdje zapisane konfiguracije.
//
// Zašto je ovdje, a ne u eval/: providerima ovo treba U POGONU, a produkcijski
// kod ne smije ovisiti o datotekama mjernog okvira. Harness require-a ovaj isti
// modul i u metapodatke runa upisuje STVARNO primijenjene vrijednosti, pa je
// `sampling_equalized` provjerena činjenica, ne tvrdnja.
//
// Vrijednosti se mogu pregaziti okolinom (LLM_TEMPERATURE, LLM_TOP_P,
// LLM_MAX_OUTPUT_TOKENS, LLM_SEED) — za kontrolne prolaze poput mjerenja
// osjetljivosti na temperaturu, bez diranja koda.

/**
 * temperature 0 / top_p 1: sustav ovog tipa nitko ne bi pustio u pogon na
 * temperaturi 1, a na nuli preostala varijanca dolazi od nedeterminizma
 * izvedbe (hardver lokalno, endpoint u oblaku) umjesto od namjernog
 * uzorkovanja — a to je varijanca koja se mjeri.
 *
 * VAŽNO: temperature 0 NIJE potpuni determinizam ni na jednoj strani.
 * Lokalno na to utječu redoslijed zbrajanja u pomičnom zarezu na GPU-u i
 * veličina batcha; u oblaku nema seeda ni jamstva da je iza endpointa ista
 * verzija modela između poziva. Vidi docs/mjerni-plan.md.
 *
 * max_output_tokens: 4096 je namjerno velikodušno. Izmjereno na pilot
 * runovima, najduži pojedinačni odgovor gemma4:e2b bio je ~1140 tokena, pa
 * granica ne reže sadržaj — postoji da odbjegli odgovor ne troši budžet i
 * vrijeme, ne da ograničava model.
 */
const DEFAULTS = {
  temperature: 0,
  top_p: 1,
  max_output_tokens: 4096,
  seed: 42,
};

function readNumber(envName, fallback) {
  const raw = process.env[envName];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Efektivna konfiguracija uzorkovanja (defaulti + eventualni env override). */
function getSamplingConfig() {
  return {
    temperature: readNumber('LLM_TEMPERATURE', DEFAULTS.temperature),
    top_p: readNumber('LLM_TOP_P', DEFAULTS.top_p),
    max_output_tokens: readNumber('LLM_MAX_OUTPUT_TOKENS', DEFAULTS.max_output_tokens),
    seed: readNumber('LLM_SEED', DEFAULTS.seed),
  };
}

/**
 * Koje od parametara pojedini pružatelj STVARNO podržava. Gemini API nema
 * seed, pa ga se ne smije prijaviti kao primijenjen — inače bi metapodaci
 * tvrdili determinizam kojeg nema.
 */
const PROVIDER_SUPPORT = {
  ollama: { temperature: true, top_p: true, max_output_tokens: true, seed: true },
  gemini: { temperature: true, top_p: true, max_output_tokens: true, seed: false },
};

/** Parametri koje oba pružatelja podržavaju — osnova za `sampling_equalized`. */
function equalizedKeys() {
  return Object.keys(PROVIDER_SUPPORT.ollama)
    .filter((k) => PROVIDER_SUPPORT.ollama[k] && PROVIDER_SUPPORT.gemini[k]);
}

/**
 * Parametri koje NAMJERNO ne izjednačavamo, ali ih moramo zapisati.
 *
 * top_k: Ollama ga nosi iz Modelfilea (gemma4:e2b: 64), Gemini ima vlastiti
 * nedokumentirani default i ne primamo ga natrag u odgovoru. Na temperature 0
 * dekodiranje je pohlepno — bira se najvjerojatniji token — pa top_k nema
 * učinka na ishod. Zato nije u sampling_equalized_keys: izjednačiti ga ne bismo
 * mogli pošteno (ne znamo Geminijevu vrijednost), a tvrditi da je izjednačen
 * bilo bi netočno. Zapisuje se kao zatečeno stanje, ne kao primijenjena postavka.
 */
const UNEQUALIZED_NOTE = {
  top_k: {
    equalized: false,
    ollama: 'iz Modelfilea, čita se iz /api/show',
    gemini: 'nepoznat default, API ga ne vraća',
    why_ignored: 'temperature 0 -> pohlepno dekodiranje, top_k bez učinka na ishod',
  },
};

module.exports = {
  getSamplingConfig, PROVIDER_SUPPORT, equalizedKeys, DEFAULTS, UNEQUALIZED_NOTE,
};
