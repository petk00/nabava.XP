# Testni skup za mjerenje čitanja ponude

Zadnja provjera: **5. 9. 2026.** — usklađeno s kodom (`server/scripts/evalScenarios.js`),
prilozima na disku i ground truthom.

Mjeri se ruta `POST /api/requests/:id/ai-items` (`docs/AI.md`): model pročita ponudu
priloženu uz postojeći zahtjev i njome zamijeni stavke i ukupan iznos. Nema razgovora,
pa scenarij nije niz poruka nego **jedan zahtjev s jednom ili dvije priložene ponude**.

## Što se stvarno izvodi — jedanaest scenarija

| # | ID | Ispituje | Prilog | Stavki | Iznos |
|---|---|---|---|---|---|
| 1 | `scenario1_standardna` | normalna ponuda, četiri stavke | `scenario1_standardna.pdf` | 4 | 57,10 € |
| 2 | `scenario2_visestranicna` | dvije stranice, 23 stavke | `scenario2_visestranicna.pdf` | 23 | 50.677,88 € |
| 3 | `scenario3_rabat_pdv` | rabat i PDV — bira li konačan iznos za uplatu | `scenario3_rabat_pdv.pdf` | 8 | 25.036,88 € |
| 4 | `scenario4_dvije_ponude` | dvije ponude, iznos je zbroj | `scenario4_ponuda_a.pdf`, `_b.pdf` | 16 | 619,32 € |
| 5 | `scenario5_dugacki_opisi` | nazivi dulji od 200 znakova | `scenario5_dugacki_opisi.pdf` | 4 | 5.906,63 € |
| 6 | `scenario6_format_brojeva` | isti sadržaj, anglosaksonski zapis | `scenario6_jedinice.pdf` | 4 | 5.906,63 € |
| 7 | `scenario7_nije_ponuda` | račun za komunalne usluge — **mora biti odbijen** | `scenario7_nije_ponuda.pdf` | 0 | — |
| 8 | `scenario8_slika` | ponuda s fotografije, **bez ekstrakcije** | `scenario8_slika.jpeg` | 5 | 109,94 € |
| 9 | `scenario9_negativ` | negativna stavka (odbitak) se izostavlja | `scenario9_negativ.pdf` | 3 | 2.575,00 € |
| 10 | `scenario10_cetiri_ponude` | četiri ponude, iznos je zbroj | `scenario10_ponuda1–4.pdf` | 46 | 75.867,18 € |
| 11 | `scenario11_slika_uparena` | ponuda scenarija 1 kao **slika** — uparena proba kanala | `scenario11_slika_zaslona.jpeg` | 4 | 57,10 € |

### Scenariji 5 i 6 — uparena proba s jednom promjenjivom

Isti sadržaj u dva zapisa broja. Izdvojeni tekst je jednake duljine (2.056 znakova, 53
retka) i razlikuje se u dvanaest redaka, a svaka je razlika samo decimalni i tisućni
razdjelnik (`4 974,00 €` naspram `4,974.00 €`). **Nisu dva neovisna uzorka** — u
agregaciji se broje kao par, ne kao dvije mjere.

### Scenarij 8 — jedini bez izjednačenog ulaza

Slika ide modelu izravno, bez poslužiteljske ekstrakcije, pa **svaka izvedba radi vlastito
očitanje**. Zapis pokušaja nosi `server_text_extraction: false`. Rezultati idu u zasebnu
tablicu točnosti i tokeni se broje odvojeno; ista slika daje 368 ulaznih tokena lokalno i
1.227 kod udaljene usluge, pa zbrajanje nema smisla. Ground truth nema lokatore prema
retku — vrijednosti su očitane s fotografije i provjeravaju se okom, ne strojno.

Dokument je samostalna ponuda (biooprema d.o.o. 225/2025), **ne fotografija ponude iz
scenarija 1**, pa uparene probe „isti dokument, dva kanala" nema.

### Scenariji 1 i 11 — uparena proba ulaznog kanala

Isti dokument (Mikrotron d.o.o., ponuda 14852), dva ulaza. Scenarij 1 ulazi kao PDF i
prolazi kroz poslužiteljsko izdvajanje teksta, pa obje izvedbe dobivaju **identičan niz
znakova**. Scenarij 11 ulazi kao slika i ide modelu izravno, pa **svaka izvedba radi
vlastito očitanje**. Sve ostalo je isto — isti prompt, ista shema alata, isti zlatni
standard: četiri stavke, iste količine, 57,10 €.

Razlika u točnosti između ta dva scenarija mjeri **cijenu ulaznog kanala**, ne sposobnost
čitanja ponude. Stavke scenarija 11 su prijepis, pa **ne ulaze u ukupnu točnost ni u
raspodjelu kategorija** (`countsTowardOverall: false`).

**Dva slikovna scenarija pokrivaju dva kraja raspona.** Scenarij 11 je **snimka zaslona** —
ravna, oštra, jednoliko osvijetljena, bez sjena i nakošenja. To je **najpovoljniji slučaj**
slikovnog ulaza i gornja granica onoga što se od čitanja slike može očekivati. Scenarij 8
je **snimka papira**, sa sjenama, nakošenjem i neravnim listom, i pokriva realan slučaj
kakav bi referent doista poslao.

Zbog toga se rezultat scenarija 11 ne smije čitati kao „model dobro čita slike" nego kao
„toliko može kad je slika idealna". Razlika između scenarija 8 i 11 mjeri koliko kvaliteta
snimke stoji.

### Scenarij 10 — mjeri spajanje, ne čitanje

Njegova četiri priloga su **bajt-jednake kopije** dokumenata scenarija 4a, 3, 1 i 2 —
provjereno hashevima. Model te stavke čita i drugdje, pa se njihova pojedinačna točnost
**ne pribraja ukupnoj**. Boduje se samo po dvama mjerilima: ukupan broj stavki (46) i je
li iznos zbroj svih četiriju ponuda (75.867,18 €, broj koji se ne pojavljuje ni u jednom
prilogu).

### Scenarij 7 se reže

Dokument ima 11.650 znakova, a `MAX_QUOTE_TEXT_LEN` reže na 8.000 — **model vidi 69 %
teksta**. Jedini je dokument u skupu koji prelazi granicu. Postavka se namjerno ne mijenja
prije kampanje, jer bi se time mjerio drugi sustav.

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
