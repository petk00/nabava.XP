# Upute za rad na diplomskom radu

Ovaj repo sadrži aplikaciju nabava.XP i mjerni aparat za diplomski rad.
Folder `rad/` sadrži pomoćne datoteke rada — **ne i sam tekst rada**.

## Prije bilo kakvog rada na radu

Pročitaj `rad/KONTEKST.md` — okvir rada: predmet, hipoteza, granice poglavlja,
pojmovnik i pravila rada.

Izvori istine se ne preklapaju:

| Dokument | Nadređen za |
|---|---|
| `rad/KONTEKST.md` | okvir rada |
| `docs/mjerni-plan.md` | **mjerenje** — definicije mjera, klase grešaka, ground truth, protokol runova |
| `docs/AI.md` | **sustav** — kako radi danas |
| `docs/EVAL_SCENARIOS.md` | **testni skup** |

Kad se KONTEKST i mjerni plan razilaze, vrijedi mjerni plan, a KONTEKST se ispravi —
nikad obrnuto.

## Podjela uloga

| Što | Tko piše |
|-----|----------|
| Tekst poglavlja rada | **korisnik**, sam |
| Dorada, provjera, proširenje njegovog nacrta | Claude |
| Kod: eval harness, scenariji, skoring, TCO, grafovi | Claude, punom parom |
| Prikupljanje i provjera literature | Claude |
| Popunjavanje `BROJEVI.md` | skripta iz JSONL-a, nikad ručno |

**Ne piši poglavlja umjesto korisnika.** Kad zatraži pomoć s tekstom, on daje
sirovi nacrt, a ti vraćaš dorađenu verziju istog sadržaja — ne novi tekst.

## Tekst rada živi u Wordu

Rad se piše u fakultetskom .docx predlošku i to je jedini original.
Ne generiraj .docx poglavlja, ne drži paralelnu kopiju teksta u repou,
ne predlaži prelazak na Markdown.

Kad vraćaš dorađen tekst: čisti tekst bez Markdown formatiranja
(bez `##`, bez `**`), jer se lijepi izravno u Word stilove.

## Granice poglavlja

Vidi tablicu u `KONTEKST.md`, § 11. Ukratko:

- **Uvod** — namjera i najava, buduće vrijeme, nijedan broj
- **Prethodna istraživanja** — samo tuđi nalazi, svaki s citatom
- **Metodologija** — kako se mjeri, bez rezultata i interpretacije
- **Diskusija** — brojevi, interpretacija, sinteza
- **Zaključak** — odgovor na hipotezu, bez novih brojeva

Ako te se traži nešto što prelazi granicu poglavlja — reci to, ne napiši.

## Brojevi

Svaki broj koji ide u tekst mora postojati u `rad/BROJEVI.md`.
Ako ga ondje nema — nemoj ga navesti, nego reci da nedostaje.
Nikad ne procjenjuj, ne zaokružuj i ne prisjećaj se vrijednosti iz ranijih razgovora.

Pilot-mjerenja ne ulaze u rad. Samo finalna mjerna kampanja.

## Citati

Svaki izvor mora biti u `rad/LITERATURA.md`, s punim bibliografskim podacima
i oznakom da je provjeren. Ne izmišljaj reference, ne rekonstruiraj ih po sjećanju,
ne navodi „općenito se smatra" bez izvora. IEEE numerički stil.

## Pojmovi

Koristi fiksne nazive iz `KONTEKST.md`, § 10. Bez sinonima.

## Na kraju svakog poglavlja

Sažmi donesene odluke u ~10 redaka i dopiši ih u `KONTEKST.md`, § 14.
Sljedeći razgovor nasljeđuje odluke, ne cijeli tekst.

## Mjerni aparat

Mjeri se ruta `POST /api/requests/:id/ai-items`.

| Putanja | Što je |
|---|---|
| `server/scripts/evalHarness.js` | runner — prikuplja sirove podatke; nazive stavki ne boduje |
| `server/scripts/evalScenarios.js` | scenariji — izvodi se svih **7** (1–7), svi imaju prilog |
| `server/scripts/scoreEvalResults.js` | bodovanje točnosti — putanja provjerena 5. 9. 2026. |
| `server/scripts/analyze.js` | analiza runova — **ne postoji, treba je napisati** (mjerni plan § 9, faza H) |
| `server/scripts/aggregateEvalResults.js` | agregacija kroz runove (brzina, tokeni, pouzdanost) |
| `server/scripts/groundTruth.js` | jedan čitač ground trutha za sve skripte |
| `server/eval/ground-truth/<scenario_id>.json` | ground truth s provenanceom |
| `server/eval/category-codebook.md` | pravilnik za dodjelu — **zastario:** šest kategorija, a baza ih ima 33 (O1) |
| `server/eval/category-secondrater.csv` | uzorak za drugu procjenu (22 stavke) — **zastario s O1** |
| `server/eval-scenarios/fixtures/` | prilozi — 8 datoteka, **sve PDF**; slikovnih više nema |
| `server/eval-results/` | JSONL po pokušaju (generirano, nije u gitu) |
| `docs/eval-runs/scoring-worksheet.md` | izlaz bodovanja |
| `server/eval/cost-assumptions.json` | pretpostavke troška — **još ne postoji** |

Sustav koji se mjeri:

| Putanja | Što je |
|---|---|
| `server/src/services/itemExtractionService.js` | `buildSystemPrompt`, alat `set_items` |
| `server/src/services/quoteExtractionService.js` | ekstrakcija teksta iz PDF-a |
| `server/src/services/llm/providerSelector.js` | obje izvedbe iza istog sučelja |
| `server/src/services/llm/samplingConfig.js` | parametri uzorkovanja |
| `server/src/services/promptVariant.js` | uvjet prompta (nije u `llm/`) |

Svaki run nosi `run_kind` u `run_manifest.json`. Zadana vrijednost je `smoke`;
run koji ulazi u rad mora biti izričito označen `final`. Runovi različite vrste
se ne spajaju u istu tablicu.

## Poštenje rezultata

Ako mjerenje ispadne nepovoljno za lokalnu izvedbu, to se navodi kakvo jest,
uz objašnjenje uzroka. Ne traži formulacije koje ublažavaju nalaz.
Hipoteza smije biti potvrđena djelomično.
