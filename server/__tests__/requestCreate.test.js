/**
 * Unit testovi: POST /api/requests — validacija odjela/kategorije naspram
 * poslovne godine i race condition kod generiranja broja zahtjeva.
 *
 * Nadopunjuje requestNumber.test.js (koji pokriva sekvencu broja i zatvorenu
 * godinu) prije refaktora logike u requestService.js — baseline za ponašanje
 * koje refaktor ne smije promijeniti.
 *
 * MySQL pool i authMiddleware su mockani kako bi testovi bili izolirani od baze.
 */

jest.mock('../src/config/db');
jest.mock('../src/middleware/authMiddleware', () => (req, res, next) => {
  req.user = global.__testUser__ || { id_user: 1, role_name: 'Zaposlenik' };
  next();
});

const supertest = require('supertest');
const express  = require('express');
const db       = require('../src/config/db');

const app = express();
app.use(express.json());
app.use('/api/requests', require('../src/routes/requestRoutes'));

const makeConn = () => ({
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit:           jest.fn().mockResolvedValue(undefined),
  rollback:         jest.fn().mockResolvedValue(undefined),
  release:          jest.fn(),
  query:            jest.fn(),
});

const VALID_BODY = {
  fk_fiscal_year: 1,
  fk_department:  1,
  justification:  'Test nabava za diplomski rad.',
  items: [{ fk_item_category: 1, item_name: 'Laptop', quantity: 1 }],
};

beforeEach(() => jest.clearAllMocks());

describe('POST /api/requests — odjel/kategorija naspram poslovne godine', () => {

  test('odjel iz druge poslovne godine vraća 400', async () => {
    const conn = makeConn();
    conn.query
      .mockResolvedValueOnce([[{ year: 2026, is_closed: 0 }], []]) // FiscalYear
      .mockResolvedValueOnce([[], []]);                            // Department — nema poklapanja
    db.getConnection.mockResolvedValue(conn);

    const res = await supertest(app).post('/api/requests').send(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Odabrani odjel ne pripada odabranoj poslovnoj godini.');
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

  test('kategorija artikla iz druge poslovne godine vraća 400', async () => {
    const conn = makeConn();
    conn.query
      .mockResolvedValueOnce([[{ year: 2026, is_closed: 0 }], []]) // FiscalYear
      .mockResolvedValueOnce([[{ id_department: 1 }], []])         // Department — ok
      .mockResolvedValueOnce([[], []]);                            // ItemCategory — nema poklapanja
    db.getConnection.mockResolvedValue(conn);

    const res = await supertest(app).post('/api/requests').send(VALID_BODY);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Jedna ili više kategorija artikala ne pripada odabranoj poslovnoj godini.');
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

});

describe('POST /api/requests — race condition na generiranju broja', () => {

  test('ER_DUP_ENTRY pri insertu vraća 409 i rollback', async () => {
    const conn = makeConn();
    const dupError = Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
    conn.query
      .mockResolvedValueOnce([[{ year: 2026, is_closed: 0 }], []]) // FiscalYear
      .mockResolvedValueOnce([[{ id_department: 1 }], []])         // Department
      .mockResolvedValueOnce([[{ id_item_category: 1 }], []])      // ItemCategory
      .mockResolvedValueOnce([[], []])                             // SELECT ... FOR UPDATE — nema prijašnjih
      .mockRejectedValueOnce(dupError);                            // INSERT PurchaseRequest — konflikt
    db.getConnection.mockResolvedValue(conn);

    const res = await supertest(app).post('/api/requests').send(VALID_BODY);

    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Konflikt pri generiranju broja zahtjeva. Pokušajte ponovno.');
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
  });

});

describe('POST /api/requests — duljina naziva stavke', () => {

  // Regresija za eval scenarij 6 (2026-09-02): model je kao item_name poslao
  // cijeli opis artikla iz ponude (232-251 znakova). Stupac je varchar(200),
  // pa je INSERT padao s bazičnom greškom bez naznake što je krivo, a model
  // je isti poziv slijepo ponovio četiri puta. Provjera mora doći PRIJE baze
  // i reći što napraviti, jer je poruku čita LLM koji se sam ispravlja.
  test('naziv duži od 200 znakova vraća 400 prije dodira s bazom', async () => {
    const conn = makeConn();
    db.getConnection.mockResolvedValue(conn);

    const res = await supertest(app).post('/api/requests').send({
      ...VALID_BODY,
      items: [{ fk_item_category: 1, item_name: 'A'.repeat(201), quantity: 1 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/naziv je predug \(201 znakova, najviše 200\)/);
    expect(conn.query).not.toHaveBeenCalled();
  });

  test('naziv od točno 200 znakova prolazi validaciju', async () => {
    const conn = makeConn();
    conn.query
      .mockResolvedValueOnce([[{ year: 2026, is_closed: 0 }], []])
      .mockResolvedValueOnce([[{ id_department: 1 }], []])
      .mockResolvedValueOnce([[{ id_item_category: 1 }], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([{ insertId: 1 }, []])
      .mockResolvedValueOnce([{ insertId: 1 }, []]);
    db.getConnection.mockResolvedValue(conn);

    const res = await supertest(app).post('/api/requests').send({
      ...VALID_BODY,
      items: [{ fk_item_category: 1, item_name: 'A'.repeat(200), quantity: 1 }],
    });

    expect(res.status).not.toBe(400);
  });

});
