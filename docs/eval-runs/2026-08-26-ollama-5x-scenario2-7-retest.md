# Eval retest — 2026-08-26, Ollama, scenariji 2 i 7 (5× svaki)

Ciljani re-run nakon dva popravka primijenjena na temelju nalaza iz punog
5× runa (`2026-08-26-ollama-5x.md`):

1. **Cross-turn kočnica protiv dvostrukog `create_request`** (assistantOrchestrator.js,
   `findEarlierSuccessfulCreate`) — ako je zahtjev već kreiran u ranijem
   potezu iste konverzacije, novi `create_request` se odbija umjesto da
   tiho napravi duplikat; agent dobiva jasnu poruku s brojem zahtjeva i
   uputom (pričekati da administrator vrati zahtjev na dopunu, ili
   kontaktirati administratora).
2. **Jedan retry na network-level grešku** (ollamaProvider.js) — Ollamini
   vlastiti logovi (`~/.ollama/logs/server-3.log`) pokazali su da scheduler
   zna usred rada reloadati model pod memorijskim pritiskom (potvrđen
   restart s `-c 8192` → `4096` točno u vremenu pada scenarija 2), što
   prekida zahtjev u tijeku. Vision (slika) zahtjevi disproporcionalno
   pogođeni jer mmproj enkoder dodatno optereti već tijesnu memoriju.
   Retry nakon 3s pauze pokriva ovaj slučaj bez maskiranja stvarnih HTTP
   grešaka ili vlastitog 10-min timeouta.

Prije re-runa obrisana 3 duplicirana retka nastala u originalnom runu
(NAB-2026-0074, 0076, 0078 — drugi, nenamjerni `create_request` iz istog
razgovora).

- **Provider:** `ollama`, model `gemma4:12b`, temperature `1` (isto kao ranije)
- **Sirovi podaci:** `server/eval-results/run_2026-08-26T18-54-13-376Z.jsonl` + `.meta.json`

## Rezultati

| Scenarij | Prije popravka | Poslije popravka | Medijan latencije |
|---|---|---|---|
| 2 — dobra slika | 2/5 (40%) | **5/5 (100%)** | 358s |
| 7 — multi-turn izmjena | 4/5* (od čega 3 s duplikatom) | 4/5 (0 duplikata) | 281s |

\* U originalnom runu 4/5 "uspjeh" je uključivao 3 skrivena duplikata u bazi — stvaran broj ispravnih rezultata bio je niži.

## Provjera cross-turn kočnice (item 1)

Provjereno na DVIJE razine — sirovi podaci HARNESSA i STVARNO stanje baze:

- Svih 5 scenario7 pokušaja: **0 duplikata** (potvrđeno upitom nad `PurchaseRequest`
  za vrijeme runa — 4 nova retka za 5 pokušaja, ni jedan dupliciran).
- U 3 od 5 pokušaja model JEST pokušao pozvati `create_request` po drugi put
  (nakon "promijenite količinu..." poruke) — ali je server ODBIO poziv i
  agent je korisniku ispravno objasnio situaciju, npr.:
  > "Nažalost, ne mogu izmijeniti već prošli zahtjev. Zahtjev pod brojem
  > NAB-2026-0090 je već kreiran i ne može se mijenjati putem razgovora.
  > Promjena će biti moguća tek kada administrator ili odobravatelj vrati
  > vaš zahtjev na dopunu... Ako je izmjena hitna, preporučujem da
  > kontaktirate administratora."
- 1 pokušaj (attempt 3) model je umjesto ponovnog `create_request`-a pozvao
  `propose_request` (ažurirani prijedlog) i čekao potvrdu — scenarij je
  skriptiran na 2 turna bez trećeg "potvrđujem" turna, pa razgovor
  jednostavno završava bez kreiranja. Legitimna varijanca (temperature 1),
  ne bug.

## Provjera retry mehanizma (item 2)

Scenarij 2: **5/5 uspješno**, nasuprot 2/5 u originalnom runu — retry je
u potpunosti riješio problem ovaj put. Scenarij 7 i dalje ima 1/5 mrežni
pad ("fetch failed" na attempt 5, nakon što je turn 1 već uspješno kreirao
zahtjev) — retry smanjuje, ali ne garantira 100% uspjeh (ako i drugi
pokušaj padne u isti reload prozor). Prihvatljivo, u skladu s očekivanjem
iz istrage (infrastrukturno ograničenje, ne rješivo do kraja bez dodatnih
resursa/hardvera).

## Status formalnog 5× skupa

Zajedno s originalnih 8 scenarija (1, 3, 4, 5, 6, 8, 9, 10) iz
`2026-08-26-ollama-5x.md`, koji ostaju važeći, ovaj retest zaokružuje
formalni 5× Ollama skup podataka za svih 10 scenarija.
