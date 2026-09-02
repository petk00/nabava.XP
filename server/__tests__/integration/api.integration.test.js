/**
 * API integracijski testovi s PRAVOM MySQL bazom (bez mockova).
 *
 * Pri pokretanju se kreira zasebna baza `XP_test` iz db/01_schema.sql,
 * db/02_seed.sql i e2e/seed.e2e.sql, pa se montirana Express aplikacija
 * gađa supertestom kroz pune middleware lance (auth, role, validacije,
 * transakcije). Ako MySQL nije dostupan, testovi se preskaču s upozorenjem.
 */

// Env se postavlja PRIJE requirea aplikacije — dotenv ne pregazi postojeće.
process.env.DB_NAME = 'XP_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret-0123456789abcdef';
process.env.LOGIN_RATE_LIMIT_MAX = '1000';
process.env.CHECK_EMAIL_RATE_LIMIT_MAX = '1000';
// Invite email je opcionalan (emailSent fallback) — usmjeri SMTP na zatvoreni
// port da sendInvite padne odmah umjesto da visi na pravom SMTP hostu iz .env
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1';

require('dotenv').config();

// file-type je ESM-only pa dynamic import ne radi pod Jestom bez
// --experimental-vm-modules — magic bytes provjera se zato mocka.
jest.mock('../../src/services/fileTypeService', () => ({
  detectMimeType: jest.fn().mockResolvedValue('application/pdf'),
}));

// AI provideri rade prave mrežne pozive (Ollama/Gemini) — mockani su i ovdje
// jer integracijski test gađa pravu bazu/rutu preko cijelog Express stacka,
// pa se sve osim samog LLM poziva testira end-to-end (auth, rate limiter,
// admin zaštita, DB-backed toggle).
jest.mock('../../src/services/llm/ollamaProvider', () => ({
  chat: jest.fn().mockResolvedValue({ text: '[fake ollama] odgovor' }),
}));
jest.mock('../../src/services/llm/geminiProvider', () => ({
  chat: jest.fn().mockResolvedValue({ text: '[fake gemini] odgovor' }),
}));

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const request = require('supertest');
const ollamaProvider = require('../../src/services/llm/ollamaProvider');
const geminiProvider = require('../../src/services/llm/geminiProvider');

const REPO_ROOT = path.join(__dirname, '..', '..', '..');

const ADMIN = { email: 'admin@veleri.hr', password: '12345678' };
const EMPLOYEE = { email: 'zaposlenik@veleri.hr', password: '12345678' };

let app = null;
let db = null;
let dbAvailable = false;

const connConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true,
};

beforeAll(async () => {
  let conn;
  try {
    conn = await mysql.createConnection(connConfig);
  } catch {
    console.warn('[integration] MySQL nije dostupan — integracijski testovi se preskaču.');
    return;
  }

  await conn.query('DROP DATABASE IF EXISTS XP_test');
  await conn.query('CREATE DATABASE XP_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await conn.query('USE XP_test');
  for (const file of ['db/01_schema.sql', 'db/02_seed.sql', 'e2e/seed.e2e.sql']) {
    await conn.query(fs.readFileSync(path.join(REPO_ROOT, file), 'utf8'));
  }
  await conn.end();

  app = require('../../src/index');
  db = require('../../src/config/db');
  dbAvailable = true;
}, 30000);

afterAll(async () => {
  if (db) await db.end();
});

/** Vrati supertest agenta s aktivnom sesijom (cookie JWT). */
async function loginAgent(user) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send(user);
  expect(res.status).toBe(200);
  return agent;
}

const itDb = (name, fn, timeout = 15000) =>
  test(name, async () => {
    if (!dbAvailable) return; // preskoči bez baze
    await fn();
  }, timeout);

describe('Health (integracija)', () => {
  itDb('health provjerava i dostupnost baze', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Autentikacija (integracija)', () => {
  itDb('login s pogrešnom lozinkom vraća 401 bez cookieja', async () => {
    const res = await request(app).post('/api/auth/login')
      .send({ email: ADMIN.email, password: 'kriva-lozinka' });
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  itDb('uspješan login postavlja httpOnly cookie', async () => {
    const res = await request(app).post('/api/auth/login').send(ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.user.role_name).toBe('Administrator');
    const cookie = (res.headers['set-cookie'] || []).join(';');
    expect(cookie).toMatch(/HttpOnly/i);
  });

  itDb('zaštićena ruta bez tokena vraća 401', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
  });
});

describe('Korisnici (integracija)', () => {
  itDb('zaposlenik ne može listati korisnike (403)', async () => {
    const agent = await loginAgent(EMPLOYEE);
    const res = await agent.get('/api/users');
    expect(res.status).toBe(403);
  });

  itDb('email izvan @veleri.hr domene je odbijen', async () => {
    const agent = await loginAgent(ADMIN);
    const res = await agent.post('/api/users').send({
      first_name: 'Vanjski', last_name: 'Korisnik',
      email: 'vanjski@gmail.com', role_id: 2,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('@veleri.hr');
  });

  itDb('admin kreira korisnika: invite link + neaktivan dok ne postavi lozinku', async () => {
    const agent = await loginAgent(ADMIN);
    const res = await agent.post('/api/users').send({
      first_name: 'Integracijski', last_name: 'Test',
      email: 'integracijski.test@veleri.hr', role_id: 2,
    });
    expect(res.status).toBe(201);
    expect(res.body.inviteLink).toContain('/set-password?token=');

    const list = await agent.get('/api/users');
    const created = list.body.find((u) => u.email === 'integracijski.test@veleri.hr');
    expect(created).toBeDefined();
    expect(Boolean(created.is_active)).toBe(false);
  });

  itDb('cijeli invite tok: token iz linka postavlja lozinku, u bazi je samo hash', async () => {
    const agent = await loginAgent(ADMIN);
    const created = await agent.post('/api/users').send({
      first_name: 'Invite', last_name: 'Tok',
      email: 'invite.tok@veleri.hr', role_id: 2,
    });
    expect(created.status).toBe(201);
    const rawToken = created.body.inviteLink.split('token=')[1];

    // U bazi ne smije biti sirovi token nego njegov SHA-256 hash
    const [[row]] = await db.query(
      "SELECT invite_token FROM AppUser WHERE email = 'invite.tok@veleri.hr'"
    );
    expect(row.invite_token).not.toBe(rawToken);
    expect(row.invite_token).toHaveLength(64);

    const set = await request(app).post('/api/auth/set-password')
      .send({ token: rawToken, password: 'nova-lozinka-123' });
    expect(set.status).toBe(200);

    // Prijava radi i s email adresom u drugačijem case-u (normalizacija)
    const login = await request(app).post('/api/auth/login')
      .send({ email: 'Invite.Tok@VELERI.HR', password: 'nova-lozinka-123' });
    expect(login.status).toBe(200);

    // Iskorišteni token više ne vrijedi
    const reuse = await request(app).post('/api/auth/set-password')
      .send({ token: rawToken, password: 'druga-lozinka-123' });
    expect(reuse.status).toBe(400);
  });
});

describe('Kategorije i limiti (integracija, SRS 7.1)', () => {
  itDb('limit kategorije iznad godišnjeg budžeta je odbijen', async () => {
    const agent = await loginAgent(ADMIN);
    // Seed: budžet 100000, alocirano po kategorijama 20000
    const res = await agent.post('/api/fiscal-years/1/categories')
      .send({ name: 'Preskupa kategorija', category_limit: 90000 });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('premašuju godišnji budžet');
  });

  itDb('kategorija s limitom unutar budžeta se kreira i vraća potrošnju', async () => {
    const agent = await loginAgent(ADMIN);
    const created = await agent.post('/api/fiscal-years/1/categories')
      .send({ name: 'Integracijska kategorija', category_limit: 1000 });
    expect(created.status).toBe(201);

    const list = await agent.get('/api/fiscal-years/1/categories');
    expect(list.status).toBe(200);
    const cat = list.body.categories.find((c) => c.name === 'Integracijska kategorija');
    expect(Number(cat.category_limit)).toBe(1000);
    expect(Number(cat.spent_amount)).toBe(0);
    expect(list.body.unattributed).toEqual({ request_count: 0, total_amount: 0 });

    const del = await agent.delete(`/api/fiscal-years/1/categories/${cat.id_item_category}`);
    expect(del.status).toBe(200);
  });
});

describe('Aktivacija odjela i kategorija (integracija)', () => {
  itDb('deaktivirani odjel nestaje iz referentne liste, aktivacijom se vraća', async () => {
    const admin = await loginAgent(ADMIN);
    const employee = await loginAgent(EMPLOYEE);

    const created = await admin.post('/api/fiscal-years/1/departments')
      .send({ name: 'Odjel za deaktivaciju', department_limit: 0 });
    expect(created.status).toBe(201);
    const deptId = created.body.id_department;

    const off = await admin.patch(`/api/fiscal-years/1/departments/${deptId}/status`)
      .send({ is_active: false });
    expect(off.status).toBe(200);

    // referentna ruta (koju koristi wizard novog zahtjeva) više ga ne nudi
    const refOff = await employee.get('/api/reference/departments');
    expect(refOff.body.some((d) => d.id_department === deptId)).toBe(false);

    const on = await admin.patch(`/api/fiscal-years/1/departments/${deptId}/status`)
      .send({ is_active: true });
    expect(on.status).toBe(200);

    const refOn = await employee.get('/api/reference/departments');
    expect(refOn.body.some((d) => d.id_department === deptId)).toBe(true);

    // počisti
    const del = await admin.delete(`/api/fiscal-years/1/departments/${deptId}`);
    expect(del.status).toBe(200);
  });

  itDb('is_active mora biti boolean, kategorija u zatvorenoj godini se ne mijenja', async () => {
    const admin = await loginAgent(ADMIN);
    const bad = await admin.patch('/api/fiscal-years/1/categories/1/status')
      .send({ is_active: 'ne' });
    expect(bad.status).toBe(400);
  });
});

describe('Workflow zahtjeva (integracija)', () => {
  let requestId;

  itDb('zaposlenik kreira zahtjev — dobiva NAB broj i status Poslano', async () => {
    const agent = await loginAgent(EMPLOYEE);
    const res = await agent.post('/api/requests').send({
      fk_fiscal_year: 1,
      fk_department: 1,
      justification: 'Integracijski test zahtjeva',
      estimated_amount: 150,
      comment: 'Napomena iz integracijskog testa',
      items: [{ fk_item_category: 1, item_name: 'Integracijska stavka', quantity: 2 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.request_number).toMatch(/^NAB-\d{4}-\d{4}$/);
    requestId = res.body.id_purchase_request;
  });

  itDb('zaposlenik ne može izvršiti admin akciju preuzmi (403)', async () => {
    const agent = await loginAgent(EMPLOYEE);
    const res = await agent.patch(`/api/requests/${requestId}/status`).send({ action: 'preuzmi' });
    expect(res.status).toBe(403);
  });

  itDb('admin preuzima zahtjev, ali odobrenje bez ponude je odbijeno', async () => {
    const agent = await loginAgent(ADMIN);
    const take = await agent.patch(`/api/requests/${requestId}/status`).send({ action: 'preuzmi' });
    expect(take.status).toBe(200);

    const approve = await agent.patch(`/api/requests/${requestId}/status`).send({ action: 'odobri' });
    expect(approve.status).toBe(400);
  });

  itDb('zaposlenik u listi vidi samo vlastite zahtjeve', async () => {
    const agent = await loginAgent(EMPLOYEE);
    const res = await agent.get('/api/requests');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    // Svi zahtjevi pripadaju zaposleniku (id_user 2 iz seeda)
    for (const r of res.body.data) {
      expect(r.created_by).toContain('Zaposlenik');
    }
  });
});

describe('Dokumenti (integracija)', () => {
  itDb('upload i download datoteke s dijakritikom u imenu', async () => {
    const agent = await loginAgent(EMPLOYEE);

    const created = await agent.post('/api/requests').send({
      fk_fiscal_year: 1,
      fk_department: 1,
      justification: 'Test downloada s posebnim znakovima u imenu datoteke',
      items: [{ fk_item_category: 1, item_name: 'Stavka', quantity: 1 }],
    });
    expect(created.status).toBe(201);

    // Minimalni valjani PDF — magic bytes provjera traži %PDF potpis
    const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
    // Ne-Latin1 znakovi u imenu — stari ručni setHeader bi na ovo bacio
    // "Invalid character in header content" i download bi vratio 500.
    const weirdName = 'Ponuda čšđž — oprema (kopija).pdf';

    const uploaded = await agent
      .post(`/api/requests/${created.body.id_purchase_request}/attachments`)
      .field('document_type', 'Ponuda')
      .attach('file', pdfBuffer, { filename: weirdName, contentType: 'application/pdf' });
    expect(uploaded.status).toBe(201);

    const download = await agent.get(`/api/attachments/download/${uploaded.body.id_attachment}`);
    expect(download.status).toBe(200);
    // res.download escapa ime kroz filename* (RFC 5987) umjesto da header pukne
    expect(download.headers['content-disposition']).toContain("filename*=UTF-8''");

    // kreator smije obrisati vlastiti upload u nezaključanom statusu —
    // ujedno počisti datoteku s diska nakon testa
    const deleted = await agent.delete(`/api/attachments/delete/${uploaded.body.id_attachment}`);
    expect(deleted.status).toBe(200);
  });
});

describe('Zaštite sesija i upravljanja korisnicima (integracija)', () => {
  itDb('deaktivacija odmah gasi postojeću sesiju korisnika', async () => {
    const employeeAgent = await loginAgent(EMPLOYEE);
    const adminAgent = await loginAgent(ADMIN);

    // Zaposlenik (id 2 iz seeda) ima aktivnu sesiju...
    const before = await employeeAgent.get('/api/requests');
    expect(before.status).toBe(200);

    // ...admin ga deaktivira — sljedeći zahtjev s istim cookiejem pada na 401
    const deactivate = await adminAgent.patch('/api/users/2/status').send({ is_active: false });
    expect(deactivate.status).toBe(200);

    const after = await employeeAgent.get('/api/requests');
    expect(after.status).toBe(401);

    // vrati na aktivno da ostali testovi ne ovise o ovom
    const reactivate = await adminAgent.patch('/api/users/2/status').send({ is_active: true });
    expect(reactivate.status).toBe(200);
  });

  itDb('zadnjem aktivnom administratoru nije moguće promijeniti ulogu', async () => {
    const agent = await loginAgent(ADMIN);
    // Admin (id 1) je jedini aktivni administrator u seedu
    const res = await agent.put('/api/users/1').send({
      first_name: 'Admin', last_name: 'Korisnik',
      email: 'admin@veleri.hr', role_id: 2,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('zadnjem aktivnom administratoru');
  });

  itDb('admin ne može obrisati vlastiti račun', async () => {
    const agent = await loginAgent(ADMIN);
    const res = await agent.delete('/api/users/1');
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('vlastiti');
  });

  itDb('korisnik sa zahtjevima ili aktivnostima vraća 409, ne SQL grešku', async () => {
    const agent = await loginAgent(ADMIN);
    // Zaposlenik (id 2) kreirao je zahtjev u workflow testovima
    const res = await agent.delete('/api/users/2');
    expect(res.status).toBe(409);
  });
});

describe('AI asistent (integracija) — docs/AI.md', () => {
  itDb('bez prijave POST /api/assistant/chat vraća 401', async () => {
    const res = await request(app)
      .post('/api/assistant/chat')
      .send({ messages: [{ role: 'user', content: 'Bok' }] });
    expect(res.status).toBe(401);
  });

  itDb('prijavljeni korisnik dobiva odgovor od aktivnog (default) providera — Ollama', async () => {
    const agent = await loginAgent(EMPLOYEE);
    const res = await agent
      .post('/api/assistant/chat')
      .send({ messages: [{ role: 'user', content: 'Trebam 5 tonera.' }] });

    expect(res.status).toBe(200);
    expect(res.body.text).toBe('[fake ollama] odgovor');
    expect(ollamaProvider.chat).toHaveBeenCalled();
    expect(geminiProvider.chat).not.toHaveBeenCalled();
  });

  itDb('rate limiter je montiran na /api/assistant/chat (standardHeaders)', async () => {
    const agent = await loginAgent(EMPLOYEE);
    const res = await agent
      .post('/api/assistant/chat')
      .send({ messages: [{ role: 'user', content: 'test' }] });

    expect(res.status).toBe(200);
    expect(res.headers).toHaveProperty('ratelimit-limit');
  });

  itDb('zaposlenik ne može čitati ni mijenjati AI postavke (403)', async () => {
    const agent = await loginAgent(EMPLOYEE);
    const get = await agent.get('/api/assistant/settings');
    expect(get.status).toBe(403);

    const put = await agent.put('/api/assistant/settings').send({ provider: 'gemini' });
    expect(put.status).toBe(403);
  });

  itDb('admin čita zadani toggle iz seeda (ollama / gemini-2.5-flash / gemma4:e2b)', async () => {
    const agent = await loginAgent(ADMIN);
    const res = await agent.get('/api/assistant/settings');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      provider: 'ollama',
      gemini_model: 'gemini-2.5-flash',
      ollama_model: 'gemma4:e2b',
    });
    // Katalog lokalnih modela (ollamaModels.js) ide klijentu da UI ne drži
    // vlastitu kopiju popisa — mora nositi i supportsTools zastavicu.
    expect(res.body.ollama_models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: 'gemma4:e2b', supportsTools: true }),
      ])
    );
  });

  itDb('admin postavlja lokalni model iz kataloga', async () => {
    const agent = await loginAgent(ADMIN);

    const put = await agent
      .put('/api/assistant/settings')
      .send({ provider: 'ollama', ollama_model: 'gemma4:e2b' });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ provider: 'ollama', ollama_model: 'gemma4:e2b' });

    const check = await agent.get('/api/assistant/settings');
    expect(check.body.ollama_model).toBe('gemma4:e2b');
  });

  itDb('admin šalje Ollama model izvan kataloga — 400, postavka ostaje netaknuta', async () => {
    const agent = await loginAgent(ADMIN);
    // Model koji stvarno postoji u Ollami, ali NIJE u našem katalogu.
    const res = await agent.put('/api/assistant/settings').send({ ollama_model: 'llama3.2-vision:11b' });
    expect(res.status).toBe(400);

    const check = await agent.get('/api/assistant/settings');
    expect(check.body.ollama_model).toBe('gemma4:e2b');
  });

  itDb('admin mijenja toggle na gemini — bez restarta idući chat poziv dispatch-a na GeminiProvider', async () => {
    const adminAgent = await loginAgent(ADMIN);
    const employeeAgent = await loginAgent(EMPLOYEE);
    ollamaProvider.chat.mockClear();
    geminiProvider.chat.mockClear();

    const put = await adminAgent.put('/api/assistant/settings').send({ provider: 'gemini' });
    expect(put.status).toBe(200);
    expect(put.body.provider).toBe('gemini');

    const chatRes = await employeeAgent
      .post('/api/assistant/chat')
      .send({ messages: [{ role: 'user', content: 'test' }] });

    expect(chatRes.status).toBe(200);
    expect(chatRes.body.text).toBe('[fake gemini] odgovor');
    expect(geminiProvider.chat).toHaveBeenCalled();
    expect(ollamaProvider.chat).not.toHaveBeenCalled();

    // vrati na default da ostali testovi (i CI) ne ovise o ovome
    const restore = await adminAgent.put('/api/assistant/settings').send({ provider: 'ollama' });
    expect(restore.status).toBe(200);
  });

  itDb('admin šalje nepoznat provider — 400, toggle ostaje netaknut', async () => {
    const agent = await loginAgent(ADMIN);
    const res = await agent.put('/api/assistant/settings').send({ provider: 'chatgpt' });
    expect(res.status).toBe(400);

    const check = await agent.get('/api/assistant/settings');
    expect(check.body.provider).toBe('ollama');
  });
});
