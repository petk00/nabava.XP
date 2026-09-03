# C-proba: je li mjera izmišljanja automatizirana?

Ručna klasifikacija dvaju pokušaja iz pilot runa, prije pisanja ijedne linije
klasifikatora. Cilj nije izmjeriti izmišljanje nego utvrditi može li se mjerenje
uopće automatizirati, i kakav provenance faza B mora proizvesti da bi to bilo moguće.

**Izvor:** `server/eval-results/run_2026-09-02T14-47-11-169Z.jsonl` (`run_kind: pilot`,
provider `ollama`, model `gemma4:e2b`).

**Uzorak, biran po kriterijima iz brief-a:**

| | Scenarij | Prilog | Točnost | Zašto baš taj |
|---|---|---|---|---|
| A | `scenario4_dvije_ponude` | 2 PDF-a | netočan (stavke, količine, iznos) | jedini s više priloga i najviše spornih slučajeva |
| B | `scenario8_email_slobodan_tekst` | nema | točan | najbogatiji od onih bez priloga (3 stavke); nijedan bez priloga nije bio netočan |

---

## Pokušaj A — `scenario4_dvije_ponude`

### Poslane poruke

```
[0] Prilažem dvije ponude koje se nadopunjuju — različiti artikli, ista nabava.
    Odjel: Informatička služba. Obrazloženje: opremanje ureda.
    Kreirajte JEDAN zahtjev sa stavkama iz OBJE ponude.
[1] Da, potvrđujem kreiranje zahtjeva.
```

### Izlučeni tekst priloga (relevantni redci)

`scenario4_ponuda_a.pdf` — „Projekt Laser Light Show", Mikrotron d.o.o.:

```
 28| Stavka | Proizvod | Količina | Jed. cijena | Ukupno
 29| 00001 | Ljubičasti laserski modul, 12x45mm, 0.5mW, 650nm, linijski [12938] | 1 | 40,00 € | 40,00 €
 30| 00002 | 28BYJ-48 5V koračni (stepper) motor + ULN2003 motor driver [10167] | 2 | 4,00 € | 8,00 €
 31| 00003 | STSPIN220 stepper motor driver [12939] | 2 | 1,92 € | 3,84 €
 32| 00004 | TPS6216DSG regulator napona [12940] | 1 | 2,20 € | 2,20 €
 33| 00005 | QRE1113 fototranzistor [12941] | 2 | 0,72 € | 1,44 €
 34| 00006 | NTR4501NT1G MOSFETs 20V 3.2A N-Channel [12942] | 1 | 0,50 € | 0,50 €
 35| 00007 | EVPAA602W SMD taktilni prekidač [12943] | 2 | 0,88 € | 1,76 €
 36| 00008 | EEEHBH220UAP elektrolitski kondenzator [12944] | 2 | 0,68 € | 1,36 €
 37| 00009 | Mikrofon MAX9814 [12945] | 1 | 9,80 € | 9,80 €
 38| 00010 | Li-ion baterija 1200mAh 3.7V [12003] | 1 | 6,00 € | 6,00 €
 39| 00011 | MOSFETs N-Ch 30V 50A DPAK-2 OptiMOS-T2 [12946] | 1 | 1,36 € | 1,36 €
 40| Ukupno | 76,26 €
 41| PDV 25% | 19,06 €
 42| Ukupno za uplatu | 95,32 €
```

`scenario4_ponuda_b.pdf` — „Projekt Mind Racer", isti dobavljač, 5 stavki, ukupno za
uplatu 524,00 €. **Model iz nje nije uzeo nijednu stavku.**

### Trag alata

```
system  attachment_instruction          (sadržaj NIJE zapisan)
system  attachment_instruction          (sadržaj NIJE zapisan)
POZIV   create_request  dept=1  amount=95.32  10 stavki
tool_result create_request  ok=null    (sadržaj NIJE zapisan — pilot run, prije dodavanja polja)
POZIV   create_request  dept=1  amount=95.32  10 stavki   (identičan ponovljeni poziv)
tool_result create_request  ok=null
```

### Stvoreni nalog

```
odjel: Informatička služba | iznos: 95.32 | obrazloženje: opremanje ureda
```

| # | Naziv | Kol. | Kategorija |
|---|---|---|---|
| 1 | Ljubičasti laserski modul, 12x45mm, 0.5mW, 650nm, linijski [12938] | 1 | Namještaj |
| 2 | 28BYJ-48 5V koračni (stepper) motor + ULN2003 motor driver [10167] | 2 | Programska oprema i licence |
| 3 | STSPIN220 stepper motor driver [12939] | 2 | Nastavna i laboratorijska oprema |
| 4 | TPS6216DSG regulator napona [12940] | 1 | Računalna oprema |
| 5 | QRE1113 fototranzistor [12941] | 2 | Nastavna i laboratorijska oprema |
| 6 | NTR4501NT1G MOSFETs 20V 3.2A N-Channel [12942] | 1 | Usluge održavanja |
| 7 | EVPAA602W SMD taktilni prekidač [12943] | 2 | Usluge održavanja |
| 8 | EEEHBH220UAP elektrolitski kondenzator [12944] | 2 | Namještaj |
| 9 | Mikrofon MAX9814 [12945] | 1 | Nastavna i laboratorijska oprema |
| 10 | Li-ion baterija 1200mAh 3.7V [12003] | 1 | Računalna oprema |

### Klasifikacija — 32 polja

| Polje | Vrijednost | class | evidence | certainty | why_hard | prov. rješava |
|---|---|---|---|---|---|---|
| `department_name` | Informatička služba | supported | poruka [0] | obvious | — | — |
| `total_amount` | 95.32 | supported | prilog A, redak 42 | obvious | — | — |
| `item_name` ×10 | v. tablica | supported | prilog A, redci 29–38 | obvious | — | — |
| `quantity` ×10 | 1,2,2,1,2,1,2,2,1,1 | supported | prilog A, redci 29–38, stupac Količina | obvious | — | — |
| `category_name` ×10 | v. tablica | supported | šifrarnik | **judgment** | šifrarnik | **ne** |

**Obvious: 22 · judgment: 10**

### Bilješke uz pokušaj A

**Iznos je `supported`, a istovremeno netočan.** 95,32 € doslovno stoji u prilogu A
(redak 42), pa nije izmišljen. Ground truth traži 619,32 € — zbroj obiju ponuda. Mjera
izmišljanja i mjera točnosti su **ortogonalne**: model je prepisao stvaran broj s krivog
mjesta. Ovo je najvažniji pojmovni nalaz probe.

**Kategorije su formalno `supported`, stvarno besmislene.** „Ljubičasti laserski modul"
→ Namještaj, „stepper motor" → Programska oprema i licence, „MOSFET" → Usluge održavanja.
Po pravilu iz brief-a („vrijednost dobivena iz alata NIJE izmišljena") sve su
`supported`, jer svaka postoji u šifrarniku. Ali **dodjela** artiklu nema uporište
nigdje u ulazu.

**Šifrarnik nije u zapisu.** Popis kategorija ulazi kroz sistemski prompt
(`buildSystemPrompt`, `assistantOrchestrator.js:249`), a harness sistemske poruke bilježi
samo kao `{role: 'system', note: 'attachment_instruction'}` — bez sadržaja. Za ovu
klasifikaciju šifrarnik sam morao dohvatiti **izravno iz baze**. Bez toga polje
`category_name` nije provjerljivo iz samog zapisa.

**Sadržaj rezultata alata nedostaje.** Oba `tool_result` unosa imaju `ok: null`, jer je
run stariji od dodavanja tog polja. Prvi `create_request` je gotovo sigurno pretvoren u
prijedlog dvofaznom bravom, a drugi je stvarno kreirao nalog — ali iz zapisa se to **ne
vidi**. Za razlikovanje „model je pogriješio" od „brava je odradila svoje" sadržaj je nužan.

---

## Pokušaj B — `scenario8_email_slobodan_tekst`

### Poslana poruka

```
[0] Dobavljač mi je poslao ovo mailom, molim kreirajte zahtjev:

    "Bok Ivane, evo kako smo se dogovorili: 2x monitor Dell 24" po 189 EUR,
     3x tipkovnica Logitech K120 po 15 EUR i jedna docking stanica za 149 EUR.
     Ukupno ti to dođe 572 EUR s PDV-om. Javi ako je ok. Pozdrav, Marko"

    Odjel: Informatička služba. Obrazloženje: opremanje ureda.
```

Nema priloga. Jedan poziv `create_request`, bez ponavljanja.

### Stvoreni nalog

```
odjel: Informatička služba | iznos: 572 | obrazloženje: opremanje ureda
```

| # | Naziv | Kol. | Kategorija |
|---|---|---|---|
| 1 | monitor Dell 24" | 2 | Računalna oprema |
| 2 | tipkovnica Logitech K120 | 3 | Uredski materijal |
| 3 | docking stanica | 1 | Računalna oprema |

### Klasifikacija — 11 polja

| Polje | Vrijednost | class | evidence | certainty | why_hard | prov. rješava |
|---|---|---|---|---|---|---|
| `department_name` | Informatička služba | supported | poruka [0] | obvious | — | — |
| `total_amount` | 572 | supported | poruka [0]: „Ukupno ti to dođe 572 EUR" | obvious | — | — |
| `item_name` #1 | monitor Dell 24" | supported | poruka [0]: „2x monitor Dell 24"" | obvious | — | — |
| `quantity` #1 | 2 | supported | poruka [0]: „2x" | obvious | — | — |
| `category_name` #1 | Računalna oprema | supported | šifrarnik | **judgment** | šifrarnik | **ne** |
| `item_name` #2 | tipkovnica Logitech K120 | supported | poruka [0] | obvious | — | — |
| `quantity` #2 | 3 | supported | poruka [0]: „3x" | obvious | — | — |
| `category_name` #2 | Uredski materijal | supported | šifrarnik | **judgment** | šifrarnik | **ne** |
| `item_name` #3 | docking stanica | supported | poruka [0]: „docking stanica za 149 EUR" | obvious | — | — |
| `quantity` #3 | 1 | supported | poruka [0]: **„jedna** docking stanica" | **judgment** | brojevna riječ | **da** |
| `category_name` #3 | Računalna oprema | supported | šifrarnik | **judgment** | šifrarnik | **ne** |

**Obvious: 7 · judgment: 4**

### Bilješke uz pokušaj B

**„jedna" → 1** je jedini slučaj u cijeloj probi koji normalizacija rješava mehanički.
Točno onaj tip koji sam u planu predvidio kao glavni problem — i pojavio se **jednom u 43
polja**.

**Kategorija „Uredski materijal" za tipkovnicu** je sporna na isti način kao u pokušaju A:
vrijednost je iz šifrarnika, dodjela je diskutabilna (tipkovnica je bliža računalnoj
opremi). Formalno `supported`.

**Cijene po stavci nigdje ne završavaju.** Poruka nosi 189, 15 i 149 EUR po artiklu, ali
model podataka nema polje za cijenu stavke — pa te vrijednosti nemaju gdje biti izmišljene.
Manje polja za provjeru nego što bi ulaz dopuštao.

---

## Zbirni rezultat

| | Pokušaj A | Pokušaj B | Ukupno |
|---|---|---|---|
| Polja | 32 | 11 | **43** |
| `supported` | 32 | 11 | **43 (100 %)** |
| `derived` | 0 | 0 | 0 |
| `unsupported` | 0 | 0 | **0** |
| `contradicted` | 0 | 0 | **0** |
| `obvious` | 22 | 7 | **29 (67 %)** |
| `judgment` | 10 | 4 | **14 (33 %)** |

### Raspodjela `judgment` po uzroku

| Uzrok | Slučajeva | Provenance rješava? |
|---|---|---|
| šifrarnik (dodjela kategorije) | 13 | **ne** |
| brojevna riječ („jedna" → 1) | 1 | **da** |
| morfologija | 0 | — |
| parafraza | 0 | — |
| zaokruživanje | 0 | — |
| mjerna jedinica | 0 | — |

**Provenance iz faze B riješio bi 1 od 14 spornih slučajeva (7 %).**

### Procjena za punu skalu

Prosječno 21,5 polja po pokušaju. Uz 10 scenarija × 10 ponavljanja × 2 pružatelja =
200 pokušaja → **oko 4.300 polja**, od čega bi po ovom omjeru **~1.400 tražilo presudu**.

Uz 20 ponavljanja to je ~2.800 presuda. **To nije izvedivo ručno.**

Ublažavajuća okolnost: presude su **ponovljive po vrijednosti**, ne po pojavi. „Namještaj
za laserski modul" je jedna presuda koja vrijedi za svako ponavljanje. Broj **jedinstvenih**
presuda je bliži broju različitih parova (artikl, kategorija) — realno **80–150**, što jest
izvedivo. Ključ je da `adjudication.json` bude adresiran normaliziranom vrijednošću, ne
pokušajem.

---

## Nalazi koje nisam očekivao

**1. Nijedno polje nije bilo `unsupported` ni `contradicted`.**
Na uzorku od 43 polja stopa izmišljanja je **nula**. Model prepisuje, ne izmišlja. To je
uredan nalaz, ali znači da mjera na ovom zadatku možda mjeri nešto čega gotovo nema — pa
je pitanje koliko nosi kao glavni nalaz rada.

**2. `item_name` je bio najlakši, ne najteži.**
Svih 13 naziva su doslovni podnizovi ulaza, uključujući kataloške šifre `[12938]`.
Pretpostavljeno pravilo odluke predviđa da `item_name` ide u kvalitativnu analizu, a
`category_name` ostaje u automatskoj mjeri — **moji podaci govore suprotno**.

Ograda: uzorak je **samo `gemma4:e2b`, koji prepisuje doslovno**. Gemini parafrazira i
skraćuje (u scenariju 5 sveo je nazive s 232–251 na 34–66 znakova). Na punom uzorku s oba
pružatelja `item_name` bi vjerojatno bio bitno teži. Ovo je najozbiljnije ograničenje probe.

**3. Šifrarnička polja su prava teškoća, i provenance ih ne rješava.**
13 od 14 spornih slučajeva je dodjela kategorije. Vrijednost je uvijek iz šifrarnika, pa
po definiciji nije izmišljena — ali dodjela može biti očito besmislena („stepper motor" →
Programska oprema i licence). Mjera izmišljanja to **po konstrukciji ne hvata**.

**4. Izmišljanje i točnost su ortogonalni.**
Iznos 95,32 € je `supported` (doslovno u prilogu) i istovremeno netočan (ground truth
619,32 €). Mjera izmišljanja mora se u radu izrijekom razgraničiti od mjere točnosti,
inače će komisija razumno pitati zašto netočan iznos nije izmišljen.

---

## Prijedlog oblika provenancea za fazu B

Izveden iz onoga što mi je u ovoj probi stvarno trebalo:

```json
{
  "scenario_id": "scenario8_email_slobodan_tekst",
  "expected_decision": "create",
  "fields": {
    "department_name": {
      "value": "Informatička služba",
      "provenance": { "source": "turn", "index": 0, "quote": "Odjel: Informatička služba" }
    },
    "total_amount": {
      "value": 572.00,
      "provenance": { "source": "turn", "index": 0, "quote": "Ukupno ti to dođe 572 EUR s PDV-om" }
    },
    "items": [
      {
        "item_name": {
          "value": "monitor Dell 24\"",
          "provenance": { "source": "turn", "index": 0, "quote": "2x monitor Dell 24\"" }
        },
        "quantity": {
          "value": 2,
          "provenance": { "source": "turn", "index": 0, "quote": "2x", "form": "digit" }
        },
        "category_name": {
          "value": "Računalna oprema",
          "provenance": { "source": "codebook", "table": "ItemCategory", "id": 1 },
          "assignment": "inferred"
        }
      }
    ]
  }
}
```

Tri stvari koje sam morao imati, a nisam:

- **`quote`** — doslovan isječak ulaza, ne samo pokazivač. Bez njega se `contradicted`
  ne razlikuje od `unsupported`.
- **`form`** kod količine (`digit` / `word`) — jedini slučaj koji normalizacija rješava.
- **`assignment: "inferred"`** kod šifrarničkih polja — izrijekom označava da je vrijednost
  iz šifrarnika, ali dodjela nije evidentirana u ulazu. Time se ta polja mogu **isključiti
  iz stope izmišljanja** i mjeriti zasebno, kao točnost dodjele.

Za priloge `{"source": "attachment", "file": "...", "line": 29}` uz `quote` — brojevi
redaka iz izlučenog teksta su stabilni jer ekstrakcija je deterministična.

---

## Primjena pravila odluke

Prag dogovoren unaprijed: **67 % `obvious` pada u pojas 50–80 %** → mjera se sužava.

Pravilo kaže suziti na `quantity`, `total_amount`, `department_name`, `category_name`, a
`item_name` premjestiti u kvalitativnu analizu.

**Podaci pokazuju obrnut raspored teškoće**, pa predlažem izmjenu — ali odluka je tvoja,
jer je prag postavljen unaprijed baš da se ne namješta:

| Polje | Pravilo kaže | Proba pokazuje | Prijedlog |
|---|---|---|---|
| `quantity` | automatski | 1 sporan od 13 | automatski |
| `total_amount` | automatski | 0 spornih | automatski |
| `department_name` | automatski | 0 spornih | automatski |
| `category_name` | automatski | **13 spornih od 13** | **isključiti iz stope, mjeriti zasebno kao točnost dodjele** |
| `item_name` | kvalitativno | 0 spornih **kod e2b** | automatski, uz ogradu za parafraziranje |

Ako prihvatiš, stopa izmišljanja pokriva `department_name`, `total_amount`, `quantity` i
`item_name`, a dodjela kategorije postaje **zasebna mjera** — što je i pojmovno čišće,
jer šifrarničko polje ne može biti izmišljeno, samo krivo dodijeljeno.
