# Mjerni plan

> **Status od 5. 9. 2026.** Predmet mjerenja je promijenjen: chat asistenta je
> uklonjen iz sustava i mjeri se ruta `POST /api/requests/:id/ai-items`. Time
> ispadaju mjere vezane uz razgovor (broj pojašnjenja, dvofazna potvrda,
> ponašanje nakon kreiranja), a ostaju brzina, potrošnja tokena i točnost
> čitanja ponude — stavke, količine, kategorije i iznos. Izvedba se bira po
> pozivu, pa se lokalni model i Gemini mogu mjeriti naizmjence bez diranja
> postavke poslužitelja.

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

`server/scripts/analyze.js` po zadanom obrađuje isključivo `final` i odbija spojiti runove
različite vrste u istu tablicu — **skripta još nije napisana** (v. § 9, faza H). Do tada
odabir runova radi čovjek, a `aggregateEvalResults.js` prikazuje raščlambu po runu upravo
zato da se runovi različite vrste ne pomiješaju nezapaženo.

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
| `max_output_tokens` | **16384** | `num_predict` | `maxOutputTokens` |
| `seed` | 42 | da | **ne postoji u API-ju** |

### Promjena granice izlaza prije kampanje

`max_output_tokens` podignut je s **4096 na 16384** 7. 9. 2026., **jednako za obje
izvedbe**. Prijašnja vrijednost postavljena je prema pilot runovima, gdje najduži odgovor
lokalnog modela nije prelazio ~1140 tokena. Probni prolaz cijelog skupa tu je pretpostavku
oborio: **tri pokušaja udarila su u granicu**, a scenarij 10 sa 46 stavki potrošio je
**11.191 izlazni token** na lokalnoj izvedbi. Uz `num_ctx` 32768 nema razloga za nižu
granicu, a odsijecanje kod `--kind=final` po protokolu poništava cijeli run.

**Mjerenja s prijašnjom granicom ne uspoređuju se izravno s kampanjom.** To se odnosi na
probu odluke O2 (§ 7) i na probni prolaz cijelog skupa od 7. 9. 2026. — obje su vrtjele na
4096 i u radu se navode kao pilot, ne kao rezultat.

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

**Konvencija redaka:** `line` je **nula-indeksiran** redak nad `text.split('\n')` izvučenog
teksta. Konvencija nigdje nije bila zapisana; utvrđena je 6. 9. 2026. mjerenjem — svih 125
lokatora koji pokazuju na prilog poklapa se uz nula-bazirano brojanje, nijedan uz jedinično.
Izvučeni tekst ne počinje praznim retkom, pa razlika nije artefakt vodećeg prijeloma.

### Zašto strojna provjera citata

Pri izradi je provjera uhvatila dvije greške koje oko ne vidi: u retku
`Ukupno za uplatu | 95,32 €` razmak prije znaka eura je **nedjeljivi** (`U+00A0`), a ručno
prepisan citat imao je obični. Bez strojne provjere provenance bi tiho pokazivao na
nepostojeći tekst.

### Skripta

`server/scripts/verifyProvenance.js`. Tekst izvlači **istim putem kojim ga izvlači mjerena
ruta** (`quoteExtractionService` → `pdfExtractWorker`, `pdf-parse` u zasebnom procesu); bilo
koji drugi čitač PDF-a dao bi drukčije razmake i prijelome, pa bi provjera ovjeravala tekst
koji model nikad ne vidi. Za svaki lokator provjerava (1) je li citat doslovan podniz
izvučenog teksta, bez ikakve normalizacije, i (2) nalazi li se **na navedenom retku** — ne
samo bilo gdje u dokumentu, jer se isti niz („Ukupno za uplatu") pojavljuje u više ponuda.
Neslaganja ispisuje s vidljivim nedjeljivim razmakom. Izlazni kod 1 kod ijednog promašaja,
pa se može zvati iz protokola prije kampanje.

    node scripts/verifyProvenance.js

### Stanje, mjereno 6. 9. 2026.

| Veličina | Broj |
|---|---|
| unosa `provenance` ukupno, uključujući ugniježđene u izvedenoj vrijednosti | 209 |
| **od toga s citatom** | **145** |
| provjerljivo protiv teksta priloga | 125 |
| **prolazi** | **125 (sve)** |
| pada — citat nije doslovan podniz | 0 |
| pada — citat točan, redak pogrešan | 0 |
| neprovjerljivo — izvor je poruka razgovora | 20 |
| bez citata — dodjela iz codebooka | 64 |

Ranija tvrdnja „145 lokatora, nula promašaja" **stoji po broju**, uz dva pojašnjenja koja
prije nisu bila zapisana. Prvo: 145 je broj lokatora **s citatom**, a ne broj provjerenih —
provjerljivo protiv dokumenta je njih 125. Preostalih 20 pokazuje na tekst korisnikove
poruke (`source: turn`), a poruka od uklanjanja chata više nema, pa se ti citati **nemaju
na čemu provjeriti**; sva se odnose na polja koja se ionako ne boduju (odjel) ili na
scenarije koji se više ne izvode. Drugo: u 145 ulaze i **dva ugniježđena lokatora** unutar
izvedenog iznosa scenarija 4 (`total_amount.provenance.from[]`, 95,32 + 524,00); brojanje
koje gleda samo vršne unose daje 143.

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

## 7. Latencija i tokeni

Provedeno 7. 9. 2026.

- warm-up poziv lokalnom modelu prije mjerenja; `warmup` u manifestu nosi je li izveden i
  koliko je trajao. Za udaljenu izvedbu se ne radi — nema učitavanja modela, a poziv bi
  trošio kvotu; razlog se zapisuje umjesto da polje ostane prazno
- `model_call_latencies_ms[]` — trajanje svakog poziva zasebno; medijan i p95 se iz zbroja
  ne mogu izračunati
- **`rate_limit_wait_ms` se oduzima od `model_latency_ms`** — bez toga mjera brzine modela
  mjeri tuđi rate limit. Sirova vrijednost ostaje u `model_latency_raw_ms`, jer je kvota
  kao operativno ograničenje zaseban nalaz. Razlika dvaju polja jest čekanje
- `model_version_reported` dolazi **iz odgovora**, ne iz konfiguracije, uz
  `model_versions_seen` za slučaj da se unutar runa promijeni

### Misaoni tokeni nisu odvojivi u API-ju

Lokalni model radi s `think: true`. Ollamin odgovor **razdvaja tekstove** (`message.thinking`
i `message.content`), ali `eval_count` je **zbroj** — API ne dijeli tokene na misaone i
izlazne. Odvajanje na razini tokena stoga nije izvedivo bez procjene.

Zapisuje se ono što jest mjerljivo: `thinking_chars`, `content_chars` i zastavica
`completion_tokens_include_thinking`. **Kad je zastavica postavljena, `completion_tokens`
lokalne i udaljene izvedbe nisu ista veličina i ne smiju se izravno uspoređivati** — ni u
propusnosti ni u trošku.

Izmjereno na scenariju 9 (isti dokument, oba pružatelja, jednak ishod — tri stavke i
2.575,00 €):

| | izlaznih tokena | misaonih znakova | izlaznih znakova | trajanje modela |
|---|---|---|---|---|
| lokalna | 1.307 | 3.376 | 0 | 31,1 s |
| udaljena | 110 | 0 | 0 | 3,0 s |

Izlaznih znakova je nula na obje strane jer odgovor nije tekst nego poziv alata. Kod
lokalne izvedbe to znači da **gotovo sav izlaz otpada na razmišljanje** — 1.307 tokena za
rezultat koji udaljena izvedba daje sa 110. To je podatak za odluku O2 u okviru rada.

---

### Nalaz: razmišljanje je nužno za protokol, ne za čitanje

Odluka O2 provjerena je probom 7. 9. 2026. (`--kind=smoke`, dva scenarija s tekstualnim
prilogom, po dva ponavljanja, obje izvedbe). Prekidač `OLLAMA_THINK` postoji upravo zato da
se postavka može provjeriti bez trajne izmjene kataloga; manifest runa bilježi efektivnu
vrijednost i odakle dolazi.

| Uvjet | Ishod | Medijan e2e | Izlaznih tokena |
|---|---|---|---|
| lokalno, `think: true` | 4/4 točno | 57,9 s | 2.832 |
| lokalno, `think: false` | **0/4 — svi odbijeni** | 10,2 s | — |
| udaljeno (kontrola) | 4/4 točno | 5,3 s | 193 |

**Uzrok pada nije čitanje ponude nego protokol.** Bez razmišljanja model proizvede ispravan
sadržaj — iznosi 57,10 € i 25.036,88 € poklapaju se sa zlatnim standardom, kao i nazivi
stavki — ali ga ispiše kao **običan tekst**, s artefaktima `<|"|>` umjesto navodnika, pa ga
Ollamin parser ne prepozna kao poziv alata. Ruta zato vraća 422.

Zaključak: `think: true` ostaje za kampanju, a proba se u radu navodi kao pilot koji je tu
odluku opravdao.

**Za dalji rad:** napuštanje pozivanja alata u korist strukturiranog izlaza (JSON shema)
donijelo bi oko **5,7 puta brži odziv** lokalne izvedbe pri istom sadržaju. To je izmjena
nacrta, ne postavke, i ne provodi se prije kampanje.

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

### Faza H — `server/scripts/analyze.js` *(ne postoji, treba je napisati)*
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
