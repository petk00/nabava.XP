// Ekstrakcija teksta iz priložene ponude (PDF) za AI asistenta (docs/AI.md).
// Radi se JEDNOM, server-side, prije poziva bilo kojeg LlmProvider-a — isti
// izvučeni tekst ide oba providera (Ollama/Gemini), bez oslanjanja na
// nativnu vision/multimodalnu sposobnost pojedinog modela. To je namjerno,
// radi fer usporedbe providera pod istim ulazom (diplomski rad).
//
// Sve tri test ponude u test_scenarios/ (mikrotron_S/M.pdf, "Ponuda_[Broj
// ponuda].pdf") imaju stvaran tekstualni sloj — pdf-parse ga izvuče izravno,
// bez potrebe za OCR-om.
//
// pdf-parse@1.1.1 se namjerno pokreće u ZASEBNOM child procesu po datoteci
// (pdfExtractWorker.js), ne izravno u ovom procesu — potvrđeno stvarnim
// testom (dvije priložene ponude u istoj poruci, multi-ponuda scenarij) da
// pdf-parse drži global-scope stanje koje kod dva uzastopna parsiranja u
// ISTOM procesu zna vratiti sadržaj PRETHODNOG dokumenta umjesto stvarno
// zatraženog — ni kopiranje buffera ni čišćenje require-cachea to ne
// popravlja, dok potpuna procesna izolacija dosljedno daje ispravan rezultat.

const path = require('path');
const { execFile } = require('child_process');
const { detectMimeTypeFromBuffer } = require('./fileTypeService');

// Guard protiv prevelikog teksta u system promptu ako netko priloži
// neuobičajeno dugačak PDF — stvarne ponude u test_scenarios/ imaju <2500 znakova.
const MAX_QUOTE_TEXT_LEN = 8000;

const WORKER_PATH = path.join(__dirname, 'pdfExtractWorker.js');

/** Očekivana greška — ruta je mapira na 400 bez logiranja stacka. */
class QuoteExtractionError extends Error {}

/** Pokreće pdfExtractWorker.js u zasebnom procesu, šalje buffer na stdin. */
function runExtractWorker(buffer) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      process.execPath,
      [WORKER_PATH],
      { maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (parseError) {
          reject(parseError);
        }
      }
    );
    child.stdin.on('error', () => {}); // EPIPE ako worker padne prije čitanja stdina
    child.stdin.end(buffer);
  });
}

/**
 * @param {Buffer} buffer sirovi sadržaj priložene datoteke
 * @returns {Promise<string>} izvučeni tekst ponude (obrezan na MAX_QUOTE_TEXT_LEN)
 * @throws {QuoteExtractionError} ako datoteka nije stvarno PDF (magic bytes) ili nema čitljiv tekst
 */
async function extractQuoteText(buffer) {
  const mime = await detectMimeTypeFromBuffer(buffer);
  if (mime !== 'application/pdf') {
    throw new QuoteExtractionError('Priložena datoteka nije valjan PDF.');
  }

  let result;
  try {
    result = await runExtractWorker(buffer);
  } catch {
    throw new QuoteExtractionError('Nije moguće pročitati sadržaj PDF datoteke.');
  }

  if (!result.ok) {
    throw new QuoteExtractionError('Nije moguće pročitati sadržaj PDF datoteke.');
  }

  const text = (result.text || '').trim();
  if (!text) {
    throw new QuoteExtractionError(
      'PDF ne sadrži čitljiv tekst — moguće je da je skenirana slika bez tekstualnog sloja.'
    );
  }

  return text.slice(0, MAX_QUOTE_TEXT_LEN);
}

module.exports = { extractQuoteText, QuoteExtractionError };
