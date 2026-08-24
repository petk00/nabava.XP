/**
 * Unit testovi: POST /api/assistant/chat i GET/PUT /api/assistant/settings.
 *
 * MySQL pool, authMiddleware i assistantOrchestrator su mockani — testira se
 * ruta samostalno (validacija ulaza, mapiranje rezultata/greške orkestratora
 * u HTTP odgovor, admin-only zaštita settings endpointa). Orkestracijska
 * petlja i tool-calling logika testirani su odvojeno u
 * assistantOrchestrator.test.js.
 */

jest.mock('../src/config/db');
jest.mock('../src/middleware/authMiddleware', () => (req, res, next) => {
  req.user = global.__testUser__ || { id_user: 1, role_name: 'Zaposlenik' };
  next();
});
jest.mock('../src/services/assistantOrchestrator', () => ({ runAssistantChat: jest.fn() }));

const supertest = require('supertest');
const express  = require('express');
const db       = require('../src/config/db');
const { runAssistantChat } = require('../src/services/assistantOrchestrator');

const app = express();
app.use(express.json());
app.use('/api/assistant', require('../src/routes/assistantRoutes'));

const ADMIN = { id_user: 1, role_name: 'Administrator' };
const EMPLOYEE = { id_user: 2, role_name: 'Zaposlenik' };

// getSetting čita jedan red preko db.query -> [rows, fields]
const settingRow = (value) => [[{ setting_value: value }], []];

beforeEach(() => {
  jest.clearAllMocks();
  global.__testUser__ = EMPLOYEE;
});

describe('POST /api/assistant/chat — validacija', () => {
  test('messages mora biti neprazan niz', async () => {
    const res = await supertest(app).post('/api/assistant/chat').send({});
    expect(res.status).toBe(400);
    expect(runAssistantChat).not.toHaveBeenCalled();
  });

  test('svaka poruka mora imati dozvoljen role i neprazan content', async () => {
    const res = await supertest(app)
      .post('/api/assistant/chat')
      .send({ messages: [{ role: 'bot', content: 'test' }] });
    expect(res.status).toBe(400);
    expect(runAssistantChat).not.toHaveBeenCalled();
  });

  test('prazan content se odbija', async () => {
    const res = await supertest(app)
      .post('/api/assistant/chat')
      .send({ messages: [{ role: 'user', content: '  ' }] });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/assistant/chat — poziva orkestrator u auth kontekstu korisnika', () => {
  test('prosljeđuje messages i userId iz req.user (ne iz tijela zahtjeva)', async () => {
    global.__testUser__ = { id_user: 2, role_name: 'Zaposlenik' };
    runAssistantChat.mockResolvedValue({ text: 'Odgovor.', created_request: null });

    const res = await supertest(app)
      .post('/api/assistant/chat')
      .send({ messages: [{ role: 'user', content: 'Bok' }], userId: 999 }); // pokušaj lažiranja

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: 'Odgovor.', created_request: null });
    expect(runAssistantChat).toHaveBeenCalledWith({
      messages: [{ role: 'user', content: 'Bok' }],
      userId: 2,
    });
  });

  test('vraća created_request kad ga orkestrator postavi (agent stvarno kreirao zahtjev)', async () => {
    runAssistantChat.mockResolvedValue({
      text: 'Zahtjev NAB-2026-0042 je kreiran.',
      created_request: { id_purchase_request: 42, request_number: 'NAB-2026-0042', fk_request_status: 1 },
    });

    const res = await supertest(app)
      .post('/api/assistant/chat')
      .send({ messages: [{ role: 'user', content: 'test' }] });

    expect(res.status).toBe(200);
    expect(res.body.created_request).toEqual({
      id_purchase_request: 42, request_number: 'NAB-2026-0042', fk_request_status: 1,
    });
  });

  test('greška orkestratora (npr. provider nedostupan) vraća 502 s generičkom porukom', async () => {
    runAssistantChat.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:11434'));

    const res = await supertest(app)
      .post('/api/assistant/chat')
      .send({ messages: [{ role: 'user', content: 'Bok' }] });

    expect(res.status).toBe(502);
    expect(res.body.message).not.toMatch(/ECONNREFUSED/);
  });
});

describe('GET /api/assistant/settings — samo administrator', () => {
  test('zaposlenik dobiva 403', async () => {
    global.__testUser__ = EMPLOYEE;
    const res = await supertest(app).get('/api/assistant/settings');
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('administrator dobiva trenutni toggle', async () => {
    global.__testUser__ = ADMIN;
    db.query
      .mockResolvedValueOnce(settingRow('gemini'))
      .mockResolvedValueOnce(settingRow('gemini-2.5-flash'));

    const res = await supertest(app).get('/api/assistant/settings');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ provider: 'gemini', gemini_model: 'gemini-2.5-flash' });
  });
});

describe('PUT /api/assistant/settings — samo administrator', () => {
  test('zaposlenik dobiva 403', async () => {
    global.__testUser__ = EMPLOYEE;
    const res = await supertest(app).put('/api/assistant/settings').send({ provider: 'gemini' });
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('nepoznat provider vraća 400', async () => {
    global.__testUser__ = ADMIN;
    const res = await supertest(app).put('/api/assistant/settings').send({ provider: 'chatgpt' });
    expect(res.status).toBe(400);
  });

  test('prazno tijelo (ni provider ni gemini_model) vraća 400', async () => {
    global.__testUser__ = ADMIN;
    const res = await supertest(app).put('/api/assistant/settings').send({});
    expect(res.status).toBe(400);
  });

  test('uspješna izmjena providera upisuje u bazu i vraća ažurirane vrijednosti', async () => {
    global.__testUser__ = ADMIN;
    db.query
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // setSetting: INSERT ... ON DUPLICATE KEY UPDATE
      .mockResolvedValueOnce(settingRow('gemini'))        // getSetting ai_provider
      .mockResolvedValueOnce(settingRow('gemini-2.5-flash')); // getSetting gemini_model

    const res = await supertest(app).put('/api/assistant/settings').send({ provider: 'gemini' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: 'AI postavke ažurirane.',
      provider: 'gemini',
      gemini_model: 'gemini-2.5-flash',
    });
  });
});
