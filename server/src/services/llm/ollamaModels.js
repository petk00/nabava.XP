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
//   - qwen3.5:9b  — alate ima, ali NEDOSLJEDNO preskače propose_request
//     (1 od 2 mjerena pokušaja), čime je razgovor znao zapeti.
//   - gemma4:12b  — pouzdan, ali ~3× sporiji od e4b uz isti ishod na eval
//     scenarijima. Sirovi podaci njegovih runova obrisani su 2026-08-31.
const OLLAMA_MODELS = [
  {
    value: 'gemma4:e4b',
    label: 'gemma4:e4b',
    // Ollama za njega prijavljuje completion,tools,thinking — BEZ vision —
    // ali probni poziv sa slikom (2026-08-31) uredno ju je opisao, a i eval
    // scenariji sa slikovnim ponudama (3) su prošli, pa je deklaracija
    // nepotpuna, a ne model.
    supportsTools: true,
  },
];

// Fallback kad je u AppSetting zapisan model kojeg nema u katalogu (npr.
// ručno diran red u bazi ili uklonjen model) — bolje raditi s poznatim
// modelom nego pucati na svakom pozivu.
const DEFAULT_OLLAMA_MODEL = 'gemma4:e4b';

module.exports = { OLLAMA_MODELS, DEFAULT_OLLAMA_MODEL };
