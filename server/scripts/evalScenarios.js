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
// ŠTO JE ISPALO IZ MJERENJA. Tri scenarija bez priloga (8 — ponuda kao tekst
// e-maila, 9 — manipulativan uvod, 10 — izmjena nakon kreiranja) nemaju što
// mjeriti na ovoj ruti, jer ona polazi od priložene datoteke. Njihov ground
// truth namjerno OSTAJE u eval/ground-truth/ kao zapis o obavljenom poslu, ali
// se više ne izvodi. To se mora navesti u Metodologiji kao suženje opsega, ne
// prešutjeti.
//
// Format:
//   id                — kratki identifikator; ujedno ime datoteke ground trutha
//   description       — kratki opis (za log/izvještaj)
//   attachments       — niz apsolutnih putanja do ponuda; prilažu se uz zahtjev
//                        koji harness stvori prije mjerenja, kao formalni
//                        dokument tipa "Ponuda" (isti put kao ručni upload)
//   repeatCount       — koliko puta ponoviti (default 5, promjenjivo po scenariju)
//   inputModality     — 'pdf' | 'image'; mora se poklapati s ground truthom
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
    description: 'Standardna jednostranična PDF ponuda — osnovno čitanje stavki i konačnog iznosa.',
    attachments: [path.join(FIXTURES_DIR, 'scenario1_standardna.pdf')],
    repeatCount: 5,
  },
  {
    id: 'scenario2_visestranicna',
    inputModality: 'pdf',
    expectsRefusal: false,
    description: 'Ponuda kroz dvije stranice, 23 stavke — zadržava li model stavke s druge stranice.',
    attachments: [path.join(FIXTURES_DIR, 'scenario2_visestranicna.pdf')],
    repeatCount: 5,
  },
  {
    id: 'scenario3_rabat_pdv',
    inputModality: 'pdf',
    expectsRefusal: false,
    description: 'Složena struktura cijena (osnovica, rabat, PDV, za uplatu) — bira li model pravi iznos.',
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
    description: 'Nazivi stavki 232-251 znakova — stane li u item_name varchar(200) i skraćuje li model razumno.',
    attachments: [path.join(FIXTURES_DIR, 'scenario5_dugacki_opisi.pdf')],
    repeatCount: 5,
  },
  {
    id: 'scenario6_format_brojeva',
    inputModality: 'pdf',
    expectsRefusal: false,
    description: 'Ista ponuda kao scenarij 5, ali brojevi u anglosaksonskom formatu (1,398.00) — čita li ih model točno.',
    attachments: [path.join(FIXTURES_DIR, 'scenario6_jedinice.pdf')],
    repeatCount: 5,
  },
  {
    id: 'scenario7_nije_ponuda',
    inputModality: 'image',
    expectsRefusal: true,
    description: 'PDF bez tekstualnog sloja (skenirana slika) — sustav ga mora odbiti s jasnom porukom.',
    attachments: [path.join(FIXTURES_DIR, 'scenario7_nije_ponuda.pdf')],
    repeatCount: 3,
  },
];

module.exports = { SCENARIOS, FIXTURES_DIR };
