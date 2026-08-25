/**
 * Unit testovi: quoteExtractionService.extractQuoteText (docs/AI.md).
 *
 * Koristi stvarnu ponudu iz test_scenarios/ (kopirana u __tests__/fixtures/
 * da test suite ostane samostalan i neovisan o putanjama izvan repozitorija).
 * pdf-parse NIJE mockan — cilj je potvrditi da stvarna ekstrakcija radi na
 * stvarnom dokumentu. fileTypeService JEST mockan (isti razlog kao u
 * api.integration.test.js): file-type je ESM-only, a Jest bez
 * --experimental-vm-modules ne podržava native dynamic import.
 */

jest.mock('../src/services/fileTypeService', () => ({
  detectMimeTypeFromBuffer: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const { detectMimeTypeFromBuffer } = require('../src/services/fileTypeService');
const { extractQuoteText, QuoteExtractionError } = require('../src/services/quoteExtractionService');

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'mikrotron_M.pdf');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('extractQuoteText — stvarna ponuda (mikrotron_M.pdf)', () => {
  test('izvlači stvaran tekst s dobavljačem, stavkama, količinama i ukupnim iznosom', async () => {
    detectMimeTypeFromBuffer.mockResolvedValue('application/pdf');
    const buffer = fs.readFileSync(FIXTURE_PATH);

    const text = await extractQuoteText(buffer);

    expect(typeof text).toBe('string');
    expect(text).toContain('Mikrotron d.o.o.');
    expect(text).toContain('Grove EMG Detector kit');
    expect(text).toContain('Jednokratne EMG/ECG/EKG elektrode');
    expect(text).toMatch(/Ukupno za uplatu/);
    expect(text).toMatch(/93,75/); // stvaran ukupan iznos na ovoj ponudi
  });
});

describe('extractQuoteText — VIŠE poziva u istom procesu (regresija: sadržaj se ne smije miješati)', () => {
  // Stvarnim testom (docs/AI.md, multi-ponuda scenarij) otkriveno: pdf-parse@1.1.1
  // (bundlani pdf.js v1.10.100) drži interno GLOBALNO stanje koje kod parsiranja
  // dva dokumenta jedan za drugim u ISTOM Node procesu zna vratiti sadržaj
  // PRETHODNOG dokumenta umjesto stvarno zatraženog. Zato extractQuoteText svaki
  // poziv izolira u zaseban child proces (pdfExtractWorker.js) — ovaj test to
  // brani od regresije pozivajući extractQuoteText VIŠE PUTA zaredom, s pravim
  // pdf-parseom (nije mockan), i provjerava da svaki poziv vrati SVOJ sadržaj.
  test('dvije strukturno vrlo slične ponude (isti generator, iste stavke, drugi dobavljač) ekstrahiraju se ISPRAVNO, bez miješanja', async () => {
    detectMimeTypeFromBuffer.mockResolvedValue('application/pdf');
    const bufferA = fs.readFileSync(path.join(__dirname, 'fixtures', 'quote_supplier_A.pdf'));
    const bufferB = fs.readFileSync(path.join(__dirname, 'fixtures', 'quote_supplier_B.pdf'));

    const textA = await extractQuoteText(bufferA);
    const textB = await extractQuoteText(bufferB);

    expect(textA).toContain('Dobavljac A d.o.o.');
    expect(textA).toContain('800,00 EUR');
    expect(textA).not.toContain('Dobavljac B');

    expect(textB).toContain('Dobavljac B d.o.o.');
    expect(textB).toContain('750,00 EUR');
    expect(textB).not.toContain('Dobavljac A');
  });
});

describe('extractQuoteText — validacija ulaza', () => {
  test('odbija datoteku koja nije stvarno PDF prema magic bytes', async () => {
    detectMimeTypeFromBuffer.mockResolvedValue('text/plain');
    const notAPdf = Buffer.from('ovo je obična tekstualna datoteka, ne PDF');

    await expect(extractQuoteText(notAPdf)).rejects.toThrow(QuoteExtractionError);
    await expect(extractQuoteText(notAPdf)).rejects.toThrow(/nije valjan PDF/);
  });

  test('odbija kad magic-bytes detekcija ne prepozna tip (null)', async () => {
    detectMimeTypeFromBuffer.mockResolvedValue(null);

    await expect(extractQuoteText(Buffer.from('???'))).rejects.toThrow(/nije valjan PDF/);
  });

  test('deklarirani PDF magic bytes, ali pdf-parse ne uspije parsirati sadržaj', async () => {
    detectMimeTypeFromBuffer.mockResolvedValue('application/pdf');
    // Prolazi magic-bytes detekciju (mockana), ali sadržaj nije valjana PDF
    // struktura — pdf-parse mora baciti grešku pri parsiranju.
    const corruptPdf = Buffer.from('ovo nije valjana PDF struktura, samo smeće');

    await expect(extractQuoteText(corruptPdf)).rejects.toThrow(QuoteExtractionError);
    await expect(extractQuoteText(corruptPdf)).rejects.toThrow(/Nije moguće pročitati/);
  });
});
