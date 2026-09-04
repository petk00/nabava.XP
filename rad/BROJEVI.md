# BROJEVI — jedini izvor izmjerenih vrijednosti

> **Pravilo:** nijedan broj ne ulazi u tekst rada ako nije ovdje.
> Popunjava se **skriptom iz JSONL-a** (`server/eval-results/`), ne prepisivanjem iz glave.
> Svaki redak ima izvor (datoteka + datum prolaza), inače nije upotrebljiv.

**Status kampanje:** ⬜ nije pokrenuta ⬜ u tijeku ⬜ završena
**Datum kampanje:** ‹popuniti›
**Verzija koda pri mjerenju (git commit):** ‹popuniti›

---

## 0. Uvjeti mjerenja

| Stavka | Vrijednost |
|--------|-----------|
| Hardver (lokalno) | Mac Mini M4, 16 GB RAM |
| OS i verzija | ‹popuniti› |
| Ollama verzija | ‹popuniti› |
| Lokalni model | `gemma4:e2b` (5,1 mlrd. par.) |
| Temperatura (lokalno) | Modelfile default — ‹vrijednost› |
| Cloud model | `gemini-2.5-flash` |
| Cloud regija / endpoint | ‹popuniti› |
| Broj scenarija | ‹popuniti› |
| Ponavljanja po scenariju (N) | ‹≥30› |
| Cool-down između prolaza | 2 s |
| Mreža (za cloud) | ‹popuniti — vrsta veze, izmjerena latencija do endpointa› |

---

## 1. Latencija

**TTFT (vrijeme do prvog tokena), ms**

| Izvedba | N | min | medijan | p95 | max | st. dev. | Izvor |
|---------|---|-----|---------|-----|-----|----------|-------|
| lokalna | | | | | | | |
| cloud | | | | | | | |

**End-to-end latencija, ms**

| Izvedba | N | min | medijan | p95 | max | st. dev. | Izvor |
|---------|---|-----|---------|-----|-----|----------|-------|
| lokalna | | | | | | | |
| cloud | | | | | | | |

**Jitter** (raspršenje uzastopnih mjerenja)

| Izvedba | mjera | vrijednost | Izvor |
|---------|-------|-----------|-------|
| lokalna | | | |
| cloud | | | |

**Po scenariju** (za box plot — sirovi podaci ostaju u JSONL-u, ovdje samo sažetak)

| Scenarij | Izvedba | medijan e2e (ms) | p95 (ms) |
|----------|---------|------------------|----------|
| | | | |

---

## 2. Propusnost

| Izvedba | tokeni/s (medijan) | eval_count (prosj.) | eval_duration (prosj.) | Izvor |
|---------|--------------------|---------------------|------------------------|-------|
| lokalna | | | | |
| cloud | | | | |

---

## 3. Točnost

**JSON validity rate** — udio odgovora koji zadovoljavaju shemu

| Izvedba | ispravnih / ukupno | % | Izvor |
|---------|--------------------|---|-------|
| lokalna | | | |
| cloud | | | |

**Field accuracy** — usporedba sa `gold_standard.json`

| Izvedba | točnih polja / ukupno | % | Izvor |
|---------|------------------------|---|-------|
| lokalna | | | |
| cloud | | | |

**Po polju** (gdje sustav griješi)

| Polje | Lokalna % | Cloud % | Napomena |
|-------|-----------|---------|----------|
| | | | |

**S prilogom vs bez priloga**

| Izvedba | bez priloga % | s prilogom (PDF) % | Izvor |
|---------|---------------|--------------------|-------|
| lokalna | | | |
| cloud | | | |

**Izmišljanje podataka (fabrication)** — polja popunjena vrijednošću koje nema u ulazu

| Izvedba | broj slučajeva | stopa % | Izvor |
|---------|----------------|---------|-------|
| lokalna | | | |
| cloud | | | |

**Dosljednost** — isti ulaz, ponovljeni prolazi, identičan izlaz?

| Izvedba | udio identičnih izlaza % | Izvor |
|---------|--------------------------|-------|
| lokalna | | | |
| cloud | | | |

---

## 4. Resursi (samo lokalna izvedba)

Uzorkovanje svakih 500 ms tijekom obrade.

| Mjera | Mirovanje | Prosjek pod opterećenjem | Vršno | Izvor |
|-------|-----------|--------------------------|-------|-------|
| CPU % | | | | |
| RAM (GB) | | | | |
| ‹temperatura / potrošnja, ako se mjeri› | | | | |

---

## 5. Stress test (5–10 istodobnih naloga)

| Istodobnih | Izvedba | medijan e2e (ms) | p95 (ms) | neuspjelih | RAM vršno (GB) | Izvor |
|-----------|---------|------------------|----------|------------|----------------|-------|
| 1 (osnovica) | lokalna | | | | | |
| 5 | lokalna | | | | | |
| 10 | lokalna | | | | | |
| 5 | cloud | | | | — | |
| 10 | cloud | | | | — | |

---

## 6. Offline test

| Scenarij | Lokalna izvedba | Cloud izvedba |
|----------|-----------------|---------------|
| Mreža prekinuta tijekom obrade | | |
| Mreža nedostupna pri pokretanju | | |
| Vrijeme oporavka nakon vraćanja veze | | |

Opis ponašanja: ‹popuniti›

---

## 7. Trošak i TCO

**Ulazne pretpostavke**

| Stavka | Vrijednost | Izvor pretpostavke |
|--------|-----------|--------------------|
| Volumen naloga | 500 mj. / ~6.000 god. | radna procjena, sustav nije u produkciji |
| Cijena uređaja (CapEx) | | |
| Životni vijek uređaja | ‹36 mj.› | |
| Potrošnja struje | | |
| Cijena struje | | |
| Cijena cloud tokena (ulaz) | | cjenik, datum ‹›|
| Cijena cloud tokena (izlaz) | | cjenik, datum ‹›|
| Prosj. tokena po nalogu (ulaz/izlaz) | | izmjereno |

**Rezultat**

| Horizont | Lokalna izvedba | Cloud izvedba | Razlika |
|----------|-----------------|---------------|---------|
| 12 mj. | | | |
| 24 mj. | | | |
| 36 mj. | | | |

**Točka pokrića:** ‹popuniti› naloga godišnje

> Napomena: raniji izračun dao je 37.589 naloga/god. Ta brojka potječe iz ranije
> postavke i **mora se ponovno izračunati** za finalnu kampanju prije ulaska u rad.

---

## 8. Ponderirana matrica odlučivanja

Ponder = težina (1–5) × ocjena (1–5). Težine određene prije uvida u rezultate.

| # | Kriterij | Težina | Ocjena — lokalna | Ponder L | Ocjena — cloud | Ponder C | Obrazloženje ocjene |
|---|----------|--------|------------------|----------|----------------|----------|---------------------|
| 1 | Performanse / latencija | | | | | | |
| 2 | Propusnost | | | | | | |
| 3 | Točnost | | | | | | |
| 4 | Resursi | | | | | | |
| 5 | Financije (TCO) | | | | | | |
| 6 | Sigurnost / GDPR | | | | | | |
| 7 | Otpornost i offline rad | | | | | | |
| 8 | Održavanje | | | | | | |
| 9 | Neovisnost o dobavljaču | | | | | | |
| 10 | Fleksibilnost / skalabilnost | | | | | | |
| | **UKUPNO** | | | | | | |

---

## 9. Provjera hipoteze

| # | Tvrdnja | Prag | Izmjereno | Potvrđeno? |
|---|---------|------|-----------|-----------|
| H1 | točka pokrića postoji i dostižna je | | | |
| H2 | prag točnosti zadovoljen | | | |
| H3 | prag brzine zadovoljen | | | |
| H4 | podaci ostaju kod naručitelja | rubrika | | |

---

## 10. Grafovi

| Oznaka | Vrsta | Podaci iz | Datoteka slike | U poglavlju |
|--------|-------|-----------|----------------|-------------|
| Slika 1 | box plot — latencija | § 1 | | Diskusija |
| Slika 2 | bar chart — točnost | § 3 | | Diskusija |
| Slika 3 | grouped bar — usporedba izvedbi | § 1–3 | | Diskusija |
| Slika 4 | resource timeline — CPU/RAM | § 4 | | Diskusija |
| Slika 5 | line chart — točka pokrića | § 7 | | Diskusija |
