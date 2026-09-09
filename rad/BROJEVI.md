# BROJEVI — jedini izvor izmjerenih vrijednosti

> **Pravilo:** nijedan broj ne ulazi u tekst rada ako nije ovdje.
> Popunjava se **skriptom iz JSONL-a**, ne prepisivanjem.
> Definicije mjera i klase grešaka drži `docs/mjerni-plan.md` — ovdje su samo vrijednosti.
> Uz svaku vrijednost mora biti jasno je li dobivena **automatski** ili **ručno**.

**Mjerena ruta:** `POST /api/requests/:id/ai-items` (čitanje priložene ponude, zamjena stavki)

**`run_id`:** `8179c21d-e796-47bf-a6da-27bca395cbbe` · **`run_kind`:** `final` · **datum:** 8. 9. 2026., 04:37–06:36 (lokalno)
**commit aplikacije:** `531e5d5f` · **commit harnessa:** `531e5d5f` · **dirty:** false · **grana:** `mjerenje-ai-items`
**`prompt_variant`:** `names_only` (poslužitelj i harness se slažu) · **hash sustavnog prompta:** `df5f37ee35d98a29` (jedan kroz cijeli prolaz)

> Runovi različite vrste se ne spajaju. Pilot se citira kao pilot, nikad kao rezultat.
> Odrezan odgovor (`finish_reason` = `length` / `MAX_TOKENS`) poništava run — u ovom
> prolazu `truncated` je **0/220**.

**Poništeni prolaz:** `run_2026-09-08T01-46-23-427Z` — 167 od 220 pokušaja odbio je
ograničivač broja poziva (HTTP 429). Zadržan kao dokaz, ne ulazi u rezultate.

---

## 0. Uvjeti mjerenja

| Stavka | Vrijednost |
|--------|-----------|
| Uređaj | Mac Mini M4 (`Mac16,10`), 16 GB objedinjene memorije |
| Što na njemu radi | aplikacija (Node v25.7.0), MySQL, Ollama — sve na istom čvoru |
| OS | macOS `25D125` |
| Samoposlužena izvedba | `gemma4:e2b` — 5,1 mlrd. parametara, kvantizacija Q4_K_M, `num_ctx` 32768 |
| Distribuirana izvedba | `gemini-3.5-flash` |
| Uzorkovanje | temp 0, top_p 1, `max_output_tokens` 16384; sjeme 42 **samo Ollama**; `top_k` neizjednačen |
| Zašto `top_k` nije izjednačen | temperatura 0 → pohlepno dekodiranje, `top_k` bez učinka na ishod |
| Unutarnje razmišljanje lokalnog modela | uključeno (`think: true`) |
| Warm-up lokalnog modela | izveden, 188 ms |
| Scenariji u prolazu | 11 (8 ulazi u ocjenu, 3 izuzeta — v. 3.3 rada) |
| Ponavljanja po scenariju i izvedbi | 10 |
| Ukupno pokušaja | 220 (110 po izvedbi) |
| Razmak među pokušajima | 2000 ms |
| Redoslijed izvedbi | izmjenično po krugu, obrće se svaki drugi krug |
| Stanje baze prije / poslije | 50 → 61 zahtjeva, 419 → 561 stavki |
| **Odstupanje** | ograničivač poziva podignut s 20 na **1000 u prozoru od 900 s** (`AI_ITEMS_RATE_LIMIT_MAX` u `.env`, bez izmjene koda); dokaz u `ratelimit-1000.txt`. Razlog: ograničivač se veže na IP, a kampanja s jedne adrese u dva sata proizvodi gušće opterećenje nego produkcija u mjesec dana. `rate_limit_wait_ms` = 0 u svih 220 pokušaja |

**Opterećenje Veleučilišta (sidro hipoteze):**
**oko 300 nabava godišnje**, vrhunac početkom kalendarske godine · vršna istodobnost **1**
(zahtjev preuzima i dovršava ista osoba; iznimka je zamjena u odsutnosti) ·
izvor: strukturirani razgovor sa službom nabave, 13. 7. 2026. (Prilog 1 rada)

> Prije razgovora pretpostavljen je raspon 300–500 i za izračune se koristila vrijednost 400.
> Nakon razgovora mjerodavna je vrijednost **300**; 400 i 500 ostaju u analizi osjetljivosti.

**Ostalo iz istog razgovora:** ponude stižu kao PDF · dokument koji nije ponuda prilaže se vrlo
rijetko i uvijek kao pogreška podnositelja · **svaki se zahtjev pregledava, a stavke se već danas
provjeravaju usporedbom s ponudom dobavljača** (zatečena praksa, ne očekivanje) · kategorija se
ponekad namjerno bira prema raspoloživim sredstvima, a ne prema sadržaju stavke

**Provjera mjerila** (`server/scripts/verifyProvenance.js`) — nad izvođenim scenarijima:

| Mjera | Vrijednost |
|---|---|
| unosa provenance ukupno (s ugniježđenima) | 190 |
| od toga s citatom | 131 |
| provjerljivo protiv teksta priloga | 125 |
| **prolazi provjeru doslovnosti i retka** | **125 (sve)** |
| bez citata — dodjela iz codebooka | 63 stavke |

Tekst se izvlači istim putem kojim ga izvlači mjerena ruta. `line` je nula-indeksiran.

---

## 1. Odziv

> Medijan i p95, **nikad prosjek**. Sve vrijednosti automatski iz `latency_ms`.

**Ukupno trajanje obrade (s)**

| Izvedba | opseg | N | p50 | p95 | min | max |
|---------|-------|---|-----|-----|-----|-----|
| samoposlužena | svi scenariji | 110 | 37,0 | 101,2 | 24,3 | 109,1 |
| samoposlužena | samo bodovani | 80 | 49,3 | 86,7 | 24,3 | 90,3 |
| distribuirana | svi scenariji | 110 | 5,4 | 18,3 | 2,3 | 22,1 |
| distribuirana | samo bodovani | 80 | 4,9 | 13,3 | 2,3 | 15,9 |

**Po scenariju (s, p50 / p95)**

| Sc. | samoposlužena | distribuirana |
|---|---|---|
| 1 osnovno čitanje | 73,7 / 78,3 | 4,7 / 5,0 |
| 2 višestranična | 65,0 / 67,9 | 13,2 / 15,0 |
| 3 rabat i PDV | 32,8 / 35,1 | 5,4 / 6,3 |
| 4 dvije ponude | 86,7 / 88,7 | 10,1 / 10,9 |
| 5 dugački opisi | 34,9 / 37,1 | 4,0 / 5,0 |
| 6 zapis brojeva *(izuzet)* | 37,0 / 37,9 | 4,5 / 5,0 |
| 7 nije ponuda | 31,0 / 35,9 | 2,5 / 3,1 |
| 8 fotografija | 59,0 / 60,2 | 7,4 / 8,2 |
| 9 negativna stavka | 24,4 / 25,1 | 3,5 / 3,9 |
| 10 četiri ponude *(izuzet)* | 101,3 / 105,6 | 20,0 / 22,0 |
| 11 snimka zaslona *(izuzet)* | 36,0 / 36,0 | 6,5 / 7,0 |

**Razlaganje odziva — koliko otpada na model**

| Izvedba | trajanje u modelu p50 (s) | udio ukupnog odziva |
|---------|---------------------------|---------------------|
| samoposlužena | 49,2 | **99,8 %** |
| distribuirana | 4,7 | 96,9 % |

Aplikacija i poslužiteljsko izdvajanje teksta ne doprinose mjerljivo — sve trajanje je model.

**Broj poziva modelu:** samoposlužena 1 poziv u 80 pokušaja, 2 poziva u 30; distribuirana 1 poziv u svih 110.

**Čekanje na kvotu:** 0 ms u svih 220 pokušaja.

---

## 2. Potrošnja tokena

> Odvojeno po izvedbi, nikad kao omjer — različiti tokenizatori.
> Izlazni tokeni samoposlužene izvedbe **uključuju i unutarnje razmišljanje**
> (medijan 5244 znakova razmišljanja naspram 0 znakova teksta odgovora — odgovor je
> isključivo poziv alata).

| Izvedba | ulazni p50 | izlazni p50 | ukupno ulaz / izlaz (bodovani) | izlaznih tokena/s p50 |
|---------|-----------|-------------|-------------------------------|----------------------|
| samoposlužena | 4138 | 2440 | 351 460 / 212 260 | 52,3 |
| distribuirana | 2786 | 188 | 254 480 / 22 967 | 39,4 |

Ulazni tokeni razlikuju se ondje gdje izdvajanje teksta nije zajedničko — kod slikovnih
priloga (sc. 8 i 11) i kod scenarija 1, gdje lokalni model prima i vlastiti predložak.

---

## 3. Točnost čitanja ponude

> **Podjela mjere.** Nosivi dio i jedini koji ulazi u prag H1: **iznos i stavke**
> (§ 3.3 i § 3.4). Dopunska mjera bez praga: **dodjela kategorije** (§ 3.2).
> Bodovano nad 8 scenarija koji ulaze u ocjenu, n = 80 po izvedbi.

### 3.1 Raspodjela grešaka po klasama

> Klase: `supported`, `derived`, `misgrounded`, `fabricated`, `contradicted`.

| Polje | Nalaz | Samoposlužena | Distribuirana |
|-------|-------|---------------|---------------|
| `total_amount` | supported / derived | 70/70 nad stvarnim ponudama | 70/70 |
| `total_amount` | misgrounded, fabricated, contradicted | 0 | 0 |
| `quantity` | supported | 50/80 | 70/80 |
| broj stavki | **ponavljanje utemeljenih stavki** (nije izmišljanje) | sc. 2: 42 umjesto 23 (24 jedinstvene, 18 duplikata); sc. 10: 50 umjesto 46 | — |
| `item_name` | čitanje šifri umjesto naziva na slici | sc. 8: `FORB7`, `2.000102`, `3.000002` … | — |

**Ključno razgraničenje:** pogreške samoposlužene izvedbe u broju stavki **nisu izmišljene
stavke** nego ponovljene stvarne. Nijedna vrijednost iznosa nije bila neutemeljena.

### 3.2 Dodjela kategorije — DOPUNSKA MJERA, ne ulazi u prag H1

**Polazišna vrijednost većinske klase: 23,8 %** (nad 63 bodovane stavke, 13 zastupljenih kategorija)

| Izvedba | strogo % | blago % | razlika | provjereno dodjela |
|---------|----------|---------|---------|--------------------|
| samoposlužena | **57,1** | **71,4** | 14,3 | 350 |
| distribuirana | **76,8** | **88,9** | 12,1 | 630 |
| polazišna (većinska klasa) | 23,8 | — | — | — |

> Broj provjerenih dodjela razlikuje se jer samoposlužena izvedba u dva scenarija ne
> vraća skup stavki koji se može uparivati sa zlatnim standardom.

**Najčešće zamjene (apsolutno, kroz svih 10 ponavljanja)**

| Očekivana → odabrana | Samoposlužena | Distribuirana |
|---|---|---|
| Elektronička → Sitni inventar | 20 | 0 |
| Nastavna i laboratorijska → Elektronička | 10 | 30 |
| Nastavna i laboratorijska → Laboratorijski potrošni materijal | 10 | 0 |
| Mjerna i ispitna → Laboratorijski potrošni materijal | 10 | 0 |
| Nastavna i laboratorijska → Mrežna i telekomunikacijska | 10 | 0 |
| Računalna → Uredska oprema i potrepštine | 10 | 0 |
| Računalna → Uredski materijal | 10 | 0 |
| Usluge razvoja i održavanja IS → Ostale usluge | 10 | 10 |
| Nastavna i laboratorijska → Edukacije i stručno usavršavanje | 10 | 0 |
| Mjerna i ispitna → Elektronička | 0 | 10 |
| Nastavne potrepštine → Uredski materijal | 0 | 10 |
| Stručne i savjetodavne → Ostale usluge | 0 | 6 |
| Nastavna i laboratorijska → Zaštitna oprema | 0 | 4 |
| **ukupno neslaganja** | **100** | **70** |

Distribuirana izvedba griješi **uže**: 30 od 70 njezinih neslaganja pada na jednu granicu
(laboratorijsko → elektroničko), koja je i u zlatnom standardu najspornija. Samoposlužena
ih raspršuje po osam različitih granica.

**Druga ljudska procjena** (19 graničnih stavki, 8. 9. 2026.): strogo 9/19, blago 12/19.
Ljudski strop na graničnim slučajevima manji je od polovice — v. 3.3.4 rada.

### 3.3 Broj stavki i iznos — PRIMARNA MJERA *(H1)*

| Mjera | Samoposlužena | Distribuirana | Izvor |
|-------|---------------|---------------|-------|
| **iznos točan (samo stvarne ponude, n=70)** | **70/70 = 100 %** | **70/70 = 100 %** | automatski |
| iznos točan (uklj. sc. 7, n=80) | 70/80 | 70/80 | automatski |
| točan broj stavki (n=80) | 50/80 = 62,5 % | 70/80 = 87,5 % | automatski |
| točne količine (n=80) | 50/80 = 62,5 % | 70/80 = 87,5 % | automatski |
| ispravna odluka obraditi/odbiti (n=80) | 70/80 = 87,5 % | **80/80 = 100 %** | automatski |
| `amount_status` = `read` | 100/110 | 100/110 | automatski |
| `amount_status` = `missing` | 10/110 (sc. 11) | 0 | automatski |
| `amount_status` = `foreign_currency` | 0 | 0 | automatski |

> Onih 10 promašaja iznosa kod obje izvedbe je scenarij 7, gdje iznosa nema jer je
> ispravan ishod odbijanje. Nad sedam stvarnih ponuda obje izvedbe pogađaju iznos
> u svih 70 pokušaja.

**Po scenariju — iznos / broj stavki, pogodaka od 10**

| Sc. | samoposlužena | distribuirana |
|---|---|---|
| 1 | 10 / 10 | 10 / 10 |
| 2 | 10 / **0** | 10 / 10 |
| 3 | 10 / 10 | 10 / 10 |
| 4 | 10 / 10 | 10 / 10 |
| 5 | 10 / 10 | 10 / 10 |
| 6 *(izuzet)* | 10 / 10 | 10 / 10 |
| 7 (odbijanje) | 0 / 0 | 0 / 0 |
| 8 fotografija | 10 / **0** | 10 / 10 |
| 9 | 10 / 10 | 10 / 10 |
| 10 *(izuzet)* | **0 / 0** | 10 / 10 |
| 11 *(izuzet)* | **0 / 0** | 10 / 10 |

### 3.4 Naziv stavke — PRIMARNA MJERA *(H1)*, RUČNO bodovano

| Mjera | Samoposlužena | Distribuirana | Bodovao | Datum |
|-------|---------------|---------------|---------|-------|
| sadržajno ispravni nazivi %, kriterij **B — naručivost** *(vrijedi)* | **89,2** *(58 od 65)* | **77,8** *(49 od 63)* | prijedlog AI, autor potvrdio i postrožio | 8. 9. 2026. |
| isto, kriterij A — prepoznatljivost *(za usporedbu)* | 89,2 *(58 od 65)* | 98,4 *(62 od 63)* | — | 8. 9. 2026. |
| od toga duplikati (izvan nazivnika) | 18 | 0 | — | |
| duljina naziva, medijan (znakova) | 46 | 39 | automatski | 8. 9. 2026. |
| duljina naziva, max | 68 | 67 | automatski | 8. 9. 2026. |

> Ograničenje polja je 200 znakova; nijedna izvedba ga nije ni približila, uključujući
> scenarij 5 čiji izvorni opisi granicu premašuju. Skraćivanje radi obje.

> **Postupak i njegovo ograničenje.** Nazivi se ne mogu usporediti doslovno pa se boduju
> ručno, po pravilu „bi li službenik nabave iz naziva prepoznao što se nabavlja".
> Bodovan je jedan reprezentativni pokušaj po scenariju i izvedbi (opravdano jer je
> samoposlužena izvedba dala jedan ishod u svih 10 ponavljanja). Ocjene je **predložio
> jezični model, a autor ih je pregledao i potvrdio** — postupak se u radu navodi upravo
> tako, jer ocjenjivač nije neovisan o mjerenju. Duplikati se ne broje u nazivnik:
> ponavljanje stavke već je obuhvaćeno mjerom broja stavki (§ 3.3).
>
> Duplikati se utvrđuju strojno — doslovno isti niz znakova unutar istog scenarija i
> izvedbe (18 redaka, svih 18 kod samoposlužene u scenariju 2) — pa nisu predmet prosudbe.
>
> Dva su slučaja bila sporna i autor je oba potvrdio kao **ne odgovara**: redak
> *„Akademski popust (10 %)"* (redak ponude, ali ne stavka nabave) i skraćenica
> *„MOSFETs N-Ch"* koja ne razlikuje dvije različite stavke iz iste ponude. Da su
> ocijenjeni suprotno, udjeli bi bili 90,8 % i 100,0 %.
>
> Autor je pregledao svih 128 redaka koji se ocjenjuju ručno i potvrdio prijedlog bez
> izmjena (8. 9. 2026.).

**Kriterij ocjene.** Naziv se ocjenjuje kao ispravan ako se po njemu stavka može
**naručiti**, a ne samo prepoznati: mora zadržati oznaku modela ili tehničku
specifikaciju iz ponude. Kriterij je izabran nakon provjere podudarnosti (dolje), gdje su
se obje procjene razišle upravo na toj granici, i primijenjen je jednako na obje izvedbe.
Radi transparentnosti navodi se i blaži kriterij (prepoznatljivost).

Postrožavanje ne dira samoposluženu izvedbu jer ona nazive vraća doslovno; svih 14
promjena pada na distribuiranu, koja skraćuje. Ishod je time nepovoljniji za referentnu
izvedbu, a ne za onu koju rad zagovara.

**Provjera podudarnosti** (8. 9. 2026.) — autor je naslijepo bodovao 30 naziva, bez uvida
u predložene ocjene. Uzorak stratificiran po predloženoj ocjeni (svih 8 „ne odgovara" +
22 nasumična „odgovara", sjeme 42), duplikati izuzeti jer se utvrđuju strojno.

| Mjera | Vrijednost |
|---|---|
| ukupna podudarnost | **28/30 = 93,3 %** |
| slaganje na „ne odgovara" | **8/8 = 100 %** |
| slaganje na „odgovara" | 20/22 = 90,9 % |
| neslaganja | 2, oba u istom smjeru (autor stroži) |

Oba neslaganja su ista vrsta i oba kod **distribuirane** izvedbe: skraćeni naziv zadržava
vrstu artikla, ali gubi specifikaciju po kojoj se naručuje — *„Univerzalni strujni
adapter"* umjesto *„…230V/3-12V DC max. 27W 2,25A"* i *„Ljubičasti laserski modul"*
umjesto *„…12x45mm, 0.5mW, 650nm, linijski"*. Ocjenjivači se, dakle, ne razilaze
nasumično nego po jednoj granici: **koliko skraćivanja naziv podnosi prije nego prestane
biti naručiv**. Stroža granica snizila bi rezultat distribuirane izvedbe, ne
samoposlužene, jer samoposlužena nazive vraća doslovno.

### 3.5 Upozorenja i odbijanja poslužitelja

| Mjera | Samoposlužena | Distribuirana |
|-------|---------------|---------------|
| pokušaja s `warnings` | 0 | 0 |
| HTTP 422 (nije izvukao stavke) | 0 | 10 (sc. 7, **očekivano**) |
| `truncated` | 0 | 0 |
| nepostojeća kategorija u pozivu | 0 | 0 |

**Scenarij 7 — dokument koji nije ponuda:** distribuirana ga odbija 10/10 puta;
samoposlužena ga 10/10 puta obradi i izvuče dvije stavke iz računa za komunalne usluge
(*„vodne usluge - ukupno"*, *„Javna usluga prikupljanja kom. otpada - ukupno"*) s
iznosom 44,53 €. To je najozbiljnija razlika u ponašanju izmjerena u ovom prolazu.

### 3.6 Dosljednost kroz ponavljanja

| Izvedba | različitih ishoda po scenariju (p50) | scenarija s jednim ishodom |
|---------|--------------------------------------|-----------------------------|
| samoposlužena | 1 | **11/11 = 100 %** |
| distribuirana | 2 | 4/11 = 36,4 % |

Samoposlužena izvedba daje bit-jednak ishod u svih 10 ponavljanja svakog scenarija.
Sjeme radi. Distribuirana varira u sedam od jedanaest scenarija jer sučelje sjeme ne
podržava.

### 3.7 Po vrsti ponude

| Vrsta | Samoposlužena | Distribuirana |
|-------|---------------|---------------|
| PDF s tekstom, jednostranična (sc. 1) | iznos i stavke točni | isto |
| PDF s tekstom, višestranična (sc. 2) | iznos točan, stavke udvostručene | oboje točno |
| PDF s rabatom (sc. 3) | oboje točno | oboje točno |
| dvije ponude (sc. 4) | oboje točno | oboje točno |
| dugački opisi (sc. 5) | oboje točno | oboje točno |
| nije ponuda (sc. 7) | **ne prepoznaje** | odbija 10/10 |
| fotografija papira (sc. 8) | iznos točan, nazivi neupotrebljivi | oboje točno |
| negativna stavka (sc. 9) | oboje točno | oboje točno |
| četiri ponude (sc. 10, izuzet) | iznos jedne ponude umjesto zbroja | zbroj točan |
| snimka zaslona (sc. 11, izuzet) | 3 stavke, iznos nepročitan | 4 stavke, iznos točan |

**Cijena slikovnog kanala** (sc. 1 naspram sc. 11, isti dokument): distribuirana izvedba
ne gubi ništa; samoposlužena gubi jednu stavku, ponavlja drugu i ne pročita iznos.

---

## 4. Istodobnost *(H3)*

> Pokus 8. 9. 2026., `concurrencyProbe.js`, scenarij 1, razine 1/3/5.
> Svaka usporedna obrada ide nad **vlastitim** zahtjevom — nad istim bi ih brava retka
> (`FOR UPDATE`) serijalizirala i mjerila bi se brava, ne čvor.

| Istodobnih | Izvedba | p50 (s) | p95 (s) | uspjelo | neuspjelih | RAM modela (GB) | RAM sustava (GB) |
|-----------|---------|---------|---------|---------|------------|------------------|-------------------|
| 1 | samoposlužena | 84,2 | 84,2 | 1/1 | 0 | 3,42 | 13,7 |
| 3 | samoposlužena | 207,7 | 236,2 | 3/3 | 0 | 3,43 | 13,2 |
| 5 | samoposlužena | 278,9 | — | **1/5** | **4** (`fetch failed`, bez HTTP statusa) | 3,43 | 13,4 |
| 1 | distribuirana | 9,9 | 9,9 | 1/1 | 0 | — | 13,0 |
| 3 | distribuirana | 9,2 | 9,4 | 3/3 | 0 | — | 12,8 |
| 5 | distribuirana | 9,4 | 9,9 | 5/5 | 0 | — | 12,7 |

**Stvarna vršna istodobnost Veleučilišta:** 1 · **Podnosi li je čvor:** **da**

**Ali bez rezerve.** Pri tri usporedne obrade odziv se utrostručuje (84 → 208 s), a pri pet
četiri od pet padaju. Memorija nije uzrok — model zauzima 3,4 GB, sustav ostaje na 12,7–13,7
od 16 GB kroz sve razine; grlo je računanje. Distribuirana izvedba ne pokazuje **nikakvu**
degradaciju do pete razine.

> **Napomena o usporedivosti:** sonda za razinu 1 daje 84,2 s, a kampanja za isti scenarij
> medijan 73,7 s. Razlika od oko 14 % vjerojatno potječe od uzorkovanja resursa svakih
> 500 ms koje sonda usput vrti. Vrijednosti iz sonde uspoređuju se međusobno, ne s
> vrijednostima iz kampanje.

---

## 5. Suživot komponenti na istom čvoru *(H4)*

> Pokus 8. 9. 2026., `appLatencyProbe.js`, 20 krugova, razmak 250 ms, scenarij 2.
> Ritam poziva izjednačen je u obje faze; obrada je trajala 103,6 s (samoposlužena)
> odnosno 18,4 s (distribuirana).

**Samoposlužena izvedba — model radi na istom čvoru**

| Operacija | U mirovanju p50 | Pod obradom p50 | Pod obradom p95 | Promjena |
|-----------|-----------------|------------------|------------------|----------|
| dohvat popisa zahtjeva | 23,5 ms | 24,0 ms | 27 ms | +2,1 % |
| otvaranje zahtjeva | 4 ms | 5 ms | 8 ms | +25 % |
| spremanje izmjene | 6 ms | 5 ms | 7 ms | −16,7 % |

Najveća pojedinačna vrijednost u cijelom mjerenju: **48 ms**.

**Distribuirana izvedba — kontrola, obrada je izvan čvora**

| Operacija | U mirovanju p50 | Pod obradom p50 | Promjena |
|-----------|-----------------|------------------|----------|
| dohvat popisa zahtjeva | 28 ms | 27,5 ms | −1,8 % |
| otvaranje zahtjeva | 4 ms | 4 ms | 0 % |
| spremanje izmjene | 5 ms | 5 ms | 0 % |

**Zaključak o suživotu:** aplikacija ostaje neometana. Onih +25 % kod otvaranja zahtjeva
je jedna milisekunda u apsolutnom iznosu, dakle šum mjerenja, a ne opterećenje. I najgori
zabilježeni odziv pod obradom dvadeset je puta ispod praga od jedne sekunde.

---

## 6. Resursni otisak čvora

> Uzorkovanje `powermetrics`, interval 5 s. Mjeri se **snaga čipa**, ne uređaja na
> utičnici — donja granica stvarne potrošnje.

| Mjera | Mirovanje | Tijekom kampanje |
|-------|-----------|------------------|
| snaga SoC-a, medijan | 1,74 W | **12,92 W** |
| snaga SoC-a, prosjek | 6,59 W | 11,17 W |
| snaga SoC-a, p95 | 15,11 W | 14,95 W |
| snaga SoC-a, max | 18,61 W | 17,94 W |
| **toplinski pritisak** | Nominal | **Nominal — kroz cijele dvije sata, bez iznimke** |

> Mirovanje je izmjereno u satu prije kampanje (03:38–04:37); prosjek je viši od medijana
> jer u tom razdoblju nije bio potpuno miran (priprema, zagrijavanje modela).

**Energija po jednoj obradi, iznad mirovanja**

| Izvedba | medijan | prosjek |
|---------|---------|---------|
| samoposlužena | **476 J (0,132 Wh)** | 636 J (0,177 Wh) |
| distribuirana | ~0 J | 3,3 J |

Kod distribuirane izvedbe čip miruje dok se čeka odgovor, pa je energijski trošak na
uređaju ustanove zanemariv.

**Energija po scenariju, samoposlužena (medijan, J iznad mirovanja):**
sc. 1 — 920 · sc. 2 — 782 · sc. 3 — 427 · sc. 4 — 1003 · sc. 5 — 452 · sc. 6 — 470 ·
sc. 7 — 398 · sc. 8 — 669 · sc. 9 — 318 · sc. 10 — 1134 · sc. 11 — 463

**Ukupno za 110 lokalnih obrada:** 19,4 Wh.

**Memorija čvora** (uzorkovano tijekom pokusa istodobnosti, svakih 500 ms)

| Mjera | 1 obrada | 3 istodobne | 5 istodobnih |
|---|---|---|---|
| rezidentna memorija modela | 3,42 GB | 3,43 GB | 3,43 GB |
| memorija sustava u upotrebi | 13,7 GB | 13,2 GB | 13,4 GB |

Memorija se s brojem istodobnih obrada ne mijenja — model se ne učitava višekratno.
Od 16 GB ostaje 2,3–3,3 GB slobodno u svim razinama.

**Zagrijavanje kroz prolaz** — medijan trajanja po krugu (samoposlužena, s):

| krug | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| | 39,7 | 37,0 | 37,0 | 37,0 | 36,8 | 37,0 | 36,9 | 36,9 | 36,9 | 36,9 |

Trajanja **ne rastu**. Prvi je krug neznatno sporiji (učitavanje predložaka), nakon čega
je vrijednost ravna do kraja. Uz toplinski pritisak koji nikad nije napustio `Nominal`,
zaključak je da zagrijavanje pri ovom opterećenju nije ograničenje.

---

## 7. Dostupnost bez vanjske veze *(H5)*

> Pokus 8. 9. 2026., 16:20–16:24. Scenarij 2 (višestranična ponuda), po jedan pokušaj
> svakom izvedbom u svakoj inačici. Prekid izveden gašenjem mrežnog sučelja, potvrđen
> probnim paketom. Oznaka prolaza `smoke` — ne ulazi u konačne podatke.

| Scenarij | Samoposlužena | Distribuirana |
|----------|---------------|---------------|
| Veza prekinuta **prije** obrade | **prolaz** — 71 487 ms, 42 stavke, iznos 50 677,88 € | **pad** — „AI obrada ponude nije uspjela. Pokušajte ponovno." |
| Veza prekinuta **usred** obrade | **prolaz** — 72 597 ms, 42 stavke, iznos 50 677,88 €; prekid nakon ~20 s bez ikakvog učinka | **pad** — ista poruka; prekid nakon 5 s |
| Ostaje li polovičan zapis u bazi? | ne | **ne** |
| Vrijeme oporavka | nije primjenjivo — obrada nije ni prekinuta | obrada se ne nastavlja; korisnik ponavlja radnju |

**Usporedba sa spojenom mrežom:** ista obrada uz vezu traje 73 042 ms. Razlika prema
prolazima bez veze je 1,5 s odnosno 0,4 s — unutar uobičajenog raspršenja. Samoposlužena
izvedba nema mjerljivu ovisnost o vanjskoj vezi.

**Provjera djelomičnog upisa** (stanje baze iz popratnog zapisa, broj stavki):

| Pokušaj | prije → poslije | tumačenje |
|---|---|---|
| samoposlužena, bez veze | 733 → 775 | +42, obrada dovršena |
| distribuirana, bez veze | 775 → 776 | +1 — samo prazna stavka koju mjerni program upiše pri pripremi zahtjeva |
| distribuirana, prekid usred | 776 → 777 | +1 — isto |
| samoposlužena, prekid usred | 777 → 819 | +42, obrada dovršena |

Kod oba pada distribuirane izvedbe u bazu nije ušla nijedna stavka iz obrade —
transakcija je izvršena u cijelosti ili nikako. Ona jedna stavka artefakt je mjernog
programa, koji zahtjev stvara s praznom stavkom; u produkciji zahtjev već sadrži
korisnikove stavke i one pri padu ostaju netaknute.

**Opis ponašanja:** aplikacija pri nedostupnoj vanjskoj usluzi ne pada nego vraća
poruku korisniku, a zahtjev ostaje u zatečenom stanju.

---

## 8. Lokalnost podataka *(H6)*

> Pokus 8. 9. 2026., 14:07–14:15. Zapis mrežnog prometa na djelatnom sučelju (`en1`)
> tijekom po jedne obrade svakom izvedbom, scenarij 2. Uz pakete zabilježeni i upiti za
> razrješavanje imena.

| Izvedba | Upiti za imenom pružatelja | Promet prema pružatelju | Prelazi li sadržaj ponude izvan mreže? |
|---------|----------------------------|--------------------------|-----------------------------------------|
| samoposlužena | **nijedan** | **nijedan paket** | **ne** |
| distribuirana | `generativelanguage.googleapis.com` → `172.217.112.4` | **11 888 B poslano**, 20 675 B primljeno, 14:15:01–14:15:21 | **da** |

Prijenos prema pružatelju poklapa se s trajanjem obrade u sekundu. Volumen odgovara
veličini dokumenta predanog modelu (medijan ulaznih tokena za taj scenarij: 3580).

**Odredišta u zapisu samoposlužene izvedbe** (381 s snimanja, 1448 paketa) — sva
pripadaju programima koji s mjerenim sustavom nemaju veze i navode se radi potpunosti:

| Odredište | Poslano | Što je |
|---|---|---|
| `claude.ai` (160.79.104.10) | 294 179 B | aplikacija u kojoj je autor tijekom pokusa vodio razgovor |
| `browser-intake-us5-datadoghq.com` | 88 567 B | telemetrija iste aplikacije |
| `s-0005.dual-s-msedge.net`, `onedscolprdneu56…` | 21 214 B | telemetrija sustavskih programa |

Nijedno od njih nije mjereni sustav, i nijedno nije Googleova usluga jezičnog modela.

**Ograničenje:** promet prema udaljenoj usluzi je šifriran, pa se sadržaj ponude u zapisu
ne vidi niti se tvrdi da je viđen. Zaključak se izvodi iz odredišta, volumena i
vremenskog poklapanja, a kod samoposlužene izvedbe iz **odsutnosti** i imena i prometa.

Uvjeti pružatelja o obradi i treniranju: ‹popuniti + izvor s datumom› · DPA: ‹da/ne›

---

## 9. Trošak *(H7)*

**Pretpostavke — `server/eval/cost-assumptions.json`**

| Stavka | Vrijednost | Izvor i datum |
|--------|-----------|---------------|
| Cijena uređaja | 800 € | podaci vlasnika uređaja (tržišni raspon 779–800 €) |
| Vijek / amortizacija | 5 godina, bez ostatka vrijednosti | pretpostavka autora |
| Horizont ocjene H7 | 36 mjeseci | prag iz Tablice 3 |
| Snaga pod opterećenjem | **12,92 W (medijan SoC-a)** — donja granica | izmjereno 8. 9. 2026. |
| Snaga u mirovanju | 1,74 W (SoC) | izmjereno 8. 9. 2026. |
| Energija po obradi, iznad mirovanja | 0,177 Wh (prosjek), 0,132 Wh (medijan) | izmjereno |
| Tarifa kWh | 0,0913 €/kWh (jedinstvena) | cjenik opskrbljivača; **v. napomenu** |
| Cijena tokena | 1,50 / 9,00 USD po milijunu (ulaz/izlaz) | cjenik pružatelja, 7. 9. 2026. |
| Tečaj | 1 USD = 0,8604371 EUR | ESB, 4. 9. 2026. |
| Tokena po obradi, distribuirana | 3181 ulaz / 287 izlaz (prosjek nad bodovanima) | izmjereno |
| Volumen | **300 obrada godišnje** (raspon 300–500) | razgovor sa službom nabave, 13. 7. 2026. |

> **Napomena o tarifi i snazi.** Datoteka pretpostavki još navodi snagu od 65 W s oznakom
> „nije izmjereno" — to treba zamijeniti izmjerenih 12,92 W. Tarifa od 0,0913 €/kWh je
> vjerojatno samo energetski dio; ako se uzme puna cijena s prijenosom i PDV-om
> (0,15–0,20 €/kWh), godišnji trošak energije raste s 0,0065 € na 0,0124 € — razlika bez
> ikakvog učinka na zaključak.

**Trošak po jednoj obradi**

| Izvedba | Trošak | Sastavnice |
|---------|--------|-----------|
| samoposlužena, **puno pripisivanje** | 0,533 € pri 300/god. (0,400 € pri 400/god.) | amortizacija 160 €/god. + energija |
| samoposlužena, **granično pripisivanje** | **0,000016 €** | samo energija (0,177 Wh) |
| distribuirana | **0,00633 €** | tokeni |

**Godišnji trošak i omjer**

| Volumen | samoposlužena (puno) | distribuirana | omjer |
|---|---|---|---|
| 300 | 160,00 € | 1,90 € | 84× |
| 400 | 160,00 € | 2,53 € | **63×** |
| 500 | 160,00 € | 3,16 € | 51× |

**Kroz horizont od 36 mjeseci**

| Izvedba | Ukupno (pri 300/god.) | Ukupno (pri 400/god.) |
|---|---|---|
| samoposlužena, puno pripisivanje | **480,00 €** | **480,00 €** |
| samoposlužena, granično pripisivanje | **0,01 €** | **0,02 €** |
| distribuirana | **5,70 €** | **7,59 €** |

**Točka pokrića kao krivulja** (puno pripisivanje, preko raspona cijene oblaka)

| Množitelj cijene oblaka | Točka pokrića (obrada/god.) |
|---|---|
| 0,25× | 101 126 |
| 0,5× | 50 563 |
| 0,75× | 33 709 |
| 1× | **25 281** |
| 1,25× | 20 225 |
| 1,5× | 16 854 |
| 1,75× | 14 447 |
| 2× | 12 641 |

**Nalaz.** Pod punim pripisivanjem troška uređaja samoposlužena izvedba postaje jeftinija
tek iznad **25 281 obrade godišnje** — 84 puta više od stvarnog opsega ustanove. Ni pri
dvostruko skupljem oblaku točka pokrića ne pada ispod 12 600, što je i dalje 42 puta više
od stvarnog opsega. Pod graničnim pripisivanjem, gdje uređaj ionako postoji zbog
aplikacije i baze, samoposlužena je izvedba jeftinija odmah i za tri reda veličine.

**H7 je time i opovrgnut i potvrđen, ovisno o načinu pripisivanja** — i to nije
nedosljednost nego nalaz: odluka o trošku ne ovisi o mjerenju nego o tome pripisuje li se
uređaj obradi ponuda ili sustavu koji na njemu ionako radi.

---

## 10. Ponderirana matrica odlučivanja

| # | Kriterij | Težina | Ocjena samopos. | Ponder S | Ocjena distrib. | Ponder D | Iz čega |
|---|----------|--------|------------------|----------|------------------|----------|---------|
| 1 | Točnost iznosa i stavki | 5 | 3 | 15 | 4 | 20 | iznos 100 % obje; stavke 62,5 naspram 87,5 %; nazivi 89,2 naspram 77,8 % |
| 2 | Točnost dodjele kategorije | 2 | 3 | 6 | 4 | 8 | 57,1 naspram 76,8 % strogo; obje iznad polazišnih 23,8 % |
| 3 | Odziv | 4 | 3 | 12 | 5 | 20 | p50 49,3 naspram 4,9 s; prag 60 s prijeđen, četiri scenarija preko |
| 4 | Istodobnost i suživot | 3 | 3 | 9 | 5 | 15 | vršna istodobnost 1 podnesena; pri 5 pada 4/5; aplikacija neometana (48 ms) |
| 5 | Resursni otisak | 2 | 3 | 6 | 5 | 10 | 476 J i 3,42 GB po obradi naspram ~0 J na uređaju ustanove |
| 6 | Trošak | 4 | 3 | 12 | 4 | 16 | 480 € naspram 7,59 € (puno pripisivanje); 0,02 € (granično) |
| 7 | Sigurnost i lokalnost | 5 | 5 | 25 | 2 | 10 | nijedan paket izvan mreže naspram 11 888 B pružatelju |
| 8 | Dostupnost bez veze | 3 | 5 | 15 | 1 | 3 | obrada dovršena i pri prekidu usred naspram pada obiju obrada |
| 9 | Održavanje | 3 | 2 | 6 | 4 | 12 | vlastito ažuriranje modela i nadzor naspram pružateljevog |
| 10 | Neovisnost o dobavljaču | 2 | 5 | 10 | 2 | 4 | model na disku naspram jedne vanjske ovisnosti |
| 11 | Skalabilnost i granice | 2 | 2 | 4 | 5 | 10 | zid na 5 istodobnih naspram ravne krivulje do 5 |
| | **UKUPNO** | **35** | | **120** | | **128** | od najviše 175 |

**68,6 % naspram 73,1 % mogućega.** Razlika je 8 bodova od 175, odnosno 4,6 postotnih
bodova, i cijela dolazi s kriterija izvedbe (1–6, 11). Samoposlužena izvedba vodi na sva
tri kriterija povjerenja — sigurnost i lokalnost, dostupnost bez veze, neovisnost o
dobavljaču — koji zajedno nose 10 od 35 težinskih bodova.

> Ocjene 1–5 izveo autor iz izmjerenih vrijednosti u § 1–9, potvrdio 8. 9. 2026.
> Težine su određene unaprijed, u Tablici 3 metodologije, prije mjerenja.

---

## 11. Provjera hipoteze

| # | Tvrdnja | Prag | Izmjereno | Potvrđeno? |
|---|---------|------|-----------|-----------|
| H1 | točnost iznosa i stavki iznad praga | iznos ≥ 90 %, stavke ≥ 90 % | iznos **100 %** (70/70); broj stavki 62,5 % (80), količine 62,5 %; nazivi 89,2 % | **djelomično** — iznos da, stavke ne |
| H1s | *(dopunski)* kategorija naspram polazišne | — | 57,1 % strogo / 71,4 % blago, polazišna 23,8 % | iznad polazišne |
| H2 | odziv prihvatljiv | medijan ≤ 60 s | **49,3 s** (bodovani), 37,0 s (svi) | **da**, uz četiri scenarija preko praga |
| H3 | podnosi vršnu istodobnost | 1 | pri 1: 84,2 s, 1/1; pri 3: 207,7 s, 3/3; pri 5: 1/5 | **da**, ali bez rezerve |
| H4 | ne ugrožava ostatak sustava | < 1 s | najgori odziv pod obradom 48 ms; p50 promjene +2,1 % / +25 % (1 ms) / −16,7 % | **da** |
| H5 | radi bez vanjske veze | binarno | obrada dovršena i pri prekinutoj vezi i pri prekidu usred obrade, bez djelomičnog upisa | **da** |
| H6 | podaci ne napuštaju ustanovu | binarno | nijedan upit ni paket prema pružatelju; distribuirana šalje 11 888 B na `generativelanguage.googleapis.com` | **da** |
| H7 | niži trošak u 36 mj. | binarno | puno pripisivanje 480 € naspram 7,59 €; granično 0,02 € naspram 7,59 € | **ovisi o pripisivanju** |

**Ukupni odgovor:** svih sedam tvrdnji ima izmjerenu podlogu. Ponderirana matrica daje
120 naspram 128 od 175 — samoposlužena izvedba postiže 93,8 % rezultata referentne,
uz vodstvo na sva tri kriterija povjerenja. Razrada u poglavlju 4.

---

## 12. Grafovi

| Oznaka | Vrsta | Podaci iz | Datoteka | Poglavlje |
|--------|-------|-----------|----------|-----------|
| Slika 1 | dijagram dviju izvedbi | — | (u 3.2) | Metodologija |
| Slika 2 | dijagram mjernog postava | — | `postav.png` | Metodologija |
| Slika 3 | točnost po mjerama + polazišna 23,8 % | § 3.2, § 3.3 | `slika5_tocnost.png` | 4.1 |
| Slika 4 | zamjene kategorija po granicama | § 3.2 | `slika6_zamjene_kategorija.png` | 4.1.1 |
| Slika 5 | box plot — odziv po izvedbi | § 1 | `slika3_odziv_box.png` | 4.2 |
| Slika 6 | odziv po scenariju | § 1 | `slika4_odziv_scenariji.png` | 4.2 |
| Slika 7 | snaga SoC-a: prolaz i isječak | § 6 | `slika7_snaga.png` | 4.4 |
| Slika 8 | trajanje po krugu — zagrijavanje | § 6 | `slika8_krugovi.png` | 4.4 |
| Slika 9 | krivulja isplativosti 0,25×–2× | § 9 | `slika9_tocka_pokrica.png` | 4.7 |

**Tablice u poglavlju 4:** 6 točnost · 7 istodobnost · 8 dostupnost bez veze · 9 trošak ·
10 ponderirana matrica. Nastavljaju numeraciju iz poglavlja 3 (Tablice 1–5).

> Naziv datoteke ne prati broj slike — brojevi slijede redoslijed pojavljivanja u tekstu.

> Sve slike crta `grafovi/g1.py` i `grafovi/g2.py` iz `run.jsonl` i zapisa `powermetrics`.
> Točka pokrića na Slici 9 računa se kao amortizacija / cijena po obradi u oblaku, bez
> granične energije lokalne izvedbe (1,6 × 10⁻⁵ €, utjecaj 0,3 %) — jednako kao `evalCost.js`.
