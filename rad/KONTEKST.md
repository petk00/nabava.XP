# KONTEKST — diplomski rad

> Ova datoteka se čita na početku **svakog** razgovora s AI-em o radu.
> Kratka je namjerno. Ako nešto ovdje nije zapisano, ne postoji.
> Polja označena `‹popuniti›` popuniti prije prvog korištenja.

---

## 1. Osnovni podaci

- **Naslov (radni):** Komparativna analiza lokalnog i distribuiranog AI sustava na primjeru aplikacije nabava.XP
- **Autor:** Igor Petković
- **Mentor:** ‹popuniti›
- **Status prijave teme:** nije formalno prijavljena
- **Datum početka finalne verzije:** 3. 9. 2026.
- **Ciljani rok (vlastiti, nije fakultetski):** ~8. 9. 2026.

---

## 2. Cilj i hipoteza — DOSLOVNO, ne prepričavati

**Cilj rada:**
‹popuniti — jedna rečenica, u obliku „Cilj rada je utvrditi ..."›

**Hipoteza (zaključana, ne mijenja se nakon Bloka 1):**

> Lokalni AI sustav na Mac Mini M4 pri određenom volumenu obrade naloga postiže
> financijsku točku pokrića i zadovoljava tehničke pragove točnosti i brzine,
> uz podatke koji ostaju kod naručitelja.

**Razgradnja hipoteze na provjerive tvrdnje** — svaka tvrdnja mora imati broj koji je potvrđuje ili obara:

| # | Tvrdnja | Metrika koja je potvrđuje/obara | Prag |
|---|---------|--------------------------------|------|
| H1 | postoji volumen iznad kojeg je lokalno jeftinije | točka pokrića iz TCO izračuna | break-even < ‹popuniti› naloga/god. |
| H2 | lokalni model zadovoljava prag točnosti | JSON validity rate + field accuracy | ‹popuniti› % |
| H3 | lokalni model zadovoljava prag brzine | end-to-end latencija (medijan, p95) | ‹popuniti› s |
| H4 | podaci ostaju kod naručitelja | kvalitativni kriterij 6 (GDPR/tajnost) + offline test | rubrika |

> Ako neka tvrdnja nema svoj broj — izbaciti je iz hipoteze ili joj dodijeliti metriku.
> Ovo se rješava **prije** pisanja Metodologije.

---

## 3. Sustav koji se istražuje

- **Aplikacija:** nabava.XP — asistirano kreiranje naloga/zahtjeva za nabavu
- **Naručitelj:** Veleučilište u Rijeci
- **Arhitektura:** klijent/poslužitelj; uz aplikaciju se preporučuje i isporučuje komad hardvera
- **Jezik sustava:** hrvatski (upiti, ponude, polja obrasca)
- **Status:** sustav nije u produkciji; radi na lokalnom modelu
- **Sučelje prema modelima:** model-agnostičko, ista aplikacijska logika za obje izvedbe

### Dvije uspoređivane izvedbe

| | Lokalna izvedba | Distribuirana (cloud) izvedba |
|---|---|---|
| Model | `gemma4:e2b` (5,1 mlrd. parametara) | `gemini-2.5-flash` |
| Pokretanje | Ollama, on-premise | HTTP API |
| Hardver | Mac Mini M4, 16 GB RAM | — (usluga) |
| Trošak | CapEx (uređaj) + struja | OpEx (tokeni) |
| Uloga u radu | predmet ocjene | referentni strop |

> **Okvir usporedbe:** rad NE tvrdi „koji je model bolji". Rad utvrđuje **na kojim se
> mjerljivim osima dvije izvedbe istog agenta razlikuju**, s cloud modelom kao
> referentnim stropom. Ovu rečenicu ponoviti u Uvodu i u Metodologiji.

---

## 4. Kriteriji ponderirane matrice odlučivanja

Ponder = **težina (1–5) × ocjena (1–5)** po izvedbi.

**Kvantitativni (mjere se):**

| # | Kriterij | Izvor ocjene | Težina |
|---|----------|--------------|--------|
| 1 | Performanse / latencija | TTFT, end-to-end, jitter | ‹1–5› |
| 2 | Propusnost | tokeni/s | ‹1–5› |
| 3 | Točnost (JSON + ekstrakcija polja) | zlatni standard | ‹1–5› |
| 4 | Resursi (CPU/RAM) | uzorkovanje tijekom obrade | ‹1–5› |
| 5 | Financije (TCO, CapEx vs OpEx) | TCO izračun 12–36 mj. | ‹1–5› |

**Kvalitativni (rubrika stručne procjene, bez mjerenja):**

| # | Kriterij | Osnova ocjene | Težina |
|---|----------|---------------|--------|
| 6 | Sigurnost i tajnost / GDPR | prijenos podataka, DPA, treniranje na podacima | ‹1–5› |
| 7 | Otpornost i offline rad | simulirani prekid veze | ‹1–5› |
| 8 | Jednostavnost održavanja | RACI, procjena sati IT-a | ‹1–5› |
| 9 | Neovisnost o dobavljaču | prenosivost koda i modela | ‹1–5› |
| 10 | Fleksibilnost i skalabilnost | kontekstni prozor vs RAM | ‹1–5› |

> Težine se određuju **prije** nego što se vide rezultati i poslije se ne mijenjaju.
> Obrazloženje svake težine ide u Metodologiju, blok D.

---

## 5. Mjerni plan

| Metrika | Kako | Uvjeti |
|---------|------|--------|
| TTFT, end-to-end latencija, jitter | `performance.now()` | N ≥ 30 po scenariju, cool-down 2 s |
| Propusnost (t/s) | `eval_count / eval_duration` | isti prolazi |
| JSON validity rate | shema odgovora | svi prolazi |
| Field accuracy | usporedba s `gold_standard.json` | 10–20 naloga |
| CPU / RAM | uzorkovanje svakih 500 ms | tijekom obrade |
| TCO i točka pokrića | `evalCost.js` | horizont 12–36 mj. |
| Stress test | 5–10 istodobnih naloga | skroman opseg, namjerno |
| Offline rad | fizički prekid mreže | opis + snimka ponašanja |

**Radna pretpostavka volumena:** 500 naloga mjesečno (~6.000 godišnje).
Sustav nije u produkciji, pa je ovo procjena — i tako mora biti napisano u radu.

**Prikazi:** box plot (latencija), bar chart (točnost), grouped/stacked bar (usporedba izvedbi), resource timeline (CPU/RAM), line chart (break-even).

### Gdje živi mjerni aparat

```
server/scripts/evalScenarios.js      scenariji + ground truth
server/scripts/evalHarness.js        runner
scripts/scoreEvalResults.js          bodovanje
scripts/evalCost.js                  trošak i TCO
server/eval-scenarios/fixtures/      PDF prilozi
server/eval-results/                 JSONL rezultati
```

> Pilot-mjerenja (3 prolaza, 9/10, 9/10, 8/10) **ne ulaze u rad.**
> U rad ulazi isključivo finalna mjerna kampanja, provedena zasebno.

---

## 6. Pojmovnik — fiksni nazivi, bez sinonima

| Koristi se | Ne koristi se |
|------------|---------------|
| nabava.XP | Nabava XP, nabavaXP, aplikacija |
| nalog | zahtjev, narudžba, request |
| lokalna izvedba / lokalni model | on-premise model, offline model |
| distribuirana (cloud) izvedba | vanjski model, API model |
| `gemma4:e2b` | Gemma, gemma4 |
| `gemini-2.5-flash` | Gemini, Flash |
| zlatni standard | ground truth, referentni skup |
| točka pokrića | break-even (u tekstu; u grafovima smije) |

---

## 7. Granice poglavlja — protiv miješanja sadržaja

| Poglavlje | Opseg | Smije sadržavati | **Ne smije sadržavati** |
|-----------|-------|------------------|--------------------------|
| Uvod | ~3 str. | namjera, cilj, hipoteza, najava aktivnosti (buduće vrijeme) | ijedan izmjereni broj, ijedan zaključak |
| Prethodna istraživanja | ~4 str. / ~4 kartice | tuđi nalazi, svaki s citatom | vlastita mjerenja, opis vlastitog sustava, vlastite ocjene |
| Metodologija | ~16 str. | postupak, uvjeti, metrike, kako se mjeri | rezultate, interpretaciju |
| Diskusija | ~14 str. | vlastiti brojevi + interpretacija + sinteza | novi opis postupka, novu literaturu |
| Zaključak | ~3 str. | odgovor na hipotezu, ograničenja, dalji rad | ijedan broj koji se ne pojavljuje u Diskusiji |

**Ukupno ~40 str.** — 1 kartica = 1800 znakova s razmacima (~250–300 riječi).

Struktura poglavlja slijedi fakultetski predložak (`STRUKTURA.docx`) — svaka natuknica iz predloška mora biti odgovorena, ali natuknice **nisu** potpoglavlja: tekst je tekući.

---

## 8. Pravila rada s AI-em

1. **Tekst rada pišem ja.** AI dorađuje, provjerava, širi i predlaže — ne piše poglavlja umjesto mene. Iznimka: **kod** (eval harness, skripte, grafovi) — tu AI radi punom parom.
2. **Word je jedini original teksta.** AI ne generira .docx poglavlja i ne drži drugu kopiju. Lijepljenje natrag u Word isključivo kao čisti tekst (Ctrl+Shift+V), pa stil predloška.
3. **Jedan razgovor = jedno poglavlje.** Objedinjavanje natuknica radi se unutar tog razgovora, na kraju, nikad naknadno.
4. **Brojevi se ne pamte.** Svaki broj u tekstu prepisuje se iz `BROJEVI.md`. Ako broja nema ondje — ne ide u tekst.
5. **Citati se ne izmišljaju.** Svaki izvor u `LITERATURA.md` s punim bibliografskim podacima i oznakom da je provjeren. Nepotvrđena referenca ne ulazi u rad.
6. **Na kraju svakog poglavlja:** 10 redaka donesenih odluka → dopisati u § 10 ove datoteke. Sljedeći razgovor nasljeđuje odluke, ne cijeli tekst.
7. **Citiranje:** numerički, IEEE stil, redoslijedom prvog pojavljivanja.

---

## 9. Poštenje rezultata

Ako neki rezultat ispadne loše za lokalnu izvedbu, ide u rad **kakav jest**, uz objašnjenje uzroka. Rad koji pokaže gdje lokalno ne zadovoljava je obranjiv; rad u kojem svaki nalaz podupire hipotezu nije.

Hipoteza smije biti potvrđena **djelomično** — i to je valjan ishod.

---

## 10. Dnevnik odluka

> Dopisivati na kraju svakog poglavlja. Kratko, jedan redak po odluci.

**Blok 1 — ‹datum›**
- ‹odluka›

**Metodologija — ‹datum›**
- ‹odluka›

**Prethodna istraživanja — ‹datum›**
- ‹odluka›

**Diskusija — ‹datum›**
- ‹odluka›

---

## 11. Utrošak vremena po fazama

> Bilježiti **usput**, svaki dan. Traži se u Zaključku i naknadno se ne može rekonstruirati.

| Faza | Datum | Sati | Napomena |
|------|-------|------|----------|
| Priprema, kontekst, predložak | | | |
| Scenariji i zlatni standard | | | |
| Mjerna kampanja | | | |
| Metodologija | | | |
| Prethodna istraživanja | | | |
| Diskusija | | | |
| Uvod i Zaključak | | | |
| Završna kontrola i formatiranje | | | |
