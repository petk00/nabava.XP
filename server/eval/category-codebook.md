# Codebook kategorija predmeta nabave

Pravilnik po kojem je određen zlatni standard za dodjelu kategorije predmeta nabave.

**Ne ulazi u prompt.** `PROMPT_VARIANT` je `names_only`, pa model dobiva samo popis
naziva kategorija (`server/eval/category-list.md`). Ovaj dokument služi isključivo kao
mjerilo pri bodovanju.

**Zamijenjen 6. 9. 2026. (odluka O1).** Ranija inačica opisivala je šest kategorija s
deset pravila razgraničenja (P1–P10). Tablica `ItemCategory` stvarno sadrži **33**
kategorije, pa je mjerilo od šest ocjenjivalo izbor iz skupa koji model nikad nije ni
vidio. Stara pravila su uklonjena jer su pisana za skup kojega nema; nisu prenesena
niti prilagođena.

**Dodjelu je obavio autor rada**, iz popisa svih 33 kategorije, nakon što su izlazi
modela iz probnog prolaza već bili viđeni. Ta je kontaminacija priznata imenom i ne
umanjuje se: pravila niže nastala su uz poznavanje jednog probnog prolaza na scenariju 1.

**Dva ispravka dosljednosti, 6. 9. 2026.** — ne mijenjaju prosudbu nego je izjednačuju
nad istovrsnim stavkama: „IoT komplet ESP32" dobio je iste prihvatljive alternative kao
opširnije opisani komplet iz druge ponude, a „Ljubičasti laserski modul" usklađen je s
ostalih jedanaest diskretnih komponenti iz istog para ponuda.

Obrazloženja su **doslovno onako kako ih je autor zapisao** u
`server/eval/category-assignment.csv`, stupac `napomena`. Nijedno pravilo nije dopisano
sa strane.

---

## Dodjele i obrazloženja

Prva navedena kategorija je očekivana (`expected_category`); ostale su prihvatljive
alternative koje blago bodovanje priznaje.

### scenario1_standardna

**Univerzalni strujni adapter 230V/3-12V DC max. 27W 2,25A**
→ Elektronička i elektrotehnička oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema, Mjerna i ispitna oprema
> Napajanje/adapterski uređaj; primarno elektronička oprema.

**Eksperimentalna pločica (breadboard) s 400 rupica**
→ Nastavna i laboratorijska oprema
> Komponenta za eksperimentalni rad.

**Eksperimentalna pločica (breadboard) s 830 rupica**
→ Nastavna i laboratorijska oprema
> Komponenta za eksperimentalni rad.

**Kabeli za eksperimentalnu pločicu (breadboard) - 65 komada**
→ Nastavna i laboratorijska oprema  ·  prihvatljivo i: Elektronička i elektrotehnička oprema
> Povezni pribor za eksperimentalne pločice.

### scenario2_visestranicna

**IoT edukacijski komplet ESP32-S3 DevKit s modulima i pločicom**
→ Nastavna i laboratorijska oprema  ·  prihvatljivo i: Računalna oprema, Mrežna i telekomunikacijska oprema
> Razvojni edukacijski komplet s mikrokontrolerom i modulima.

**Laboratorijski set senzora (temp., vlaga, tlak, IMU, svjetlo)**
→ Mjerna i ispitna oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> Senzorski set služi mjerenju fizikalnih veličina.

**Raspberry Pi 5 8GB s kućištem, napajanjem i microSD 64GB**
→ Računalna oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> Jednoplatformsko računalo s priborom; namjena je računalna.

**LoRaWAN gateway RAK7268CV2 indoor, 868 MHz**
→ Mrežna i telekomunikacijska oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> LoRaWAN gateway je mrežna komunikacijska oprema.

**LoRa razvojni čvor RAK4631 WisBlock Starter Kit**
→ Nastavna i laboratorijska oprema  ·  prihvatljivo i: Mrežna i telekomunikacijska oprema
> Razvojni LoRa čvor namijenjen laboratorijskom/edukacijskom radu.

**Digitalni osciloskop Rigol DHO814, 100 MHz, 4 kanala**
→ Mjerna i ispitna oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> Digitalni osciloskop je mjerna i ispitna oprema.

**Laboratorijsko napajanje Rigol DP832, 3 kanala**
→ Mjerna i ispitna oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> Laboratorijsko napajanje je mjerna/laboratorijska oprema.

**Digitalni multimetar Fluke 117 s priborom**
→ Mjerna i ispitna oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> Digitalni multimetar je mjerna i ispitna oprema.

**Lemna stanica Weller WE1010 s kompletom vrhova**
→ Nastavna i laboratorijska oprema  ·  prihvatljivo i: Elektronička i elektrotehnička oprema
> Lemna stanica za laboratorijski rad.

**Odsis dima za lemljenje s filtrom, stolni**
→ Nastavna i laboratorijska oprema  ·  prihvatljivo i: Elektronička i elektrotehnička oprema
> Odsis dima je specijalizirana oprema radnog mjesta za lemljenje.

**3D pisač Prusa MK4S s kompletom filamenata**
→ Nastavna i laboratorijska oprema  ·  prihvatljivo i: Računalna oprema
> 3D pisač je laboratorijska/nastavna oprema; može se tretirati i kao računalno upravljani uređaj.

**PoE preklopnik Ubiquiti USW-24-PoE, 24 porta**
→ Mrežna i telekomunikacijska oprema  ·  prihvatljivo i: Računalna oprema
> PoE preklopnik je mrežna oprema.

**Wi-Fi 6 pristupna točka Ubiquiti U6-Pro**
→ Mrežna i telekomunikacijska oprema  ·  prihvatljivo i: Računalna oprema
> Wi‑Fi pristupna točka je mrežna oprema.

**Poslužitelj za edge računarstvo Dell PowerEdge R250**
→ Računalna oprema  ·  prihvatljivo i: Mrežna i telekomunikacijska oprema
> Poslužitelj je računalna oprema.

**Komunikacijski ormar 19" 22U s policama i PDU letvom**
→ Mrežna i telekomunikacijska oprema  ·  prihvatljivo i: Računalna oprema, Namještaj
> Komunikacijski ormar je prvenstveno infrastruktura za mrežnu opremu; može se tretirati kao namještaj prema načinu evidencije.

**Studentska radna stanica (računalo, monitor 24", periferija)**
→ Računalna oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> Računalo, monitor i periferija čine radnu računalnu cjelinu.

**Set alata za elektroniku (odvijači, pincete, rezači, mjerni vodovi)**
→ Nastavna i laboratorijska oprema  ·  prihvatljivo i: Elektronička i elektrotehnička oprema, Sitni inventar
> Specijalizirani alat za laboratorij elektronike.

**Ormarić za pohranu kompleta, s bravom, 12 pretinaca**
→ Namještaj  ·  prihvatljivo i: Sitni inventar
> Ormarić za pohranu je namještaj; sitni inventar je moguća alternativa ovisno o vrijednosnom pragu.

**Akademska licenca IoT platforme, 200 uređaja, 12 mjeseci**
→ Programska oprema i licence
> Vremenski ograničena akademska licenca.

**Instalacija, umrežavanje i puštanje laboratorija u rad**
→ Usluge razvoja i održavanja informacijskih sustava  ·  prihvatljivo i: Usluge održavanja
> Instalacija, umrežavanje i puštanje IT/laboratorijske infrastrukture u rad.

**Izrada 10 laboratorijskih vježbi i nastavnih materijala**
→ Stručne i savjetodavne usluge  ·  prihvatljivo i: Edukacije i stručno usavršavanje, Nastavne potrepštine
> Izrada laboratorijskih vježbi i nastavnih materijala je stručna usluga; dio sadržaja je nastavnog karaktera.

**Edukacija nastavnog osoblja, 3 dana, do 12 polaznika**
→ Edukacije i stručno usavršavanje  ·  prihvatljivo i: Stručne i savjetodavne usluge
> Izravno predstavlja edukaciju nastavnog osoblja.

**Produljeno jamstvo i tehnička podrška 36 mjeseci**
→ Usluge održavanja  ·  prihvatljivo i: Ostale usluge
> Produljeno jamstvo i tehnička podrška; ako je riječ o zasebnoj servisnoj usluzi, održavanje je najbliže.

### scenario3_rabat_pdv

**IoT komplet ESP32**
→ Nastavna i laboratorijska oprema  ·  prihvatljivo i: Računalna oprema, Mrežna i telekomunikacijska oprema
> Komplet s mikrokontrolerom za edukacijski/laboratorijski rad.

**Set senzora**
→ Mjerna i ispitna oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> Senzori služe mjerenju fizikalnih veličina.

**Raspberry Pi 5**
→ Računalna oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> Raspberry Pi je računalna platforma.

**LoRaWAN gateway**
→ Mrežna i telekomunikacijska oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> LoRaWAN gateway je mrežna komunikacijska oprema.

**Osciloskop Rigol**
→ Mjerna i ispitna oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> Osciloskop je mjerna i ispitna oprema.

**Lemna stanica**
→ Nastavna i laboratorijska oprema  ·  prihvatljivo i: Elektronička i elektrotehnička oprema
> Lemna stanica je specijalizirana laboratorijska oprema.

**Radna stanica**
→ Računalna oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> Radna stanica je računalna oprema.

**Instalacija i edukacija**
→ Usluge razvoja i održavanja informacijskih sustava  ·  prihvatljivo i: Edukacije i stručno usavršavanje, Usluge održavanja
> Kombinirana usluga instalacije i edukacije; dominantna je IT instalacija/podešavanje.

### scenario4_dvije_ponude

**Ljubičasti laserski modul, 12x45mm, 0.5mW, 650nm, linijski**
→ Elektronička i elektrotehnička oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> Laserski modul je elektronička komponenta/oprema za eksperimentalni rad.

**28BYJ-48 5V koračni (stepper) motor + ULN2003 motor driver**
→ Elektronička i elektrotehnička oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> Koračni motor i driver čine elektrotehničku komponentu.

**STSPIN220 stepper motor driver**
→ Elektronička i elektrotehnička oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> Driver za koračni motor je elektronička komponenta.

**TPS6216DSG regulator napona**
→ Elektronička i elektrotehnička oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> Regulator napona je elektronička komponenta.

**QRE1113 fototranzistor**
→ Elektronička i elektrotehnička oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> Fototranzistor je elektronička komponenta.

**NTR4501NT1G MOSFETs 20V 3.2A N-Channel**
→ Elektronička i elektrotehnička oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> MOSFET je elektronička komponenta.

**EVPAA602W SMD taktilni prekidač**
→ Elektronička i elektrotehnička oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> SMD taktilni prekidač je elektronička komponenta.

**EEEHBH220UAP elektrolitski kondenzator**
→ Elektronička i elektrotehnička oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> Elektrolitski kondenzator je elektronička komponenta.

**Mikrofon MAX9814**
→ Elektronička i elektrotehnička oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema, Audio-vizualna oprema
> Mikrofon je elektronička komponenta; može se klasificirati i kao AV oprema prema namjeni.

**Li-ion baterija 1200mAh 3.7V**
→ Elektronička i elektrotehnička oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> Baterija je elektrotehnička komponenta/napajanje.

**MOSFETs N-Ch 30V 50A DPAK-2 OptiMOS-T2**
→ Elektronička i elektrotehnička oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> MOSFET je elektronička komponenta.

**MindWave Mobile 2: Brainwave Starter Kit**
→ Nastavna i laboratorijska oprema  ·  prihvatljivo i: Elektronička i elektrotehnička oprema
> Brainwave kit je specijalizirani edukacijski/eksperimentalni komplet.

**Carrera GO DTM set**
→ Nastavna i laboratorijska oprema  ·  prihvatljivo i: Sitni inventar
> Komplet za edukacijski/eksperimentalni rad; namjena je presudna.

**Gravity: MOSFET kontroler 5-36V/20A**
→ Elektronička i elektrotehnička oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> MOSFET kontroler je elektronička upravljačka komponenta.

**GP ULTRA+ 4xAA alkalne baterije**
→ Elektronička i elektrotehnička oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> Alkalne baterije su potrošni elektrotehnički materijal.

**GP ULTRA+ 4xAAA alkalne baterije**
→ Elektronička i elektrotehnička oprema  ·  prihvatljivo i: Nastavna i laboratorijska oprema
> Alkalne baterije su potrošni elektrotehnički materijal.

### scenario5_dugacki_opisi + scenario6_format_brojeva

**Procesor AMD Ryzen 9 9950X3D (AM5)**
→ Računalna oprema  ·  prihvatljivo i: Elektronička i elektrotehnička oprema
> Procesor je računalna komponenta.

**Grafička kartica GeForce RTX 5090 32GB GDDR7**
→ Računalna oprema  ·  prihvatljivo i: Elektronička i elektrotehnička oprema
> Grafička kartica je računalna komponenta.

**Matična ploča ASUS ROG Crosshair X870E Hero (AM5, EATX)**
→ Računalna oprema  ·  prihvatljivo i: Elektronička i elektrotehnička oprema
> Matična ploča je računalna komponenta.

**Memorija G.Skill Trident Z5 Neo RGB 64 GB (2×32 GB) DDR5-6400 CL32**
→ Računalna oprema  ·  prihvatljivo i: Elektronička i elektrotehnička oprema
> RAM je računalna komponenta.

---

## Parovi kategorija koji se stvarno sudaraju

Mehanički izvedeno iz dodjela gore — svaki par (očekivana, prihvatljiva alternativa) i
koliko ga puta stavke pokreću. Nije pravilo nego sažetak onoga što je dodjela pokazala.

| Očekivana | Prihvatljiva alternativa | Stavaka |
|---|---|---|
| Elektronička i elektrotehnička oprema | Nastavna i laboratorijska oprema | 15 |
| Nastavna i laboratorijska oprema | Elektronička i elektrotehnička oprema | 6 |
| Mjerna i ispitna oprema | Nastavna i laboratorijska oprema | 6 |
| Računalna oprema | Nastavna i laboratorijska oprema | 4 |
| Računalna oprema | Elektronička i elektrotehnička oprema | 4 |
| Nastavna i laboratorijska oprema | Računalna oprema | 3 |
| Nastavna i laboratorijska oprema | Mrežna i telekomunikacijska oprema | 3 |
| Mrežna i telekomunikacijska oprema | Računalna oprema | 3 |
| Mrežna i telekomunikacijska oprema | Nastavna i laboratorijska oprema | 2 |
| Nastavna i laboratorijska oprema | Sitni inventar | 2 |
| Usluge razvoja i održavanja informacijskih sustava | Usluge održavanja | 2 |
| Elektronička i elektrotehnička oprema | Mjerna i ispitna oprema | 1 |
| Računalna oprema | Mrežna i telekomunikacijska oprema | 1 |
| Mrežna i telekomunikacijska oprema | Namještaj | 1 |
| Namještaj | Sitni inventar | 1 |
| Stručne i savjetodavne usluge | Edukacije i stručno usavršavanje | 1 |
| Stručne i savjetodavne usluge | Nastavne potrepštine | 1 |
| Edukacije i stručno usavršavanje | Stručne i savjetodavne usluge | 1 |
| Usluge održavanja | Ostale usluge | 1 |
| Usluge razvoja i održavanja informacijskih sustava | Edukacije i stručno usavršavanje | 1 |
| Elektronička i elektrotehnička oprema | Audio-vizualna oprema | 1 |
