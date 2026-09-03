# Codebook kategorija predmeta nabave

Definicije šest kategorija iz tablice `ItemCategory`, s pravilima razgraničenja.

**Zašto postoji.** Tablica `ItemCategory` ima samo stupac `name` — nigdje u aplikaciji,
bazi ni dokumentaciji ne postoji opis kategorije. Model u sustavnom promptu dobiva goli
popis od šest naziva i mora sam pogoditi što svaki obuhvaća. Ovaj dokument je taj propis,
napisan naknadno.

**Dvostruka uloga.** Ovaj tekst je istovremeno (1) pravilo po kojem se određuje ground
truth za mjeru točnosti dodjele i (2) sadržaj koji se u eksperimentalnom uvjetu
`with_definitions` doslovno umeće u sustavni prompt. Zato mora biti sažet i nedvosmislen.

> **Uvjet bez iznimke:** nijedan primjer u ovom dokumentu ne smije biti artikl koji se
> pojavljuje u eval scenarijima. Codebook ulazi u prompt, pa bi svaki takav primjer bio
> curenje rješenja. Svi primjeri niže namjerno dolaze iz drugih domena.

---

## 1. Računalna oprema

Fizička računalna i mrežna oprema koja se koristi kao **radno sredstvo**: računala i
njihove sastavnice, periferija, uređaji za pohranu, mrežna i podatkovna oprema, te oprema
za napajanje i smještaj te opreme.

Uključuje i pojedinačne komponente računala kad se nabavljaju zasebno, jer i tada
zadržavaju svrhu dijela radnog računala.

*Primjeri:* skener dokumenata, vanjski SSD disk, UPS uređaj, mrežni pisač.

## 2. Programska oprema i licence

Nematerijalna dobra: programi, licence, pretplate i prava korištenja, bez obzira na
trajanje i način isporuke. Ovdje ide sve što se ne može fizički primiti u ruke.

*Primjeri:* licenca uredskog paketa, godišnja pretplata na antivirusni program, licenca
sustava za upravljanje bazom podataka.

## 3. Uredski materijal

Potrošni materijal za svakodnevni uredski rad — roba koja se troši i redovito nadoknađuje,
male jedinične vrijednosti.

*Primjeri:* papir za pisač, toner, registratori, ljepljive bilješke, kemijske olovke.

## 4. Namještaj

Oprema za opremanje prostora: stolovi, stolice, ormari, police, pregrade. Uključuje i
ormare i police namijenjene pohrani opreme, jer je riječ o namještaju bez obzira što se
u njega sprema.

*Primjeri:* uredski stol, radna stolica, garderobni ormar, zidna polica.

## 5. Nastavna i laboratorijska oprema

Oprema, instrumenti, alati i materijal koji služe **izvođenju nastave ili laboratorijskog
rada**, a nisu radno računalo. Obuhvaća mjerne i ispitne instrumente, laboratorijske
alate, elektroničke komponente i module, te komplete i setove namijenjene vježbama.

*Primjeri:* mikroskop, analitička vaga, laboratorijska centrifuga, otpornici i LED diode
za vježbe, anatomski model.

## 6. Usluge održavanja

**Usluge**, ne roba: rad koji netko obavlja. Uključuje montažu, servis, popravak, obuku korisnika i ugovorenu podršku.
Kupnja jamstvenog razdoblja izvan zakonskog također je usluga, ne roba.

*Primjeri:* godišnji servis klima uređaja, popravak dizala, čišćenje prostora.

---

## Pravila razgraničenja

Primjenjuju se **redom**; prvo pravilo koje se poklopi odlučuje.

**P1 — Usluga prije robe.** Ako se nabavlja nečiji rad, a ne predmet, ide u *Usluge
održavanja*, bez obzira na to na kakvoj se opremi rad obavlja. Montaža, obuka, podrška i ugovorena jamstva su usluge.

**P2 — Nematerijalno prije materijalnog.** Licenca, pretplata ili pravo korištenja idu u
*Programsku opremu i licence*, bez obzira na to za kakav se uređaj vežu.

**P3 — Namjena prije oblika.** Odlučuje čemu predmet služi, ne od čega je napravljen.
Instrument za mjerenje u laboratoriju ide u *Nastavnu i laboratorijsku opremu* iako sadrži
računalo; računalo za uredski rad ide u *Računalnu opremu* iako se koristi i u nastavi.

**P4 — Komponente i moduli.** Elektroničke komponente, senzori, moduli i razvojne pločice
idu u *Nastavnu i laboratorijsku opremu*, jer su u visokoškolskom okruženju sredstvo
vježbe i istraživanja, a ne dio uredskog računala. Iznimka su komponente **računala kao
takvog** — one idu u *Računalnu opremu* po P5.

**P5 — Sastavnice računala.** Dijelovi od kojih se sastavlja ili nadograđuje osobno
računalo ili poslužitelj idu u *Računalnu opremu*, i kad se nabavljaju pojedinačno.

**P6 — Periferija je računalna oprema, ne uredski materijal.** Uređaji koji se priključuju
na računalo trajno su sredstvo rada, a ne potrošni materijal. *Uredski materijal* je
rezerviran za robu koja se troši.

**P7 — Namještaj ostaje namještaj.** Ormar ili polica ide u *Namještaj* i kad je
namijenjen pohrani opreme.

**P8 — Komplet se svrstava po pretežnoj svrsi.** Set ili komplet ide u kategoriju koja
odgovara njegovoj glavnoj namjeni, a ne najskupljem pojedinačnom dijelu.

**P10 — Trajno prije potrošnog.** *Uredski materijal* obuhvaća robu koja se **troši
uporabom** i redovito nadoknađuje. Predmet koji uporabom ne nestaje, koristi se ponovljeno
kroz više godina i vodi se kao oprema **ne pripada** toj kategoriji, ni kad mu je jedinična
vrijednost mala. Niska cijena sama po sebi ne čini predmet potrošnim.

**P9 — Prvenstvo pri sukobu.** Kad definicija kategorije obuhvaća predmet koji bi po nekom
pravilu razgraničenja išao drugamo, **prednost ima uže određenje**: ono koje predmet opisuje
po njegovoj tehničkoj funkciji, a ne po vanjskom obliku. Ako ni tada nije jasno koje je
određenje uže, predmet je **granični slučaj** i ground truth mu upisuje više prihvatljivih
kategorija umjesto jedne.

Ovo pravilo postoji jer definicije kategorija i pravila razgraničenja nisu izvedeni iz
istog kriterija — definicije opisuju **što kategorija obuhvaća**, pravila razrješavaju
**gdje se dvije kategorije dodiruju**. Bez P9 bi dokument na dodirnim mjestima sam sebi
proturječio.

---

## Granični slučajevi i kako se rješavaju

| Slučaj | Odluka | Pravilo |
|---|---|---|
| Mjerni instrument s ugrađenim računalom | Nastavna i laboratorijska oprema | P3 |
| Pojedinačna elektronička komponenta | Nastavna i laboratorijska oprema | P4 |
| Sastavnica osobnog računala kupljena zasebno | Računalna oprema | P5 |
| Priključni uređaj uz računalo | Računalna oprema | P6 |
| Ormar namijenjen pohrani opreme | Namještaj | P7 |
| Montaža opreme na lokaciji | Usluge održavanja | P1 |
| Obuka korisnika | Usluge održavanja | P1 |
| Ugovorena podrška uz kupljeni uređaj | Usluge održavanja | P1 |
| Licenca vezana uz uređaj | Programska oprema i licence | P2 |
| Izrada dokumentacije po narudžbi | Usluge održavanja | P1 |
| Konstrukcija koja služi montaži tehničke opreme | uža tehnička funkcija odlučuje | P9 |
| Jeftin ali trajan uređaj koji se ne troši | nije Uredski materijal | P10 |

---

## Kad ni pravila ne odlučuju

Neki artikli imaju **više obranjivih dodjela**. Za njih ground truth nosi
`acceptable_categories` s više vrijednosti i obrazloženjem, umjesto da se jedna proglasi
jedinom točnom. Dvije tipične skupine:

- **oprema dvojne namjene** — jednako uvjerljivo radno sredstvo i nastavno pomagalo
- **komplet mješovitog sadržaja** — kad P8 ne daje jasnu pretežnu svrhu

Model se ne kažnjava za izbor unutar `acceptable_categories`.

---

## Zapis o postanku

- **Autor dodjele:** Igor Petković, uz Claude Opus 5 kao pomoć pri primjeni pravila.
- **Postupak:** pravila su napisana **prije** dodjele; dodjela je izvršena **prije** uvida
  u izlaze modela (vidi `docs/mjerni-plan.md`, odjeljak o slijepoj dodjeli).
- **Druga procjena:** 20 nasumično odabranih stavaka klasificira nezavisna osoba bez uvida
  u ovaj prijedlog (`server/eval/category-secondrater.csv`); slaganje se izvještava.
- **Verzija:** hash ove datoteke zapisuje se u `run_manifest.json` svakog runa koji je
  koristi.
