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

// Zadani pagerender u pdf-parse spaja SVE elemente s istom Y koordinatom bez
// ijednog razmaka, pa se ćelije tablice slijepe: količina "12" i cijena
// "145,00" postanu "12145,00". Stvarnim eval runovima (2026-09-01, gemma4:e4b
// i e2b) potvrđeno da je to glavni uzrok krivih količina — oba modela čitaju
// iste brojke točno kad su u rečenici, a promašuju ih kad dolaze iz tablice.
//
// Svaki element nosi i X koordinatu (transform[4]) i širinu, pa se granica
// stupca prepoznaje po vodoravnom razmaku. Prag je namjerno konzervativan:
// premalen bi razbijao riječi unutar iste ćelije, prevelik bi propuštao uske
// stupce.
const COLUMN_GAP_MIN = 4;
const COLUMN_SEPARATOR = ' | ';
const ROW_TOLERANCE = 1;

function renderPageWithColumns(pageData) {
  return pageData
    .getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false })
    .then((textContent) => {
      let text = '';
      let lastY = null;
      let lastEndX = null;

      for (const item of textContent.items) {
        const x = item.transform[4];
        const y = item.transform[5];

        if (lastY !== null && Math.abs(y - lastY) > ROW_TOLERANCE) {
          text += '\n';
          lastEndX = null;
        } else if (lastEndX !== null && x - lastEndX > COLUMN_GAP_MIN) {
          text += COLUMN_SEPARATOR;
        }

        text += item.str;
        lastEndX = x + (item.width || 0);
        lastY = y;
      }
      return attachNumericCellsToRow(text);
    });
}

// Kad se naziv artikla prelomi kroz više redaka, brojčani stupci (količina,
// cijena, ukupno, PDV) ostanu u ZASEBNOM retku ispod cijelog opisa, odvojeni
// od artikla na koji se odnose. Stvarno opaženo na scenariju 6: opis počinje
// s "Procesor AMD Ryzen 9 9950X3D (AM5) — 16 jezgri...", pa je model upisao
// količinu 16 (broj koji stoji uz naziv) umjesto 2 iz retka "2 | 699.00 |
// 1,398.00 | 25.00 %" šest redaka niže.
//
// Zato se redak koji se sastoji ISKLJUČIVO od brojčanih ćelija pripaja
// prethodnom retku. Prag je namjerno uzak — traži se barem jedan separator
// stupca i nijedno slovo — da se ne bi lijepili redovi teksta koji slučajno
// počinju brojem (npr. "2 kom u kutiji").
const NUMERIC_ROW = /^[\d\s.,%€$-]+(\s\|\s[\d\s.,%€$-]+)+$/;

function attachNumericCellsToRow(text) {
  const lines = text.split('\n');
  const merged = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const previous = merged.length > 0 ? merged[merged.length - 1].trim() : '';
    if (trimmed && previous && NUMERIC_ROW.test(trimmed) && !NUMERIC_ROW.test(previous)) {
      merged[merged.length - 1] = `${merged[merged.length - 1].trimEnd()}${COLUMN_SEPARATOR}${trimmed}`;
    } else {
      merged.push(line);
    }
  }
  return merged.join('\n');
}

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
      return await pdfParse(buffer, { pagerender: renderPageWithColumns });
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
