# Arhitektura sustava

Ovaj dokument opisuje arhitekturu aplikacije `nabava.XP`, odnosno način na koji su povezani frontend, backend i baza podataka.
Aplikacija je organizirana kao full-stack web aplikacija za upravljanje zahtjevima za nabavu.

## Pregled sustava

Sustav je podijeljen na tri glavna sloja:

| Sloj | Tehnologija | Uloga |
|---|---|---|
| Klijentski sloj | Vue 3, Quasar Framework | Korisničko sučelje za djelatnike i administratore. |
| Poslužiteljski sloj | Node.js, Express | REST API, autentikacija, poslovna logika i komunikacija s bazom. |
| Podatkovni sloj | MySQL / MariaDB | Pohrana korisnika, zahtjeva, stavki, dokumenata, statusa i šifrarnika. |

Komunikacija između klijenta i poslužitelja odvija se preko REST API-ja. Frontend šalje HTTP zahtjeve prema backendu, a backend vraća podatke u JSON formatu.

## Visoka arhitektura

```text
+-----------------------------+
|        Web preglednik        |
| Vue 3 + Quasar aplikacija    |
+--------------+--------------+
               |
               | HTTP/JSON
               | Cookie: token (httpOnly)
               v
+--------------+--------------+
|       Node.js / Express      |
| REST API + poslovna logika   |
+--------------+--------------+
               |
               | SQL upiti
               v
+--------------+--------------+
|       MySQL / MariaDB        |
| Relacijska baza podataka     |
+-----------------------------+
```

## Struktura projekta

```text
nabava.XP/
├── client/                 # Frontend aplikacija
│   └── src/
│       ├── boot/           # Axios konfiguracija
│       ├── components/     # Zajedničke Vue komponente
│       ├── composables/    # Reusable Composition API logika
│       ├── layouts/        # Layout komponente
│       ├── pages/          # Stranice aplikacije
│       ├── router/         # Definicija ruta
│       ├── stores/         # Pinia stores
│       └── utils/          # Pomoćne funkcije
├── server/                 # Backend aplikacija
│   └── src/
│       ├── config/         # Konfiguracija baze
│       ├── middleware/     # Middleware funkcije
│       ├── routes/         # Express rute
│       └── index.js        # Ulazna točka servera
├── database/               # SQL dump i dokumentacija baze
└── docs/                   # Projektna dokumentacija
```

## Frontend arhitektura

Frontend se nalazi u direktoriju `client/` i implementiran je pomoću Vue 3 i Quasar Frameworka.

Glavne frontend cjeline:

| Datoteka / direktorij | Uloga |
|---|---|
| `client/src/router/routes.js` | Definicija ruta aplikacije. |
| `client/src/layouts/AuthLayout.vue` | Layout za login i početne stranice. |
| `client/src/layouts/MainLayout.vue` | Glavni layout aplikacije nakon prijave. |
| `client/src/pages/LoginPage.vue` | Prijava korisnika (dvofazni email → lozinka flow). |
| `client/src/pages/SetPasswordPage.vue` | Postavljanje lozinke putem invite linka. |
| `client/src/pages/RequestsPage.vue` | Pregled i filtriranje zahtjeva s serverskom paginacijom. |
| `client/src/pages/NewRequestPage.vue` | Kreiranje novog zahtjeva. |
| `client/src/pages/EditRequestPage.vue` | Uređivanje zahtjeva (samo u statusu Vraćeno). |
| `client/src/pages/RequestDetailsPage.vue` | Detalji zahtjeva, dokumenti, statusi i povijest. |
| `client/src/pages/IndexPage.vue` | Početni dashboard nakon prijave. |
| `client/src/pages/UsersPage.vue` | Admin upravljanje korisnicima (CRUD, invite, deaktivacija). |
| `client/src/pages/FiscalYearPage.vue` | Admin upravljanje poslovnim godinama, odjelima i kategorijama. |
| `client/src/boot/axios.js` | Konfiguracija Axios klijenta; API URL iz env varijable. |
| `client/src/composables/useActionableRequestsNotifier.js` | In-app notifikacije o promjenama statusa zahtjeva. |
| `client/src/utils/authStorage.js` | Pomoćne funkcije za čitanje korisnika iz lokalne pohrane. |

Frontend koristi Axios za komunikaciju s backendom. Osnovna API adresa konfigurira se kroz environment varijablu `API_URL` (u `quasar.config.js`); zadana vrijednost za razvoj je `http://localhost:3000/api`.

JWT token se **ne sprema u `localStorage`** nego se koristi kao `httpOnly` cookie kojeg postavlja backend pri prijavi. Frontend ne čita niti šalje token eksplicitno — Axios šalje cookie automatski kroz `withCredentials: true`.

## Backend arhitektura

Backend se nalazi u direktoriju `server/` i implementiran je pomoću Node.js i Expressa.

Glavne backend cjeline:

| Datoteka | Uloga |
|---|---|
| `server/src/index.js` | Pokretanje Express aplikacije i registracija ruta. |
| `server/src/config/db.js` | Konfiguracija konekcije prema MySQL/MariaDB bazi. |
| `server/src/middleware/authMiddleware.js` | Provjera JWT tokena i zaštita API ruta. |
| `server/src/routes/authRoutes.js` | Login, odjava, postavljanje lozinke putem invite tokena. |
| `server/src/routes/requestRoutes.js` | Kreiranje, pregled, uređivanje i promjena statusa zahtjeva. |
| `server/src/routes/requestAttachmentRoutes.js` | Upload i pregled dokumenata vezanih uz zahtjev. |
| `server/src/routes/attachmentRoutes.js` | Download i brisanje dokumenata. |
| `server/src/routes/userRoutes.js` | Admin upravljanje korisnicima (CRUD, invite, reset linka). |
| `server/src/routes/fiscalYearRoutes.js` | Upravljanje poslovnim godinama, odjelima i kategorijama. |
| `server/src/routes/referenceRoutes.js` | Dohvat aktivne poslovne godine, mjesta troška i predmeta nabave. |

Backend koristi REST pristup. Najvažnije grupe ruta su:

| Prefiks | Namjena |
|---|---|
| `/api/auth` | Autentikacija korisnika (login, logout, set-password). |
| `/api/requests` | Zahtjevi za nabavu i dokumenti zahtjeva. |
| `/api/attachments` | Download i brisanje dokumenata. |
| `/api/users` | Admin upravljanje korisnicima. |
| `/api/fiscal-years` | Upravljanje poslovnim godinama, odjelima i kategorijama. |
| `/api/reference` | Referentni podaci: aktivna godina, odjeli i kategorije. |

## Podatkovni sloj

Baza podataka je relacijska i koristi MySQL/MariaDB.

Glavne tablice:

| Tablica | Uloga |
|---|---|
| `AppUser` | Korisnici sustava. |
| `Role` | Korisničke uloge. |
| `FiscalYear` | Poslovne godine. |
| `Department` | Mjesta troška / odjeli. |
| `ItemCategory` | Predmeti nabave / kategorije. |
| `PurchaseRequest` | Glavni zapis zahtjeva. |
| `PurchaseRequestItem` | Stavke zahtjeva. |
| `RequestStatus` | Šifrarnik statusa zahtjeva. |
| `RequestStatusHistory` | Povijest statusa i aktivnosti nad zahtjevom. |
| `Attachment` | Dokumenti vezani uz zahtjev. |

Trenutni SQL dump nalazi se u:

```text
database/dump-XP-202605061957.sql
```

Dijagrami baze nalaze se u direktoriju `docs/`:

```text
docs/MODEL EV.png
docs/RELACIJSKI MODEL.png
```

## Autentikacija i autorizacija

Sustav koristi JWT autentikaciju.

Osnovni tok prijave:

1. Korisnik unosi email i lozinku.
2. Frontend šalje podatke na `POST /api/auth/login`.
3. Backend dohvaća korisnika iz baze.
4. Backend provjerava je li korisnik aktivan.
5. Backend uspoređuje unesenu lozinku s bcrypt hashom.
6. Ako su podaci ispravni, backend izdaje JWT token.
7. Frontend sprema token i koristi ga za sljedeće zahtjeve.

Autorizacija se temelji na ulozi korisnika:

| Uloga | Ovlasti |
|---|---|
| `Zaposlenik` | Kreira zahtjeve, vidi vlastite zahtjeve, uređuje zahtjeve kada su vraćeni na dopunu, ponovo šalje vraćene zahtjeve. |
| `Administrator` | Vidi sve zahtjeve, preuzima zahtjeve na obradu, odobrava, vraća na izmjenu, odbija, naručuje, zatvara i stornira zahtjeve; upravlja korisnicima i poslovnim godinama. |

Zaštićene backend rute koriste `authMiddleware`, koji provjerava JWT token i postavlja podatke korisnika u `req.user`.

## Workflow zahtjeva

Trenutni workflow zahtjeva implementiran je u backendu kroz statusne akcije.

```text
Poslano
   |
   | admin: preuzmi
   v
Na odobrenju
   |
   | admin: odobri
   v
Naručeno
   |
   | admin: završi
   v
Zatvoreno
```

Dodatne grane:

```text
Poslano / Vraćeno
   |
   | admin: odbij
   v
Odbijeno

Na odobrenju
   |
   | admin: vrati-na-izmjenu
   v
Vraćeno na dopunu/izmjenu
   |
   | korisnik: resubmit      | admin: vrati-u-obradu
   v                          v
Poslano                   Na odobrenju

Bilo koji aktivni status (osim Zatvoreno)
   |
   | admin: storno
   v
Odbijeno
```

Napomena: status `Odobreno` postoji u bazi, ali se u trenutnom workflowu ne koristi kao zaseban operativni status.

## Dokumenti

Dokumenti se spremaju kroz upload na server filesystem.

Trenutna putanja za upload:

```text
server/uploads/attachments/{id_zahtjeva}/
```

Podaci o dokumentima spremaju se u tablicu `Attachment`.

Trenutno podržane vrste dokumenata:

| Vrsta dokumenta | Namjena |
|---|---|
| `Ponuda` | Dokument ponude ili računa. |
| `Otpremnica` | Dokument potreban prije zatvaranja zahtjeva. |

Podržani tipovi datoteka u implementaciji:

```text
PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, TXT, ZIP
```

Maksimalna veličina datoteke je 10 MB.

## Tok podataka kod kreiranja zahtjeva

```text
Korisnik ispunjava obrazac
        |
        v
Frontend validira osnovna polja
        |
        v
POST /api/requests
        |
        v
Backend validira podatke
        |
        v
Backend generira broj zahtjeva
        |
        v
Spremanje u PurchaseRequest
        |
        v
Spremanje stavki u PurchaseRequestItem
        |
        v
Spremanje početnog zapisa u RequestStatusHistory
        |
        v
Frontend prikazuje potvrdu korisniku
```

Ako korisnik prilikom kreiranja dodaje ponudu, frontend nakon kreiranja zahtjeva šalje dodatni upload zahtjev na:

```text
POST /api/requests/{id}/attachments
```

## ## Sigurnosne značajke

Implementirano:

- JWT autentikacija putem `httpOnly` cookie-ja (`sameSite: strict`, `secure` u produkciji).
- bcrypt hashiranje lozinki.
- provjera aktivnog korisničkog računa.
- role-based provjere za administratorske akcije.
- parametrizirani SQL upiti.
- backend validacija ulaznih podataka.
- provjera statusnih tranzicija kroz state machine.
- ograničenje veličine uploadane datoteke (10 MB).
- whitelist dopuštenih MIME tipova.
- transakcije i `FOR UPDATE` lockovi kod osjetljivih promjena.
- CORS whitelist konfiguriran kroz env varijablu `CLIENT_URL`.
- rate limiting: login (20 pokušaja / 15 min), set-password (10 pokušaja / sat).
- Helmet middleware (sigurnosni HTTP headeri).
- provjera postojanja obaveznih env varijabli pri pokretanju servera.
- zaštita od path traversal napada kod preuzimanja dokumenata.
- API ne vraća `error.message` niti stack trace klijentu.

## Trenutna arhitekturna ograničenja

| Ograničenje | Opis |
|---|---|
| Limiti nisu aktivno korišteni | `department_limit` i `category_limit` postoje u bazi, ali se ne računaju i ne prikazuju u workflowu. |
| Dokumenti koriste lokalne putanje | U bazi se spremaju lokalne filesystem putanje, što otežava prijenos okruženja. |

## Zaključak

Arhitektura aplikacije je troslojna web arhitektura: Vue/Quasar frontend, Express REST API i MySQL/MariaDB baza.
Takva arhitektura je prikladna za akademski projekt jer jasno razdvaja korisničko sučelje, poslovnu logiku i podatkovni sloj.

Implementacija pokriva kompletan proces zahtjeva za nabavu, administraciju korisnika i poslovnih godina, serversku paginaciju s filterima, in-app notifikacije i sigurnosni hardening. Preostale dorade su financijsko praćenje limita, automatizirani testovi i produkcijski deployment.
