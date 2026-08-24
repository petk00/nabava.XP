// Ekstrakcija teksta iz priložene ponude (PDF) za AI asistenta (docs/AI.md).
// Radi se JEDNOM, server-side, prije poziva bilo kojeg LlmProvider-a — isti
// izvučeni tekst ide oba providera (Ollama/Gemini), bez oslanjanja na
// nativnu vision/multimodalnu sposobnost pojedinog modela. To je namjerno,
// radi fer usporedbe providera pod istim ulazom (diplomski rad).
//
// Sve tri test ponude u test_scenarios/ (mikrotron_S/M.pdf, "Ponuda_[Broj
// ponuda].pdf") imaju stvaran tekstualni sloj — pdf-parse ga izvuče izravno,
// bez potrebe za OCR-om.

const pdfParse = require('pdf-parse');
const { detectMimeTypeFromBuffer } = require('./fileTypeService');

// Guard protiv prevelikog teksta u system promptu ako netko priloži
// neuobičajeno dugačak PDF — stvarne ponude u test_scenarios/ imaju <2500 znakova.
const MAX_QUOTE_TEXT_LEN = 8000;

/** Očekivana greška — ruta je mapira na 400 bez logiranja stacka. */
class QuoteExtractionError extends Error {}

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

  let data;
  try {
    data = await pdfParse(buffer);
  } catch {
    throw new QuoteExtractionError('Nije moguće pročitati sadržaj PDF datoteke.');
  }

  const text = (data.text || '').trim();
  if (!text) {
    throw new QuoteExtractionError(
      'PDF ne sadrži čitljiv tekst — moguće je da je skenirana slika bez tekstualnog sloja.'
    );
  }

  return text.slice(0, MAX_QUOTE_TEXT_LEN);
}

module.exports = { extractQuoteText, QuoteExtractionError };
