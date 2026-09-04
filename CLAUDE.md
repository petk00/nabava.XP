# Upute za rad na diplomskom radu

Ovaj repo sadrži aplikaciju nabava.XP i mjerni aparat za diplomski rad.
Folder `rad/` sadrži pomoćne datoteke rada — **ne i sam tekst rada**.

## Prije bilo kakvog rada na radu

Pročitaj `rad/KONTEKST.md`. Sadrži cilj, hipotezu, opis sustava, kriterije,
mjerni plan, pojmovnik i granice poglavlja. Sve što ondje nije zapisano — ne postoji.

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

Vidi tablicu u `KONTEKST.md`, § 7. Ukratko:

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

Koristi fiksne nazive iz `KONTEKST.md`, § 6. Bez sinonima.

## Na kraju svakog poglavlja

Sažmi donesene odluke u ~10 redaka i dopiši ih u `KONTEKST.md`, § 10.
Sljedeći razgovor nasljeđuje odluke, ne cijeli tekst.

## Mjerni aparat

```
server/scripts/evalScenarios.js      scenariji + ground truth
server/scripts/evalHarness.js        runner
scripts/scoreEvalResults.js          bodovanje
scripts/evalCost.js                  trošak i TCO
server/eval-scenarios/fixtures/      PDF prilozi
server/eval-results/                 JSONL rezultati
```

## Poštenje rezultata

Ako mjerenje ispadne nepovoljno za lokalnu izvedbu, to se navodi kakvo jest,
uz objašnjenje uzroka. Ne traži formulacije koje ublažavaju nalaz.
Hipoteza smije biti potvrđena djelomično.
