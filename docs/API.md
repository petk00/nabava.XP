# API dokumentacija

Ovaj dokument opisuje REST API aplikacije `nabava.XP`.
API koristi JSON format za većinu zahtjeva i odgovora, osim kod uploada i downloada dokumenata.

## Osnovni podaci

| Stavka | Vrijednost |
|---|---|
| Backend tehnologija | Node.js, Express |
| Osnovni URL lokalno | `http://localhost:3000/api` |
| Autentikacija | JWT httpOnly cookie |
| Format podataka | JSON |
| Upload dokumenata | `multipart/form-data` |

## Autentikacija

Većina API ruta zaštićena je JWT tokenom koji se prenosi kao `httpOnly` cookie.
Cookie postavlja backend pri uspješnoj prijavi; browser ga automatski šalje uz svaki zahtjev.
Frontend koristi `withCredentials: true` u Axios konfiguraciji — nema ručnog dodavanja tokena u headere.

Ako cookie nedostaje, nije ispravan ili je istekao, API vraća status `401`.

## Standardni status kodovi

| Status | Značenje |
|---:|---|
| 200 | Zahtjev je uspješno izvršen. |
| 201 | Resurs je uspješno kreiran. |
| 400 | Neispravan zahtjev ili poslovno pravilo nije zadovoljeno. |
| 401 | Korisnik nije autentificiran. |
| 403 | Korisnik nema ovlasti za akciju. |
| 404 | Resurs nije pronađen. |
| 409 | Konflikt, npr. pri generiranju broja zahtjeva. |
| 500 | Interna greška servera. |

## Auth API

### POST `/api/auth/login`

Prijava korisnika u sustav.

Autentikacija: **nije potrebna**

#### Request body

```json
{
  "email": "korisnik@veleri.hr",
  "password": "lozinka"
}
```

#### Uspješan odgovor

JWT token se ne vraća u tijelu odgovora — postavlja se kao `httpOnly` cookie (`token`).

```json
{
  "message": "Prijava uspješna.",
  "user": {
    "id_user": 2,
    "first_name": "Ivan",
    "last_name": "Horvat",
    "email": "ivan.horvat@veleri.hr",
    "role_name": "Zaposlenik"
  }
}
```

#### Moguće greške

| Status | Razlog |
|---:|---|
| 400 | Email ili lozinka nisu poslani. |
| 401 | Neispravni podaci za prijavu. |
| 403 | Korisnički račun nije aktivan. |
| 500 | Greška pri prijavi. |

## Requests API

Rute za zahtjeve koriste prefiks:

```text
/api/requests
```

Sve rute zahtijevaju JWT token.

### GET `/api/requests`

Dohvaća listu zahtjeva sa serverskom paginacijom i filterima.

Pravila pristupa:

- administrator vidi sve zahtjeve,
- zaposlenik vidi samo zahtjeve koje je sam kreirao.

#### Query parametri

| Parametar | Opis |
|---|---|
| `page`, `limit` | Paginacija (default `1` / `10`, limit najviše 500). |
| `search` | Pretraga po broju zahtjeva, podnositelju, odjelu i nazivu statusa. |
| `status` | Naziv statusa (npr. `Poslano`) ili izvedeni filter: `u_obradi`, `ceka_otpremnicu`, `spremno_za_zatvaranje`. |
| `department` | Naziv odjela. |
| `user` | Ime i prezime podnositelja (samo admin). |
| `fiscalYear` | Godina (npr. `2026`). |
| `category` | Naziv kategorije — zahtjevi koji imaju barem jednu stavku te kategorije. |
| `onlyMine` | `1` — admin vidi samo vlastite zahtjeve. |
| `sortBy`, `order` | Sortiranje (`request_number`, `department_name`, `created_by`, `created_at`, `updated_at`, `status_name`; `ASC`/`DESC`). |

#### Uspješan odgovor

```json
{
  "data": [
    {
      "id_purchase_request": 1,
      "request_number": "NAB-2026-0001",
      "fiscal_year": 2026,
      "department_name": "IT",
      "fk_request_status": 1,
      "created_by": "Ivan Horvat",
      "total_amount": "250.00",
      "created_at": "2026-04-23T21:21:14.000Z",
      "updated_at": null,
      "justification": "Zamjena dotrajale opreme",
      "last_comment": "Zahtjev kreiran i poslan.",
      "has_ponuda": 1,
      "has_otpremnica": 0,
      "status_name": "Poslano"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10,
  "counts": {
    "total": 1, "active": 1, "attention": 1, "closed": 0,
    "na_odobrenju": 0, "naruceno": 0, "u_obradi": 1,
    "ceka_otpremnicu": 0, "spremno_za_zatvaranje": 0
  }
}
```

`counts` sadrži nefiltrirane brojeve po statusnim grupama (uz kontrolu pristupa) — koristi ih dashboard.

### GET `/api/requests/meta`

Vraća jedinstvene vrijednosti za filter padajuće izbornike: `departments`, `fiscalYears`, `categories` (za admina i `users`), izvedene iz zahtjeva vidljivih prijavljenom korisniku.

### GET `/api/requests/:id`

Dohvaća detalje pojedinog zahtjeva, njegove stavke i povijest aktivnosti.

Pravila pristupa:

- administrator može dohvatiti bilo koji zahtjev,
- zaposlenik može dohvatiti samo vlastiti zahtjev.

Polja `department_limit` i `department_spent` (stanje budžeta odjela — potrošnja iz zahtjeva u statusima Naručeno/Zatvoreno) vraćaju se **samo administratoru**; koriste se za prikaz utjecaja odobrenja u dijalogu odobravanja.

#### Uspješan odgovor

```json
{
  "request": {
    "id_purchase_request": 1,
    "request_number": "NAB-2026-0001",
    "fiscal_year": 2026,
    "fk_department": 3,
    "department_name": "IT",
    "fk_request_status": 1,
    "created_by": "Ivan Horvat",
    "total_amount": "250.00",
    "justification": "Nabava opreme za rad.",
    "created_at": "2026-04-23T21:21:14.000Z",
    "updated_at": "2026-04-23T21:33:14.000Z",
    "status_name": "Poslano",
    "department_limit": 10000,
    "department_spent": 8200
  },
  "items": [
    {
      "id_purchase_request_item": 1,
      "item_name": "Monitor",
      "quantity": 2,
      "category_name": "Računalna oprema"
    }
  ],
  "history": [
    {
      "id_request_status_history": 1,
      "fk_request_status": 1,
      "changed_by": "Ivan Horvat",
      "changed_at": "2026-04-23T21:21:14.000Z",
      "comment": "Zahtjev kreiran i poslan.",
      "status_name": "Poslano"
    }
  ]
}
```

#### Moguće greške

| Status | Razlog |
|---:|---|
| 404 | Zahtjev nije pronađen ili korisnik nema pristup. |
| 500 | Greška pri dohvaćanju detalja zahtjeva. |

### POST `/api/requests`

Kreira novi zahtjev za nabavu.

Novi zahtjev odmah dobiva status `Poslano`.
Backend automatski generira broj zahtjeva u formatu:

```text
NAB-GGGG-NNNN
```

Primjer:

```text
NAB-2026-0001
```

#### Request body

```json
{
  "fk_fiscal_year": 2,
  "fk_department": 1,
  "justification": "Nabava računalne opreme za ured.",
  "estimated_amount": 500.0,
  "items": [
    {
      "fk_item_category": 1,
      "item_name": "Monitor",
      "quantity": 2
    }
  ]
}
```

#### Obavezna polja

| Polje | Pravilo |
|---|---|
| `fk_fiscal_year` | Obavezno. |
| `fk_department` | Obavezno. |
| `justification` | Obavezno, najviše 1000 znakova. |
| `items` | Obavezno, mora sadržavati barem jednu stavku. |
| `items[].fk_item_category` | Obavezno. |
| `items[].item_name` | Obavezno. |
| `items[].quantity` | Cijeli broj veći od 0. |
| `estimated_amount` | Opcionalno, ako je uneseno mora biti pozitivan broj. |

#### Uspješan odgovor

```json
{
  "message": "Zahtjev je uspješno kreiran.",
  "id_purchase_request": 52,
  "request_number": "NAB-2026-0052",
  "fk_request_status": 1
}
```

#### Moguće greške

| Status | Razlog |
|---:|---|
| 400 | Nedostaju obavezni podaci ili su neispravni. |
| 409 | Konflikt pri generiranju broja zahtjeva. |
| 500 | Greška pri kreiranju zahtjeva. |

### PUT `/api/requests/:id`

Ažurira postojeći zahtjev.

Pravila:

- administrator može uređivati zahtjev dok nije zaključan,
- zaposlenik može uređivati samo vlastiti zahtjev i samo kada je vraćen na izmjenu,
- zahtjevi u statusima `Odbijeno` i `Zatvoreno` su zaključani.

#### Request body

```json
{
  "fk_department": 1,
  "justification": "Ažurirano obrazloženje zahtjeva.",
  "estimated_amount": 450.0,
  "items": [
    {
      "fk_item_category": 1,
      "item_name": "Tipkovnica",
      "quantity": 3
    }
  ]
}
```

#### Uspješan odgovor

```json
{
  "message": "Zahtjev uspješno ažuriran."
}
```

#### Moguće greške

| Status | Razlog |
|---:|---|
| 400 | Neispravni podaci ili zaključan zahtjev. |
| 403 | Korisnik nema pravo uređivanja. |
| 404 | Zahtjev nije pronađen. |
| 500 | Greška pri ažuriranju zahtjeva. |

### PATCH `/api/requests/:id/status`

Mijenja status zahtjeva prema definiranim workflow akcijama.

#### Request body

```json
{
  "action": "preuzmi",
  "comment": "Zahtjev preuzet na obradu."
}
```

Polje `comment` je obavezno samo za određene akcije.

#### Podržane akcije

| Akcija | Iz statusa | U status | Tko može izvršiti | Uvjeti |
|---|---|---|---|---|
| `preuzmi` | Poslano | Na odobrenju | Administrator | Nema posebnih uvjeta. |
| `odbij` | Poslano | Odbijeno | Administrator | Komentar je obavezan. |
| `odobri` | Na odobrenju | Naručeno | Administrator | Zahtjev mora imati ponudu. Ako iznos zahtjeva premašuje limit odjela, odobrenje se ne blokira, ali se u povijest aktivnosti automatski dopisuje bilješka o prekoračenju. |
| `vrati-na-izmjenu` | Na odobrenju | Vraćeno na dopunu/izmjenu | Administrator | Komentar je obavezan. |
| `resubmit` | Vraćeno na dopunu/izmjenu | Poslano | Vlasnik zahtjeva ili administrator | Zahtjev ne smije biti zaključan. |
| `zavrsi` | Naručeno | Zatvoreno | Administrator | Zahtjev mora imati ponudu, otpremnicu i iznos. |

#### Uspješan odgovor

```json
{
  "message": "Akcija \"preuzmi\" je uspješno izvršena.",
  "fk_request_status": 2
}
```

#### Moguće greške

| Status | Razlog |
|---:|---|
| 400 | Nepoznata akcija, nedozvoljena tranzicija ili nedostaje obavezni dokument/komentar. |
| 403 | Korisnik nema ovlasti za akciju. |
| 404 | Zahtjev nije pronađen. |
| 500 | Greška pri izvršavanju akcije. |

## Request Attachments API

Rute za dokumente vezane uz zahtjev koriste kombinaciju prefiksa:

```text
/api/requests/:id/attachments
/api/attachments
```

Sve rute zahtijevaju JWT token.

### GET `/api/requests/:id/attachments`

Dohvaća dokumente vezane uz određeni zahtjev.

Pravila pristupa:

- administrator vidi dokumente svih zahtjeva,
- zaposlenik vidi dokumente samo za vlastite zahtjeve.

#### Uspješan odgovor

```json
[
  {
    "id_attachment": 1,
    "file_name": "ponuda.pdf",
    "file_type": "application/pdf",
    "document_type": "Ponuda",
    "uploaded_at": "2026-04-23T21:25:11.000Z",
    "fk_uploaded_by_user": 2,
    "uploaded_by": "Ivan Horvat"
  }
]
```

### POST `/api/requests/:id/attachments`

Dodaje dokument na zahtjev.

Content-Type:

```http
multipart/form-data
```

#### Form data

| Polje | Opis |
|---|---|
| `file` | Datoteka koja se uploada. |
| `document_type` | `Ponuda` ili `Otpremnica`. |

#### Pravila po tipu dokumenta

| Tip dokumenta | Dozvoljeni statusi |
|---|---|
| `Ponuda` | Poslano, Na odobrenju, Vraćeno na dopunu/izmjenu |
| `Otpremnica` | Naručeno |

#### Podržani MIME tipovi

```text
application/pdf
application/vnd.openxmlformats-officedocument.wordprocessingml.document
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
image/jpeg
image/png
application/zip
```

Uz MIME whitelist, backend provjerava i stvarne magic bytes datoteke (`file-type`) — datoteka čiji sadržaj ne odgovara dozvoljenom tipu odbija se s `415`. Zato stari DOC/XLS i TXT formati nisu podržani (nemaju pouzdan binarni potpis).

Maksimalna veličina datoteke:

```text
10 MB
```

#### Uspješan odgovor

```json
{
  "message": "Fajl uspješno uploadan.",
  "id_attachment": 10,
  "file_name": "ponuda.pdf",
  "document_type": "Ponuda",
  "fk_request_status": 1
}
```

#### Moguće greške

| Status | Razlog |
|---:|---|
| 400 | Datoteka nije poslana, tip dokumenta nije dozvoljen, status ne dopušta upload ili je zahtjev zaključan. |
| 404 | Zahtjev nije pronađen. |
| 500 | Greška pri spremanju datoteke. |

### GET `/api/attachments/download/:id`

Preuzima dokument.

Pravila pristupa:

- administrator može preuzeti svaki dokument,
- zaposlenik može preuzeti samo dokumente vezane uz vlastite zahtjeve.

#### Uspješan odgovor

Server vraća binarni sadržaj datoteke uz odgovarajuće HTTP headere:

```http
Content-Disposition: attachment; filename="naziv-datoteke.pdf"
Content-Type: application/pdf
```

#### Moguće greške

| Status | Razlog |
|---:|---|
| 404 | Dokument nije pronađen ili datoteka ne postoji na disku. |
| 500 | Greška pri preuzimanju datoteke. |

### DELETE `/api/attachments/delete/:id`

Briše dokument.

Pravila:

- administrator može brisati dokumente dok zahtjev nije zaključan,
- zaposlenik može brisati samo vlastite uploadane dokumente na vlastitim zahtjevima,
- dokumenti se ne mogu brisati ako je zahtjev u statusu `Odbijeno` ili `Zatvoreno`.

#### Uspješan odgovor

```json
{
  "message": "Fajl uspješno obrisan."
}
```

#### Moguće greške

| Status | Razlog |
|---:|---|
| 400 | Zahtjev je zaključan. |
| 403 | Korisnik nema dozvolu za brisanje dokumenta. |
| 404 | Dokument nije pronađen. |
| 500 | Greška pri brisanju dokumenta. |

## Reference API

Rute za referentne podatke koriste prefiks:

```text
/api/reference
```

Sve rute zahtijevaju JWT token.

### GET `/api/reference/active-fiscal-year`

Dohvaća aktivnu poslovnu godinu.

Aktivnom se smatra godina kod koje je:

```text
is_closed = 0
```

Ako postoji više otvorenih godina, vraća se godina s najvećom vrijednosti `year`.

#### Uspješan odgovor

```json
{
  "id_fiscal_year": 2,
  "year": 2026
}
```

#### Moguće greške

| Status | Razlog |
|---:|---|
| 404 | Nema aktivne fiskalne godine. |
| 500 | Greška pri dohvaćanju aktivne fiskalne godine. |

### GET `/api/reference/departments`

Dohvaća aktivna mjesta troška / odjele.

#### Uspješan odgovor

```json
[
  {
    "id_department": 1,
    "name": "IT"
  }
]
```

#### Napomena

Vraćaju se samo odjeli otvorene poslovne godine s `is_active = 1` — deaktivirani odjeli ne nude se kod novih zahtjeva.

### GET `/api/reference/item-categories`

Dohvaća aktivne predmete nabave / kategorije.

#### Uspješan odgovor

```json
[
  {
    "id_item_category": 1,
    "name": "Računalna oprema"
  }
]
```

#### Napomena

Vraćaju se samo kategorije otvorene poslovne godine s `is_active = 1` — deaktivirane kategorije ne nude se kod novih zahtjeva.

## Users API

Rute za administraciju korisnika koriste prefiks `/api/users`. Sve rute zahtijevaju JWT token **i ulogu Administrator** (inače `403`).

| Metoda i ruta | Opis |
|---|---|
| GET `/api/users` | Lista svih korisnika s ulogom i statusom aktivnosti. |
| GET `/api/users/roles` | Lista dostupnih uloga. |
| POST `/api/users` | Kreira korisnika (ime, prezime, email na `@veleri.hr`, uloga). Korisnik je neaktivan dok ne postavi lozinku putem invite linka; odgovor sadrži `inviteLink` i `emailSent` (slanje emaila je opcionalno — bez SMTP konfiguracije admin link prosljeđuje ručno). |
| PUT `/api/users/:id` | Uređuje korisnika. Zadnjem aktivnom administratoru nije moguće promijeniti ulogu (`400`). |
| PATCH `/api/users/:id/status` | Aktivira/deaktivira korisnika (`{ "is_active": boolean }`). Nije moguće deaktivirati vlastiti račun ni zadnjeg aktivnog administratora. Deaktivacija se primjenjuje odmah — aktivna sesija korisnika prestaje vrijediti. |
| POST `/api/users/:id/reset-link` | Generira novi invite/reset link (48 h valjanosti). |
| DELETE `/api/users/:id` | Briše korisnika. Nije moguće obrisati vlastiti račun, zadnjeg aktivnog administratora (`400`) ni korisnika sa zahtjevima, poviješću statusa ili dokumentima (`409` — umjesto brisanja deaktivirati račun). |

#### Povezane auth rute

| Metoda i ruta | Opis |
|---|---|
| POST `/api/auth/set-password` | Postavljanje lozinke putem invite tokena (`{ token, password }`, min. 8 znakova); aktivira račun i poništava token. Rate limit: 10 pokušaja po satu. |
| POST `/api/auth/check-email` | Provjera postoji li aktivan račun za email (koristi login forma). Rate limit: 30 pokušaja / 15 min. |
| POST `/api/auth/logout` | Briše JWT cookie. |

## Fiscal Years API

Rute za poslovne godine i šifrarnike koriste prefiks `/api/fiscal-years`. Sve rute zahtijevaju JWT token **i ulogu Administrator**. Izmjene su moguće samo dok je godina otvorena (`is_closed = 0`); zatvorena godina vraća `400`.

### Poslovne godine

| Metoda i ruta | Opis |
|---|---|
| GET `/api/fiscal-years` | Lista godina s budžetom i ukupno alociranim limitima odjela. |
| POST `/api/fiscal-years` | Otvara novu godinu (`{ year, total_budget }`) i kopira odjele i kategorije iz zadnje zatvorene godine (limiti se postavljaju na 0). Nije moguće otvoriti godinu unaprijed niti dok je neka godina još otvorena (`409`). |
| PATCH `/api/fiscal-years/:id/budget` | Mijenja godišnji budžet; novi budžet ne smije biti manji od već alociranih limita odjela. |
| PATCH `/api/fiscal-years/:id/close` | Zaključava godinu — moguće tek od 1. siječnja sljedeće kalendarske godine. Radnja je nepovratna (ruta za brisanje godine ne postoji). |

### Odjeli po godini

| Metoda i ruta | Opis |
|---|---|
| GET `/api/fiscal-years/:id/departments` | Odjeli godine s limitom i potrošnjom (zahtjevi u statusima Naručeno/Zatvoreno). |
| POST `/api/fiscal-years/:id/departments` | Dodaje odjel (`{ name, department_limit }`). Zbroj limita svih odjela ne smije premašiti godišnji budžet; naziv je jedinstven unutar godine (`409`). |
| PUT `/api/fiscal-years/:id/departments/:deptId` | Uređuje naziv i limit uz iste kontrole. |
| PATCH `/api/fiscal-years/:id/departments/:deptId/status` | Aktivira/deaktivira odjel (`{ "is_active": boolean }`). Deaktivirani odjel se ne nudi kod novih zahtjeva; postojeći zahtjevi ostaju netaknuti. |
| DELETE `/api/fiscal-years/:id/departments/:deptId` | Briše odjel; odjel korišten u zahtjevima ne može se obrisati (`409` — deaktivirati umjesto brisanja). |

### Kategorije po godini

| Metoda i ruta | Opis |
|---|---|
| GET `/api/fiscal-years/:id/categories` | Kategorije godine s limitom i potrošnjom + `unattributed` (zbirno za zahtjeve čije stavke miješaju kategorije). |
| POST `/api/fiscal-years/:id/categories` | Dodaje kategoriju (`{ name, category_limit }`) uz iste kontrole kao za odjele. |
| PUT `/api/fiscal-years/:id/categories/:catId` | Uređuje naziv i limit. |
| PATCH `/api/fiscal-years/:id/categories/:catId/status` | Aktivira/deaktivira kategoriju. |
| DELETE `/api/fiscal-years/:id/categories/:catId` | Briše kategoriju; kategorija korištena u stavkama ne može se obrisati (`409`). |

#### Napomena o potrošnji po kategoriji

Iznos postoji samo na razini zahtjeva (stavke nemaju cijenu), pa se kategoriji pripisuju samo zahtjevi čije sve stavke dijele tu kategoriju. Zahtjevi s više kategorija iskazuju se zbirno kao `unattributed`.

## Health

### GET `/health`

Provjera dostupnosti servera i baze (bez autentikacije). Vraća `{ "status": "ok", "uptime": n }`, odnosno `503` ako baza nije dostupna.

## Statusi zahtjeva

Trenutno korišteni statusi:

| ID | Naziv |
|---:|---|
| 1 | Poslano |
| 2 | Na odobrenju |
| 3 | Zahtjeva izmjene |
| 5 | Odbijeno |
| 6 | Naručeno |
| 7 | Zatvoreno |

Status `Odobreno` (ID 4) postoji u bazi kao stariji status, ali ga trenutni workflow ne koristi kao zasebnu fazu. Status `Odbijeno` koristi se i za storno (akcija `storno`) — razlika je vidljiva u komentaru povijesti.

## Poznata ograničenja API-ja

| Ograničenje | Opis |
|---|---|
| Nema narudžbenice i ostalih dokumenata | Podržani su samo `Ponuda` i `Otpremnica`; ostali tipovi izvan su opsega projekta. |
| Cijene po stavci | Iznos postoji na razini zahtjeva; potrošnja po kategoriji je zato približna (vidi Fiscal Years API). |
| Upload putanje su lokalne | U bazi se sprema filesystem putanja dokumenta relativna od `UPLOADS_DIR`. |
| Email obavijesti | Postoji samo opcionalni invite email; obavijesti o statusima su in-app. |

## Primjer korištenja API-ja

Tipičan redoslijed korištenja:

1. Korisnik se prijavi preko `POST /api/auth/login`.
2. Backend postavlja JWT kao httpOnly cookie — frontend ne barata tokenom.
3. Frontend dohvaća aktivnu godinu preko `GET /api/reference/active-fiscal-year`.
4. Frontend dohvaća odjele i kategorije preko reference API-ja.
5. Korisnik kreira zahtjev preko `POST /api/requests`.
6. Ako ima ponudu, frontend šalje upload preko `POST /api/requests/:id/attachments`.
7. Administrator dohvaća zahtjev preko `GET /api/requests/:id`.
8. Administrator mijenja status preko `PATCH /api/requests/:id/status`.
9. Korisnik ili administrator dodaje otpremnicu.
10. Administrator zatvara zahtjev akcijom `zavrsi`.
