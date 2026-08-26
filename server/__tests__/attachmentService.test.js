/**
 * Unit testovi: attachmentService.saveAttachmentBuffer / cleanupAttachmentFile
 * (docs/AI.md — formalni prilog uz zahtjev kreiran preko AI asistenta).
 *
 * Namjerno NE mocka fs — cilj je potvrditi da datoteka STVARNO završi na
 * disku, čitljiva, na očekivanoj putanji (isti spremišni obrazac kao ručni
 * upload, requestAttachmentRoutes.js). UPLOADS_DIR je preusmjeren na
 * izolirani temp direktorij da test ne dira pravi uploads/ folder.
 * DB queryable je jednostavan fake (nije prava konekcija).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

let TEST_UPLOADS_DIR;
let saveAttachmentBuffer;
let cleanupAttachmentFile;
let UPLOADS_DIR;

beforeAll(() => {
  TEST_UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'nabava-attachment-test-'));
  process.env.UPLOADS_DIR = TEST_UPLOADS_DIR;
  jest.resetModules();
  ({ saveAttachmentBuffer, cleanupAttachmentFile, UPLOADS_DIR } = require('../src/services/attachmentService'));
});

afterAll(() => {
  fs.rmSync(TEST_UPLOADS_DIR, { recursive: true, force: true });
  delete process.env.UPLOADS_DIR;
});

const fakeQueryable = () => ({ query: jest.fn().mockResolvedValue([{ insertId: 42 }, []]) });

describe('attachmentService.saveAttachmentBuffer', () => {
  test('piše buffer na disk pod uploads/attachments/<requestId>/ i datoteka je stvarno čitljiva', async () => {
    const queryable = fakeQueryable();
    const buffer = Buffer.from('%PDF-1.4 sadržaj stvarne ponude');

    const result = await saveAttachmentBuffer(queryable, {
      requestId: 77,
      uploadedByUserId: 2,
      buffer,
      fileName: 'ponuda.pdf',
      mimeType: 'application/pdf',
      documentType: 'Ponuda',
    });

    expect(fs.existsSync(result.file_path)).toBe(true);
    expect(fs.readFileSync(result.file_path)).toEqual(buffer);
    expect(result.file_path.startsWith(path.join(UPLOADS_DIR, 'attachments', '77'))).toBe(true);
  });

  test('insertira Attachment red s ispravnim stupcima i RELATIVNOM putanjom (od UPLOADS_DIR)', async () => {
    const queryable = fakeQueryable();
    const buffer = Buffer.from('fake png bytes');

    const result = await saveAttachmentBuffer(queryable, {
      requestId: 88,
      uploadedByUserId: 5,
      buffer,
      fileName: 'ponuda-b.png',
      mimeType: 'image/png',
      documentType: 'Ponuda',
    });

    expect(queryable.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO Attachment'),
      expect.arrayContaining([88, 5, 'ponuda-b.png', expect.any(String), 'image/png', 'Ponuda'])
    );
    const [, params] = queryable.query.mock.calls[0];
    const relativePath = params[3];
    expect(path.isAbsolute(relativePath)).toBe(false);
    expect(fs.existsSync(path.join(UPLOADS_DIR, relativePath))).toBe(true);
    expect(result.id_attachment).toBe(42);
  });

  test('imena datoteka se sanitiziraju (bez razmaka/specijalnih znakova) na disku', async () => {
    const queryable = fakeQueryable();
    const result = await saveAttachmentBuffer(queryable, {
      requestId: 99,
      uploadedByUserId: 2,
      buffer: Buffer.from('x'),
      fileName: 'ponuda čudno ime (1).pdf',
      mimeType: 'application/pdf',
      documentType: 'Ponuda',
    });

    expect(path.basename(result.file_path)).not.toMatch(/[čć ()]/);
  });
});

describe('attachmentService.cleanupAttachmentFile', () => {
  test('briše postojeću datoteku', async () => {
    const queryable = fakeQueryable();
    const result = await saveAttachmentBuffer(queryable, {
      requestId: 100,
      uploadedByUserId: 2,
      buffer: Buffer.from('x'),
      fileName: 'za-brisanje.pdf',
      mimeType: 'application/pdf',
      documentType: 'Ponuda',
    });

    expect(fs.existsSync(result.file_path)).toBe(true);
    cleanupAttachmentFile(result.file_path);
    expect(fs.existsSync(result.file_path)).toBe(false);
  });

  test('ne baca grešku za nepostojeću/undefined putanju', () => {
    expect(() => cleanupAttachmentFile(undefined)).not.toThrow();
    expect(() => cleanupAttachmentFile('/ne/postoji/nikad.pdf')).not.toThrow();
  });
});
