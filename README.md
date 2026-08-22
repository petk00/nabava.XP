# nabava.XP

> Aplikacija za upravljanje zahtjevima za nabavu na Veleučilištu u Rijeci.

veleri.XP je full-stack web aplikacija za digitalizaciju procesa nabave: zaposlenik kreira zahtjev, administrator ga preuzima, odobrava ili vraća na izmjenu, a zahtjev se zatvara nakon dostave potrebne dokumentacije.

## Status projekta

![CI](https://github.com/petk00/veleri.XP/actions/workflows/ci.yml/badge.svg)

**Verzija:** 1.1  
**Faza:** funkcionalno zaokružen sustav — kompletan tijek nabave s financijskim praćenjem

### Implementirano

- Prijava korisnika (httpOnly JWT cookie).
- Dvije uloge: `Administrator` i `Zaposlenik`.
- Kreiranje (višekoračni wizard, s ponudom ili bez), pregled, uređivanje i storniranje zahtjeva.
- Automatski broj zahtjeva u formatu `NAB-GGGG-NNNN` (npr. `NAB-2026-0001`).
- Odabir aktivne poslovne godine, odjela i kategorije nabave.
- Unos stavki i količina; provjera da stavke i odjel pripadaju istoj godini.
- Serverska paginacija i filteri (status, odjel, korisnik, godina, kategorija, pretraga; status i kroz `?status=` URL parametar).
- Kompletan workflow statusa s provjerom ovlasti.
- Upload, download i brisanje dokumenata (`Ponuda`, `Otpremnica`) s magic-bytes provjerom sadržaja.
- Audit trail kroz povijest aktivnosti (`RequestStatusHistory`).
- In-app obavijesti o promjenama statusa; više novih obavijesti grupira se u jednu s linkom na filtriranu listu.
- Admin upravljanje korisnicima (CRUD, invite link, deaktivacija; novi korisnik je neaktivan dok ne postavi lozinku). Deaktivacija odmah ruši aktivnu sesiju; zadnji aktivni administrator ne može se deaktivirati, obrisati ni degradirati.
- Admin upravljanje poslovnim godinama, odjelima i kategorijama, uključujući aktivaciju/deaktivaciju (deaktivirani zapis ne nudi se kod novih zahtjeva, postojeći ostaju netaknuti).
- Kopiranje šifrarnika pri otvaranju nove poslovne godine.
- **Financijsko praćenje:** godišnji budžet, limiti i potrošnja po odjelima i po kategorijama (stranica Financije), uz kontrolu da zbroj limita ne premaši budžet; dijalog odobravanja prikazuje projekciju potrošnje odjela i bilježi prekoračenja u povijest (upozorava, ne blokira).
- Security hardening: CORS whitelist, rate limiting, Helmet, path traversal zaštita, trust proxy iza nginxa; uloga i aktivnost korisnika provjeravaju se iz baze pri svakom zahtjevu.
- Generiranje PDF dokumenta zahtjeva (samo za admin, status Naručeno/Zatvoreno).
- Testovi na tri razine: unit (Jest, Vitest), API integracijski s pravom bazom (supertest + MySQL) i end-to-end (Playwright) — ukupno 100+ testova, sve tri razine u CI-ju.
- Docker deployment (MySQL + Express backend + Quasar/nginx frontend s HTTPS preusmjeravanjem).
- Health endpoint `/health` koji vraća status aplikacije i provjeru dostupnosti baze.

### Svjesno izvan opsega

- Draft zahtjeva — zahtjev se uvijek šalje odmah.
- Tipovi dokumenata `Narudžbenica` i `Ostalo`.
- Email obavijesti o promjeni statusa (postoji samo opcionalni invite email) i trajni centar obavijesti.
- Analitički modul potrošnje (osnovni pregled postoji na stranici Financije).
- 2FA i audit log prijava.
- Cijene po stavci — iznos postoji na razini zahtjeva, pa se potrošnja kategorije računa iz zahtjeva čije sve stavke dijele tu kategoriju, a miješani zahtjevi iskazuju se zbirno kao neraspodijeljeni (egzaktna raspodjela tražila bi cijene po stavci).

## Dokumentacija

| Dokument | Opis |
|---|---|
| `docs/AI.md` | AI prijedlozi |
| `docs/SRS_STATUS.md` | Status implementacije prema SRS zahtjevima. |
| `docs/ARHITEKTURA.md` | Arhitektura sustava i opis slojeva. |
| `docs/API.md` | REST API dokumentacija. |
| `docs/BAZA_PODATAKA.md` | Dokumentacija baze podataka. |
| `docs/KORISNICKE_UPUTE.md` | Korisničke upute za zaposlenika i administratora. |
| `docs/TEST_PLAN.md` | Plan testiranja. |
| `docs/DEPLOYMENT.md` | Instalacija na produkcijski server, TLS, backup i restore. |
| `docs/PLAN_DORADA.md` | Preporučeni redoslijed daljnjih dorada. |

## Tech Stack

| Sloj | Tehnologija |
|---|---|
| Frontend | Vue 3, Quasar Framework, Composition API |
| Backend | Node.js, Express 5 |
| Baza | MySQL 8.0 |
| Auth | JWT (httpOnly cookie), bcrypt |
| Upload | Multer |
| PDF | jsPDF (client-side) |
| Testovi | Jest, Supertest (backend) · Vitest, jsdom (frontend) · Playwright (e2e) |
| Deployment | Docker, Docker Compose, nginx |

## Struktura projekta

```text
veleri.XP/
├── client/              # Vue 3 + Quasar frontend
│   ├── src/
│   │   ├── pages/       # Stranice aplikacije
│   │   ├── layouts/     # AuthLayout, MainLayout
│   │   ├── components/  # Dijeljene komponente
│   │   ├── router/      # Routing i zaštita ruta
│   │   ├── boot/        # Axios konfiguracija
│   │   ├── composables/ # useActionableRequestsNotifier (in-app obavijesti)
│   │   ├── utils/       # authStorage, budgetMath
│   │   └── __tests__/   # Vitest unit testovi
│   ├── public/          # Statički resursi (logo, ikone)
│   ├── Dockerfile
│   └── nginx.conf
├── server/              # Node.js + Express backend
│   ├── src/
│   │   ├── routes/      # API rute (sva poslovna logika)
│   │   ├── middleware/  # Auth middleware
│   │   ├── services/    # budgetService, emailService, fileTypeService
│   │   └── config/      # DB konfiguracija
│   ├── __tests__/       # Jest unit testovi
│   │   └── integration/ # API integracijski testovi (prava MySQL baza)
│   └── Dockerfile
├── e2e/                 # Playwright end-to-end testovi
│   ├── tests/           # auth, requests, workflow, documents, financije, korisnici
│   ├── seed.e2e.sql     # Testni šifrarnici za CI (aktivna godina, odjeli, kategorije)
│   └── playwright.config.js
├── db/                  # SQL init skripte za Docker MySQL
│   ├── 01_schema.sql
│   └── 02_seed.sql
├── docker-compose.yml
├── docs/
└── README.md
```

## Workflow zahtjeva

```text
[Zaposlenik kreira zahtjev]
        |
        v
   [Poslano]
    |      |
    |      | admin: odbij
    |      v
    |  [Odbijeno]
    |
    | admin: preuzmi
    v
[Na odobrenju] <------------------+
    |          |                  |
    |          | admin:           | admin:
    |          | vrati-na-izmjenu | vrati-u-obradu
    |          v                  |
    |    [Vraćeno na dopunu] -----+
    |      |
    |      | zaposlenik: resubmit
    |      v
    |   [Poslano]
    |
    | admin: odobri (zahtijeva Ponudu)
    v
  [Naručeno]
        |
        | admin: završi (zahtijeva Ponudu + Otpremnicu + iznos)
        v
  [Zatvoreno]

Admin može stornirati zahtjev iz bilo kojeg aktivnog statusa → [Odbijeno].
```

| ID | Status |
|---:|---|
| 1 | Poslano |
| 2 | Na odobrenju |
| 3 | Vraćeno na dopunu/izmjenu |
| 5 | Odbijeno |
| 6 | Naručeno |
| 7 | Zatvoreno |

## Pokretanje putem Dockera (preporučeno)

### Postupak instalacije i pokretanja sustava

1. Instalirati [Docker Desktop](https://docs.docker.com/get-started/get-docker/) i pokrenuti ga.

2. Klonirati repozitorij aplikacije na lokalno računalo ili server:

```bash
git clone https://github.com/petk00/veleri.XP
cd veleri.XP
```

3. Kreirati `.env` datoteku u korijenu projekta s JWT tajnim ključem i MySQL lozinkama.

   **Najlakše (bilo koji OS) — ručno u Notepadu ili VS Code:**  
   Kreirati datoteku `.env` u korijenu projekta (`veleri.XP/.env`) s ovim sadržajem:
   ```
   JWT_SECRET=PROMIJENI_OVO_minimum_32_znaka_dugacak_kljuc_ovdje
   DB_ROOT_PASSWORD=PROMIJENI_OVO_root_lozinka
   DB_PASSWORD=PROMIJENI_OVO_app_lozinka
   ```
   Zamijeniti `PROMIJENI_OVO_...` s vlastitim jakim vrijednostima. `JWT_SECRET` mora imati minimalno 32 znaka.

   **macOS / Linux / Git Bash:**
   ```bash
   {
     echo "JWT_SECRET=$(openssl rand -base64 48)"
     echo "DB_ROOT_PASSWORD=$(openssl rand -base64 24)"
     echo "DB_PASSWORD=$(openssl rand -base64 24)"
   } > .env
   ```

   **Windows PowerShell 5.x** (standardni PowerShell na Windows 10/11):
   ```powershell
   $rng = [Security.Cryptography.RNGCryptoServiceProvider]::new()
   $b = New-Object byte[] 48; $rng.GetBytes($b); "JWT_SECRET=$([Convert]::ToBase64String($b))" | Set-Content .env -Encoding ASCII
   $b = New-Object byte[] 24; $rng.GetBytes($b); "DB_ROOT_PASSWORD=$([Convert]::ToBase64String($b))" | Add-Content .env -Encoding ASCII
   $b = New-Object byte[] 24; $rng.GetBytes($b); "DB_PASSWORD=$([Convert]::ToBase64String($b))" | Add-Content .env -Encoding ASCII
   ```

   **Windows PowerShell 7+:**
   ```powershell
   "JWT_SECRET=$([Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48)))" | Set-Content .env -Encoding utf8NoBOM
   "DB_ROOT_PASSWORD=$([Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)))" | Add-Content .env -Encoding utf8NoBOM
   "DB_PASSWORD=$([Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)))" | Add-Content .env -Encoding utf8NoBOM
   ```

   > **Važno:** `.env` datoteka mora biti plain UTF-8 (bez BOM) ili ASCII — Docker Compose ne može čitati UTF-16 datoteke koje `Out-File` ponekad kreira na staroj PowerShell verziji.

   Bez `JWT_SECRET`, `DB_ROOT_PASSWORD` i `DB_PASSWORD` Docker Compose odbija pokrenuti stack.

4. Izgraditi i pokrenuti sve kontejnere:

```bash
docker compose up --build
```

5. Nakon što sva tri kontejnera budu pokrenuta (poruka `Server running on http://localhost:3000` u logu), aplikacija je dostupna u web pregledniku na adresi:

```
https://localhost
```

> **Napomena:** Preglednik će prikazati sigurnosno upozorenje za self-signed SSL certifikat — kliknite *Napredno* → *Nastavi prema localhost* (ili ekvivalent u vašem pregledniku).

6. Za prijavu u aplikaciju koristiti inicijalne korisničke račune iz seed podataka:

```
Administrator:  admin@veleri.hr
Zaposlenik:     zaposlenik@veleri.hr

Lozinka za oba računa: 12345678
```

### Napomene za Windows

Cijeli stack se izvršava u Linux kontejnerima, pa na Windowsu radi jednako kao na macOS/Linuxu. Tri stvari na koje treba paziti:

- **Docker Desktop koristi WSL2 backend** — instalirati [Docker Desktop za Windows](https://docs.docker.com/desktop/setup/install/windows-install/) i pri prvom pokretanju prihvatiti WSL2 postavku (installer je nudi automatski).
- **`.env` mora biti UTF-8 ili ASCII** — koristiti PowerShell naredbe iz koraka 3 iznad (starije `Out-File` naredbe znaju kreirati UTF-16 koji Docker Compose ne čita).
- **Portovi 80 i 443 moraju biti slobodni** — na Windowsu ih znaju držati IIS ili druge usluge. Provjera: `netstat -ano | findstr ":80"`. Ako su zauzeti, u `docker-compose.yml` promijeniti mapiranje frontenda u npr. `"8080:80"` i `"8443:443"` pa aplikaciju otvoriti na `https://localhost:8443`.

Repozitorij sadrži `.gitattributes` koji čuva ispravne (LF) line endinge pri checkoutu na Windowsu — za to nije potrebno ništa napraviti. Preporuka: klonirati izvan OneDrive/Dropbox sinkroniziranih mapa.

### Napomene za produkcijski deploy

- Generirati jak JWT tajni ključ i MySQL lozinke te postaviti ih u `.env` u korijenu projekta. Docker Compose odbija pokrenuti stack bez `JWT_SECRET`, `DB_ROOT_PASSWORD` i `DB_PASSWORD`.
- Za pristup s drugih računala postaviti `SERVER_IP` u istom `.env` (javna IP adresa ili domena servera, bez porta) — compose iz toga gradi `API_URL` i CORS whitelist. Vidjeti `.env.example`.
- Ne commitati produkcijski `.env`; lozinke ostaju lokalno na serveru.
- Frontend koristi self-signed certifikat (generira se pri buildu) — za javnu produkciju zamijeniti pravim certifikatom u nginx konfiguraciji.
- MySQL init skripte (`db/`) izvršavaju se **samo pri prvom pokretanju na praznom volumenu**. Za čisti reinit (briše bazu i uploade!): `docker compose down -v && docker compose up --build`. Običan `down` čuva podatke.
- Uploadani dokumenti čuvaju se u named volumenu `uploads` i ostaju perzistentni između restartova.

## Lokalno pokretanje (bez Dockera)

### 1. Baza podataka

Instalirati MySQL 8.0, zatim kreirati bazu i importati init skripte:

```bash
mysql -u root -p -e "CREATE DATABASE XP CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p XP < db/01_schema.sql
mysql -u root -p XP < db/02_seed.sql
```

### 2. Backend

```bash
cd server
cp .env.example .env   # prilagoditi lozinke i JWT_SECRET
npm install
npm run dev
```

Server se pokreće na `http://localhost:3000`.

### 3. Frontend

```bash
cd client
npm install
npm run dev
```

Quasar će ispisati lokalni URL, najčešće `http://localhost:9000`.

## Početni korisnički računi

| Uloga | E-mail | Lozinka |
|---|---|---|
| Administrator | `admin@veleri.hr` | `12345678` |
| Zaposlenik | `zaposlenik@veleri.hr` | `12345678` |

## Prvi koraci nakon instalacije

Svježa instalacija namjerno **ne sadrži šifrarnike** — bez njih se novi zahtjev ne može kreirati. Administrator ih postavlja kroz aplikaciju:

1. Prijaviti se kao `admin@veleri.hr` i otvoriti stranicu **Financije**.
2. Kliknuti **Nova poslovna godina** — unijeti godinu i ukupni godišnji budžet.
3. Dodati **odjele** (mjesta troška) s budžetskim limitima — zbroj limita ne može premašiti godišnji budžet.
4. Dodati **kategorije artikala** (predmete nabave), po želji s vlastitim limitima.
5. Kroz stranicu **Korisnici** kreirati račune zaposlenika — sustav generira invite link koji se korisniku prosljeđuje ručno (Teams, email...); korisnik je neaktivan dok preko linka ne postavi lozinku.

Nakon toga zaposlenici mogu kreirati zahtjeve kroz wizard **Novi zahtjev**.

## Testiranje

**Backend** (iz `server/` mape; integracijski dio zahtijeva dostupan MySQL — bez njega se preskače):

```bash
npm test
```

Pokriva: unit testove (generiranje broja zahtjeva, state machine, pravila uploada, projekcija budžeta) i **API integracijske testove s pravom bazom** — testovi sami kreiraju zasebnu `XP_test` bazu i supertestom gađaju cijelu aplikaciju (auth, role, validacija limita, workflow).

**Frontend** (iz `client/` mape):

```bash
npm test
```

Pokriva: `authStorage`, `useActionableRequestsNotifier` (deduplikacija i grupiranje obavijesti), `budgetMath` (postoci limita, slobodna alokacija).

**End-to-end testovi** (iz `e2e/` mape, zahtijeva pokrenute backend i frontend servise):

```bash
cd e2e
npm test
```

Pokriva: prijavu i kontrolu pristupa, kreiranje zahtjeva kroz wizard (s ponudom i bez), puni workflow (preuzmi → odobri s pregledom limita → otpremnica → zatvori), storniranje, vraćanje na dopunu, upload/brisanje dokumenata, Financije (kategorije s limitima) i Korisnike (invite tok, domensko pravilo, aktivacija).

> **Lokalno pokretanje:** Testovi zahtijevaju istovremeno pokrenute backend (`npm run dev` u `server/`) i frontend (`npm run dev` u `client/`), s inicijaliziranom bazom. Ako je baza svježa (bez šifrarnika), testni podaci se ubacuju s `mysql -u root -p XP < e2e/seed.e2e.sql`. Preporučeno je i povisiti rate limite u `server/.env` (vidi `server/.env.example`) jer e2e suite radi puno prijava. U CI-ju se svi servisi automatski podižu unutar pipeline-a.

Za interaktivni UI mod:

```bash
npm run test:ui
```

**Lint i build provjera:**

```bash
cd client
npm run lint
npm run build
```

## Sigurnosni model

- JWT autentikacija putem `httpOnly` cookie-ja (`sameSite: strict`, `secure` u produkciji).
- bcrypt hashiranje lozinki.
- Role-based provjere za sve administratorske akcije.
- Parametrizirani SQL upiti (zaštita od SQL injekcije).
- CORS whitelist konfiguriran kroz env varijablu `CLIENT_URL`.
- Rate limiting: login (20 pokušaja / 15 min), set-password (10 pokušaja / sat); limiti se za razvoj/testove mogu povisiti env varijablama `LOGIN_RATE_LIMIT_MAX` i `CHECK_EMAIL_RATE_LIMIT_MAX` (produkcijski defaulti vrijede bez njih).
- `trust proxy` — ispravna identifikacija korisnika iza nginx proxyja (Docker/produkcija).
- Helmet middleware (sigurnosni HTTP headeri).
- Provjera postojanja obaveznih env varijabli pri pokretanju servera.
- Whitelist dozvoljenih MIME tipova za upload + magic-bytes provjera stvarnog sadržaja datoteke (`file-type`).
- Zaštita od path traversal napada kod preuzimanja dokumenata.
- Transakcije i `FOR UPDATE` lockovi za osjetljive promjene statusa.
- API ne vraća `error.message` niti stack trace klijentu.

## Academic Context

Projekt se razvija u sklopu studija na:

**Veleučilište u Rijeci**  
**Stručni diplomski studij Informacijske tehnologije u poslovnim sustavima**  
**Smjer: Programsko inženjerstvo**

## Autor

**Igor Petkovic**
