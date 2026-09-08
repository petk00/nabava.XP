# KONTEKST — diplomski rad

> Čita se na početku **svakog** razgovora s AI-em o radu.
> Ova datoteka drži **okvir rada**. Mjernu metodologiju drži `docs/mjerni-plan.md`
> i ona je nadređena — ovdje se ne prepisuje, nego se na nju upućuje.
> Polja `‹popuniti›` popuniti prije prvog korištenja.

---

## 0. Područje i predmet — čitaj prvo

Rad je **istraživački rad iz područja distribuiranih sustava.**

Predmet **nije** usporedba dvaju jezičnih modela, nego **dostatnost samoposlužene
izvedbe**: može li cijeli sustav nabava.XP — aplikacija, baza i sloj zaključivanja —
raditi na jednom uređaju unutar ustanove i zadovoljiti stvarne potrebe naručitelja,
umjesto da se dio obrade iznosi na udaljenu uslugu izvan mreže.

**Oblik tvrdnje je dostatnost, ne nadmoć.** Distribuirana izvedba mjeri se kao
**referentni strop**, ne kao suparnik.

Obje su izvedbe distribuirani sustavi; razlika je prelazi li poziv sloja zaključivanja
granicu mreže ustanove.

---

## 1. Osnovni podaci

- **Naslov — kandidati, nije odlučeno:**
  1. Dostatnost samoposlužene izvedbe AI funkcionalnosti u sustavu nabave na primjeru aplikacije nabava.XP
  2. Usporedba samoposlužene i distribuirane izvedbe sloja zaključivanja na primjeru aplikacije nabava.XP
  3. Izvođenje AI komponente na rubnom čvoru naspram usluge u oblaku na primjeru sustava nabava.XP
- **Autor:** Igor Petković · **Mentor:** ‹popuniti›
- **Status prijave teme:** nije formalno prijavljena
- **Ciljani rok (vlastiti):** ~8. 9. 2026.

---

## 2. Podjela izvora istine — da se dokumenti ne proturječe

| Dokument | Što drži | Nadređenost |
|---|---|---|
| `rad/KONTEKST.md` | okvir: predmet, hipoteza, granice poglavlja, pravila rada, pojmovnik | okvir |
| `docs/mjerni-plan.md` | definicije mjera, protokol, klase grešaka, ground truth, statistika | **mjerenje** |
| `docs/AI.md` | kako sustav radi danas | **sustav** |
| `docs/EVAL_SCENARIOS.md` | scenariji i prilozi | **testni skup** |
| `rad/BROJEVI.md` | izmjerene vrijednosti | rezultati |
| `rad/LITERATURA.md` | izvori | literatura |

Kad se KONTEKST i mjerni plan razilaze, **vrijedi mjerni plan** — a KONTEKST se ispravi.
Kad se dokumentacija i kod razilaze, **vrijedi kod** — a dokument se ispravi.

---

## 3. Mjerena funkcionalnost — točno jedna

Mjeri se **`POST /api/requests/:id/ai-items`**: model pročita ponudu već priloženu uz
zahtjev i njome zamijeni stavke i ukupan iznos. Ne vodi razgovor, ne kreira zahtjeve,
ne mijenja odjel, obrazloženje ni status. Puni opis: `docs/AI.md`.

**Chat je uklonjen iz sustava u cijelosti** (5. 9. 2026., commit `25911da`, grana
`mjerenje-ai-items`) — sučelje, ruta `/api/assistant/chat` (sada 404), orkestrator,
spremište priloga i alati `propose_request` / `create_request`. Time je AI gumb jedini
put kojim model dira podatke, pa se mjeri ono što se stvarno koristi. **To izričito
napisati u Metodologiji**, uz commit uklanjanja.

**Dva gumba, ista funkcija:** `AI` (lokalni model) i `Gemini`. Izvedba se šalje uz
poziv (`provider`), ne uzima iz administratorske postavke, pa su **obje dostupne
istovremeno nad istim zahtjevom i istom ponudom**. To je najčišća moguća kontrola —
identičan ulaz, identično stanje baze, jedina razlika je izvedba. Ide u 3.2.

**Zajednički ulaz:** ekstrakcija teksta je poslužiteljska (`pdf-parse` u zasebnom
procesu po datoteci), zajednička objema izvedbama. Tekst se reže na 8000 znakova —
**odluka aplikacije, ne granica modela** (`num_ctx` je 32768).

**Ograničenje modela na tri poziva po zahtjevu**; greška alata vraća se modelu kao
rezultat i on dobiva priliku ispraviti se. Nepostojeća kategorija se ne nagađa.

**`amount_status`:** `read` / `missing` / `foreign_currency` — u zadnja dva slučaja
iznos zahtjeva ostaje nepromijenjen. To je mjerljiv ishod, ne greška.

**Misaoni tokeni:** `gemma4:e2b` je u katalogu s `think: true`, pa izlazni tokeni
uključuju i misaone. Za trošak i propusnost moraju se razdvojiti ili izrijekom navesti.
Vidi otvorenu odluku O2 u § 8.

---

## 4. Istraživačko pitanje, cilj i hipoteza

**Istraživačko pitanje:**

> Zadovoljava li samoposlužena izvedba, u kojoj jedan uređaj unutar mreže ustanove
> izvodi aplikaciju, bazu i sloj zaključivanja, zahtjeve na točnost, odziv, istodobnost
> i dostupnost pri opterećenju koje stvarno proizvodi Veleučilište u Rijeci — i što se
> prelaskom na udaljenu uslugu dobiva, a što gubi?

**Cilj:** utvrditi granice dostatnosti samoposlužene izvedbe i formulirati preporuku
za produkcijsku postavku sustava nabava.XP.

**Hipoteza (zaključati prije mjerenja):**

> Za vrstu i opseg opterećenja koje stvarno proizvodi Veleučilište u Rijeci,
> samoposlužena izvedba sustava nabava.XP na jednom uređaju Mac Mini M4 — koji uz
> aplikaciju i bazu izvodi i sloj zaključivanja — zadovoljava zahtjeve na točnost
> čitanja ponude, vrijeme odziva i dostupnost, uz niži ukupni trošak i bez iznošenja
> podataka izvan ustanove, pri čemu udaljena izvedba unutar tog opsega ne donosi
> mjerljivu korist koja bi opravdala prelazak granice mreže.

| # | Tvrdnja | Mjerenje | Prag |
|---|---------|----------|------|
| H1 | **točnost iznosa i stavki** zadovoljava prag | iznos i `amount_status`, broj stavki, količine, nazivi | iznos ≥ 90 % (kad ga ponuda navodi) · broj stavki ≥ 90 % · količine ≥ 90 % · nazivi ≥ 80 % |
| H1s | *(dopunski, bez praga)* točnost dodjele kategorije | strogo i blago; **polazišna vrijednost 25,4 %** | oba iznad 25,4 % (27,3 % nad 55 jedinstvenih) |
| H2 | odziv je prihvatljiv za jedan klik | medijan i p95, nikad prosjek | **p50 ≤ 60 s · p95 ≤ 120 s** — prema naručitelju |
| H3 | čvor podnosi stvarnu vršnu istodobnost | 1 → 3 → 5 istodobnih | **stvarna vršna istodobnost je 1**; 3 i 5 mjere se kao zaliha kapaciteta |
| H4 | zaključivanje ne ugrožava ostatak sustava na istom čvoru | odziv običnih operacija tijekom obrade | uobičajene operacije ostaju **ispod 1 s (p95)** i dok traje obrada |
| H5 | sustav radi bez vanjske veze | prekid prije i usred obrade | lokalna prolazi, udaljena pada |
| H6 | podaci ne napuštaju ustanovu | mrežni zapis odlaznog prometa | nema sadržaja ponude prema van |
| H7 | trošak je niži unutar horizonta | TCO, točka pokrića kao krivulja | niži unutar **36 mjeseci** pri pretpostavljenom volumenu |

> **Pragovi su privremeni dok ne stignu odgovori naručitelja.** Obrazloženje svakoga
> upisuje se uz njega i prepisuje u 3.5. Izvori obrazloženja: zahtjev naručitelja,
> usporedba s trajanjem ručnog unosa, i ustaljene granice doživljaja odziva iz
> literature (za H2).

> **Uz H7 — dva računa, ne jedan.** U samoposluženoj izvedbi uređaj je ionako potreban,
> jer na njemu rade aplikacija i baza. Zato se TCO iskazuje dvaput: jednom s punom
> cijenom uređaja pripisanom zaključivanju, jednom samo s graničnim troškom, budući da
> je uređaj i tako u pogonu. Razlika između ta dva računa sama je po sebi nalaz.
>
> **Napomena o volumenu.** Stvarnih 300–500 zahtjeva godišnje red je veličine niže od
> radne pretpostavke koja je ranije korištena. Pri tom volumenu trošak tokena udaljene
> izvedbe je zanemariv u apsolutnom iznosu, pa **pod računom s punom cijenom uređaja H7
> vrlo vjerojatno pada**. To se ne skriva: nalaz tada glasi da se lokalna izvedba pri
> ovom opsegu ne brani troškom nego lokalnošću podataka i neovisnošću o vanjskoj usluzi.

> **Uz H1s — što se očekuje.** Sporno je 56 od 59 stavki, pa blago bodovanje neće
> razlikovati izvedbe; signal će nositi **strogo**. Razlika strogo/blago tumači se kroz
> najčešću granicu među kategorijama: laboratorijsko naspram elektroničkog obuhvaća
> 21 od 55 stavki u oba smjera, dakle 38 % skupa.

> **Opterećenje Veleučilišta — sidro hipoteze.** Izvor: služba nabave Veleučilišta u
> Rijeci, razgovor rujan 2026.
>
> - **300–500 zahtjeva godišnje**; vrh na početku kalendarske godine, kad se otvara nov
>   proračun pa se obrađuju zahtjevi zadržani zbog nedostatka sredstava
> - zahtjev može podnijeti svaki zaposlenik; **obradu je ovlašteno raditi troje, a radi
>   jedan** — tko preuzme zahtjev, taj ga i dovrši, pa je **stvarna vršna istodobnost 1**
> - **ručno prepisivanje ponude traje 5–10 minuta**, ovisno o vještini operatera i
>   veličini ponude
> - broj stavki nije određen, od jedne do više njih
> - **ponude gotovo uvijek dolaze kao PDF**; slikovni prilozi su rijetkost
> - prihvatljivo čekanje nakon pokretanja obrade: **do jedne minute**; granica je obrada
>   koja traje više minuta i uz to pogriješi
> - **iznos se uvijek provjerava** — iznos u kreiranom zahtjevu mora odgovarati ponudi
> - Veleučilište ima **imenovanog službenika za zaštitu podataka** i Politiku zaštite
>   osobnih podataka; obrada kod vanjskog pružatelja uređuje se **ugovorom o obradi**,
>   uz obradu isključivo prema dokumentiranim uputama Veleučilišta i propisane tehničke
>   i organizacijske mjere

> **Izvedeni kriterij dostatnosti uz H1.** Naručitelj nije naveo prag točnosti u
> postocima, nego uvjet: alat je isplativ dok skraćuje vrijeme unosa. Zato se uz
> izmjerene postotke iskazuje i izvedeni kriterij — **zbroj trajanja obrade i
> procijenjenog vremena ispravaka mora ostati ispod 5–10 minuta ručnog unosa**. To je
> mjerilo koje je postavio naručitelj i ono je odlučujuće.

> **Napomena uz H2:** probni prolaz dao je lokalno 31–41 s, distribuirano 11–15 s.
> Velik dio lokalne latencije otpada na misaone tokene (1601 naspram 191). Prag H2
> postaviti prije nego se odluči O2 — ne prema izmjerenom.

---

## 5. Sustav i dvije izvedbe

- **Stanje:** nije u produkciji; razvojno-ispitno okruženje na ciljanoj konfiguraciji
- Izvedba se razrješava po pozivu (`resolveProvider`); zadana iz `AppSetting.ai_provider`
- Parametri uzorkovanja: `llm/samplingConfig.js` — temp 0, top_p 1, max 4096;
  **sjeme 42 samo kod Ollame**; `top_k` nije izjednačen i zapisuje se kao zatečeno stanje

**Što vrti na Mac Miniju M4 (16 GB):**

| Komponenta | Detalj |
|---|---|
| OS | macOS 26.3 (25D125), Apple M4 |
| Poslužitelj | Node v25.7.0 / npm 11.10.1, Express — poslužuje API i klijenta |
| Baza | MySQL 9.6.0 (Homebrew, arm64), izravno na macOS-u, **bez Dockera** |
| Sloj zaključivanja | Ollama 0.33.3, `gemma4:e2b` — **100 % GPU**, rezidentno 1,8 GB, `num_ctx` 32768, `keep_alive` ‹popuniti› |
| Obratni proxy | **nema** — Node poslužuje izravno |
| Kontejneri | **nema** |
| Dostupnost | samo iz lokalne mreže ustanove (višekatna zgrada, veći broj računala) |
| Namjena uređaja | istovremeno razvojno i ciljano okruženje; autor na njemu i radi |

Na uređaju je povučeno jedanaest modela (`gemma4:e4b`, `gemma4:12b`, `qwen3.5:9b`
i drugi) iz faze izbora modela; mjeri se isključivo `gemma4:e2b`. Kratko obrazloženje
izbora ide u 3.2.

**Mjerenja se izvode u kontroliranom stanju mirovanja** — bez drugih programa — i to se
navodi i kao uvjet mjerenja i kao ograničenje.

| | Samoposlužena izvedba | Distribuirana izvedba |
|---|---|---|
| Aplikacija i baza | Mac Mini M4, 16 GB | Mac Mini M4, 16 GB |
| Sloj zaključivanja | `gemma4:e2b`, Ollama, **isti uređaj** | **`gemini-3.5-flash`**, HTTP API |
| Granica povjerenja | podaci ostaju u ustanovi | podaci prelaze granicu |
| Mrežna ovisnost | nema | javni internet |
| Determinizam | sjeme 42, ali ne potpun (pomični zarez, batch) | nema sjemena; bilježi se `modelVersion` **iz odgovora** |
| Uloga u radu | predmet ocjene | **referentni strop** |

> Naziv modela usklađen s bazom (`gemini_model`) i mjernim planom 5. 9. 2026.
> Raniji navod `gemini-2.5-flash` bio je pogrešan.

**Suživot komponenti na jednom čvoru** je posebnost samoposlužene izvedbe i mjeri se
zasebno (H4).

**Granica povjerenja poklapa se s mrežom ustanove.** Sustav je dostupan samo iznutra,
pa je u distribuiranoj izvedbi **sadržaj ponude jedina stvar koja izlazi van**. Tako
formulirati H6 u 3.2.

**Prava:** ruta traži ista prava pisanja kao ručno uređivanje; mjerenje se izvodi kao
administrator, jer zaposlenik stavke smije mijenjati tek kad je zahtjev vraćen na
dopunu. **Ide u ograničenja.**

**Protokol prije svakog runa:** restart poslužitelja i provjera da `/version` javlja
očekivani commit. Probni prolaz zatekao je poslužitelj s kodom starije grane.

---

## 6. Kriteriji ponderirane matrice

Ponder = težina (1–5) × ocjena (1–5). Težine **prije** uvida u rezultate.

| # | Kriterij | Izvor ocjene | Težina |
|---|----------|--------------|--------|
| 1 | **Točnost iznosa i stavki** | iznos i `amount_status`, broj stavki, količine, nazivi | **5** |
| 2 | **Točnost dodjele kategorije** | strogo i blago, uz polazišnu vrijednost 25,4 % | 2 |
| 3 | Odziv | medijan, p95, po pozivu | 4 |
| 4 | Istodobnost i suživot komponenti | 1→3→5; odziv aplikacije pod obradom | 3 |
| 5 | Resursni otisak čvora | memorija + **GPU** (v. napomenu) | 2 |
| 6 | Trošak | trošak po ponudi, TCO, krivulja | 4 |
| 7 | Sigurnost i lokalnost podataka | tok podataka, GDPR, DPA; **trag:** mrežni zapis | **5** |
| 8 | Dostupnost bez vanjske veze | **binarno:** prolaz/pad + oporavak | 3 |
| 9 | Održavanje | sati IT-a, RACI — **procjena** | 3 |
| 10 | Neovisnost o dobavljaču | **pokazano:** izvedba je parametar poziva | 2 |
| 11 | Skalabilnost i granice | rez na 8000 znakova (odluka aplikacije, ne granica modela); najveća ponuda; odsijecanje poništava run | 2 |

> **Obrazloženje težina.** Petice nose točnost iznosa i stavki te lokalnost podataka —
> dva razloga zbog kojih sustav u ovom obliku uopće postoji. Četvorke nose odziv i
> trošak, o kojima ovisi hoće li ustanova rješenje uvesti. Ostalo su svojstva koja
> razlikuju izvedbe, ali sama po sebi ne odlučuju. Težine su određene prije mjerenja i
> upisane u ovu datoteku, pa se njihov nastanak može provjeriti u povijesti izmjena.

> **Zašto je kategorizacija odvojena i lakše ponderirana.** Kategorija u sustavu služi
> grubom pregledu potrošnje po predmetu nabave, a ne knjigovodstvenoj točnosti; sam
> postupak od modela traži da stavku svrsta *otprilike gdje pripada*. Mjeriti je jednako
> strogo kao iznos značilo bi kažnjavati sustav za nešto što ni njegova namjena ne
> traži. Zato je nosiva mjera točnosti **iznos i popis stavki**, a kategorizacija se
> mjeri i izvještava zasebno, s blagim bodovanjem kao glavnom brojkom.

> **Kriterij 4 — model radi 100 % na GPU-u.** Uzorkovanje procesora i memorije zato
> gotovo ništa ne mjeri. Ili se doda GPU (`powermetrics --samplers gpu_power`, traži
> sudo, daje i vate koji ionako trebaju za trošak), ili se kriterij svede na memoriju
> uz izričitu napomenu da opterećenje GPU-a nije mjereno. **Prva mogućnost je bolja.**

---

## 7. Testni skup

**Ostaje** (prilog postoji, ground truth s provenanceom postoji — ne baca se):
scenariji **1, 2, 3, 4, 9, 10**.
Otpadaju **5, 6, 7, 8** — nemaju priloga, a ruta polazi od priložene datoteke.
Njihov ground truth ostaje u `server/eval/ground-truth/` kao zapis.

> **Ispraviti u `EVAL_SCENARIOS.md`:** zaglavlje tvrdi da ispadaju 8, 9 i 10 i da se
> izvodi sedam. Po tablici priloga ispadaju 5–8, a izvodi se šest. Uskladiti s kodom.

**Iz starog ground trutha otpadaju samo razgovorna polja** (odluka, odjel, obrazloženje).
Stavke, količine i iznos ostaju i vrijede. **Kategorije ne** — vidi O1.

**Dopuna — praznine koje treba pokriti novim ponudama:**
ponuda s rabatom · dvadesetak stavki · višestranična · granične kategorije
Svaka nova ponuda traži ground truth **istog standarda**: provenance s lokatorom i
bajt-jednakim citatom, strojno provjeren.

---

## 8. Otvorene odluke — blokade prije kampanje

### O1 — šifrarnik: baza ima 33 kategorije, codebook i ground truth imaju 6 ✅ RIJEŠENO

**Ishod (commit `eb337f1`, codebook `08f7e418f4e86c46`):** 59 bodovanih stavki (55
jedinstvenih) preneseno na šifrarnik od 33 kategorije. Polazišna vrijednost većinske
klase **25,4 %** nad 59 bodovanih, 27,3 % nad 55 jedinstvenih — bila je 65,0 % po
starom šifrarniku, pa je mjera time postala informativna. Spornih 56 od 59. Provenance
i dalje 125/125. Razlaganje razloga (`codebook_tie` / `alternative_convention`)
izbačeno je iz mjernog plana, jer je bilo definirano za instrument od šest kategorija.
Druga procjena uzorkovana po granicama, 19 stavki.

*Zapis o postanku, za 3.3:* pravila su izvedena iz napomena uz dodjelu, dodjela je
obavljena prije uvida u izlaze modela, a dvije naknadne ispravke bile su ispravci
unutarnje dosljednosti pronađeni mehaničkom usporedbom srodnih stavki, ne prilagodbe
prema rezultatima.

*Izvorni opis problema:*

Model bira između 33 ponuđene, a mjerilo poznaje samo 6. U probnom prolazu odabrao je
„Elektronička i elektrotehnička oprema" i „Sitni inventar" — kategorije koje ground
truth ne poznaje, pa ih `acceptable_categories` nikad ne mogu pogoditi. Distribuirana
izvedba dobila je strogo 0/4. **Ta nula ne mjeri model nego neusklađenost mjerila.**

**ODLUČENO 5. 9. 2026.: tih 33 su stvarni šifrarnik. Baza se ne dira — mjerilo se
usklađuje s bazom.**

**Opseg (potvrđeno skriptom `verifyProvenance.js`):** 59 dodjela iz codebooka nad sedam
izvođenih scenarija, od čega **55 jedinstvenih stavki** — scenariji 5 i 6 dijele isti
dokument, pa su njihove dodjele isti artikli dvaput.

Postupak, pojednostavljen nakon odluke da je kategorizacija dopunska mjera:

- za svaku od 55 stavki odrediti **koju bih kategoriju prihvatio kao točnu**, biraući
  između svih 33; gdje je više njih obranjivo, nabrojati ih sve u `acceptable_categories`
- **glavna je brojka blago bodovanje** — je li odabrana kategorija obranjiva — pa
  `acceptable_categories` smiju biti široke gdje šifrarnik doista ne razrješava
- pravila se pišu **poslije dodjele i samo gdje je trebalo odlučiti**, jednom rečenicom
  po pravilu; ne piše se priručnik od 33 definicije
- budući da `PROMPT_VARIANT` ostaje `names_only`, **codebook nikad ne ulazi u prompt** —
  služi isključivo kao pravilnik za dodjelu
- **polazišna vrijednost većinske klase računa se iznova** iz nove raspodjele; 65,0 %
  vrijedilo je za šest kategorija i više ne vrijedi
- dodjela se obavlja **prije uvida u izlaze modela**; gdje to nije moguće, kontaminacija
  se priznaje imenom, kao kod pravila P6

### O2 — `think: true` na lokalnom modelu

Izlazni tokeni: lokalno 1601, distribuirano 191 na istom ulazu. Razlika je uglavnom
misaonim tokenima, a ona nosi i razliku u odzivu (31–41 s naspram 11–15 s).

Izdvajanje stavki je zadatak prepisivanja, ne rasuđivanja.

**ODLUČENO 5. 9. 2026.: provodi se proba `--kind=smoke` s `think: false` na dva
scenarija.** Ako točnost ostane ista a odziv padne, to nije nova dimenzija mjerenja
nego **konfiguracijska odluka opravdana probom** — zapisuje se kao takva, mjeri se
tako, a proba se u radu navodi kao pilot koji je odluku opravdao.

Ishod probe: ‹popuniti — točnost s think/bez, odziv s think/bez›
Konačna postavka za kampanju: ‹popuniti›

### O3 — `PROMPT_VARIANT`

Ostaje `names_only`. Infrastruktura (codebook, dva hasha, provjera na `/version`, plan
analize) **već postoji**; odluka se može preispitati bez novog razvoja, uz cijenu
dodatnih prolaza.

---

## 9. Preduvjeti prije kampanje

| # | Stavka | Status |
|---|--------|--------|
| 1 | Živi probni prolaz (`--kind=smoke`) | ✅ commit `25911da`, grana `mjerenje-ai-items` |
| 2 | O1 — ground truth i codebook preneseni na 33 kategorije | ✅ commit `eb337f1`, polazišna 25,4 % |
| 3 | O2 — proba `think: false`, pa upisana konačna postavka | ⬜ |
| 4 | Sve commitano, `dirty: false` (protokol poništava run inače) | ⬜ |
| 5 | Restart poslužitelja + provjera `/version` prije runa | ⬜ |
| 6 | `run_manifest.json` s oba commita, `run_id`, snimkom šifrarnika i prompta | ⬜ |
| 7 | `model_version_reported` i `rate_limit_wait_ms` u zapisu (sada ih nema) | ⬜ |
| 8 | Latencija po pozivu + warm-up | ⬜ |
| 9 | Uzorkovač memorije **i GPU-a** | ⬜ |
| 10 | Pokretač istodobnih zahtjeva (1→3→5) | ⬜ |
| 11 | Mjerenje odziva aplikacije tijekom obrade (H4) | ⬜ |
| 12 | `eval/cost-assumptions.json` + TCO krivulja | ⬜ |
| 13 | Mrežni zapis odlaznog prometa (H6) | ⬜ |
| 14 | Scenarij 7 — zamjena priloga dokumentom s tekstualnim slojem | ⬜ |
| 14b | Skripta za provjeru provenancea | ✅ `verifyProvenance.js`, commit `6d93bbe`, 125/125 |
| 15 | Druga procjena kategorija — **treba druga osoba** | ⬜ |
| 16 | Broj nabava godišnje i vršna istodobnost za Veleri | ⬜ |
| 17 | Pragovi H1–H4, H7 i težine 11 kriterija upisani | ✅ privremeni, do brojki naručitelja |
| 18 | Tokeni za udaljenu uslugu kupljeni | ⬜ |

> Pilot-runovi se u radu citiraju **kao pilot, ne kao rezultat** (mjerni plan § 1).
> `server/eval-results/` je u `.gitignore` — rezultati runa se ne commitaju; za rad
> odlučiti hoće li se konačni JSONL priložiti uz predaju.

---

## 10. Pojmovnik — fiksni nazivi

| Koristi se | Ne koristi se |
|------------|---------------|
| samoposlužena izvedba | lokalni model, on-premise, offline |
| distribuirana izvedba | cloud model, vanjski model |
| sloj zaključivanja | AI, model (kad se misli na sloj) |
| čitanje ponude | ekstrakcija (u naslovima), parsiranje |
| utemeljenost / točnost | vjerodostojnost, halucinacija |
| raspodjela grešaka po klasama | stopa izmišljanja |
| strogo / blago bodovanje | stroga/labava ocjena |
| polazišna vrijednost većinske klase | baseline |
| misaoni tokeni | thinking, reasoning tokeni |
| referentni strop | suparnik, konkurencija |
| suživot komponenti | dijeljenje resursa, kolokacija |
| nabava.XP · nalog · ponuda · zlatni standard · točka pokrića | — |

---

## 11. Granice poglavlja

| Poglavlje | Opseg | Smije | **Ne smije** |
|-----------|-------|-------|--------------|
| Uvod | ~3 str. | problem dostatnosti, cilj, hipoteza, najava | ijedan broj, ijedan zaključak |
| Prethodna istraživanja | ~4 str. | tuđi nalazi, svaki s citatom | vlastita mjerenja, opis vlastitog sustava |
| Metodologija | ~16 str. | arhitektura, postupak, uvjeti, metrike | rezultate, interpretaciju |
| Diskusija | ~14 str. | brojevi + interpretacija + sinteza | novi postupak, novu literaturu |
| Zaključak | ~3 str. | odgovor na hipotezu, preporuka, ograničenja, dalji rad | ijedan novi broj |

**Potpoglavlja Metodologije:** 3.1 Plan istraživanja (1,5) · 3.2 Sustav i dvije izvedbe (3)
· 3.3 Testni skup i ground truth (2,5) · 3.4 Mjerni aparat i provedba (3,5) · 3.5 Metrike,
kriteriji i težine (2,5) · 3.6 Obrada i analiza (1,5) · 3.7 Povezanost s ciljem i
hipotezom (1) · 3.8 Ograničenja postupka (0,5)

---

## 12. Pravila rada s AI-em

1. **Tekst rada pišem ja.** AI dorađuje i provjerava. Iznimka: **kod**.
2. **Word je jedini original teksta.** Lijepljenje kao čisti tekst.
3. **Jedan razgovor = jedno poglavlje**, potpoglavlje po potpoglavlje.
4. **Brojevi se ne pamte** — prepisuju se iz `BROJEVI.md`.
5. **Citati se ne izmišljaju** — „provjereno" u `LITERATURA.md` stavlja **samo autor**.
6. **Na kraju poglavlja:** 10 redaka odluka → § 14.
7. **Citiranje:** numerički, IEEE.
8. **Tri provjere prije predaje poglavlja:** govori li tekst o sustavu ili o modelu?
   tvrdi li nešto što aparat ne radi? slaže li se s `mjerni-plan.md`?

---

## 13. Poštenje rezultata

Nepovoljan rezultat ide u rad kakav jest. Hipoteza smije biti potvrđena **djelomično** —
dostatno do određene razine, iznad nje ne — i to vodi na preporuku s uvjetom.

Iz mjernog plana se **preuzima i način priznavanja slabosti**: priznata kontaminacija
pravila P6, neizjednačen determinizam, `top_k` kao zatečeno stanje, `item_name` kao
otvoreno pitanje, GPU izvan uzorkovanja, mjerenje s administratorskim pravima, uređaj
koji je istovremeno razvojno okruženje. To se u radu **navodi, ne uklanja**.

---

## 14. Dnevnik odluka

**4. 9. 2026. — okvir**
- rad je iz područja distribuiranih sustava; predmet je smještaj obrade

**5. 9. 2026. — sužavanje predmeta**
- mjeri se samo ruta `ai-items`; chat uklonjen u cijelosti (commit `25911da`)
- tvrdnja mijenja oblik iz nadmoći u **dostatnost**
- dodano mjerenje suživota komponenti (H4)
- testni skup: ostaju scenariji s prilozima (1, 2, 3, 4, 9, 10); 5–8 otpadaju

**5. 9. 2026. — nalazi probnog prolaza**
- naziv modela ispravljen na `gemini-3.5-flash` (baza i mjerni plan)
- otvoreno O1: 33 kategorije u bazi naspram 6 u mjerilu — blokada za točnost dodjele
- otvoreno O2: `think: true` nosi većinu lokalne latencije
- model radi 100 % na GPU-u → uzorkovanje procesora ne mjeri opterećenje
- poslužitelj je vrtio zastarjeli kod → restart i provjera `/version` ulaze u protokol

**5. 9. 2026. — riješene odluke**
- O1: 33 kategorije su stvarni šifrarnik; **mjerilo se usklađuje s bazom**, ne obrnuto;
  polazišna vrijednost većinske klase računa se iznova
- O2: provodi se proba `think: false`; postavka za kampanju bira se prema ishodu probe
- O3: `PROMPT_VARIANT` ostaje `names_only`
- naziv modela potvrđen: `gemini-3.5-flash`

**5. 9. 2026. — mjerilo i težište točnosti**
- **točnost se dijeli**: iznos i stavke nosivi dio (H1, prag), kategorizacija dopunska
  (H1s, bez praga, blago bodovanje kao glavna brojka)
- matrica ima **11 kriterija** — kategorizacija dobiva vlastiti redak s nižom težinom
- provjera provenancea napisana i pokrenuta (`verifyProvenance.js`, commit `6d93bbe`):
  nad sedam izvođenih scenarija 125 lokatora provjerljivo protiv priloga, svih 125
  prolazi; razlika 143/145 razriješena u korist mjernog plana (ugniježđeni lokatori
  izvedenog iznosa u scenariju 4)
- utvrđena konvencija: `line` u ground truthu je **nula-indeksiran**; zapisano u skriptu
  i mjerni plan
- skup je već pisan za čitanje ponude: rabat, 23 stavke, višestranična, dugi nazivi i
  zapis brojeva pokriveni; **nove ponude nisu potrebne**
- scenariji 5 i 6 su **uparena proba s jednom promjenjivom** (europski naspram
  anglosaksonskog zapisa iznosa), ne dva neovisna uzorka
- scenarij 7 dobiva prilog s tekstualnim slojem koji nije ponuda, da model doista donese
  prosudbu; skenirani dokument izlazi iz mjernog skupa
- **slikovni prilozi se ne uvode** — ruta ih preskače jednako za obje izvedbe, što je
  posljedica odluke o izjednačenom ulazu, a ne ograničenje modela

**5. 9. 2026. — O1 zatvoren, pragovi i težine upisani**
- šifrarnik prenesen na 33 kategorije; **polazišna vrijednost 25,4 %** (bila 65,0 %)
- dvije ispravke dosljednosti: ESP32 komplet izjednačen između scenarija 2 i 3,
  laserski modul usklađen s ostalih jedanaest diskretnih komponenti
- razlaganje razloga izbačeno iz mjernog plana; razlika strogo/blago tumači se kroz
  najčešću granicu, laboratorijsko naspram elektroničkog (38 % skupa)
- pragovi H1–H4 i H7 upisani kao **privremeni**, do odgovora naručitelja
- težine 11 kriterija upisane **prije mjerenja**, s obrazloženjem
- TCO se iskazuje **dvama računima**: s punom cijenom uređaja i s graničnim troškom

**7. 9. 2026. — brojke naručitelja i dovršen aparat**
- pragovi zamijenjeni stvarnima iz razgovora sa službom nabave; H2 s 10 s na **60 s**,
  H3 s tri istodobne obrade na **jednu**
- uz H1 dodan izvedeni kriterij: obrada plus ispravci moraju ostati ispod 5–10 minuta
  ručnog unosa
- volumen 300–500 zahtjeva godišnje, red veličine niže od ranije pretpostavke — H7 pod
  punim računom uređaja vjerojatno pada, i to se navodi
- ponude gotovo uvijek dolaze kao PDF, pa su slikovni scenariji **rubni slučaj**, a ne
  glavni put; tako se i tumače
- ugovor o obradi s vanjskim pružateljem je institucionalni zahtjev, ne pretpostavka —
  ide u kriterij sigurnosti kao provjerljiva činjenica
- O2 zatvoren: `think: true` ostaje; bez razmišljanja sadržaj je točan, ali model ne
  poziva alat ispravno, pa uzrok pada nije čitanje nego protokol; procjena dobitka od
  prelaska na strukturirani izlaz ~5,7× ide u dalji rad
- mjerni aparat dovršen (commit `a744036`); H4 izmjeren — odziv aplikacije se pod
  obradom ne mijenja
- testni skup proširen na jedanaest scenarija
- ‹dopisati›

---

## 15. Utrošak vremena po fazama

| Faza | Datum | Sati | Napomena |
|------|-------|------|----------|
| Okvir i priprema | | | |
| Dopuna mjernog aparata | | | |
| Usklađivanje šifrarnika i ground trutha | | | |
| Nove ponude i ground truth | | | |
| Mjerna kampanja | | | |
| Metodologija | | | |
| Prethodna istraživanja | | | |
| Diskusija | | | |
| Uvod i Zaključak | | | |
| Završna kontrola | | | |
