# BROJEVI — jedini izvor izmjerenih vrijednosti

> **Pravilo:** nijedan broj ne ulazi u tekst rada ako nije ovdje.
> Popunjava se **skriptom iz JSONL-a**, ne prepisivanjem.
> Definicije mjera i klase grešaka drži `docs/mjerni-plan.md` — ovdje su samo vrijednosti.
> Uz svaku vrijednost mora biti jasno je li dobivena **automatski** ili **ručno**.

**Mjerena ruta:** `POST /api/requests/:id/ai-items` (čitanje priložene ponude, zamjena stavki)

**`run_id`:** ‹popuniti› · **`run_kind`:** `final` · **datum:** ‹popuniti›
**commit aplikacije:** ‹popuniti› · **commit harnessa:** ‹popuniti› · **dirty:** false
**`prompt_variant`:** `names_only` (s poslužitelja, `/version`)

> Runovi različite vrste se ne spajaju. Pilot se citira kao pilot, nikad kao rezultat.
> Odrezan odgovor (`finish_reason` = `length` / `MAX_TOKENS`) poništava run.

---

## 0. Uvjeti mjerenja

| Stavka | Vrijednost |
|--------|-----------|
| Uređaj | Mac Mini M4, 16 GB objedinjene memorije |
| Što na njemu radi | ‹popuniti — aplikacija, baza, Ollama, …› |
| OS / Ollama verzija | ‹popuniti› |
| Samoposlužena izvedba | `gemma4:e2b` |
| Distribuirana izvedba | `gemini-2.5-flash`, `modelVersion` iz odgovora: ‹popuniti› |
| Endpoint / regija | ‹popuniti› |
| Vrsta veze prema internetu | ‹popuniti› |
| Osnovni RTT do endpointa | ‹ms, medijan od N› |
| Uzorkovanje | temp 0, top_p 1, max 4096; sjeme 42 **samo Ollama**; `top_k` neizjednačen |
| Warm-up lokalnog modela | ‹izveden / nije› |
| Scenariji u runu | 1, 2, 3, 4, 9, 10 (+ nove ponude: ‹popisati›) |
| Ponavljanja po scenariju i izvedbi | ‹popuniti› |
| Stanje baze prije prvog pokušaja | ‹snimka: popuniti› |

**Opterećenje Veleučilišta (sidro hipoteze):**
nabava godišnje ‹popuniti› · vršna istodobnost ‹popuniti› · izvor ‹popuniti›

**Provjera mjerila** (`server/scripts/verifyProvenance.js`, commit `6d93bbe`) — nad
sedam izvođenih scenarija:

| Mjera | Vrijednost |
|---|---|
| unosa provenance ukupno (s ugniježđenima) | 190 |
| od toga s citatom | 131 |
| provjerljivo protiv teksta priloga | 125 |
| **prolazi provjeru doslovnosti i retka** | **125 (sve)** |
| bez citata — dodjela iz codebooka | 59 (55 jedinstvenih stavki) |

Tekst se izvlači istim putem kojim ga izvlači mjerena ruta. `line` je nula-indeksiran.

---

## 1. Odziv

> Medijan i p95, **nikad prosjek**. `rate_limit_wait_ms` odbijen od `latencyMs`;
> sirova vrijednost se zadržava kao zaseban nalaz o kvoti.

| Izvedba | N | p50 (ms) | p95 (ms) | min | max | Izvor |
|---------|---|----------|----------|-----|-----|-------|
| samoposlužena | | | | | | |
| distribuirana | | | | | | |

**Po pojedinom pozivu modelu** (`model_call_latencies_ms[]` — p50/p95 se iz zbroja ne računaju)

| Izvedba | broj poziva (p50) | trajanje poziva p50 | p95 | Izvor |
|---------|-------------------|---------------------|-----|-------|
| samoposlužena | | | | |
| distribuirana | | | | |

**Razlaganje odziva — cijena prelaska mreže**

| Izvedba | mrežni RTT (ms) | vrijeme obrade (ms) | ukupno | udio mreže % | Izvor |
|---------|-----------------|---------------------|--------|--------------|-------|
| samoposlužena | — | | | 0 | |
| distribuirana | | | | | |

**Čekanje na kvotu** (zaseban nalaz, ne dio brzine modela)

| Izvedba | `rate_limit_wait_ms` p50 | p95 | udio pokušaja s čekanjem % |
|---------|--------------------------|-----|-----------------------------|
| distribuirana | | | |

**Po scenariju**

| Scenarij | Izvedba | p50 (ms) | p95 (ms) |
|----------|---------|----------|----------|
| | | | |

---

## 2. Potrošnja tokena

> Odvojeno po izvedbi, nikad kao omjer — različiti tokenizatori.

| Izvedba | ulazni (p50) | izlazni (p50) | izlazni tokeni/s (p50) | Izvor |
|---------|--------------|---------------|------------------------|-------|
| samoposlužena | | | | |
| distribuirana | | | | |

---

## 3. Točnost čitanja ponude

> **Podjela mjere.** Nosivi dio i jedini koji ulazi u prag H1: **iznos i stavke**
> (§ 3.3 i § 3.4). Dopunska mjera bez praga: **dodjela kategorije** (§ 3.2), gdje je
> glavna brojka blago bodovanje, a strogo se navodi uz nju.
> Raspodjela grešaka po klasama (§ 3.1) opisuje narav grešaka u oba dijela.

### 3.1 Raspodjela grešaka po klasama

> Nije „stopa izmišljanja". Klase: `supported`, `derived`, `misgrounded`, `fabricated`, `contradicted`.

| Polje | Klasa | Samoposlužena (n) | Distribuirana (n) |
|-------|-------|-------------------|-------------------|
| `total_amount` | supported | | |
| `total_amount` | derived | | |
| `total_amount` | misgrounded | | |
| `total_amount` | fabricated | | |
| `total_amount` | contradicted | | |
| `quantity` | supported | | |
| `quantity` | misgrounded | | |
| `quantity` | fabricated | | |
| `item_name` | ‹odluka čeka — v. mjerni plan § 8› | | |

**`item_name` — prag odluke:** ≥ 80 % `obvious` → ulazi u mjeru utemeljenosti; ispod →
izlazi, a parafraziranje se opisuje kao razlika u ponašanju. Izmjereno: ‹popuniti›

### 3.2 Dodjela kategorije — DOPUNSKA MJERA, ne ulazi u prag H1

> Šifrarničko polje ne može biti izmišljeno — samo krivo dodijeljeno.
> **Glavna brojka je blago bodovanje** (je li kategorija obranjiva); strogo se navodi
> uz nju. Model bira između **33 kategorije** iz baze; zlatni standard obuhvaća
> **55 jedinstvenih stavki** u sedam scenarija.

**Polazišna vrijednost većinske klase: 25,4 %** nad 59 bodovanih stavki
*(27,3 % nad 55 jedinstvenih; 65,0 % vrijedilo je za stari šifrarnik od šest kategorija)*
*Uvijek stoji u istoj tablici kao rezultati.*

Raspodjela zlatnog standarda (59 bodovanih stavki, šifrarnik od 33 kategorije):

| Kategorija | Stavaka | Udio |
|---|---|---|
| Elektronička i elektrotehnička oprema | 15 | 25,4 % |
| Nastavna i laboratorijska oprema | 13 | 22,0 % |
| Računalna oprema | 13 | 22,0 % |
| Mjerna i ispitna oprema | 6 | 10,2 % |
| Mrežna i telekomunikacijska oprema | 5 | 8,5 % |
| Usluge razvoja i održavanja informacijskih sustava | 2 | 3,4 % |
| ostalih pet kategorija | po 1 | po 1,7 % |

Spornih (s prihvatljivim alternativama): **56 od 59**. Osam stavki ima tri prihvatljive
kategorije, 44 ih ima dvije.

| Izvedba | strogo % | blago % | razlika | Wilsonov interval (strogo) | Izvor |
|---------|----------|---------|---------|-----------------------------|-------|
| samoposlužena | | | | | |
| distribuirana | | | | | |
| **polazišna (većinska klasa)** | 65,0 | — | — | — | codebook |

**Razlaganje razlike strogo/blago po granicama**

> Za svaku strogo pogrešnu dodjelu koja prolazi blago bilježi se par
> (očekivana → odabrana). U mjerilu je najzastupljenija granica laboratorijsko naspram
> elektroničkog: 21 od 55 stavki u oba smjera, 38 % skupa. Nosi li ona i izmjerenu
> razliku, vidjet će se tek iz rezultata.

| Granica (očekivana → odabrana) | Samoposlužena | Distribuirana |
|---|---|---|
| Elektronička → Nastavna i laboratorijska | | |
| Nastavna i laboratorijska → Elektronička | | |
| Mjerna i ispitna → Nastavna i laboratorijska | | |
| Računalna → Nastavna i laboratorijska | | |
| Računalna → Elektronička | | |
| ostale granice (ukupno 21 par) | | |

**Točnost po kategoriji** (kategorije s jednom stavkom: **pogodak/promašaj, ne postotak**)

| Kategorija | Stavaka | Samoposlužena | Distribuirana |
|------------|---------|---------------|---------------|
| Nastavna i laboratorijska oprema | 39 | | |
| Računalna oprema | 14 | | |
| Usluge održavanja | 5 | | |
| Programska oprema i licence | 1 | pogodak/promašaj | pogodak/promašaj |
| Namještaj | 1 | pogodak/promašaj | pogodak/promašaj |
| **mikro (ukupno)** | 60 | | |
| **makro (prosjek po kategorijama)** | — | | |

**Matrica zabune** — apsolutni brojevi, uz napomenu o dominantnoj ćeliji: ‹prilog›

**Uparena usporedba:** McNemar ‹popuniti› · bootstrap razlike ‹popuniti›

### 3.3 Broj stavki i iznos — PRIMARNA MJERA *(H1)*

| Mjera | Samoposlužena | Distribuirana | Izvor |
|-------|---------------|---------------|-------|
| točan broj stavki % | | | |
| točne količine % | | | |
| `amount_status` = `read` % | | | |
| `amount_status` = `missing` % | | | |
| `amount_status` = `foreign_currency` % | | | |
| iznos točan kad je pročitan % | | | |

### 3.4 Naziv stavke — PRIMARNA MJERA *(H1)*, RUČNO bodovano

| Mjera | Samoposlužena | Distribuirana | Bodovao | Datum |
|-------|---------------|---------------|---------|-------|
| sadržajno ispravni nazivi % | | | Igor Petković | |
| prosječna duljina naziva (znakova) | | | | |

### 3.5 Upozorenja i odbijanja poslužitelja

| Mjera | Samoposlužena | Distribuirana | Izvor |
|-------|---------------|---------------|-------|
| pokušaja s `warnings` % | | | |
| najčešće upozorenje | | | |
| 422 (nije izvukao stavke) % | | | |
| nepostojeća kategorija u pozivu % | | | |
| broj ispravaka nakon greške alata (p50) | | | |

### 3.6 Dosljednost kroz ponavljanja

| Izvedba | broj različitih ishoda po scenariju (p50) | udio scenarija s jednim ishodom % |
|---------|-------------------------------------------|-----------------------------------|
| samoposlužena | | |
| distribuirana | | |

### 3.7 Po vrsti ponude

| Vrsta | Samoposlužena % | Distribuirana % |
|-------|-----------------|-----------------|
| HR PDF, tekstualni sloj (sc. 1) | | |
| slika, dobra (sc. 2) | | |
| slika, otežani uvjeti (sc. 3) | | |
| EN PDF, GBP (sc. 4) | | |
| dvije ponude odjednom (sc. 9) | | |
| nije ponuda (sc. 10) — očekuje se 422 | | |
| ‹nova: rabat› | | |
| ‹nova: dvadesetak stavki› | | |
| ‹nova: višestranična› | | |

---

## 4. Istodobnost *(H3)*

| Istodobnih | Izvedba | p50 (ms) | p95 (ms) | neuspjelih | RAM vršno (GB) | Izvor |
|-----------|---------|----------|----------|------------|----------------|-------|
| 1 | samoposlužena | | | | | |
| 3 | samoposlužena | | | | | |
| 5 | samoposlužena | | | | | |
| 1 | distribuirana | | | | — | |
| 3 | distribuirana | | | | — | |
| 5 | distribuirana | | | | — | |

**Stvarna vršna istodobnost Veleučilišta:** ‹popuniti› · **Podnosi li je čvor:** ‹da/ne›

---

## 5. Suživot komponenti na istom čvoru *(H4)*

> Samo samoposlužena izvedba.

| Operacija | U mirovanju (ms) | Tijekom obrade (ms) | Porast % | Izvor |
|-----------|------------------|---------------------|----------|-------|
| ‹dohvat popisa zahtjeva› | | | | |
| ‹otvaranje zahtjeva› | | | | |
| ‹spremanje izmjene› | | | | |

Zaključak o suživotu: ‹popuniti›

---

## 6. Resursni otisak čvora

> Uzorkovanje 500 ms. **Rad na grafičkom procesoru nije obuhvaćen** — ograničenje.

| Mjera | Mirovanje | 1 obrada | 5 istodobnih | Vršno | Izvor |
|-------|-----------|----------|--------------|-------|-------|
| CPU % | | | | | |
| Memorija (GB) | | | | | |

**Procijenjeni kapacitet čvora:** ‹ponuda/sat pri prihvatljivom p95›

---

## 7. Dostupnost bez vanjske veze *(H5)*

| Scenarij | Samoposlužena | Distribuirana |
|----------|---------------|---------------|
| Veza prekinuta prije obrade | prolaz / pad | prolaz / pad |
| Veza prekinuta usred obrade | | |
| Ostaje li polovičan zapis u bazi? | | |
| Vrijeme oporavka (s) | | |

Opis ponašanja: ‹popuniti›

---

## 8. Lokalnost podataka *(H6)*

| Izvedba | Odlazna odredišta | Prelazi li sadržaj ponude izvan mreže? | Volumen (KB) | Izvor zapisa |
|---------|-------------------|----------------------------------------|--------------|--------------|
| samoposlužena | | | | |
| distribuirana | | | | |

Uvjeti pružatelja o obradi i treniranju: ‹popuniti + izvor s datumom› · DPA: ‹da/ne›

---

## 9. Trošak *(H7)*

**Pretpostavke — `eval/cost-assumptions.json`**

| Stavka | Vrijednost | Izvor i datum |
|--------|-----------|---------------|
| Cijena uređaja | | |
| Amortizacija | ‹36 mj.› | |
| Snaga pod opterećenjem (W) | | izmjereno / **označeno kao pretpostavka** |
| Tarifa kWh | | |
| Cijena tokena ulaz / izlaz | | cjenik, datum |
| Prosj. tokena po ponudi | | izmjereno |

**Trošak po ponudi**

| Izvedba | trošak | sastavnice |
|---------|--------|-----------|
| samoposlužena | | energija + amortizacija |
| distribuirana | | tokeni |

**Točka isplativosti kao krivulja** preko raspona **0,25× – 2×** cijene oblaka

| Množitelj cijene oblaka | Točka pokrića (nabava/god.) | Napomena |
|-------------------------|------------------------------|----------|
| 0,25× | | |
| 0,5× | | |
| 1× | | |
| 2× | | |

---

## 10. Ponderirana matrica odlučivanja

| # | Kriterij | Težina | Ocjena samopos. | Ponder S | Ocjena distrib. | Ponder D | Obrazloženje |
|---|----------|--------|------------------|----------|------------------|----------|--------------|
| 1 | Točnost iznosa i stavki | | | | | | |
| 2 | Točnost dodjele kategorije | *niža* | | | | | |
| 3 | Odziv | | | | | | |
| 4 | Istodobnost i suživot | | | | | | |
| 5 | Resursni otisak | | | | | | |
| 6 | Trošak | | | | | | |
| 7 | Sigurnost i lokalnost | | | | | | |
| 8 | Dostupnost bez veze | | | | | | |
| 9 | Održavanje | | | | | | |
| 10 | Neovisnost o dobavljaču | | | | | | |
| 11 | Skalabilnost i granice | | | | | | |
| | **UKUPNO** | | | | | | |

---

## 11. Provjera hipoteze

| # | Tvrdnja | Prag | Izmjereno | Potvrđeno? |
|---|---------|------|-----------|-----------|
| H1 | točnost **iznosa i stavki** iznad praga | | | |
| H1s | *(dopunski, bez praga)* dodjela kategorije naspram polazišne vrijednosti | — | | |
| H2 | odziv prihvatljiv za klik | | | |
| H3 | podnosi vršnu istodobnost | | | |
| H4 | ne ugrožava ostatak sustava | | | |
| H5 | radi bez vanjske veze | | | |
| H6 | podaci ne napuštaju ustanovu | | | |
| H7 | niži trošak u horizontu | | | |

**Ukupni odgovor:** ‹dostatno / dostatno uz uvjet / nedostatno› — ‹obrazloženje›

---

## 12. Grafovi

| Oznaka | Vrsta | Podaci iz | Datoteka | Poglavlje |
|--------|-------|-----------|----------|-----------|
| Slika 1 | dijagram dviju izvedbi | — | | Metodologija |
| Slika 2 | točnost kategorija: strogo, blago, polazišna 65 % | § 3.2 | | Diskusija |
| Slika 3 | matrica zabune | § 3.2 | | Diskusija |
| Slika 4 | raspodjela grešaka po klasama | § 3.1 | | Diskusija |
| Slika 5 | box plot — odziv | § 1 | | Diskusija |
| Slika 6 | stacked bar — RTT vs obrada | § 1 | | Diskusija |
| Slika 7 | krivulja istodobnosti | § 4 | | Diskusija |
| Slika 8 | odziv aplikacije: mirovanje vs obrada | § 5 | | Diskusija |
| Slika 9 | resource timeline | § 6 | | Diskusija |
| Slika 10 | krivulja isplativosti 0,25×–2× | § 9 | | Diskusija |
