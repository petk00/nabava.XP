// Konfiguracija eval scenarija (docs/EVAL_SCENARIOS.md) — čisti podaci, ne
// logika po scenariju. Runner (evalHarness.js) iterira kroz ovaj niz generički.
//
// PROMIJENJEN PREDMET MJERENJA. Do uklanjanja chata asistenta scenarij je bio
// RAZGOVOR: niz korisnikovih poruka kroz koje je model sastavljao nov zahtjev
// i kreirao ga alatom create_request. Chata više nema; jedini put kojim model
// dira podatke je POST /api/requests/:id/ai-items — čitanje ponude priložene
// uz POSTOJEĆI zahtjev i zamjena njegovih stavki i iznosa.
//
// Zbog toga scenarij više nema `turns`, `expectsProposeBeforeCreate` ni
// pojašnjenja: nema sugovornika kojem bi se odgovaralo. Ostaje ono što se i
// dalje mjeri — čita li model ponudu točno.
//
// SKUP OD 6. 9. 2026.: deset scenarija. Devet ide kroz poslužiteljsku ekstrakciju
// teksta iz PDF-a; scenarij 8 je slika i ide modelu izravno, bez ekstrakcije, pa se
// njegovi rezultati izvještavaju odvojeno (ulaz ondje nije izjednačen).
//
// Ground truth ranijih scenarija koji su ispali (chat-era tekstualni scenariji i
// raniji sastav skupa) ostaje u eval/ground-truth/ kao zapis, ali se ne izvodi.
//
// Format:
//   id                — kratki identifikator; ujedno ime datoteke ground trutha
//   description       — kratki opis (za log/izvještaj)
//   attachments       — niz apsolutnih putanja do ponuda; prilažu se uz zahtjev
//                        koji harness stvori prije mjerenja, kao formalni
//                        dokument tipa "Ponuda" (isti put kao ručni upload)
//   repeatCount       — koliko puta ponoviti (default 5, promjenjivo po scenariju)
//   inputModality     — 'pdf' | 'image'; mora se poklapati s ground truthom.
//                        'image' znači BEZ poslužiteljske ekstrakcije teksta.
//   countsTowardOverall — ulaze li stavke ovog scenarija u UKUPNU točnost i u
//                        raspodjelu kategorija. false kod scenarija čije su stavke
//                        prijepis drugih; scenarij se i dalje izvodi i izvještava,
//                        samo se ne pribraja da isti artikl ne bi ušao dvaput.
//   expectsRefusal    — je li ispravan ishod da stavke NE budu izvučene.
//                        Mora se poklapati s ground truthom; evalHarness.js to
//                        provjerava prije mjerenja i puca ako se raziđu.
//
//   GROUND TRUTH nije ovdje — v. eval/ground-truth/<scenario_id>.json

const path = require('path');

const FIXTURES_DIR = path.join(__dirname, '..', 'eval-scenarios', 'fixtures');

const SCENARIOS = [
  {
    id: 'scenario1_standardna',
    inputModality: 'pdf',
    expectsRefusal: false,
    description: 'Normalna ponuda s četiri stavke — osnovno čitanje stavki i konačnog iznosa.',
    attachments: [path.join(FIXTURES_DIR, 'scenario1_standardna.pdf')],
    repeatCount: 5,
  },
  {
    id: 'scenario2_visestranicna',
    inputModality: 'pdf',
    expectsRefusal: false,
    description: 'Višestranična ponuda s dvadesetak stavki — zadržava li model stavke s druge stranice.',
    attachments: [path.join(FIXTURES_DIR, 'scenario2_visestranicna.pdf')],
    repeatCount: 5,
  },
  {
    id: 'scenario3_rabat_pdv',
    inputModality: 'pdf',
    expectsRefusal: false,
    description: 'Ponuda s rabatom — bira li model konačan iznos za uplatu, a ne osnovicu ni međuzbroj.',
    attachments: [path.join(FIXTURES_DIR, 'scenario3_rabat_pdv.pdf')],
    repeatCount: 5,
  },
  {
    id: 'scenario4_dvije_ponude',
    inputModality: 'pdf',
    expectsRefusal: false,
    description: 'Dvije ponude uz isti zahtjev — spaja li model stavke iz obje i zbraja li iznose.',
    attachments: [
      path.join(FIXTURES_DIR, 'scenario4_ponuda_a.pdf'),
      path.join(FIXTURES_DIR, 'scenario4_ponuda_b.pdf'),
    ],
    repeatCount: 5,
  },
  {
    id: 'scenario5_dugacki_opisi',
    inputModality: 'pdf',
    expectsRefusal: false,
    description: 'Ponuda s dugačkim opisima stavki — stane li naziv u item_name varchar(200).',
    attachments: [path.join(FIXTURES_DIR, 'scenario5_dugacki_opisi.pdf')],
    repeatCount: 5,
  },
  {
    id: 'scenario6_format_brojeva',
    inputModality: 'pdf',
    expectsRefusal: false,
    // Parnjak scenariju 5: isti sadržaj, drugi zapis broja. U ukupnu točnost i
    // raspodjelu ulazi samo scenarij 5, inače bi ista četiri artikla ušla dvaput.
    countsTowardOverall: false,
    description: 'Ponuda s drugim formatom zapisa cijene (anglosaksonski, 1,398.00) — čita li ga model točno.',
    attachments: [path.join(FIXTURES_DIR, 'scenario6_jedinice.pdf')],
    repeatCount: 5,
  },
  {
    id: 'scenario7_nije_ponuda',
    inputModality: 'pdf',
    expectsRefusal: true,
    description: 'Dokument sa stavkama i iznosima koji NIJE ponuda — prepoznaje li model o čemu je riječ.',
    attachments: [path.join(FIXTURES_DIR, 'scenario7_nije_ponuda.pdf')],
    repeatCount: 5,
  },
  {
    // JEDINI scenarij bez poslužiteljske ekstrakcije: slika ide modelu izravno,
    // pa svaka izvedba radi vlastito očitanje i ulaz nije izjednačen. Rezultati
    // se izvještavaju u zasebnoj tablici i tokeni se broje odvojeno.
    //
    // Dokument je SAMOSTALNA ponuda (biooprema d.o.o. 225/2025), ne fotografija
    // ponude iz scenarija 1 — uparene probe „isti dokument, dva kanala" nema.
    id: 'scenario8_slika',
    inputModality: 'image',
    expectsRefusal: false,
    description: 'Ponuda fotografirana s papira (JPEG) — čitanje bez poslužiteljske ekstrakcije teksta.',
    attachments: [path.join(FIXTURES_DIR, 'scenario8_slika.jpeg')],
    repeatCount: 5,
  },
  {
    id: 'scenario9_negativ',
    inputModality: 'pdf',
    expectsRefusal: false,
    description: 'Ponuda s negativnom stavkom (odbitak) — izostavlja li je model iz popisa stavki.',
    attachments: [path.join(FIXTURES_DIR, 'scenario9_negativ.pdf')],
    repeatCount: 5,
  },
  {
    id: 'scenario10_cetiri_ponude',
    inputModality: 'pdf',
    expectsRefusal: false,
    // Prilozi su bajt-jednake kopije dokumenata scenarija 4a, 3, 1 i 2. Mjeri
    // spajanje i zbrajanje, ne čitanje — boduje se samo po broju stavki (46) i
    // po tome je li iznos zbroj svih četiriju ponuda.
    countsTowardOverall: false,
    description: 'Četiri ponude uz isti zahtjev — spaja li model stavke iz svih i zbraja li iznose.',
    attachments: [
      path.join(FIXTURES_DIR, 'scenario10_ponuda1.pdf'),
      path.join(FIXTURES_DIR, 'scenario10_ponuda2.pdf'),
      path.join(FIXTURES_DIR, 'scenario10_ponuda3.pdf'),
      path.join(FIXTURES_DIR, 'scenario10_ponuda4.pdf'),
    ],
    repeatCount: 5,
  },
];

// Scenariji čije stavke NE ulaze u ukupnu točnost ni u raspodjelu kategorija.
const EXCLUDED_FROM_OVERALL = SCENARIOS
  .filter((s) => s.countsTowardOverall === false)
  .map((s) => s.id);

module.exports = { SCENARIOS, FIXTURES_DIR, EXCLUDED_FROM_OVERALL };
