# Plan dorada

Ovaj dokument opisuje preporučeni redoslijed dorada sustava `nabava.XP`.
Plan je napravljen prema trenutnom stanju implementacije, SRS zahtjevima i procjeni prioriteta.

Cilj plana nije implementirati sve odjednom, nego jasno odvojiti:

- funkcionalnosti koje su potrebne za stabilan MVP,
- funkcionalnosti koje čine sustav potpunijim,
- funkcionalnosti koje se mogu ostaviti za kasniju fazu.

Financijski limiti i analitika namjerno se ostavljaju za zadnju fazu jer ovise o poslovnim godinama, šifrarnicima, statusima i storniranju zahtjeva.

## Trenutno stanje

Aplikacija ima implementiran kompletan MVP proces nabave:

- prijava i odjava korisnika (httpOnly cookie JWT),
- postavljanje lozinke putem invite linka,
- admin upravljanje korisnicima (CRUD, invite, reset, deaktivacija),
- admin upravljanje poslovnim godinama, odjelima i kategorijama,
- kreiranje i uređivanje zahtjeva,
- pregled zahtjeva s serverskom paginacijom i naprednim filterima,
- kompletan workflow: preuzmi, odobri, vrati na izmjenu, odbij, naruči, zatvori, storno, vrati-u-obradu,
- upload, pregled, download i brisanje dokumenata (Ponuda, Otpremnica),
- povijest aktivnosti zahtjeva,
- in-app obavijesti za sve relevantne promjene statusa,
- sigurnosni hardening (Helmet, CORS whitelist, rate limiting, path traversal zaštita).

Preostale neimplementirane cjeline:

- stvarna instalacija na produkcijski server s pravim TLS certifikatom (Docker postava, instalacijske upute u `docs/DEPLOYMENT.md` i backup skripta postoje).
- AI agent za asistirano kreiranje zahtjeva (vidi `docs/AI.md` i Faza 11 niže) — prijedlog za diplomski rad, izvan MVP opsega.

Svjesno isključeno iz opsega (odluke potvrđene 06.07.2026.): draft zahtjeva, tipovi dokumenata Narudžbenica i Ostalo, email obavijesti o statusima, centar/povijest obavijesti, analitički pregled potrošnje, audit log prijava, 2FA. Prekoračenje limita namjerno ne blokira odobrenje (upozorenje + zapis u povijest).

Automatizirani testovi postoje: unit (Jest, Vitest), API integracijski (supertest + MySQL), e2e (Playwright — puni workflow, upload dokumenata, Financije, Korisnici) i CI (GitHub Actions).

## Prioriteti

| Prioritet | Značenje |
|---|---|
| Visoko | Potrebno za zaokruženiji MVP i usklađenje s obaveznim SRS zahtjevima. |
| Srednje | Važno za kvalitetu sustava, ali ne blokira osnovni demo. |
| Nisko | Korisno, ali može čekati. |
| Odgođeno | Svjesno ostavljeno za kasniju fazu. |

## Faza 1: Stabilizacija dokumentacije

Prioritet: **Visoko**

Cilj ove faze je uskladiti dokumentaciju sa stvarnim stanjem projekta.

### Zadaci

| ID | Zadatak | Status |
|---|---|---|
| DOK-01 | Popuniti SRS status implementacije. | Dovršeno |
| DOK-02 | Popuniti test plan. | Dovršeno |
| DOK-03 | Popuniti arhitekturu sustava. | Dovršeno |
| DOK-04 | Popuniti plan dorada. | Dovršeno |
| DOK-05 | Popuniti API dokumentaciju. | Dovršeno |
| DOK-06 | Popuniti dokumentaciju baze podataka. | Dovršeno |
| DOK-07 | Popuniti korisničke upute. | Dovršeno |
| DOK-08 | Uskladiti README sa stvarnim stanjem projekta. | Dovršeno |

### Ishod

Nakon ove faze projekt ima dokumentacijsku osnovu koja jasno objašnjava što je implementirano, što nije implementirano i kojim redoslijedom se nastavlja razvoj.

## Faza 2: Admin upravljanje korisnicima ✅ DOVRŠENO

Prioritet: **Visoko**

Ova faza pokriva zahtjev 1.1 i dopunjuje zahtjev 1.3 iz SRS-a.

### Zadaci

| ID | Zadatak | Napomena |
|---|---|---|
| KOR-01 | Dodati backend rute za listanje korisnika. | Samo administrator. |
| KOR-02 | Dodati backend rutu za kreiranje korisnika. | Validirati `@veleri.hr` domenu. |
| KOR-03 | Dodati privremenu lozinku pri kreiranju korisnika. | Za početak može biti ručno generirana/prikazana administratoru. |
| KOR-04 | Dodati backend rutu za uređivanje korisnika. | Ime, prezime, email, uloga, aktivnost. |
| KOR-05 | Dodati deaktivaciju korisnika. | Umjesto fizičkog brisanja. |
| KOR-06 | Dodati frontend admin stranicu "Korisnici". | Lista, forma, uređivanje. |
| KOR-07 | U navigaciju dodati admin linkove samo administratoru. | Sakriti od djelatnika. |

### Kriteriji dovršenosti

- Administrator može kreirati korisnika.
- Sustav ne dopušta email koji nije na domeni `@veleri.hr`.
- Administrator može deaktivirati korisnika.
- Deaktivirani korisnik se ne može prijaviti.
- Svaki korisnik ima točno jednu ulogu.

## Faza 3: Poslovne godine ✅ DOVRŠENO

Prioritet: **Visoko**

Ova faza pokriva zahtjeve 2.1, 2.3, 2.4 i 2.5 iz SRS-a.

### Zadaci

| ID | Zadatak | Napomena |
|---|---|---|
| GOD-01 | Dodati backend rutu za listanje poslovnih godina. | Admin pregled. |
| GOD-02 | Dodati backend rutu za otvaranje nove poslovne godine. | Provjeriti da godina već ne postoji. |
| GOD-03 | Pri otvaranju godine kopirati mjesta troška iz prethodne godine. | Novi ID zapisi. |
| GOD-04 | Pri otvaranju godine kopirati predmete nabave iz prethodne godine. | Novi ID zapisi. |
| GOD-05 | Dodati backend rutu za zaključavanje godine. | `is_closed = 1`. |
| GOD-06 | Zabraniti izmjene nad zaključanom godinom. | Backend provjera. |
| GOD-07 | Ne implementirati brisanje poslovne godine. | SRS traži zabranu brisanja. |
| GOD-08 | Dodati frontend admin stranicu "Poslovne godine". | Listanje, otvaranje, zaključavanje. |

### Kriteriji dovršenosti

- Administrator može otvoriti novu poslovnu godinu.
- Sustav kopira šifrarnike iz prethodne godine.
- Zaključana godina je samo za čitanje.
- Poslovna godina se ne može obrisati kroz aplikaciju.

## Faza 4: Šifrarnici ✅ DOVRŠENO

Prioritet: **Visoko**

Ova faza pokriva zahtjev 2.2 iz SRS-a i priprema teren za limite.

### Zadaci

| ID | Zadatak | Napomena |
|---|---|---|
| SIF-01 | Dodati CRUD za mjesta troška / odjele. | Aktivna poslovna godina. |
| SIF-02 | Dodati CRUD za predmete nabave / kategorije. | Aktivna poslovna godina. |
| SIF-03 | Ako zapis nije korišten, dopustiti brisanje. | Provjera kroz zahtjeve/stavke. |
| SIF-04 | Ako je zapis korišten, umjesto brisanja napraviti deaktivaciju. | `is_active = 0`. |
| SIF-05 | Prikazivati samo aktivne šifrarnike kod kreiranja zahtjeva. | Već djelomično postoji. |
| SIF-06 | Dodati frontend admin stranicu "Šifrarnici". | Tabovi: mjesta troška, predmeti nabave. |

### Kriteriji dovršenosti

- Administrator može dodati, urediti i deaktivirati šifrarnik.
- Korišteni šifrarnik se ne briše fizički.
- Zaključana poslovna godina ne dopušta izmjene šifrarnika.

## Faza 5: Provjera poslovne godine kod zahtjeva ✅ DOVRŠENO

Prioritet: **Srednje**

Ova faza dodatno učvršćuje zahtjev 3.2 iz SRS-a. Backend u POST i PUT rutama zahtjeva validira da odjel i sve kategorije stavki pripadaju poslovnoj godini zahtjeva te odbija kreiranje u zaključanoj godini (requestRoutes.js).

### Zadaci

| ID | Zadatak | Napomena |
|---|---|---|
| GOD-ZAH-01 | Backend provjera da odabrano mjesto troška pripada poslovnoj godini zahtjeva. | Implementirano (POST i PUT). |
| GOD-ZAH-02 | Backend provjera da svaki predmet nabave/stavka pripada poslovnoj godini zahtjeva. | Implementirano (POST i PUT). |
| GOD-ZAH-03 | Spriječiti kreiranje zahtjeva u zaključanoj poslovnoj godini. | Implementirano (provjera `is_closed`). |
| GOD-ZAH-04 | U frontend formama prikazivati samo šifrarnike aktivne godine. | Implementirano (`/api/reference` vraća aktivnu godinu). |

### Kriteriji dovršenosti

- Nije moguće poslati zahtjev koji kombinira šifrarnike iz različitih poslovnih godina.
- Nije moguće kreirati novi zahtjev u zaključanoj godini.

## Faza 6: Storniranje ✅ DOVRŠENO

Prioritet: **Srednje**

Ova faza pokriva zahtjev 4.6 iz SRS-a. Zahtjev 3.8 (draft) je svjesno izostavljen iz opsega projekta.

### Zadaci

| ID | Zadatak | Napomena |
|---|---|---|
| STO-01 | Dodati akciju `storno`. | Implementirano kroz `ACTIONS.storno` u requestRoutes.js. |
| STO-02 | Administrator može stornirati zahtjev osim ako je zatvoren. | Implementirano. |
| STO-03 | Zapisati storniranje u audit log. | Implementirano kroz RequestStatusHistory. |

### Kriteriji dovršenosti

- Stornirani zahtjev se ne može dalje obrađivati. ✅
- Storniranje je vidljivo u povijesti aktivnosti. ✅

## Faza 7: Proširenje dokumentacije uz zahtjev — ✋ IZVAN OPSEGA

Prioritet: **Izvan opsega** (odluka potvrđena 06.07.2026. — tipovi Narudžbenica i Ostalo se ne implementiraju; formati su usklađeni uz svjesno odstupanje opisano u SRS_STATUS 5.7)

Ova faza pokriva zahtjeve 5.1, 5.3 i djelomično 5.7 iz SRS-a.

### Zadaci

| ID | Zadatak | Napomena |
|---|---|---|
| DOC-01 | Dodati tip dokumenta `Narudžbenica`. | Admin u fazi obrade. |
| DOC-02 | Dodati tip dokumenta `Ostalo`. | Dodatna dokumentacija. |
| DOC-03 | Razmotriti tablicu `DocumentType`. | Ako tipovi trebaju biti šifrarnik. |
| DOC-04 | Uskladiti dozvoljene formate sa SRS-om. | PDF, DOC, DOCX, JPG, PNG. |
| DOC-05 | Definirati pravila po statusima za svaki tip dokumenta. | Upload i brisanje. |
| DOC-06 | Doraditi frontend prikaz dokumenata po tipu. | Jasnije oznake. |

### Kriteriji dovršenosti

- Sustav podržava ponudu, narudžbenicu, otpremnicu i ostalo.
- Zatvoreni zahtjev ne dopušta dodavanje ni brisanje dokumenata.
- Upload pravila su jednaka na frontendu i backendu.

## Faza 8: Pregled, filteri i paginacija ✅ DOVRŠENO

Prioritet: **Srednje**

Ova faza pokriva zahtjeve 6.3 i 6.4 iz SRS-a.

### Zadaci

| ID | Zadatak | Napomena |
|---|---|---|
| LIST-01 | Dodati query parametre na `GET /api/requests`. | `page`, `pageSize`, `status`, `year`, `department`, `category`, `user`, `search`. |
| LIST-02 | Implementirati serversku paginaciju. | 10 zahtjeva po stranici prema SRS-u. |
| LIST-03 | Vratiti ukupan broj rezultata. | Potrebno za tablicu. |
| LIST-04 | Prebaciti frontend tablicu na server-side režim. | Quasar table server pagination. |
| LIST-05 | Dodati filter po poslovnoj godini. | Admin i korisnik. |
| LIST-06 | Dodati filter po predmetu nabave. | Preko stavki zahtjeva. |

### Kriteriji dovršenosti

- Lista zahtjeva ne učitava sve zapise odjednom.
- Paginacija radi na serveru.
- Filteri iz SRS-a dostupni su korisniku.
- Zaposlenik i dalje vidi samo vlastite zahtjeve.

## Faza 9: Notifikacije i audit dorade ✅ DOVRŠENO

Prioritet: **Srednje**

Ova faza pokriva zahtjeve 8.2, 9.1 i 9.2 iz SRS-a.

### Zadaci

| ID | Zadatak | Napomena |
|---|---|---|
| NOT-01 | Dodati tablicu `Notification`. | Korisnik, poruka, tip, status pročitano/nepročitano. |
| NOT-02 | Kreirati notifikaciju kod promjene statusa. | Vlasniku zahtjeva. |
| NOT-03 | Kreirati notifikaciju kad zahtjev dođe adminu na obradu. | Administratorima. |
| NOT-04 | Dodati frontend prikaz notifikacija. | Header ili dashboard. |
| NOT-05 | Dodati označavanje kao pročitano. | Osnovna funkcija. |
| AUD-01 | Dodati `updated_by_user` ili pouzdano izvlačiti zadnjeg izmjenitelja iz historyja. | Za zahtjev 8.2. |
| AUD-02 | Kod uređivanja zahtjeva zapisati audit zapis. | Već postoji osnovni zapis, može se proširiti. |

### Kriteriji dovršenosti

- Korisnik vidi obavijest o promjeni statusa vlastitog zahtjeva.
- Djelatnik vidi obavijest kada je zahtjev vraćen na dopunu.
- Notifikacije ostaju vidljive dok ih korisnik ne pročita.
- Povijest radnji ostaje dostupna na detalju zahtjeva.

## Faza 10: Limiti i financijsko praćenje ✅ DOVRŠENO (analitika izvan opsega)

Prioritet: **Dovršeno**

Ova faza se ostavlja za kraj jer se oslanja na poslovne godine, šifrarnike, statusni workflow i storniranje.

Implementirano: godišnji budžet i limiti po odjelu i po predmetu nabave s kontrolom alokacije (LIM-01, LIM-02), potrošnja po odjelu i po kategoriji iz zahtjeva u statusima Naručeno/Zatvoreno (LIM-03, LIM-04, LIM-05: zahtjev utječe na potrošnju od statusa Naručeno; LIM-06: odbijeni/stornirani ne troše), pregled potrošnje po odjelima i kategorijama na stranici Financije (LIM-08) te upozorenje administratoru kod prekoračenja u dijalogu odobravanja s automatskom bilješkom u povijesti aktivnosti (LIM-07 — ne blokira). Napomena za LIM-04: iznos postoji na razini zahtjeva (stavke nemaju cijenu), pa se kategoriji pripisuju zahtjevi čije sve stavke dijele tu kategoriju, a miješani se iskazuju zbirno kao neraspodijeljeni. Analitički pregled (LIM-09) je izvan opsega — odluka 06.07.2026.

### Zadaci

| ID | Zadatak | Napomena |
|---|---|---|
| LIM-01 | Omogućiti unos godišnjih limita po mjestu troška. | Već postoji polje u bazi. |
| LIM-02 | Omogućiti unos godišnjih limita po predmetu nabave. | Već postoji polje u bazi. |
| LIM-03 | Izračunati potrošnju po mjestu troška. | Prema iznosima zahtjeva. |
| LIM-04 | Izračunati potrošnju po predmetu nabave. | Prema stavkama/kategorijama zahtjeva. |
| LIM-05 | Definirati kada zahtjev utječe na limit. | Prema SRS-u: kad prijeđe u `Poslano`. |
| LIM-06 | Definirati što se događa kod odbijanja, storniranja i zatvaranja. | Poslovno pravilo. |
| LIM-07 | Prikazati administratoru upozorenje kod prekoračenja. | Ne blokira slanje. |
| LIM-08 | Dodati pregled potrošnje. | Po godini, mjestu troška i predmetu nabave. |
| LIM-09 | ~~Dodati osnovni analitički pregled.~~ | Izvan opsega — odluka 06.07.2026. |

### Kriteriji dovršenosti

- Administrator vidi limite i potrošnju.
- Sustav računa potrošnju po mjestu troška i predmetu nabave.
- Prekoračenje limita ne blokira zahtjev, ali je jasno označeno administratoru.
- Limiti su vezani uz poslovnu godinu.

## Faza 11: AI agent za asistirano kreiranje zahtjeva

Prioritet: **Za diplomski** (izvan MVP opsega)

Ova faza pokriva konverzacijski AI modul detaljno opisan u `docs/AI.md`. Agent korisniku pomaže
kreirati zahtjev razgovorom umjesto ručnog popunjavanja `NewRequestPage.vue` wizarda, uz ključnu
arhitekturnu odluku koja prožima sve podfaze: **AI ne smije zaobići postojeću validaciju** —
agent završi poziv iste servisne funkcije/endpointa koju koristi ručni flow (`requestRoutes.js`),
inače postoje dva izvora istine i AI može kreirati nalog koji ručni flow nikad ne bi propustio.

### Zadaci

| ID | Zadatak | Napomena |
|---|---|---|
| AI-01 | Scoping — koja polja agent smije popuniti, granice odgovornosti, ponašanje kod dvosmislenosti. | docs/AI.md Faza 0. |
| AI-02 | Izdvojiti validacijsku/kreacijsku logiku iz `POST /api/requests` u `server/src/services/requestService.js`. | Preduvjet za `create_request()`, po uzoru na `budgetService.js`; čisti refactor, testovi na `POST /api/requests` moraju proći nepromijenjeni. |
| AI-03 | `LlmProvider` sučelje + `OllamaProvider` (`gemma4:12b`) + `GeminiProvider` + runtime toggle. | Toggle kao postavka u bazi, ne `.env` — mijenja se bez restarta servera. |
| AI-04 | Domenski tools: `list_departments`, `list_item_categories`, `get_active_fiscal_year`, `find_similar_past_items`, `get_user_recent_departments`, `add_item`/`remove_item`/`set_justification`/`preview_request`, `create_request`. | `create_request()` zove isključivo `requestService.js`; jedini tool koji piše u bazu. |
| AI-05 | Nova ruta `server/src/routes/assistantRoutes.js` — `POST /api/assistant/chat` sa streamingom (SSE) i tool-calling petljom. | Rate limiting odmah (`express-rate-limit` već je dependency). |
| AI-06 | Finalna potvrda u UI-ju prije `create_request()`. | Korisnik ima zadnju riječ — ne smije se preskočiti. |
| AI-07 | Wiring na `IndexPage.vue` — zamjena `setTimeout` mocka pravim streaming pozivom. | `submitAsk()` / `sendChatMessage()`. |
| AI-08 | Testiranje (unit s mockiranim providerima, integracijski s pravom MySQL bazom) i sigurnosni pregled (prompt injection otpornost). | Po uzoru na `server/__tests__/`. |
| AI-09 | Evaluacija `gemma4:12b` vs. Gemini Flash za diplomski rad. | Brzina, točnost, broj koraka do dovršetka zahtjeva. |

### Kriteriji dovršenosti

- Zahtjev koji agent kreira prolazi identičnu validaciju kao zahtjev kreiran ručno.
- Zahtjev se ne kreira bez eksplicitne potvrde korisnika u pregledu.
- Provider (Ollama/Gemini) se mijenja u runtimeu, bez restarta servera.
- Postoji evaluacijski materijal (Ollama/gemma4:12b vs. Gemini Flash) za diplomski rad.

## Predloženi redoslijed rada

Preporučeni praktični redoslijed:

1. Završiti dokumentacijski kostur.
2. Uskladiti README.
3. Implementirati admin korisnike.
4. Implementirati poslovne godine.
5. Implementirati šifrarnike.
6. Dodati provjeru poslovne godine kod zahtjeva.
7. Proširiti dokumente (Narudžbenica, Ostalo).
9. Dodati serversku paginaciju i filtere.
10. Doraditi notifikacije i audit.
11. Implementirati limite i analitiku.
12. Implementirati AI agenta za asistirano kreiranje zahtjeva (docs/AI.md, Faza 11).

## MVP opseg

Za potrebe MVP-a dovoljno je da sustav pouzdano podržava:

- prijavu korisnika,
- osnovne role,
- kreiranje zahtjeva,
- pregled vlastitih/svih zahtjeva,
- workflow obrade zahtjeva,
- upload ponude i otpremnice,
- povijest aktivnosti,
- osnovnu administraciju korisnika,
- osnovno upravljanje poslovnim godinama i šifrarnicima.

Funkcionalnosti koje se mogu opisati kao buduće dorade:

- proširene vrste dokumenata (Narudžbenica, Ostalo),
- napredno financijsko praćenje limita,
- analitički dashboard,
- perzistentne notifikacije,
- PDF generiranje,
- reset lozinke,
- napredna revizija svih promjena,
- produkcijski sigurnosni hardening,
- AI agent za asistirano kreiranje zahtjeva (docs/AI.md).

## Rizici

| Rizik | Utjecaj | Ublažavanje |
|---|---|---|
| Prevelik opseg SRS-a | Projekt se može razvući i ostati nedovršen. | Jasno razdvojiti MVP i buduće dorade. |
| Limiti se implementiraju prerano | Kasnije promjene workflowa mogu zahtijevati prepravke. | Limite ostaviti za kraj. |
| Poslovne godine nisu dobro definirane | Šifrarnici i izvještaji mogu postati nekonzistentni. | Prvo riješiti model poslovnih godina. |
| Dokumentacija ne prati kod | Završna dokumentacija može biti netočna. | Redovito ažurirati `SRS_STATUS.md`. |
| Nedostatak testova | Regresije se mogu teško uočiti. | Postupno dodavati backend i frontend testove. |

## Zaključak

Projekt već ima funkcionalnu jezgru za osnovni proces nabave, ali mu nedostaju administrativni moduli i financijsko praćenje kako bi u potpunosti odgovarao SRS-u.
Najsigurniji daljnji razvoj je postupan: prvo dokumentacija i administracija, zatim poslovne godine i šifrarnici, nakon toga workflow dorade, a tek na kraju limiti i analitika.
