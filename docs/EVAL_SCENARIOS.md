# Testni skup za mjerenje čitanja ponude

Zadnja provjera: **5. 9. 2026.** — usklađeno s kodom (`server/scripts/evalScenarios.js`),
prilozima na disku i ground truthom.

Mjeri se ruta `POST /api/requests/:id/ai-items` (`docs/AI.md`): model pročita ponudu
priloženu uz postojeći zahtjev i njome zamijeni stavke i ukupan iznos. Nema razgovora,
pa scenarij nije niz poruka nego **jedan zahtjev s jednom ili dvije priložene ponude**.

## Što se stvarno izvodi — sedam scenarija

Svi imaju prilog. Nijedan nije tekstualni, jer ruta polazi od priložene datoteke.

| ID | Prilog | Što se ispituje | Stavki u ground truthu | Iznos | N |
|---|---|---|---|---|---|
| `scenario1_standardna` | `scenario1_standardna.pdf` | jednostranična ponuda, osnovno čitanje | 4 | 57,10 € | 5 |
| `scenario2_visestranicna` | `scenario2_visestranicna.pdf` | dvije stranice, 23 stavke — zadržava li model stavke s druge stranice | 23 | 50.677,88 € | 5 |
| `scenario3_rabat_pdv` | `scenario3_rabat_pdv.pdf` | osnovica, rabat, PDV, za uplatu — bira li model pravi iznos | 8 | 25.036,88 € | 5 |
| `scenario4_dvije_ponude` | `scenario4_ponuda_a.pdf`, `scenario4_ponuda_b.pdf` | dvije ponude uz isti zahtjev — spaja li stavke i zbraja iznose | 16 | 619,32 € | 5 |
| `scenario5_dugacki_opisi` | `scenario5_dugacki_opisi.pdf` | nazivi 232–251 znakova — stane li u `varchar(200)` i skraćuje li razumno | 4 | 5.906,63 € | 5 |
| `scenario6_format_brojeva` | `scenario6_jedinice.pdf` | ista ponuda kao 5, brojevi u anglosaksonskom formatu (`1,398.00`) | 4 | 5.906,63 € | 5 |
| `scenario7_nije_ponuda` | `scenario7_nije_ponuda.pdf` | dokument bez tekstualnog sloja — **mora biti odbijen** | 0 | — | 3 |

`scenario7` u kodu nosi `inputModality: 'image'` iako je datoteka `.pdf`: riječ je o
skeniranoj slici unutar PDF-a, bez tekstualnog sloja. Ispravan ishod je odbijanje
(`expectsRefusal: true`), a ne izvučene stavke.

Zastavice `inputModality` i `expectsRefusal` stoje na dva mjesta — u scenariju i u ground
truthu. `evalHarness.js` ih uspoređuje **prije** mjerenja i puca ako se raziđu, da se ne
grupira po jednoj vrijednosti a boduje po drugoj. Provjereno 5. 9. 2026.: svih sedam se
poklapa.

## Tri ground trutha koji se više ne izvode

`server/eval/ground-truth/` sadrži deset datoteka. Tri od njih potječu iz doba chata,
nemaju priloga i nemaju odgovarajući scenarij u kodu:

| Datoteka | Zašto se ne izvodi |
|---|---|
| `scenario8_email_slobodan_tekst.json` | ponuda zalijepljena kao tekst e-maila, bez datoteke |
| `scenario9_prompt_injection.json` | manipulativan uvod u poruci, bez datoteke |
| `scenario10_izmjena_nakon_kreiranja.json` | ponašanje nakon kreiranja zahtjeva; ruta ne kreira zahtjeve |

Ostaju u repozitoriju kao zapis o obavljenom poslu. **Ne brišu se i ne mjere.**

## Ranija verzija ovog dokumenta opisivala je drugi skup

Do 5. 9. 2026. ovaj je dokument opisivao deset scenarija s drukčijim sadržajem i
prilozima — među njima dvije vision (slikovne) ponude, ponudu na engleskom u funtama i
drugu numeraciju. **Taj skup više ne postoji.** Prilozi su preimenovani i zamijenjeni u
commitu `235a694`:

- `scenario1_ponuda.pdf` → `scenario1_standardna.pdf`
- `scenario9_ponuda_a/b.pdf` → `scenario4_ponuda_a/b.pdf`
- `scenario10_not_a_quote.jpg` → `scenario7_nije_ponuda.pdf`
- obrisani: `scenario2_ponuda.jpeg`, `scenario3_ponuda_degraded.jpeg`, `scenario4_quote_en.pdf`
- dodani: `scenario2_visestranicna.pdf`, `scenario3_rabat_pdv.pdf`,
  `scenario5_dugacki_opisi.pdf`, `scenario6_jedinice.pdf`

Dokument nije bio ažuriran uz taj commit, pa je tvrdio postojanje datoteka kojih na disku
nema. Odatle i kasnija zabuna oko toga koji scenariji „nemaju prilog": u starom skupu to
su bili 5–8, u sadašnjem takvih **nema** — otpadaju 8, 9 i 10, i to zato što nemaju
priloga ni scenarija u kodu.

**Posljedica za opseg rada:** s tim commitom iz mjerenja su ispale dvije stvari koje je
stari skup pokrivao — **čitanje ponude sa slike** i **ponuda u stranoj valuti**. Prva je
otpala i zato što ruta ne prosljeđuje slike modelu (ekstrakcija je isključivo `pdf-parse`),
druga nema zamjenu među sadašnjim prilozima iako kod za nju postoji (`amount_status:
foreign_currency`). Oboje navesti u ograničenjima, ili nadoknaditi novim ponudama.

## Prilozi

`server/eval-scenarios/fixtures/` — osam datoteka, sve PDF. Odvojene su od razvojnih
dokumenata korištenih tijekom implementacije (`test_scenarios/`), da formalno mjerenje ne
koristi podatke na kojima se sustav razvijao. Scenariji 1 i 4 dolaze od istog stvarnog
dobavljača (Mikrotron d.o.o.) korištenog i u ranijim razvojnim testovima, ali su drugi
dokumenti — provjereno usporedbom hasheva.

## Ground truth

`server/eval/ground-truth/<scenario_id>.json`, verzionirano u gitu. Svako očekivano polje
nosi `provenance` s lokatorom i bajt-jednakim citatom; pravila i način provjere drži
`docs/mjerni-plan.md` § 5.

## Gdje živi mjerni aparat

```
server/scripts/evalScenarios.js       scenariji (podaci, bez ground trutha)
server/scripts/groundTruth.js         jedan čitač ground trutha za sve skripte
server/scripts/evalHarness.js         runner — mjeri rutu ai-items
server/scripts/scoreEvalResults.js    bodovanje točnosti -> docs/eval-runs/scoring-worksheet.md
server/scripts/aggregateEvalResults.js agregacija kroz runove (brzina, tokeni, pouzdanost)
server/scripts/evalCost.js            trošak i TCO
server/eval/ground-truth/             mjerilo
server/eval/category-codebook.md      pravilnik za dodjelu kategorija
server/eval-scenarios/fixtures/       prilozi
server/eval-results/                  JSONL rezultati (u .gitignore)
```

Statistička obrada (`analyze.js`, mjerni plan § 9, faza H) **još nije napisana.**

## Kako se boduje

`evalHarness.js` ne boduje nazive stavki — model ih legitimno parafrazira. Automatski se
provjerava broj stavki, količine, iznos i dodjela kategorije (strogo i blago);
`scoreEvalResults.js` to slaže u radni list i ostavlja prazno polje za ručnu procjenu
sadržaja stavki.
