# Mjerni plan

Definicije mjera, protokol mjerenja i zapis metodoloških odluka za usporedbu dviju izvedbi
AI agenta u sustavu nabava.XP: lokalnog modela preko Ollame i Gemini API-ja.

Rad ne utvrđuje koji je model bolji, nego **na kojim se mjerljivim osima dvije izvedbe
razlikuju na ovom zadatku** i koje razlike odlučuju o uvođenju.

> **Status:** dokument nastaje uz izmjene mjernog okvira i dopunjava se po fazama. Odjeljci
> označeni *(nedovršeno)* čekaju pripadnu fazu.

---

## 1. Vrste runova

Svaki run nosi `run_kind` u `run_manifest.json`:

| Vrijednost | Značenje |
|---|---|
| `pilot` | istraživački prolazi koji su opravdali dizajn mjerenja; u radu se citiraju kao pilot, ne kao rezultat |
| `final` | mjerenja koja ulaze u rad |
| `sensitivity` | kontrolni prolazi (npr. temperatura 1) |
| `smoke` | provjere ispravnosti; nikad se ne analiziraju |

`scripts/analyze.js` po zadanom obrađuje isključivo `final` i odbija spojiti runove
različite vrste u istu tablicu.

**Zadana vrijednost je `smoke`.** Run koji ulazi u rad mora biti izričito označen, da probni
prolaz nikad ne završi u konačnoj tablici zbog zaboravljene zastavice.

### Protokol završnog mjerenja

- kod aplikacije i harnessa zamrznut, jedan commit, `dirty: false` — inače se run poništava
- jedna konfiguracija uzorkovanja za sve pokušaje unutar runa
- baza u poznatom početnom stanju, snimljenom prije prvog pokušaja
- 10 scenarija × 10 ponavljanja × 2 pružatelja × 2 uvjeta prompta
- sve tablice u radu citiraju jedan `run_id`; prekinut run se **ne krpa nego vrti ispočetka**
- svaki pokušaj s odrezanim odgovorom (`finish_reason` = `length` / `MAX_TOKENS`) poništava run

---

## 2. Parametri uzorkovanja

Jedan izvor istine: `server/src/services/llm/samplingConfig.js`.

| Parametar | Vrijednost | Ollama | Gemini |
|---|---|---|---|
| `temperature` | 0 | da | da |
| `top_p` | 1 | da | da |
| `max_output_tokens` | 4096 | `num_predict` | `maxOutputTokens` |
| `seed` | 42 | da | **ne postoji u API-ju** |

`sampling_equalized_keys` obuhvaća samo prva tri. Determinizam **nije** izjednačen i to se
ne prešućuje.

### Zašto temperatura 0

Na temperaturi 1 os dosljednosti mjeri postavku dekodiranja umjesto izvedbe. Na nuli
preostala varijanca dolazi od nedeterminizma izvedbe, a to je varijanca koja se mjeri. Uz
to, sustav ovog tipa nitko ne bi pustio u pogon na temperaturi 1.

**Temperatura 0 nije potpuni determinizam ni na jednoj strani.** Lokalno na ishod utječu
redoslijed zbrajanja u pomičnom zarezu na GPU-u i veličina batcha; u oblaku nema seeda ni
jamstva da je iza istog imena endpointa ista verzija modela između poziva. Zato se za
Gemini bilježi `modelVersion` **iz odgovora**, ne iz konfiguracije.

### Zašto `top_k` nije izjednačen

Ollama ga nosi iz Modelfilea (`gemma4:e2b`: 64), Gemini ima nedokumentirani default i ne
vraća ga u odgovoru. Na temperaturi 0 dekodiranje je pohlepno pa `top_k` nema učinka na
ishod. Izjednačiti ga ne bismo mogli pošteno, a tvrditi da jest bilo bi netočno — zato se
zapisuje kao zatečeno stanje (`sampling_unequalized`), ne kao primijenjena postavka.

### Nalaz: zašto su raniji runovi označeni kao `pilot`

Prije uvođenja `samplingConfig.js` dvije su izvedbe vrtjele na **različitim i nigdje
zapisanim** postavkama:

- **Ollama** — Modelfile default: `temperature 1`, `top_k 64`, `top_p 0.95`; provider je
  slao samo `num_ctx`
- **Gemini** — `generationConfig` se **nije slao uopće**

Nijedan raniji run stoga ne uspoređuje modele nego i postavke. To je dokumentirani razlog
zašto su svi retroaktivno označeni `run_kind: pilot` i zašto se ne usklađuju s novom
konfiguracijom.

---

## 3. Uvjeti prompta

| `prompt_variant` | Što model dobiva |
|---|---|
| `names_only` | zatečeno stanje: samo nazivi kategorija |
| `with_definitions` | nazivi + definicije iz `category-codebook.md`, doslovno |

`names_only` je **polazišni uvjet i zatečeno stanje sustava**, ne „loša verzija".

**Mehanizam intervencije:** definicije kategorija ne čine model sposobnijim, nego mu
priopćuju konvenciju ustanove koju iz samog naziva kategorije nije mogao izvesti.

Tekst definicija dolazi doslovno iz zamrznutog codebooka. Zapisuju se **dva** hasha:
`category_codebook_sha256` (cijela datoteka — veže prompt uz onu inačicu priručnika koja je
ujedno ground truth) i `codebook_excerpt_sha256` (točno ono što je umetnuto, jer odjeljci o
postupku se ne šalju modelu). Bez drugoga bi manifest tvrdio da je model vidio više nego što
jest.

Uvjet se bira varijablom okoline `PROMPT_VARIANT`. **Poslužitelj ga izlaže na `/version` i
harness ga ondje provjerava**, isto kao commit: neslaganje s namjerom harnessa je kod
`--kind=final` tvrdi prekid. U manifest ide vrijednost **s poslužitelja** kao izvor istine,
uz zasebno zapisanu namjeru harnessa (`prompt_variant_intended`, `prompt_variant_matches`),
da se neslaganje vidi i naknadno. Bez toga bi cijeli 2×2 nacrt počivao na tome da se netko
sjetio izvezti pravu varijablu.

Sve ostalo između uvjeta mora biti nepromijenjeno. Zaglavlje `X-Include-System-Prompt`,
kojim harness dohvaća puni tekst prompta, smije **dodati polje u odgovoru i ništa više** —
ne sastavljanje prompta, ne pozive modelu, ne redoslijed koraka. Mjerni put mora biti
identičan pogonskom, i to drže tri testa u `__tests__/assistantRoutes.test.js`.

### Ograničenje: sadržaj i duljina mijenjaju se zajedno

Izmjereno: `with_definitions` diže prompt s 3.352 na 10.400 znakova, odnosno **+2.263 ulazna
tokena po pozivu** — gotovo dvostruko. Time uvjet mijenja **dvije stvari odjednom**: sadržaj
(model sad zna što kategorije znače) i duljinu.

Ako točnost poraste, strogo uzevši **ne znamo je li zaslužan sadržaj ili sama duljina
prompta**. Treći uvjet s ispunom nije uveden namjerno: rad mjeri intervenciju kakvu bi
ustanova doista primijenila — nitko ne dodaje ispunu, nego stvarne definicije — pa je ovo
**primijenjena, a ne mehanistička usporedba**. Ograničenje se navodi, ne uklanja.

**Duljina prompta na lokalnoj izvedbi košta vrijeme, a na oblačnoj novac.** Ista
intervencija, dvije različite valute.

---

## 4. Utemeljenost i točnost su ortogonalne

Najvažnije pojmovno razgraničenje u radu.

**Utemeljenost** pita: postoji li vrijednost igdje u ulazu?
**Točnost** pita: je li to vrijednost koju ground truth traži?

Ilustracija iz pilot runa, scenarij 4: model je upisao **95,32 €**. Taj broj doslovno stoji
u prilogu (`scenario4_ponuda_a.pdf`, redak 42), dakle **nije izmišljen**. Ground truth traži
**619,32 €** — zbroj obiju priloženih ponuda. Model je prepisao **stvaran broj s krivog
mjesta**: utemeljen, a netočan.

### Klase

| Klasa | Uvjet |
|---|---|
| `supported` | vrijednost utemeljena u ulazu i jednaka ground truthu |
| `derived` | izračunata iz utemeljenih vrijednosti (npr. iznos kao zbroj) |
| `misgrounded` | vrijednost postoji u ulazu, ali nije ona koju ground truth traži |
| `fabricated` | vrijednosti nema nigdje u ulazu |
| `contradicted` | ulaz za to polje izrijekom navodi drugu vrijednost |

Mjera se zove **raspodjela grešaka po klasama**, ne „stopa izmišljanja".

### Koja polja ulaze u koju mjeru

| Polje | Mjera |
|---|---|
| `department_name` | utemeljenost |
| `total_amount` | utemeljenost |
| `quantity` | utemeljenost |
| `item_name` | *(nedovršeno — čeka podatke, v. §8)* |
| `category_name` | **izvan utemeljenosti**; zasebna mjera točnosti dodjele |
| `justification` | izvan svake mjere; kvalitativno |

`category_name` je izuzet jer je vrijednost iz šifrarnika: šifrarničko polje **ne može biti
izmišljeno**, samo krivo dodijeljeno.

---

## 5. Ground truth

`server/eval/ground-truth/<scenario_id>.json`, verzionirano u gitu.

Svako očekivano polje nosi `provenance`: lokator u ulazu (indeks poruke ili datoteka +
redak) i **doslovan citat**. Citat mora biti bajt-jednak izvoru i to se provjerava strojno.

### Zašto strojna provjera citata

Pri izradi je provjera uhvatila dvije greške koje oko ne vidi: u retku
`Ukupno za uplatu | 95,32 €` razmak prije znaka eura je **nedjeljivi** (`U+00A0`), a ručno
prepisan citat imao je obični. Bez strojne provjere provenance bi tiho pokazivao na
nepostojeći tekst.

Provjereno: **145 lokatora, nula promašaja.**

### Imenovani popis iznimaka

Nabrojane i objašnjene iznimke su metodologija; tiho normalizirane su rupa.

| # | Scenarij | Polje | Iznimka | Obrazloženje |
|---|---|---|---|---|
| 1 | 9 | `item_name` | ground truth `digitalni multimetar`, ulaz „6 **digitalnih multimetara**" | genitiv množine; provenance nosi `surface_form` i `morphology` |
| 2 | 10 | `item_name` | ground truth `bežični miš`, ulaz „3 **bežična miša**" | genitiv jednine |
| 3 | 10 | `department_name` | ground truth `Informatička služba`, ulaz „za **Informatičku službu**" | akuzativ |
| 4 | 4 | `total_amount` | 619,32 € **ne postoji** ni u jednom ulazu | `source: derived`, `operation: sum` nad dvama lokatorima (95,32 + 524,00) |

Prva tri su hrvatska morfologija: kanonski oblik u ground truthu, površinski u
provenanceu. Četvrti je jedini slučaj u kojem točan odgovor zahtijeva račun, ne prepisivanje.

---

## 6. Točnost dodjele kategorije

Zasebna mjera, jer šifrarničko polje ne može biti izmišljeno.

### Instrument

`server/eval/category-codebook.md` — šest kategorija s definicijama i deset pravila
razgraničenja (P1–P10). Nastao je jer tablica `ItemCategory` ima **samo stupac `name`**:
nigdje u aplikaciji, bazi ni dokumentaciji ne postoji opis kategorije. Model u zatečenom
stanju dobiva goli popis od šest naziva.

**Uvjet bez iznimke:** nijedan primjer u codebooku nije artikl iz scenarija, jer codebook
ulazi u prompt u uvjetu `with_definitions`. Provjerava se strojno; prva verzija imala je
**pet curenja** (granični slučajevi bili su doslovno prepisane stavke iz scenarija) i
prepravljena je u domenski neutralne formulacije.

### Dvostruko bodovanje

- **strogo** — točno je samo `expected_category`
- **blago** — točno je bilo što iz `acceptable_categories`

Razlika između te dvije brojke razlaže se po `acceptable_reason_type`:

| Vrsta | Značenje | Slučajeva |
|---|---|---|
| `codebook_tie` | codebook doista ne razrješava; dva njegova pravila povlače na različite strane | 15 |
| `alternative_convention` | po našem codebooku odgovor je jednoznačan, ali druga ustanova bi razumno propisala drukčije | 2 |

Time razlika strogo/blago nije jedan mutni broj: prvi dio mjeri **neodređenost šifrarnika**,
drugi koliko je **naša konvencija jedna od više razumnih**. Obje veličine idu u rad.

### Raspodjela i polazišna vrijednost

64 stavke, 60 jedinstvenih naziva.

| Kategorija | Stavaka | Udio |
|---|---|---|
| Nastavna i laboratorijska oprema | 39 | 65,0 % |
| Računalna oprema | 14 | 23,3 % |
| Usluge održavanja | 5 | 8,3 % |
| Programska oprema i licence | 1 | 1,7 % |
| Namještaj | 1 | 1,7 % |

**Polazišna vrijednost većinske klase je 65,0 %** — toliko postiže klasifikator koji uvijek
odgovara „Nastavna i laboratorijska oprema", bez ikakvog znanja. Ta brojka mora stajati u
istoj tablici kao i rezultati modela.

### Zapis o postanku dodjele

- **Pravila su napisana prije dodjele**, dodjela izvršena **prije uvida u izlaze modela**.
- **Priznata kontaminacija — pravilo P6.** Prije pisanja codebooka bilo mi je poznato da su
  na scenariju 8 dvije izvedbe tipkovnicu razvrstale različito (`gemma4:e2b` → Uredski
  materijal, `gemini-3.5-flash` → Računalna oprema). P6, koji periferiju svrstava u
  Računalnu opremu, napisan je s tim saznanjem i poklapa se s jednim od dva viđena izlaza.
  **To nije neovisna prosudba.** Empirijska provjera: druga procjena obavezno sadrži
  periferiju s obje strane granice.
- **Ispravci nađeni samoprovjerom, prije potvrde:** nedosljednost kod mrežnih uređaja
  (LoRaWAN gateway označen spornim, PoE preklopnik i pristupna točka nisu, iako su svi iz
  iste ponude) i neobranjiva alternativa kod jednog kompleta.
- **Nepisano pravilo naknadno unesено:** granica trajno/potrošno primijenjena je pri dodjeli
  prije nego je zapisana. Unesena je kao P10; provjereno da ne mijenja nijednu dodjelu.

### Druga procjena

`server/eval/category-secondrater.csv` — **22 stavke, namjerno uzorkovane radi pokrivanja
granica**, ne nasumično. Nasumičan uzorak od 20 pri raspodjeli s 65 % u jednoj kategoriji ne
bi rekao ništa o graničnim slučajevima.

Uzorak sadrži: svih 17 spornih stavaka, sve četiri periferije (s obje strane P6 granice) i
svih pet kategorija koje imaju stavke. Ispalo je 22 umjesto 20 jer bi smanjivanje značilo
izbaciti spornu stavku.

Procjenitelj dobiva **codebook, nazive kategorija i stavke — bez prijedloga dodjele**. Time
se mjeri **primjenjivost codebooka**, instrumenta koji se u radu brani.

**Izvještavanje:**

- postotak slaganja **odvojeno** za sporne i nesporne stavke
- popis svih neslaganja, sa stavkom i objema kategorijama
- kappa **nije glavna mjera**: 22 stavke, pet kategorija i vrlo neuravnotežena raspodjela
  daju nestabilnu vrijednost; ako se navodi, onda kao sporedna, uz ogradu
- nisko slaganje na spornima **nije loš rezultat** nego potvrda da su označene ispravno
- neslaganje oko monitora ili docking stanice znak je da granica trajno/potrošno stoji
  drugdje nego što je postavljena — takav nalaz se **prijavljuje, ne brani**

---

## 7. Latencija *(nedovršeno — faza E)*

- warm-up poziv lokalnom modelu prije mjerenja, `warmup_performed`
- `model_call_latencies_ms[]` — trajanje svakog poziva zasebno; medijan i p95 se iz zbroja
  ne mogu izračunati
- vrijeme do prvog odgovora modela
- **`rate_limit_wait_ms` se oduzima od `latencyMs`** — svjesna odluka: bez toga mjera brzine
  modela mjeri tuđi rate limit. Sirova vrijednost se i dalje zapisuje, jer je kvota kao
  operativno ograničenje zaseban nalaz.

---

## 8. Otvorena pitanja

**`item_name` — ulazi li u mjeru utemeljenosti.** C-proba je na `gemma4:e2b` dala 13/13
doslovnih podnizova ulaza, dakle trivijalno provjerljivo. Ali e2b prepisuje doslovno, a
Gemini parafrazira i skraćuje (u scenariju 5 sveo je nazive s 232–251 na 34–66 znakova).
Produžena proba na Geminiju uspjela je samo na scenariju 8, gdje su nazivi kratki i nema što
parafrazirati — dakle **ne testira rizični slučaj**. Odluka čeka scenarij s dugačkim opisima.

Prag postavljen unaprijed: ≥ 80 % `obvious` → `item_name` ulazi u mjeru; ispod → izlazi i
parafraziranje se opisuje kao razlika u ponašanju među pružateljima.

---

## 9. Obveze koje slijede

Popis postoji da ne ovisi o pamćenju.

### Faza D
- [ ] provjera commita: server izlaže `/version` (commit + `dirty`), harness uspoređuje sa
      svojim `git_commit`; neslaganje kod `--kind=final` je **tvrdi prekid**
- [ ] oba commita (aplikacija i harness) u `run_manifest.json`
- [ ] `run_id` (uuid), `context_reset`, snimka stanja baze prije/poslije pokušaja
- [ ] snimka šifrarnika (kategorije i odjeli) i **puni tekst sistemskog prompta + hash** u
      manifest — bez toga `category_name` nije provjerljiv iz zapisa
- [ ] sadržaj rezultata alata u `tool_trace_summary` (premješteno iz faze C)

### Faza H — `scripts/analyze.js`
- [ ] polazišna vrijednost većinske klase (65,0 %) u istoj tablici kao rezultati
- [ ] ukupna točnost (mikro) **i** prosjek po kategorijama (makro)
- [ ] točnost po kategoriji zasebno, uz broj stavaka
- [ ] kategorije s jednom stavkom: **pogodak/promašaj, ne postotak**
- [ ] matrica zabune u apsolutnim brojevima, uz napomenu o dominantnoj ćeliji
- [ ] Wilsonov interval; McNemar za uparenu usporedbu; bootstrap za razliku
- [ ] dosljednost: broj različitih ishoda kroz ponavljanja istog scenarija
- [ ] latencija: medijan i p95, nikad prosjek
- [ ] razlika točnosti između scenarija s prilogom i bez njega, po pružatelju
- [ ] cijena intervencije `with_definitions`: koliko ulaznih tokena dodaje po pozivu i kako
      pomiče latenciju i trošak

### Trošak
- [ ] `eval/cost-assumptions.json`: cijena po tokenu s datumom i izvorom, hardver,
      amortizacija, kWh, vati
- [ ] stvarna potrošnja tijekom runa ako je izvediva na macOS-u; inače izrijekom označeno
      kao pretpostavka
- [ ] točka isplativosti kao **krivulja** preko raspona 0,25×–2× cijene oblaka
