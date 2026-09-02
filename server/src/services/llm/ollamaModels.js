// Katalog lokalnih Ollama modela koje administrator smije odabrati
// (AppSetting.ollama_model — runtime, bez restarta servera, kao i sam
// provider toggle). Vidi docs/AI.md.
//
// Namjerno je ZASEBAN modul, a ne dio ollamaProvider.js: katalog je čisti
// podatak koji treba i HTTP sloju (validacija PUT /api/assistant/settings,
// popis za UI) i orchestratoru, dok je ollamaProvider mrežni sloj kojeg
// testovi rutinski mockaju u cijelosti — da katalog živi ondje, mock bi ga
// odnio sa sobom.
//
// supportsTools NIJE kozmetika: Ollama na /api/chat vraća tvrdu grešku
// ("<model> does not support tools", HTTP 400) ako se `tools` pošalje modelu
// bez te sposobnosti. Zato takvom modelu `tools` ne bi bili poslani, a
// assistantOrchestrator (preko provider getCapabilities()) preskočio bi
// tool-calling petlju i u system promptu modelu rekao da zahtjev ne može
// kreirati. Trenutno je u katalogu samo model koji alate podržava, ali
// mehanizam ostaje jer je jedina brana protiv tog HTTP 400.
//
// POVIJEST IZBORA (docs/eval-runs/): u katalogu su privremeno bili i
// gemma4:12b, qwen3.5:9b i qwen2.5vl:7b. Uklonjeni 2026-08-31:
//   - qwen2.5vl:7b — nema `tools`, zahtjev uopće ne može kreirati, a i
//     količine s ponude čitao je krivo ("126,40" kao "12 × 6,40").
//   - qwen3.5:9b  — alate ima, ali preskače propose_request i zove
//     create_request izravno. Vraćen u katalog 2026-09-01 jer bi pretvorba
//     create_request -> prijedlog taj kvar trebala pokriti; uklonjen nakon 2
//     scenarija jer NE POMAŽE: pretvorba mu vrati prijedlog, a model tad kaže
//     "Pozivam taj alat" i prijedlog samo ISPIŠE U PROZI umjesto da ga pozove,
//     pa razgovor opet nigdje ne stigne. Uz to je najsporiji izmjereni (351 s
//     i 319 s po scenariju, naspram 138-185 s kod e4b), a `vision` koji Ollama
//     za njega deklarira ne radi — sam je odgovorio "nemam mogućnost čitanja
//     slike".
//   - gemma4:12b  — pouzdan, ali osjetno sporiji uz isti ishod na eval
//     scenarijima. Sirovi podaci njegovih runova obrisani su 2026-08-31.
//   - gemma4:e4b  — uklonjen 2026-09-01 zajedno sa svim svojim mjerenjima,
//     odlukom autora rada. Bio je zadani model; zamijenio ga je manji e2b iz
//     iste obitelji.
const OLLAMA_MODELS = [
  {
    value: 'gemma4:e2b',
    label: 'gemma4:e2b (najmanji)',
    // Razmišljanje ostaje uključeno, kao i kod e4b — ali iz DRUGOG razloga,
    // pa je vrijedno zapisati oba načina kvara.
    //
    // Pojedinačna proba na scenariju 1 (2026-09-01) izgledala je uvjerljivo za
    // think:false — 8,5 s i 4,6 s naspram 32,8 s, uz ISPRAVAN poziv
    // propose_request i točne količine. Puni run je tu preporuku oborio:
    //   scenarij 1 (4 stavke)   -> ✅ 45 s naspram 146 s
    //   scenarij 2 (23 stavke)  -> ❌ napravi prijedlog pa tvrdi da "nedostaje
    //                              aktivna poslovna godina", koja mu je u
    //                              system promptu (fk_fiscal_year=1)
    //   scenarij 3 (8 stavki)   -> ❌ isti kvar
    //   scenarij 4 (dvije ponude) -> ⚠️ kreira, ali IZGUBI iznos koji s
    //                              razmišljanjem pogađa
    // Dakle bez razmišljanja model odradi PRVI korak pa izgubi nit — ne
    // poveže podatak iz konteksta s pozivom alata u sljedećem koraku.
    // Pouka o metodi: proba na najjednostavnijem scenariju pokazala je
    // suprotno od punog seta.
    think: true,
    // Manja inačica iste obitelji: 5.1B naspram 8.0B kod e4b. Ollama i za
    // njega prijavljuje samo completion,tools,thinking — bez vision — ali
    // probni poziv (2026-09-01) pokazao je da i alate zove ispravno i sliku
    // uredno opisuje, jednako kao kod e4b. Deklaracija je dakle nepotpuna za
    // cijelu gemma4 obitelj, ne samo za jedan model.
    supportsTools: true,
  },
];

// Fallback kad je u AppSetting zapisan model kojeg nema u katalogu (npr.
// ručno diran red u bazi ili uklonjen model) — bolje raditi s poznatim
// modelom nego pucati na svakom pozivu.
const DEFAULT_OLLAMA_MODEL = 'gemma4:e2b';

module.exports = { OLLAMA_MODELS, DEFAULT_OLLAMA_MODEL };
