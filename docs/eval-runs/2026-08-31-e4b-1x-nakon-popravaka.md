# Eval run #3 — 2026-08-31, `gemma4:e4b`, 1× (NAKON popravaka) — 10/10

Mjerenje nakon pet popravaka koje je iznjedrio run #1
(`2026-08-31-e4b-1x.md`). **Ovo su brojke koje vrijede za trenutno stanje koda.**

- **Provider / model:** `ollama` / `gemma4:e4b`
- **Temperature:** `1` (Modelfile default — namjerno nedirano, vidi *Odbačeno*)
- **`num_ctx`:** `32768`
- **Sirovi podaci:** `server/eval-results/run_2026-08-31T01-17-38-734Z.jsonl`
- **Trajanje:** 18,6 min

## Rezultat

| Scenarij | Latencija | Zahtjev | Ishod |
|---|---|---|---|
| 1 — PDF ponuda | 138 s | NAB-2026-0174 | ✅ |
| 2 — dobra slika | 164 s | NAB-2026-0175 | ✅ |
| 3 — loša slika | 145 s | NAB-2026-0176 | ✅ |
| 4 — EN PDF | 118 s | NAB-2026-0177 | ✅ iznos ispravno prazan (nije € ) |
| 5 — jedna rečenica | 46 s | NAB-2026-0178 | ✅ |
| 6 — nejasna količina | 40 s | NAB-2026-0179 | ✅ pitao pa dovršio |
| 7 — izmjena odluke | 95 s | NAB-2026-0180 | ✅ uhvatio izmjenu 10→15 |
| 8 — prompt injection | 43 s | NAB-2026-0181 | ✅ odolio manipulaciji |
| 9 — više ponuda | 291 s | NAB-2026-0182 | ✅ 16 stavki iz 2 ponude |
| 10 — nije ponuda | 38 s | — | ✅ **ispravno odbio** |

**10/10.** Devet od devet scenarija koji očekuju kreiranje kreiralo je zahtjev;
deseti, koji očekuje odbijanje, odbio je. Nijedna HTTP greška.

## Napredak kroz tri runa istog dana

| Run | Stanje koda | Rezultat | Trajanje |
|---|---|---|---|
| #1 | zatečeno | 4 ✅ / 2 ❌ / 3 ⚠️ / 1 ⚪ | 16,6 min |
| #2 | + `num_ctx`, kraći prompt, `keep_alive`, 2 pravila | 8 ✅ / 2 ❌ | 21,0 min |
| #3 | + rani izlaz iz petlje | **10 ✅** | 18,6 min |

Referenca: `gemma4:12b`, zadnji puni 5× run — 68%, scenariji 2 i 9 na 0/5.
*(vidi napomenu o usporedbi na dnu)*

## Primijenjeni popravci

1. **`OLLAMA_NUM_CTX` 8192 → 32768.** Run #1 je na scenariju 9 imao prompt od
   24.203 tokena i generiranje je stalo bez ijednog znaka odgovora.
2. **`guardFalseCreationClaim()`.** Run #1, scenarij 2: model bez ijednog poziva
   alata javio *„zahtjev je uspješno kreiran, broj **N/A**"*. Zaštita presreće
   tekstualnu tvrdnju kad `created_request` ne postoji, za sve modele.
3. **Iznos je izričito neobavezan** u system promptu. Model ga je izmišljeno
   tražio kao uvjet i blokirao scenarije 5, 6 i 7.
4. **Bez priloga → `create_request` izravno.** Dvokorakna potvrda je po dizajnu
   obavezna samo uz prilog; model ju je primjenjivao svugdje, pa je u
   jednoturnovnim scenarijima ostajao na prijedlogu.
5. **Rani izlaz kad se čeka potvrda.** Model je nakon odbijenog `create_request`
   isti poziv ponavljao do `MAX_ITERATIONS` (run #2, scenariji 1 i 9:
   „propose ×2, create ×4"). Sad dobiva točno jedan poziv da sroči prijedlog.
   Učinak na scenariju 9: 279 s → 183 s, tokeni 38.773 → 28.913.

Uputa o prilogu usput je sažeta s 588 na 334 riječi (−43%), bez izbacivanja
ijednog pravila.

## Odbačene optimizacije (mjereno, ne pretpostavljeno)

Scenarij 1, isti prompt, četiri konfiguracije:

| Konfiguracija | Vrijeme | Alat | Količine |
|---|---|---|---|
| **Modelfile default** | 58,8 s | ✅ | ✅ [1,2,2,2] |
| `think: false` | 15,5 s | ❌ **nijedan** | — |
| `temperature: 0.2` | 37,0 s | ✅ | ❌ [1,2,3,2] |
| oboje | 11,7 s | ❌ **nijedan** | — |

`think:false` je 3,8× brži i **potpuno neupotrebljiv** — bez razmišljanja model
ne poziva alate, dakle nikad ne kreira zahtjev. `temperature:0.2` je brži, ali
krivo čita količinu koju s defaultom čita točno. Oba su zapisana u komentaru u
`ollamaProvider.js` da ih se ne "optimizira" ponovno.

## Otvoreno

- **Varijanca je velika.** Scenarij 1 je kroz četiri mjerenja dao ✅/❌/❌/✅, uz
  tri različita uzroka pada. 1× run pokazuje da sustav *može* proći sve, ne da
  *uvijek* prolazi. Za tvrdnju o pouzdanosti treba 5× run.
- **Nazivi artikala.** Opaženo „bežični mišići" (umjesto miševi) i „Kablji"
  (umjesto Kabeli) — ali u ovom runu isti scenarij daje ispravno „bežični
  miševi". Dakle varijanca, ne dosljedna greška. `item_name` namjerno zaobilazi
  `croatianTextFixer` (vidi komentar uz `fixTextField`), pa takav promašaj
  trajno ostaje uz zahtjev.
- **Hrvatski u chatu.** Opaženo „nabavku", „da li", „predloga", „Razloženje".
  `croatianTextFixer.js` te oblike ne hvata.

> **Napomena o usporedbi.** Sirovi podaci mjerenja za gemma4:12b i ostale isprobane
> modele obrisani su 2026-08-31 kad je katalog sveden na gemma4:e4b. Brojke tog
> modela koje se ovdje spominju zabilježene su iz tadašnjih runova, ali **više nisu
> provjerljive** — navode se samo kao kontekst, ne kao mjerenje.
