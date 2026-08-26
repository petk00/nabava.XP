/**
 * Unit testovi: requestService.createRequest — formalni prilog uz zahtjev
 * (docs/AI.md, attachmentService.js integracija).
 *
 * attachmentService je mockan (disk I/O već pokriven attachmentService.test.js
 * na pravom fs-u) — ovdje se testira ISKLJUČIVO WIRING: da createRequest zove
 * saveAttachmentBuffer s ispravnim podacima (novi requestId, userId, "Ponuda"
 * documentType), da tok bez priloga ostaje nepromijenjen, i da se već
 * zapisane datoteke počiste ako spremanje priloga usred petlje padne.
 */

jest.mock('../src/config/db');
jest.mock('../src/services/attachmentService', () => ({
  saveAttachmentBuffer: jest.fn(),
  cleanupAttachmentFile: jest.fn(),
}));

const db = require('../src/config/db');
const { saveAttachmentBuffer, cleanupAttachmentFile } = require('../src/services/attachmentService');
const { createRequest } = require('../src/services/requestService');

const makeConn = () => ({
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
  release: jest.fn(),
  query: jest.fn(),
});

const VALID_INPUT = {
  fk_fiscal_year: 1,
  fk_department: 3,
  justification: 'Nabava na temelju priložene ponude.',
  items: [{ fk_item_category: 7, item_name: 'Toner za pisač', quantity: 5 }],
  userId: 2,
};

/** Redoslijed conn.query poziva do (uključivo) insert stavki, zajednički svim testovima ovdje. */
function mockUpToItemsInsert(conn, newRequestId) {
  conn.query
    .mockResolvedValueOnce([[{ year: 2026, is_closed: 0 }], []]) // FiscalYear
    .mockResolvedValueOnce([[{ id_department: 3 }], []])          // Department
    .mockResolvedValueOnce([[{ id_item_category: 7 }], []])       // ItemCategory
    .mockResolvedValueOnce([[], []])                              // SELECT ... FOR UPDATE (broj zahtjeva)
    .mockResolvedValueOnce([{ insertId: newRequestId }, []])      // INSERT PurchaseRequest
    .mockResolvedValueOnce([{ affectedRows: 1 }, []]);             // INSERT PurchaseRequestItem
}

beforeEach(() => jest.clearAllMocks());

describe('createRequest — bez priloga (tekstualni tok, ne dira postojeće ponašanje)', () => {
  test('saveAttachmentBuffer se NIKAD ne zove kad attachments nije poslan', async () => {
    const conn = makeConn();
    mockUpToItemsInsert(conn, 101);
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }, []]); // INSERT RequestStatusHistory
    db.getConnection.mockResolvedValue(conn);

    await createRequest(VALID_INPUT);

    expect(saveAttachmentBuffer).not.toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
  });
});

describe('createRequest — s prilogom (AI asistent kreirao zahtjev na temelju ponude)', () => {
  test('saveAttachmentBuffer se zove s NOVIM requestId, userId i documentType "Ponuda"', async () => {
    const conn = makeConn();
    mockUpToItemsInsert(conn, 202);
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }, []]); // INSERT RequestStatusHistory
    db.getConnection.mockResolvedValue(conn);
    saveAttachmentBuffer.mockResolvedValue({ id_attachment: 9, file_path: '/tmp/x/202/1-ponuda.pdf' });

    const buffer = Buffer.from('%PDF-1.4 ponuda');
    await createRequest({
      ...VALID_INPUT,
      attachments: [{ buffer, fileName: 'ponuda.pdf', mimeType: 'application/pdf' }],
    });

    expect(saveAttachmentBuffer).toHaveBeenCalledWith(conn, {
      requestId: 202,
      uploadedByUserId: 2,
      buffer,
      fileName: 'ponuda.pdf',
      mimeType: 'application/pdf',
      documentType: 'Ponuda',
    });
    expect(conn.commit).toHaveBeenCalled();
  });

  test('VIŠE priloga (scenarij preklapajućih ponuda) — svaki se sprema zasebno', async () => {
    const conn = makeConn();
    mockUpToItemsInsert(conn, 303);
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    db.getConnection.mockResolvedValue(conn);
    saveAttachmentBuffer.mockResolvedValue({ id_attachment: 1, file_path: '/tmp/x' });

    await createRequest({
      ...VALID_INPUT,
      attachments: [
        { buffer: Buffer.from('a'), fileName: 'ponuda-a.pdf', mimeType: 'application/pdf' },
        { buffer: Buffer.from('b'), fileName: 'ponuda-b.pdf', mimeType: 'application/pdf' },
      ],
    });

    expect(saveAttachmentBuffer).toHaveBeenCalledTimes(2);
    expect(saveAttachmentBuffer.mock.calls[0][1].fileName).toBe('ponuda-a.pdf');
    expect(saveAttachmentBuffer.mock.calls[1][1].fileName).toBe('ponuda-b.pdf');
  });

  test('greška pri spremanju DRUGOG priloga — počisti PRVI (već zapisani) file i rollback cijele transakcije', async () => {
    const conn = makeConn();
    mockUpToItemsInsert(conn, 404);
    db.getConnection.mockResolvedValue(conn);
    saveAttachmentBuffer
      .mockResolvedValueOnce({ id_attachment: 1, file_path: '/tmp/x/404/1-a.pdf' })
      .mockRejectedValueOnce(new Error('disk pun'));

    await expect(createRequest({
      ...VALID_INPUT,
      attachments: [
        { buffer: Buffer.from('a'), fileName: 'ponuda-a.pdf', mimeType: 'application/pdf' },
        { buffer: Buffer.from('b'), fileName: 'ponuda-b.pdf', mimeType: 'application/pdf' },
      ],
    })).rejects.toThrow('disk pun');

    expect(cleanupAttachmentFile).toHaveBeenCalledWith('/tmp/x/404/1-a.pdf');
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });
});
