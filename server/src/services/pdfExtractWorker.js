// Izolirani "worker" proces za pdf-parse (docs/AI.md, quoteExtractionService.js).
//
// pdf-parse@1.1.1 (bundlani, namjerno stariji pdf.js v1.10.100 — odabran da
// se izbjegne native @napi-rs/canvas ovisnost) drži interno GLOBALNO stanje
// (module-scope PDFJS objekt) koje NIJE sigurno za obradu više PDF-ova u
// istom Node procesu jedan za drugim: stvarnim testom (dva sintetička PDF-a
// priložena u istoj poruci, docs/AI.md multi-ponuda scenarij) potvrđeno je da
// se sadržaj DRUGOG dokumenta zna tiho zamijeniti sadržajem PRVOG (ili nekog
// ranije uspješno parsiranog dokumenta) unutar istog procesa — ni kopiranje
// buffera ni čišćenje require-cachea to nije popravilo, dok je pokretanje
// svakog parsiranja u ZASEBNOM procesu dosljedno dalo ispravan rezultat.
// Zato se svaki poziv extractQuoteText pokreće ovdje, u vlastitom,
// kratkotrajnom child procesu, bez ikakvog dijeljenog stanja s drugima.
//
// Dodatno, stvarnim testom potvrđeno: za PDF-ove čiji xref zahtijeva pdf.js-ov
// "recovery" put parsiranja (npr. reportlab-generirani PDF-ovi korišteni u
// test_scenarios), PRVIH nekoliko poziva pdfParse() u SVJEŽE pokrenutom
// procesu dosljedno baca "bad XRef entry" (izgleda da recovery put lijeno
// inicijalizira neko interno stanje asinkrono, pa prvi pokušaj(i) koji ga
// pokrenu ne stignu na vrijeme) — ali identičan buffer u ISTOM procesu nakon
// par pokušaja onda dosljedno uspijeva. Zato se ovdje radi ograničen broj
// pokušaja NAD ISTIM bufferom prije nego se preda kao stvarna greška.
//
// Ulaz: sirovi PDF bajtovi na stdin. Izlaz: JSON na stdout,
// { ok: true, text } ili { ok: false, error }.

const pdfParse = require('pdf-parse');

const MAX_PARSE_ATTEMPTS = 6;

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks)));
    process.stdin.on('error', reject);
  });
}

async function parseWithRetry(buffer) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_PARSE_ATTEMPTS; attempt++) {
    try {
      return await pdfParse(buffer);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

(async () => {
  try {
    const buffer = await readStdin();
    const data = await parseWithRetry(buffer);
    process.stdout.write(JSON.stringify({ ok: true, text: data.text || '' }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error.message }));
  }
})();
