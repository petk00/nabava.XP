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
jest.mock('../src/services/quoteExtractionService', () => {
  const actual = jest.requireActual('../src/services/quoteExtractionService');
  return { extractQuoteText: jest.fn(), QuoteExtractionError: actual.QuoteExtractionError };
});
jest.mock('../src/services/fileTypeService', () => ({ detectMimeTypeFromBuffer: jest.fn() }));

const supertest = require('supertest');
const express  = require('express');
const db       = require('../src/config/db');
const { runAssistantChat } = require('../src/services/assistantOrchestrator');
const { extractQuoteText, QuoteExtractionError } = require('../src/services/quoteExtractionService');
const { detectMimeTypeFromBuffer } = require('../src/services/fileTypeService');

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
      attachments: [],
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

  test('prosljeđuje usage (token brojanje) iz orkestratora — za RQ1/RQ2 eval harness', async () => {
    runAssistantChat.mockResolvedValue({
      text: 'Odgovor.',
      created_request: null,
      tool_trace: [],
      usage: { promptTokens: 120, completionTokens: 34 },
    });

    const res = await supertest(app)
      .post('/api/assistant/chat')
      .send({ messages: [{ role: 'user', content: 'test' }] });

    expect(res.status).toBe(200);
    expect(res.body.usage).toEqual({ promptTokens: 120, completionTokens: 34 });
  });

  test('prosljeđuje tool_trace iz orkestratora — klijent ga mora dodati u povijest za idući zahtjev', async () => {
    const trace = [
      { role: 'system', content: '[ai-asistent:priložena-ponuda]\n...' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'p1', name: 'propose_request', arguments: {} }] },
      { role: 'tool', tool_call_id: 'p1', name: 'propose_request', content: '{"ok":true}' },
    ];
    runAssistantChat.mockResolvedValue({ text: 'Sažetak...', created_request: null, tool_trace: trace });

    const res = await supertest(app)
      .post('/api/assistant/chat')
      .send({ messages: [{ role: 'user', content: 'Evo ponude.' }] });

    expect(res.status).toBe(200);
    expect(res.body.tool_trace).toEqual(trace);
  });

  test('prihvaća role:"tool" i assistant-s-tool_calls poruke u messages (echo tool_trace iz prijašnjeg odgovora)', async () => {
    runAssistantChat.mockResolvedValue({ text: 'Odgovor.', created_request: null, tool_trace: [] });

    const res = await supertest(app)
      .post('/api/assistant/chat')
      .send({
        messages: [
          { role: 'user', content: 'Evo ponude.' },
          { role: 'assistant', content: '', tool_calls: [{ id: 'p1', name: 'propose_request', arguments: {} }] },
          { role: 'tool', tool_call_id: 'p1', name: 'propose_request', content: '{"ok":true}' },
          { role: 'user', content: 'Da, potvrđujem.' },
        ],
      });

    expect(res.status).toBe(200);
    expect(runAssistantChat).toHaveBeenCalled();
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

describe('POST /api/assistant/chat — multipart s priloženim PDF-om', () => {
  test('izvučeni tekst prosljeđuje se orkestratoru kao attachments[0]', async () => {
    detectMimeTypeFromBuffer.mockResolvedValue('application/pdf');
    extractQuoteText.mockResolvedValue('Ponuda: 5x Toner za pisač, Ukupno 93,75 EUR');
    runAssistantChat.mockResolvedValue({ text: 'Evo sažetka ponude...', created_request: null });

    const res = await supertest(app)
      .post('/api/assistant/chat')
      .field('messages', JSON.stringify([{ role: 'user', content: 'Evo ponude.' }]))
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'ponuda.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(extractQuoteText).toHaveBeenCalledWith(expect.any(Buffer));
    expect(runAssistantChat).toHaveBeenCalledWith({
      messages: [{ role: 'user', content: 'Evo ponude.' }],
      userId: 2,
      attachments: [{
        filename: 'ponuda.pdf',
        kind: 'pdf',
        text: 'Ponuda: 5x Toner za pisač, Ukupno 93,75 EUR',
        mimeType: 'application/pdf',
        base64: Buffer.from('%PDF-1.4 fake').toString('base64'),
      }],
    });
  });

  test('DVA PDF priloga u istoj poruci (isto polje "file", ponovljeno) obrađuju se OBA, redoslijedom', async () => {
    detectMimeTypeFromBuffer.mockResolvedValue('application/pdf');
    extractQuoteText
      .mockResolvedValueOnce('Dobavljač A: 5x laptop, 800 EUR/kom')
      .mockResolvedValueOnce('Dobavljač B: 5x laptop, 750 EUR/kom');
    runAssistantChat.mockResolvedValue({ text: 'Uočio sam preklapanje...', created_request: null });

    const res = await supertest(app)
      .post('/api/assistant/chat')
      .field('messages', JSON.stringify([{ role: 'user', content: 'Evo dvije ponude za usporedbu.' }]))
      .attach('file', Buffer.from('%PDF-1.4 a'), { filename: 'ponuda-a.pdf', contentType: 'application/pdf' })
      .attach('file', Buffer.from('%PDF-1.4 b'), { filename: 'ponuda-b.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(extractQuoteText).toHaveBeenCalledTimes(2);
    expect(runAssistantChat).toHaveBeenCalledWith({
      messages: [{ role: 'user', content: 'Evo dvije ponude za usporedbu.' }],
      userId: 2,
      attachments: [
        {
          filename: 'ponuda-a.pdf', kind: 'pdf', text: 'Dobavljač A: 5x laptop, 800 EUR/kom',
          mimeType: 'application/pdf', base64: Buffer.from('%PDF-1.4 a').toString('base64'),
        },
        {
          filename: 'ponuda-b.pdf', kind: 'pdf', text: 'Dobavljač B: 5x laptop, 750 EUR/kom',
          mimeType: 'application/pdf', base64: Buffer.from('%PDF-1.4 b').toString('base64'),
        },
      ],
    });
  });

  test('previše priloga (preko MAX_QUOTE_FILES) vraća 413 s jasnom porukom', async () => {
    detectMimeTypeFromBuffer.mockResolvedValue('application/pdf');

    let req = supertest(app)
      .post('/api/assistant/chat')
      .field('messages', JSON.stringify([{ role: 'user', content: 'Evo šest ponuda.' }]));
    for (let i = 0; i < 6; i++) {
      req = req.attach('file', Buffer.from(`%PDF-1.4 ${i}`), { filename: `ponuda-${i}.pdf`, contentType: 'application/pdf' });
    }
    const res = await req;

    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/previše priloga/i);
    expect(runAssistantChat).not.toHaveBeenCalled();
  });

  test('nepoznat JSON u "messages" polju vraća 400', async () => {
    const res = await supertest(app)
      .post('/api/assistant/chat')
      .field('messages', '{ovo nije validan JSON')
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'ponuda.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(extractQuoteText).not.toHaveBeenCalled();
  });

  test('nepoznat tip datoteke (magic bytes ni PDF ni slika) vraća 400 bez pokušaja ekstrakcije', async () => {
    detectMimeTypeFromBuffer.mockResolvedValue('text/plain');

    const res = await supertest(app)
      .post('/api/assistant/chat')
      .field('messages', JSON.stringify([{ role: 'user', content: 'test' }]))
      .attach('file', Buffer.from('not a pdf'), { filename: 'ponuda.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/PDF ili slika/);
    expect(extractQuoteText).not.toHaveBeenCalled();
    expect(runAssistantChat).not.toHaveBeenCalled();
  });

  test('QuoteExtractionError (npr. skenirana slika bez teksta) vraća 400 s porukom servisa', async () => {
    detectMimeTypeFromBuffer.mockResolvedValue('application/pdf');
    extractQuoteText.mockRejectedValue(new QuoteExtractionError('PDF ne sadrži čitljiv tekst.'));

    const res = await supertest(app)
      .post('/api/assistant/chat')
      .field('messages', JSON.stringify([{ role: 'user', content: 'test' }]))
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'ponuda.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('"ponuda.pdf": PDF ne sadrži čitljiv tekst.');
    expect(runAssistantChat).not.toHaveBeenCalled();
  });

  test('neočekivana greška pri ekstrakciji vraća 500 s generičkom porukom', async () => {
    detectMimeTypeFromBuffer.mockResolvedValue('application/pdf');
    extractQuoteText.mockRejectedValue(new Error('nešto se pokvarilo interno'));

    const res = await supertest(app)
      .post('/api/assistant/chat')
      .field('messages', JSON.stringify([{ role: 'user', content: 'test' }]))
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'ponuda.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(500);
    expect(res.body.message).not.toMatch(/pokvarilo/);
  });

  test('prevelika datoteka vraća 413 s jasnom porukom', async () => {
    const oversized = Buffer.alloc(5 * 1024 * 1024 + 1);
    const res = await supertest(app)
      .post('/api/assistant/chat')
      .field('messages', JSON.stringify([{ role: 'user', content: 'test' }]))
      .attach('file', oversized, { filename: 'veliko.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(413);
    expect(res.body.message).toMatch(/prevelika/i);
    expect(extractQuoteText).not.toHaveBeenCalled();
  });
});

describe('POST /api/assistant/chat — multipart sa slikom ponude (vision, bez OCR-a)', () => {
  test('PNG slika se NE šalje kroz extractQuoteText — sirovi base64 ide orkestratoru kao attachments[0]', async () => {
    detectMimeTypeFromBuffer.mockResolvedValue('image/png');
    runAssistantChat.mockResolvedValue({ text: 'Vidim ponudu na slici...', created_request: null });

    const fileBuffer = Buffer.from('fake png bytes');
    const res = await supertest(app)
      .post('/api/assistant/chat')
      .field('messages', JSON.stringify([{ role: 'user', content: 'Evo slike ponude.' }]))
      .attach('file', fileBuffer, { filename: 'ponuda.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(extractQuoteText).not.toHaveBeenCalled();
    expect(runAssistantChat).toHaveBeenCalledWith({
      messages: [{ role: 'user', content: 'Evo slike ponude.' }],
      userId: 2,
      attachments: [{ filename: 'ponuda.png', kind: 'image', mimeType: 'image/png', base64: fileBuffer.toString('base64') }],
    });
  });

  test('JPEG slika prepoznata po magic bytes prihvaća se jednako', async () => {
    detectMimeTypeFromBuffer.mockResolvedValue('image/jpeg');
    runAssistantChat.mockResolvedValue({ text: 'ok', created_request: null });

    const res = await supertest(app)
      .post('/api/assistant/chat')
      .field('messages', JSON.stringify([{ role: 'user', content: 'test' }]))
      .attach('file', Buffer.from('fake jpeg bytes'), { filename: 'ponuda.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    const call = runAssistantChat.mock.calls[0][0];
    expect(call.attachments[0].mimeType).toBe('image/jpeg');
    expect(call.attachments[0].kind).toBe('image');
  });

  test('deklarirani mimetype se ignorira — odlučuju magic bytes (datoteka nazvana .png ali stvarno PDF)', async () => {
    detectMimeTypeFromBuffer.mockResolvedValue('application/pdf');
    extractQuoteText.mockResolvedValue('tekst iz PDF-a');
    runAssistantChat.mockResolvedValue({ text: 'ok', created_request: null });

    const res = await supertest(app)
      .post('/api/assistant/chat')
      .field('messages', JSON.stringify([{ role: 'user', content: 'test' }]))
      .attach('file', Buffer.from('%PDF-1.4 stvarni pdf'), { filename: 'krivo-nazvano.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(extractQuoteText).toHaveBeenCalled();
    const call = runAssistantChat.mock.calls[0][0];
    expect(call.attachments).toEqual([{
      filename: 'krivo-nazvano.png', kind: 'pdf', text: 'tekst iz PDF-a',
      mimeType: 'application/pdf', base64: Buffer.from('%PDF-1.4 stvarni pdf').toString('base64'),
    }]);
  });

  test('PDF + slika u istoj poruci obrađuju se OBA i zadržavaju redoslijed u attachments', async () => {
    detectMimeTypeFromBuffer
      .mockResolvedValueOnce('application/pdf')
      .mockResolvedValueOnce('image/png');
    extractQuoteText.mockResolvedValue('Ponuda A tekst');
    runAssistantChat.mockResolvedValue({ text: 'ok', created_request: null });

    const imgBuffer = Buffer.from('fake png bytes');
    const res = await supertest(app)
      .post('/api/assistant/chat')
      .field('messages', JSON.stringify([{ role: 'user', content: 'Evo ponude u PDF-u i jedne na slici.' }]))
      .attach('file', Buffer.from('%PDF-1.4 a'), { filename: 'ponuda-a.pdf', contentType: 'application/pdf' })
      .attach('file', imgBuffer, { filename: 'ponuda-b.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(runAssistantChat).toHaveBeenCalledWith({
      messages: [{ role: 'user', content: 'Evo ponude u PDF-u i jedne na slici.' }],
      userId: 2,
      attachments: [
        {
          filename: 'ponuda-a.pdf', kind: 'pdf', text: 'Ponuda A tekst',
          mimeType: 'application/pdf', base64: Buffer.from('%PDF-1.4 a').toString('base64'),
        },
        { filename: 'ponuda-b.png', kind: 'image', mimeType: 'image/png', base64: imgBuffer.toString('base64') },
      ],
    });
  });
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
      .mockResolvedValueOnce(settingRow('gemma4:e4b'));

    const res = await supertest(app).get('/api/assistant/settings');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      provider: 'gemini',
      gemini_model: 'gemini-2.5-flash',
      ollama_model: 'gemma4:e4b',
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
      .mockResolvedValueOnce(settingRow('gemma4:e4b'));      // getSetting ollama_model

    const res = await supertest(app).put('/api/assistant/settings').send({ provider: 'gemini' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      message: 'AI postavke ažurirane.',
      provider: 'gemini',
      gemini_model: 'gemini-2.5-flash',
      ollama_model: 'gemma4:e4b',
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
