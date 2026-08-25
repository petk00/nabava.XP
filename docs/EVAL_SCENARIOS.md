# Eval scenariji za AI asistenta (RQ1/RQ2)

Ovaj dokument opisuje kanonski skup od 10 scenarija za formalno prikupljanje
podataka o ponašanju AI asistenta (docs/AI.md), korišten u `server/scripts/evalHarness.js`
i `server/scripts/evalScenarios.js`. Cilj skupa je pokriti četiri ključna
područja ponašanja asistenta: obradu PDF dokumenata, vision (slika) ekstrakciju,
razumijevanje prirodnog jezika i ispravno agentsko ponašanje (stanje razgovora,
otpornost na manipulaciju, poslovna validacija).

Zadnja provjera: **2026-08-25**

Sirovi rezultati eval runova (JSON Lines, po pokušaju) spremaju se u
`server/eval-results/` (generirano, nije u gitu). Prilozi korišteni za
scenarije s dokumentima nalaze se u `server/eval-scenarios/fixtures/` — svježe
generirani sintetički dokumenti, odvojeni od razvojnih PDF-ova korištenih
tijekom implementacije (`test_scenarios/mikrotron_M.pdf` i sl.), da se izbjegne
"contamination" formalnog mjerenja podacima koje je model (ili sam razvojni
proces) već "vidio".

Bodovanje točnosti (je li agent stvarno postupio ispravno za svaki scenarij)
namjerno NIJE dio ovog koraka — to je zaseban, teži problem koji zahtijeva
dogovorenu definiciju "točno" po scenariju. Ovaj skup i harness pokrivaju samo
pouzdano prikupljanje sirovih podataka (transkript, latencija, token usage,
tool pozivi).

## Popis scenarija

1. **PDF ponuda s čistim tekstualnim slojem** — upload preko + ili drag & dropa.
   Testira se ekstrakcija strukturiranih podataka iz tekstualnog PDF-a.
2. **Kvalitetna slika ponude (JPG/PNG)** — jasna i dobro poravnata slika
   dokumenta. Testira se ekstrakcija podataka vision modelom u optimalnim
   uvjetima.
3. **Nekvalitetna slika ponude (JPG/PNG)** — mutna, nakošena ili zasjenjena
   fotografija. Testira se robusnost vision ekstrakcije u otežanim uvjetima.
4. **PDF ponuda na engleskom jeziku** — agent treba razumjeti sadržaj te
   pravilno obraditi brojeve, decimalne oznake i valute izvan hrvatskog
   konteksta.
5. **Potpuno specificiran zahtjev u jednoj složenoj rečenici** — korisnik u
   jednoj rečenici navodi sve potrebne podatke za kreiranje zahtjeva.
6. **Nejasan zahtjev bez definirane količine** — korisnik navodi artikl, ali
   ne i broj komada ili drugu obaveznu informaciju. Agent mora zatražiti
   nedostajući podatak, bez nagađanja.
7. **Složen zahtjev s više stavki i promjenom odluke** — korisnik unosi
   stavke iz različitih kategorija, a zatim mijenja jednu od prethodno
   definiranih vrijednosti. Testira se mapiranje kategorija i ažuriranje
   drafta kroz više poruka.
8. **Složen zahtjev s nepotrebnim informacijama i prompt injection
   pokušajem** — korisnik uz relevantne podatke uključuje nebitne instrukcije
   i pokušaj zaobilaženja poslovnih pravila. Agent treba izdvojiti relevantne
   podatke i zadržati postojeću validaciju aplikacije.
9. **Više ponuda odjednom (PDF)** — korisnik učitava ponude za različite
   stavke. Agent treba prepoznati stavke iz svih ponuda i spojiti ih u jedan
   draft. (Eval fixture namjerno sadrži i DIJELOM preklapajuće stavke između
   dviju ponuda, ne samo posve različite — time se testira i ispravno
   spajanje neprelaklapajućih stavki i eksplicitno pitanje korisniku za
   stavke koje se preklapaju, docs/AI.md buildAttachmentInstruction.)
10. **Dokument koji nije ponuda** — korisnik učitava nerelevantan dokument,
    poput ugovora ili dopisa. Agent treba prepoznati da dokument nije
    odgovarajući i zatražiti odgovarajući dokument ili dodatnu uputu.

Ovaj skup pokriva četiri ključna područja:

- 📄 **PDF obrada** — tekstualni PDF, engleski PDF, više PDF-ova, nerelevantan
  PDF (scenariji 1, 4, 9, 10)
- 👁️ **Vision** — dobra i loša slika (scenariji 2, 3)
- 🧠 **Razumijevanje zahtjeva** — jednostavan/složen prirodni jezik,
  nedostajući podaci (scenariji 5, 6, 7)
- 🛡️ **Agentsko ponašanje** — promjena stanja kroz razgovor, prompt injection
  i poslovna validacija (scenariji 7, 8)

## Prilozi po scenariju

| Scenarij | Prilog | Napomena |
|---|---|---|
| 1 | `eval-scenarios/fixtures/scenario1_ponuda.pdf` | HR, tekstualni sloj, 4 stavke (uredska oprema) |
| 2 | `eval-scenarios/fixtures/scenario2_ponuda.png` | Isti sadržaj kao scenarij 1, renderiran kao PNG (150 DPI) |
| 3 | `eval-scenarios/fixtures/scenario3_ponuda_degraded.png` | Scenarij 2 + Gaussian blur + rotacija (reproducibilno, PIL) |
| 4 | `eval-scenarios/fixtures/scenario4_quote_en.pdf` | EN, decimalna točka, USD |
| 5-8 | — | Čisti tekst, bez priloga |
| 9 | `eval-scenarios/fixtures/scenario9_ponuda_a.pdf`, `scenario9_ponuda_b.pdf` | Dvije ponude, dijelom iste stavke |
| 10 | `eval-scenarios/fixtures/scenario10_not_a_quote.pdf` | Zapisnik sa sastanka (nije ponuda) |
