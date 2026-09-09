# LITERATURA

> **Stil: APA 6**, prema *Pravilima pisanja završnog/diplomskog rada* Veleučilišta u Rijeci.
> Citira se **preko Wordovog Upravitelja izvorima**, ne prepisivanjem — postupak je u
> `VODIC-LITERATURA.md`, a izvori su pripremljeni u `Sources.xml`.
>
> **Pravilo:** izvor bez oznake `provjereno` ne ulazi u rad.
> **Kvačicu „provjereno" stavlja isključivo autor rada**, nakon što je izvor otvorio,
> potvrdio autore i godinu, provjerio da poveznica radi i da tvrdnja koju izvor treba
> poduprijeti u njemu doista piše.

**Okvir:** rad je iz područja **distribuiranih sustava**. Literatura mora podupirati
tvrdnje o **smještaju obradne komponente**, a ne o kvaliteti jezičnih modela. Izvor koji
govori isključivo o modelima ovdje pripada samo kao pomoćni.

---

## Kako se citira (obrasci iz Pravila)

**U tekstu** (naslov se iz reference uklanja, stranica se dodaje kad je potrebna):

| Slučaj | Oblik |
|---|---|
| jedan autor | `(Dujanić, 2006, str. 55)` |
| isti autor, ista godina | `(Dujanić, 2006a)` |
| dva ili tri autora | `(Samuelson & Nordhaus, 2000, str. 225-227)` |
| četiri i više | `(Kotler, P. et al., 2006)` |
| dva izvora zaredom | `(Samuelson & Nordhaus, 2000) (Kotler, P. et al., 2006)` |
| sekundarni izvor | `(Meddinus & Curtis, 1963.) prema (Pervin et al., 2008., str. 213)` |
| propis | `(Zakon o radu NN 93/14., 127/17.)` |
| nepoznat autor | `(Naslov, n.d.)` |

**U popisu** — abecedno po prezimenu, kronološki za istog autora; smije se grupirati po
vrstama izvora. Popis generira Word, ne ruka.

---

## Popis korištenih izvora

Oznaka je *tag* iz Wordovog Upravitelja izvorima — po njemu se izvor pronalazi pri
umetanju navoda.

| Oznaka | Zapis (APA 6) | Provjereno | Poglavlje | Za koju tvrdnju |
|---|---|---|---|---|
| `Sat17` | Satyanarayanan, M. (2017.). The Emergence of Edge Computing. *Computer, 50*(1), 30-39. | ✅ | 2 | smještaj komponente je problem distribuiranih sustava |
| `Bel25` | Belcastro, L., Marozzo, F., Orsino, A., Talia, D., & Trunfio, P. (2025.). *Navigating the Edge-Cloud Continuum: A State-of-Practice Survey.* arXiv:2506.02003. | ✅ | 2 | pitanje smještaja i danas je otvoreno u praksi |
| `Pou25` | Pournazari, J., Ullah, A., Al-Dubai, A., & Liu, X. (2025.). Computation offloading in the edge-to-cloud compute continuum: a survey of federated architectural solutions. *Cluster Computing, 28*(13), 839. | ✅ | 2, 3.5 | kriteriji odluke o smještaju (latencija, energija, privatnost, trošak) |
| `Alm25` | Almeida, L., & Peixoto, M. (2025.). *Tetris: An SLA-aware Application Placement Strategy in the Edge-Cloud Continuum.* arXiv:2511.00294. | ✅ | 2, 3.5 | smještaj vođen dogovorenom razinom usluge → pragovi H2, H3 |
| `Bre12` | Brewer, E. (2012.). CAP Twelve Years Later: How the „Rules" Have Changed. *Computer, 45*(2), 23-29. | ✅ | 2, diskusija | H5 — izbor dostupnosti pri particiji mreže |
| `Dea13` | Dean, J., & Barroso, L. A. (2013.). The Tail at Scale. *Communications of the ACM, 56*(2), 74-80. | ✅ | 3.6, diskusija | zašto medijan i p95, nikad prosjek |
| `Nie93` | Nielsen, J. (1993.). *Response Time Limits.* Nielsen Norman Group. | ✅ | 3.5, diskusija | H4 (< 1 s) i tumačenje praga od 60 s |
| `GDPR28` | Uredba (EU) 2016/679 (Opća uredba o zaštiti podataka), SL L 119, čl. 28. | ✅ | 3.2, diskusija | H6 — obveze pri obradi kod vanjskog izvršitelja |
| `EDPB24` | Europski odbor za zaštitu podataka. (2024.). *Opinion 22/2024 on certain obligations following from reliance on processors and sub-processors.* Bruxelles. | ✅ | 3.2, diskusija | lanac podizvršitelja kao trošak udaljene izvedbe |
| `Pan25` | Pan, G., Chodnekar, V., Roy, A., & Wang, H. (2025.). *A Cost-Benefit Analysis of On-Premise Large Language Model Deployment: Breaking Even with Commercial LLM Services.* arXiv:2509.18101. | ✅ | 2, 3.6, diskusija | H7 — usporedna metodologija točke pokrića |
| `Kaz00` | Kazman, R., Klein, M., & Clements, P. (2000.). *ATAM: Method for Architecture Evaluation* (CMU/SEI-2000-TR-004). Pittsburgh: Software Engineering Institute. | ✅ | 3.5 | utemeljenje ponderirane matrice i kompromisa među kriterijima |
| `Hus25` | Husom, E. J. et al. (2025.). Sustainable LLM Inference for Edge AI: Evaluating Quantized LLMs for Energy Efficiency, Output Accuracy, and Inference Latency. *ACM Transactions on Internet of Things.* | ✅ | 2, 3.4 | mjerenje energije, točnosti i odziva na rubnom uređaju |
| `Ben25` | Benazir, A., & Lin, F. X. (2025.). *Profiling Large Language Model Inference on Apple Silicon: A Quantization Perspective.* arXiv:2508.08531. | ✅ | 2, 3.4 | mjerenja na M4 Pro; trošak po milijunu tokena |
| `Raj25` | Rajesh, V. et al. (2025.). *Production-Grade Local LLM Inference on Apple Silicon: A Comparative Study of MLX, MLC-LLM, Ollama, llama.cpp, and PyTorch MPS.* arXiv:2511.05502. | ✅ | 3.4, 3.8 | Ollama nije najbrži izvedbeni okvir → „dalji rad" |
| `Gom26` | Gómez, J., & Sánchez, J. (2026.). *Information Extraction from Electricity Invoices with General-Purpose Large Language Models.* arXiv:2604.25927. | ✅ | 2, diskusija | H1 — usporedna vrijednost točnosti izdvajanja iz računa |

**15 izvora.** Svi su unijeti u `Sources.xml` i uvezeni u Word.

**Provjera:** autor je 10. 9. 2026. potvrdio da je pregledao svih 15 izvora — poveznice rade,
autori i godine se slažu, a tvrdnje koje izvori podupiru u njima doista stoje.

---

## Čeka provjeru pristupa

| Izvor | Zašto nije u `Sources.xml` |
|---|---|
| *Benchmarking and Characterization of Large Language Model Inference on Apple Silicon.* Proceedings of the ACM on Measurement and Analysis of Computing Systems (2025). doi:10.1145/3771563 | Jedini **recenzirani** rad o izvođenju jezičnih modela na Apple Siliciju, ali ACM odbija pristup pa autori i točan zapis nisu potvrđeni. Otvoriti preko knjižnice Veleri i javiti popis autora. |
| *GreenBench: Benchmarking Energy Efficiency and Carbon Footprint of Open-Source LLM Inference on Apple Silicon.* arXiv:2608.28667. | Po naslovu pokriva mjerenje energije, ali puni tekst nije bio dostupan pa nije potvrđeno koje uređaje mjeri ni kako. |

---

## Odbačeni izvori

| Izvor | Razlog odbacivanja |
|---|---|
| Lenovo Press, *On-Premise vs Cloud: Generative AI TCO* | Industrijski materijal proizvođača, nije akademski izvor; `Pan25` pokriva isto pitanje. |
| *A Survey on IoT-Edge-Cloud Continuum Systems* (preprints.org) | Preklapa se s `Bel25`, a nije recenziran. |
| Gilbert & Lynch, *Perspectives on the CAP Theorem* | Formalna dopuna `Bre12`; rad ne treba teoriju particije na toj razini. |
| Nguyen et al., *The Tail at Scale: How to Predict It?* (HotCloud 2016) | Predviđanje repa nije predmet rada; `Dea13` je dovoljan. |
| Blancato, *The cloud sovereignty nexus* (Policy & Internet) | Politološki rad; u tehničkom radu bi služio jednoj rečenici, što je razrjeđivanje popisa. |
| *Cloud to Edge: Benchmarking LLM Inference on Single-Board Computers* | Mjeri jednopločna računala; `Ben25` i `Raj25` pokrivaju stvarnu platformu rada. |
| *Invoice Information Extraction: Methods and Performance Evaluation* (arXiv:2510.15727) | Preklapa se s `Gom26`, koji ima jače mjerenje po poljima. |
| Landis, J. R., & Koch, G. G. (1977.) | Uzorak druge procjene (19 stavki) namjerno je biran po graničnim slučajevima, a ne nasumično. Koeficijent slaganja pretpostavlja reprezentativan uzorak da bi procijenio slaganje slučajem, pa bi na namjerno teškom uzorku dao brojku strožu nego što stanje jest. Slaganje se umjesto toga iskazuje udjelom (npr. „15 od 19") uz popis stavki na kojima se razišlo. |

---

## Druga procjena kategorija — rezultat

Provedena 8. rujna 2026. na uzorku od 19 graničnih stavki, upisano u 3.3.

- strogo slaganje **9/19**, blago **12/19**
- od 10 razilaženja 3 padaju unutar prihvatljivih alternativa
- os neslaganja: fizička priroda predmeta (drugi procjenitelj) protiv namjene (zlatni standard)
- dvije dodjele odstupaju i od vlastitog pravila procjenitelja
- uzorak je namjerno biran po granicama; vrijednost ne opisuje zlatni standard u cjelini

---

## Napomene za pisanje poglavlja 2

- Nijedan pronađeni izvor ne mjeri **Mac Mini M4 sa 16 GB**, ne radi izdvajanje stavki iz
  ponuda dobavljača, niti postavlja pitanje smještaja unutar konkretne ustanove. Ta se
  praznina u poglavlju 2 navodi izrijekom, kao razlog zbog kojeg mjerenje ovog rada ima
  smisla.
- `Pan25` zaključuje da se za male modele ulaganje vraća unutar tri mjeseca, na
  NVIDIA sklopovlju i uz visok opseg posla. Taj se zaključak u diskusiji **suprotstavlja**
  ishodu ovog rada pod punim pripisivanjem troška, gdje je opseg posla Veleučilišta
  premalen — razlika u opsegu, a ne u metodi, i tako je treba prikazati.
- `Gom26` postiže F1 od 97,61 % (Gemini) odnosno 96,11 % (Mistral-small) na španjolskim
  računima za struju. To je najbliža usporedna vrijednost za H1, uz ogradu da su računi
  za struju ujednačeniji od ponuda dobavljača.
- Šest je izvora **preprint** (`Bel25`, `Alm25`, `Pan25`, `Ben25`, `Raj25`, `Gom26`) —
  to se u tekstu navodi pri prvom pozivanju.
