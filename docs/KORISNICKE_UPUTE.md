# Korisničke upute

Ovaj dokument opisuje korištenje aplikacije `nabava.XP` iz perspektive krajnjeg korisnika.
Aplikacija služi za kreiranje, pregled i obradu zahtjeva za nabavu.

Upute opisuju trenutno implementirano stanje aplikacije.
Funkcionalnosti koje su planirane, ali još nisu dostupne, navedene su na kraju dokumenta.

## Korisničke uloge

Aplikacija trenutno koristi dvije korisničke uloge:

| Uloga | Opis |
|---|---|
| `Zaposlenik` | Kreira zahtjeve za nabavu, pregledava vlastite zahtjeve, dopunjuje zahtjeve koji su vraćeni na izmjenu i dodaje dokumente kada je to dopušteno. |
| `Administrator` | Pregledava sve zahtjeve, preuzima ih na obradu, odobrava, odbija, vraća na dopunu, zaključuje završene zahtjeve i upravlja dokumentima. |

## Prijava u aplikaciju

1. Otvorite aplikaciju u pregledniku.
2. Na stranici za prijavu unesite e-mail adresu.
3. Kliknite `Dalje`.
4. Unesite lozinku.
5. Kliknite `Prijavi se`.

Ako su podaci ispravni, aplikacija otvara početni dio sustava.
Ako prijava ne uspije, prikazuje se poruka o grešci.

Mogući razlozi neuspješne prijave:

- e-mail nije upisan,
- lozinka nije upisana,
- e-mail ili lozinka nisu ispravni,
- korisnički račun nije aktivan.

## Navigacija

Nakon prijave korisnik vidi glavni navigacijski izbornik.

Glavne dostupne stranice su:

| Stranica | Namjena |
|---|---|
| `Dashboard` | Početna stranica aplikacije. |
| `Zahtjevi` | Pregled, pretraživanje i obrada zahtjeva za nabavu. |

U gornjem desnom kutu prikazan je korisnički izbornik.
Klikom na korisnika moguće je odjaviti se iz aplikacije.

## Pregled zahtjeva

Stranica `Zahtjevi` prikazuje tablični pregled zahtjeva za nabavu.

Zaposlenik vidi samo zahtjeve koje je sam kreirao.
Administrator vidi sve zahtjeve u sustavu.

Na vrhu stranice prikazani su sažeci:

- ukupan broj zahtjeva,
- broj aktivnih zahtjeva,
- broj zahtjeva koji čekaju pažnju korisnika,
- broj zatvorenih zahtjeva.

U tablici se prikazuju osnovni podaci:

- broj zahtjeva,
- odjel / mjesto troška,
- status,
- procijenjeni iznos,
- datum kreiranja,
- podnositelj zahtjeva.

Klikom na redak u tablici otvara se detalj zahtjeva.

### Pretraživanje i filtriranje

Na stranici `Zahtjevi` moguće je:

- pretraživati po broju zahtjeva,
- pretraživati po podnositelju,
- pretraživati po odjelu,
- filtrirati po statusu,
- filtrirati po odjelu,
- filtrirati po podnositelju.

Filtri po odjelu i podnositelju dostupni su administratoru kada postoje odgovarajući podaci.

Za uklanjanje aktivnih filtera koristi se gumb `Poništi`.

## Kreiranje novog zahtjeva

Novi zahtjev kreira se na stranici `Zahtjevi` klikom na gumb `Novi zahtjev`.

Obrazac za kreiranje zahtjeva organiziran je kao čarobnjak kroz četiri koraka.

### Korak 1: Odabir odjela

U prvom koraku potrebno je odabrati odjel, službu ili projekt za koji se otvara zahtjev.

Odjeli se dohvaćaju iz aktivnih šifrarnika.
Ako odjel nije dostupan u popisu, potrebno je kontaktirati administratora ili osobu zaduženu za održavanje šifrarnika.

### Korak 2: Ponuda ili račun

U drugom koraku korisnik odabire ima li već ponudu ili račun.

Dostupne opcije su:

| Opcija | Što znači |
|---|---|
| `Da, imam ponudu ili račun` | Korisnik će odmah priložiti jednu ili više ponuda i upisati iznos. |
| `Nemam ponudu` | Korisnik će ručno unijeti stavke koje treba nabaviti. |

### Korak 3A: Zahtjev s ponudom

Ako korisnik ima ponudu ili račun, potrebno je unijeti:

- jednu ili više datoteka ponude,
- ukupni iznos,
- kategoriju nabave,
- svrhu nabave.

Podržane datoteke su PDF, Word (DOCX), Excel (XLSX), slike (JPG, PNG) i ZIP arhive.
Najveća dopuštena veličina pojedine datoteke je 10 MB.

Ako je dodano više ponuda, u polje iznosa upisuje se ukupni zbroj.

### Korak 3B: Zahtjev bez ponude

Ako korisnik nema ponudu, potrebno je unijeti:

- svrhu nabave,
- barem jednu stavku zahtjeva.

Za svaku stavku unosi se:

- kategorija,
- naziv artikla ili usluge,
- količina.

Količina mora biti veća od 0.

### Korak 4: Pregled prije slanja

U zadnjem koraku prikazuje se sažetak zahtjeva.

Prije slanja potrebno je provjeriti:

- odabrani odjel,
- svrhu nabave,
- priložene ponude, ako postoje,
- ukupni iznos, ako je upisan,
- kategoriju ili stavke zahtjeva.

Klikom na `Pošalji na obradu` zahtjev se sprema i šalje u status `Poslano`.
Nakon uspješnog slanja aplikacija prikazuje poruku s brojem zahtjeva i vraća korisnika na popis zahtjeva.

Broj zahtjeva generira se automatski u obliku:

```text
NAB-GGGG-NNNN
```

Primjer:

```text
NAB-2026-0001
```

## Detalji zahtjeva

Detalji zahtjeva otvaraju se klikom na zahtjev u tablici.

Na detalju zahtjeva prikazuju se:

- broj zahtjeva,
- trenutni status,
- podnositelj,
- datum kreiranja,
- fiskalna godina,
- odjel / služba,
- procijenjeni iznos,
- svrha nabave,
- stavke,
- dokumenti,
- povijest aktivnosti.

Administrator na detalju zahtjeva vidi i dodatne akcije za obradu zahtjeva.

## Uređivanje zahtjeva

Zahtjev se može uređivati samo u određenim situacijama.

Administrator može uređivati zahtjev dok zahtjev nije zaključan.
Zaposlenik može uređivati vlastiti zahtjev kada je zahtjev vraćen na dopunu ili izmjenu.

Uređivanjem je moguće promijeniti:

- odjel / službu / projekt,
- obrazloženje nabave,
- procijenjeni iznos,
- stavke zahtjeva.

Fiskalna godina se ne može mijenjati nakon kreiranja zahtjeva.

Kod spremanja izmjena aplikacija provjerava:

- da je odjel odabran,
- da obrazloženje nije prazno,
- da obrazloženje nije duže od 1000 znakova,
- da procijenjeni iznos nije negativan,
- da zahtjev ima barem jednu stavku.

Svaka uspješna izmjena zapisuje se u povijest aktivnosti.

## Dokumenti

Dokumenti se dodaju i pregledavaju na detalju zahtjeva.

Trenutno su podržani sljedeći tipovi dokumenata:

| Tip dokumenta | Kada se može dodati |
|---|---|
| `Ponuda` | Dok je zahtjev u statusu `Poslano`, `Na odobrenju` ili `Vraćeno na dopunu / izmjenu`. |
| `Otpremnica` | Dok je zahtjev u statusu `Naručeno`. |

### Dodavanje dokumenta

1. Otvorite detalj zahtjeva.
2. U dijelu `Dokumenti` odaberite tip dokumenta ako je izbor dostupan.
3. Odaberite datoteku.
4. Kliknite `Učitaj`.

Nakon uspješnog uploada dokument se prikazuje u listi dokumenata.
Dodavanje dokumenta zapisuje se u povijest aktivnosti.

### Preuzimanje dokumenta

1. Otvorite detalj zahtjeva.
2. U dijelu `Dokumenti` pronađite željeni dokument.
3. Kliknite ikonu za preuzimanje.

Datoteka se preuzima u pregledniku.

### Brisanje dokumenta

Dokument se može obrisati ako zahtjev nije zaključan.

Administrator može brisati dokumente na zahtjevima kojima ima pristup.
Zaposlenik može brisati dokument koji je sam učitao, ako zahtjev nije zaključan.

Brisanje dokumenta potrebno je potvrditi u dijalogu.
Nakon brisanja akcija se zapisuje u povijest aktivnosti.

## Statusi zahtjeva

Zahtjev prolazi kroz sljedeće statuse:

| Status | Opis |
|---|---|
| `Poslano` | Zahtjev je kreiran i čeka pregled administratora. |
| `Na odobrenju` | Administrator je preuzeo zahtjev na obradu. |
| `Zahtjeva izmjene` | Administrator je vratio zahtjev zaposleniku radi ispravka ili dopune. |
| `Odbijeno` | Zahtjev je odbijen i više se ne obrađuje. |
| `Naručeno` | Zahtjev je odobren i nalazi se u fazi narudžbe. |
| `Zatvoreno` | Zahtjev je završen i zaključan. |

U bazi postoji i status `Odobreno`, ali ga trenutni workflow ne koristi kao završni operativni status.
U aktualnoj aplikaciji odobravanje prebacuje zahtjev u status `Naručeno`.

## Obrada zahtjeva za administratora

Administrator obrađuje zahtjev na stranici detalja.

### Preuzimanje zahtjeva

Kada je zahtjev u statusu `Poslano`, administrator može:

- preuzeti zahtjev na obradu,
- odbiti zahtjev.

Klikom na `Preuzmi na obradu` zahtjev prelazi u status `Na odobrenju`.

### Odbijanje zahtjeva

Administrator može odbiti zahtjev iz statusa `Poslano`.
Kod odbijanja komentar je obavezan.

Nakon odbijanja zahtjev prelazi u status `Odbijeno`.
Odbijen zahtjev smatra se zaključanim.

### Odobravanje zahtjeva

Kada je zahtjev u statusu `Na odobrenju`, administrator može odobriti zahtjev.

Za odobravanje je potrebna priložena `Ponuda`.
Ako ponuda nije priložena, gumb za odobravanje nije dostupan ili backend odbija akciju.

Komentar pri odobravanju nije obavezan.
Nakon odobravanja zahtjev prelazi u status `Naručeno`.

### Vraćanje na dopunu

Kada je zahtjev u statusu `Na odobrenju`, administrator ga može vratiti zaposleniku na dopunu.

Komentar je obavezan.
U komentaru treba navesti što korisnik mora ispraviti ili dopuniti.

Nakon vraćanja zahtjev prelazi u status `Vraćeno na dopunu / izmjenu`.

### Završavanje zahtjeva

Kada je zahtjev u statusu `Naručeno`, administrator ga može označiti kao završen.

Za završavanje zahtjeva moraju biti zadovoljeni uvjeti:

- zahtjev ima priloženu ponudu,
- zahtjev ima priloženu otpremnicu,
- zahtjev ima upisan procijenjeni iznos.

Nakon završavanja zahtjev prelazi u status `Zatvoreno`.
Zatvoren zahtjev smatra se zaključanim.

### Ispis zahtjeva

Administrator na detalju zahtjeva ima opciju `Ispiši`.
Ispis prikazuje oblikovani obrazac zahtjeva s podacima institucije, osnovnim podacima, stavkama, iznosom i statusom.

## Dopuna zahtjeva za zaposlenika

Ako administrator vrati zahtjev na dopunu, zaposlenik na detalju zahtjeva vidi obavijest i komentar administratora.

Zaposlenik tada može:

1. otvoriti zahtjev,
2. pročitati komentar administratora,
3. kliknuti `Uredi`,
4. izmijeniti podatke ili stavke,
5. spremiti izmjene,
6. po potrebi dodati ponudu,
7. kliknuti `Pošalji ponovno`.

Nakon ponovnog slanja zahtjev se vraća u status `Poslano`.

## Povijest aktivnosti

Na detalju zahtjeva prikazuje se povijest aktivnosti.

U povijesti se mogu vidjeti:

- kreiranje zahtjeva,
- promjene statusa,
- komentari administratora,
- izmjene zahtjeva,
- dodavanje dokumenata,
- brisanje dokumenata,
- završavanje zahtjeva.

Povijest aktivnosti služi kao audit trail i omogućuje praćenje tko je, kada i zašto napravio određenu radnju.

## Obavijesti u aplikaciji

Aplikacija prikazuje kratke obavijesti nakon važnih akcija.

Primjeri:

- zahtjev je uspješno kreiran,
- zahtjev je ažuriran,
- dokument je dodan,
- dokument je obrisan,
- status zahtjeva je promijenjen,
- došlo je do greške pri spremanju ili uploadu.

Administrator i zaposlenik mogu dobiti i osnovne in-app obavijesti o zahtjevima koji zahtijevaju pažnju.

## Zaključani zahtjevi

Zahtjevi u sljedećim statusima smatraju se zaključanima:

- `Odbijeno`,
- `Zatvoreno`.

Zaključani zahtjevi se ne mogu uređivati.
Na njima se ne mogu dodavati ni brisati dokumenti.

## Administracija korisnika (administrator)

Stranica `Korisnici` dostupna je samo administratoru.

Administrator može:

- kreirati novog korisnika (ime, prezime, email na domeni `@veleri.hr`, uloga) — sustav generira **invite link** koji administrator prosljeđuje korisniku (ili se šalje emailom ako je SMTP konfiguriran); korisnik je neaktivan dok putem linka ne postavi lozinku,
- urediti podatke i ulogu korisnika,
- generirati novi invite/reset link (valjanost 48 sati) ako je stari istekao ili korisnik želi novu lozinku,
- deaktivirati korisnika — deaktivacija se primjenjuje **odmah**, i aktivna sesija korisnika prestaje vrijediti,
- obrisati korisnika koji nema nikakvih tragova u sustavu (zahtjeva, povijesti, dokumenata) — inače se račun deaktivira.

Zaštite: nije moguće deaktivirati ili obrisati vlastiti račun, ni zadnjeg aktivnog administratora, niti zadnjem administratoru promijeniti ulogu.

## Financije i poslovne godine (administrator)

Stranica `Financije` dostupna je samo administratoru i objedinjuje upravljanje poslovnim godinama, budžetom i šifrarnicima.

### Budžet i limiti

- Svaka poslovna godina ima **godišnji budžet**; zbroj limita odjela ne smije premašiti budžet (aplikacija odbija unos preko limita).
- Za svaki odjel i kategoriju prikazuje se potrošnja (zahtjevi u statusima `Naručeno`/`Zatvoreno`), limit i postotak iskorištenosti.
- Kod odobravanja zahtjeva administrator vidi projekciju potrošnje odjela; prekoračenje limita **ne blokira** odobrenje, ali se upozorenje trajno bilježi u povijest aktivnosti.

### Odjeli i kategorije

- Dodavanje i uređivanje moguće je samo dok je godina otvorena; naziv je jedinstven unutar godine.
- Odjel ili kategorija koja se koristi u zahtjevima ne može se obrisati — umjesto toga se **deaktivira** (ikona oka): deaktivirani zapis se više ne nudi kod kreiranja novih zahtjeva, a postojeći zahtjevi ostaju netaknuti. Deaktivacija je reverzibilna.

### Prijelaz na novu poslovnu godinu

Redoslijed radnji na početku kalendarske godine:

1. **Od 1. siječnja** zatvoriti prethodnu poslovnu godinu (gumb za zaključavanje) — godina se ne može zatvoriti dok kalendarska godina još traje, a zatvaranje je nepovratno.
2. Otvoriti novu poslovnu godinu i unijeti godišnji budžet — nova godina ne može se otvoriti unaprijed niti dok je prethodna još otvorena.
3. Sustav automatski **kopira odjele i kategorije** iz prethodne godine (limiti se postavljaju na 0) — potrebno je samo unijeti nove limite.

> **Napomena:** dok traje prijelaz (stara godina zatvorena, nova još nije otvorena) nema aktivne poslovne godine i zaposlenici ne mogu kreirati nove zahtjeve. Prijelaz zato treba obaviti odmah početkom godine. Postojeći zahtjevi stare godine normalno se dovršavaju — zaključana godina sprječava samo izmjene šifrarnika i kreiranje novih zahtjeva u njoj.

## Ograničenja trenutne verzije

U trenutnoj verziji aplikacije nisu dostupne sljedeće funkcionalnosti:

| Funkcionalnost | Stanje |
|---|---|
| Samostalna registracija korisnika | Izvan opsega — korisnike kreira administrator uz invite link. |
| Draft zahtjeva | Izvan opsega projekta — zahtjev se uvijek šalje odmah. |
| Tipovi dokumenata `Narudžbenica` i `Ostalo` | Izvan opsega — podržani su `Ponuda` i `Otpremnica`. |
| Email obavijesti o promjeni statusa | Izvan opsega — obavijesti su in-app; postoji samo opcionalni invite email. |
| Trajni centar obavijesti | Izvan opsega — obavijesti su toast poruke u aplikaciji. |
| Analitički modul potrošnje | Izvan opsega — osnovni pregled postoji na stranici Financije. |
| Cijene po stavci | Iznos se vodi na razini zahtjeva, pa je potrošnja po kategoriji približna. |
| Priprema poslovne godine unaprijed | Nova godina se ne može otvoriti prije početka kalendarske godine (vidi Prijelaz na novu poslovnu godinu). |

## Preporučeni način rada

Za zaposlenika:

1. Kreirati zahtjev s dovoljno jasnim obrazloženjem.
2. Priložiti ponudu odmah ako je dostupna.
3. Redovito provjeravati zahtjeve u statusu `Zahtjeva izmjene`.
4. Nakon ispravka poslati zahtjev ponovno na obradu.

Za administratora:

1. Pregledavati zahtjeve u statusu `Poslano`.
2. Preuzimati zahtjeve na obradu.
3. Vraćati nepotpune zahtjeve uz jasan komentar.
4. Odobravati zahtjeve tek kada imaju potrebnu ponudu, uz pogled na projekciju limita odjela.
5. Nakon narudžbe dodati ili provjeriti otpremnicu.
6. Zatvoriti zahtjev tek kada su dokumenti i iznos potpuni.
7. Povremeno provjeriti iskorištenost budžeta na stranici Financije.
8. Početkom kalendarske godine obaviti prijelaz na novu poslovnu godinu (vidi gore).
