# Vodič: umetanje literature u Word

Cilj je da **nijedan navod i nijedan redak popisa literature ne bude ručno utipkan.**
Pravila pisanja to i traže izrijekom: stil APA 6, izvori kroz Upravljanje izvorima,
navodi kroz Umetni navod, popis kroz Bibliografija.

Datoteka `Sources.xml` sadrži svih 16 izvora, već pripremljenih s ispravnim tipom zapisa
i jezikom (hrvatski, LCID 1050), pa se u Word unose jednim uvozom umjesto šesnaest puta
ručno.

---

## Korak 0 — provjeri je li APA 6 uopće ponuđen

**Ovo napravi prvo, prije svega ostalog.**

Otvori Word → kartica **Reference** (*References*) → padajući izbornik **Stil** (*Style*).

- Ako u popisu piše **APA Sixth Edition** — sve je u redu, odaberi ga i idi na korak 1.
- Ako piše samo **APA** — to je sedmo izdanje. Novije verzije Worda izbacile su šesto.
  Razlike su vidljive (7. izdanje izostavlja mjesto izdavanja, drukčije rješava „et al.").
  Prije nego što nastaviš, pitaj mentora prihvaća li APA 7, jer je alternativa ručno
  vraćanje datoteke stila `APASixthEditionOfficeOnline.xsl` u Wordovu mapu stilova.
  Ne mijenjaj stil nakon što si već umetnuo navode — promijeni ga na početku.

---

## Korak 1 — uvoz izvora

### Windows

1. Zatvori Word.
2. Kopiraj `Sources.xml` u
   `%APPDATA%\Microsoft\Bibliography\`
   (ako ondje već postoji `Sources.xml`, **preimenuj postojeći** u `Sources-staro.xml`,
   nemoj ga prebrisati).
3. Otvori Word → **Reference → Upravljanje izvorima** (*Manage Sources*).
   Izvori su u lijevom stupcu (**Glavni popis** / *Master List*).
4. Označi sve i klikni **Kopiraj →** da prijeđu u **Trenutni popis** (*Current List*)
   ovog dokumenta.

Alternativa ako ne želiš dirati mapu: u dijalogu **Upravljanje izvorima** klikni
**Pregledaj** (*Browse*), odaberi `Sources.xml`, pa kopiraj u trenutni popis.

### macOS

1. Zatvori Word potpuno (⌘Q, ne samo prozor).
2. U Finderu pritisni ⇧⌘G i zalijepi:
   `~/Library/Containers/com.microsoft.Word/Data/Library/Application Support/Microsoft/Office/`
3. Uđi u mapu `Bibliography` (ako je nema, stvori je) i kopiraj `Sources.xml` unutra.
   Postojeći `Sources.xml` prvo preimenuj u `Sources-staro.xml`.
4. Otvori Word → **Reference → Upravitelj izvora navoda**
   (*Citation Source Manager*). Izvori su u glavnom popisu; kopiraj ih u trenutni popis.

> Ako se nakon uvoza popis ne pojavi, gotovo je uvijek riječ o tome da je Word bio otvoren
> tijekom kopiranja i pri zatvaranju prebrisao datoteku vlastitom. Ponovi s zatvorenim
> Wordom.

---

## Korak 2 — umetanje navoda u tekst

1. Postavi kursor **na kraj rečenice, prije točke.**
2. **Reference → Umetni navod** (*Insert Citation*) → odaberi izvor s popisa.
3. Klikni na umetnuti navod → padajući izbornik na desnoj strani okvira →
   **Uredi navod** (*Edit Citation*):
   - označi **Naslov** (*Title*) pod „Suppress" — Pravila traže da se naslov iz reference
     ukloni;
   - u polje **Stranice** upiši broj stranice kad citiraš doslovno ili se pozivaš na
     određeno mjesto.

Rezultat izgleda ovako: `(Dean & Barroso, 2013, str. 76)`.

**Kada se citira.** Ne samo kod doslovnog navoda pod navodnicima, nego i kod
parafraze — svaka tvrdnja koja nije tvoja mora imati izvor na mjestu gdje je iznesena.

**Više izvora zaredom** — umetni ih jedan za drugim, Word ih ispiše kao
`(Samuelson & Nordhaus, 2000) (Kotler, P. et al., 2006)`.

**Sekundarni izvor** — ako citiraš nešto što si pročitao u tuđem radu, umetni oba i
između njih ručno upiši riječ „prema": `(Meddinus & Curtis, 1963.) prema (Pervin et al., 2008., str. 213)`.
U popisu literature ostaje samo onaj koji si stvarno čitao.

---

## Korak 3 — izvori ispod tablica i slika

To **nisu** navodi iz Upravitelja izvorima nego stil `Caption`, ručno upisan, i ide
**ispod** elementa (opis ide iznad). Tri slučaja:

| Slučaj | Oblik |
|---|---|
| ti si izradio | `Izvor: Autor, rujan 2026.` |
| preuzeto iz literature | `Izvor: Dean & Barroso, 2013., str. 76.` |
| preuzeto s interneta | puni zapis kao u popisu literature, s poveznicom i datumom pristupa |

---

## Korak 4 — generiranje popisa literature

1. Idi na stranicu **Popis literature** (nova stranica, iza Popisa pokrata).
2. **Reference → Bibliografija** (*Bibliography*) → odaberi **Umetni bibliografiju**
   (*Insert Bibliography*, bez naslova — naslov stranice već imaš).
3. Popis se generira sam, abecedno.

**Nakon svake izmjene navoda** klikni na popis → **Ažuriraj citate i bibliografiju**
(*Update Citations and Bibliography*). Ovo je najčešći propust — popis ostane star, a
mentor to odmah vidi.

**Prije predaje**, kad su svi navodi na mjestu, popis možeš pretvoriti u običan tekst
(klik na popis → padajući izbornik → *Convert bibliography to static text*) kako se ne bi
promijenio pri otvaranju na tuđem računalu. To radi **tek na kraju**, jer se nakon toga
više ne ažurira sam.

---

## Korak 5 — provjera prije predaje

Prođi ovih šest stavki:

1. **Svaki izvor iz popisa pojavljuje se u tekstu**, i obrnuto. Pravila to traže u oba
   smjera. Word ne provjerava — provjeri ručno, izvor po izvor.
2. **Godina ima točku** (`2017.`). Ako je nema, jezik izvora nije hrvatski — u Upravitelju
   izvorima svakom zapisu provjeri polje jezika.
3. **Mrežni izvori imaju „Preuzeto … iz"** s datumom pristupa.
4. **Naslov je uklonjen iz svih navoda u tekstu.**
5. **Redoslijed je abecedni**, a za istog autora kronološki.
6. **Šest izvora su preprinti** (`Bel25`, `Alm25`, `Pan25`, `Ben25`, `Raj25`, `Gom26`) —
   pri prvom pozivanju u tekstu to navedi, npr. „u još nerecenziranom radu (Pan i sur., 2025.)".

---

## Ako nešto pođe po zlu

| Simptom | Uzrok |
|---|---|
| Navod se ispisuje kao `(Error! Bookmark not defined.)` | Izvor je izbrisan iz trenutnog popisa. Vrati ga iz glavnog popisa. |
| Popis pokazuje stare podatke | Nije pokrenuto ažuriranje citata i bibliografije. |
| Sve reference odjednom promijenile oblik | Netko je promijenio stil. Vrati na APA 6. |
| Hrvatski znakovi izgledaju krivo | Datoteka je otvorena i spremljena u uređivaču bez UTF-8. Uzmi izvornu `Sources.xml`. |
| Uvoz ne radi na Macu | Word je bio otvoren pri kopiranju. Zatvori ga s ⌘Q i ponovi. |

---

## Što ostaje ručno

Tri stvari Word ne rješava:

- **Propis** `GDPR28` unesen je kao „Razno" (*Misc*), s cijelim nazivom u naslovu, kako bi
  se ispisao kao u primjeru iz Pravila (`Zakon o radu NN 93/14., 127/17`). Provjeri kako
  izgleda u popisu i po potrebi skrati naslov u samom zapisu.
- **Popis pokrata, slika, tablica i priloga** generiraju se zasebnim alatima, svaki na
  novoj stranici, iza popisa literature.
- **Kvačica „provjereno"** u `LITERATURA.md` — nju stavljaš ti, tek nakon što si izvor
  otvorio i potvrdio da tvrdnja u njemu doista piše.
