/**
 * Unit testovi: GET/PUT /api/assistant/settings.
 *
 * MySQL pool i authMiddleware su mockani — testira se ruta samostalno
 * (validacija ulaza, admin-only zaštita). Chat asistenta je uklonjen iz
 * sustava, pa su i njegovi testovi otišli s njim; jedini put kojim model
 * danas dira podatke pokriven je testovima rute /api/requests/:id/ai-items.
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
app.use('/api/assistant', require('../src/routes/assistantRoutes'));

const ADMIN = { id_user: 1, role_name: 'Administrator' };
const EMPLOYEE = { id_user: 2, role_name: 'Zaposlenik' };

const { OLLAMA_MODELS } = require('../src/services/llm/ollamaModels');

// getSetting čita jedan red preko db.query -> [rows, fields]
const settingRow = (value) => [[{ setting_value: value }], []];

beforeEach(() => {
  jest.clearAllMocks();
  global.__testUser__ = EMPLOYEE;
});

describe('GET /api/assistant/settings — samo administrator', () => {
  test('zaposlenik dobiva 403', async () => {
    global.__testUser__ = EMPLOYEE;
    const res = await supertest(app).get('/api/assistant/settings');
    expect(res.status).toBe(403);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('administrator dobiva trenutni toggle i katalog lokalnih modela', async () => {
    global.__testUser__ = ADMIN;
    db.query
      .mockResolvedValueOnce(settingRow('gemini'))
      .mockResolvedValueOnce(settingRow('gemini-2.5-flash'))
      .mockResolvedValueOnce(settingRow('gemma4:e2b'));

    const res = await supertest(app).get('/api/assistant/settings');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      provider: 'gemini',
      gemini_model: 'gemini-2.5-flash',
      ollama_model: 'gemma4:e2b',
      // Katalog ide iz ollamaModels.js — UI ga ne smije držati zasebno.
      ollama_models: OLLAMA_MODELS,
    });
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

  test('prazno tijelo (ni provider ni gemini_model ni ollama_model) vraća 400', async () => {
    global.__testUser__ = ADMIN;
    const res = await supertest(app).put('/api/assistant/settings').send({});
    expect(res.status).toBe(400);
  });

  // Lokalni model se, za razliku od Gemini modela, validira protiv kataloga:
  // supportsTools zastavica postoji samo za modele iz njega, a bez nje bi
  // orchestrator poslao alate modelu koji ih ne podržava (Ollamin HTTP 400).
  test('Ollama model izvan kataloga vraća 400 i ne dira bazu', async () => {
    global.__testUser__ = ADMIN;
    const res = await supertest(app).put('/api/assistant/settings').send({ ollama_model: 'mistral:7b' });
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('uspješna izmjena providera upisuje u bazu i vraća ažurirane vrijednosti', async () => {
    global.__testUser__ = ADMIN;
    db.query
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // setSetting: INSERT ... ON DUPLICATE KEY UPDATE
      .mockResolvedValueOnce(settingRow('gemini'))        // getSetting ai_provider
      .mockResolvedValueOnce(settingRow('gemini-2.5-flash')) // getSetting gemini_model
      .mockResolvedValueOnce(settingRow('gemma4:e2b'));      // getSetting ollama_model

    const res = await supertest(app).put('/api/assistant/settings').send({ provider: 'gemini' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: 'AI postavke ažurirane.',
      provider: 'gemini',
      gemini_model: 'gemini-2.5-flash',
      ollama_model: 'gemma4:e2b',
    });
  });

  test('uspješna izmjena lokalnog modela na model iz kataloga', async () => {
    global.__testUser__ = ADMIN;
    const target = OLLAMA_MODELS[0].value;
    db.query
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // setSetting ai_provider
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]) // setSetting ollama_model
      .mockResolvedValueOnce(settingRow('ollama'))
      .mockResolvedValueOnce(settingRow('gemini-2.5-flash'))
      .mockResolvedValueOnce(settingRow(target));

    const res = await supertest(app)
      .put('/api/assistant/settings')
      .send({ provider: 'ollama', ollama_model: target });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ provider: 'ollama', ollama_model: target });
  });
});

