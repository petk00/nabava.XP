/**
 * Unit testovi: GeminiProvider (docs/AI.md, Faza 1).
 * global.fetch je mockan — ne gađa pravi Gemini API. appSettings je mockan
 * da se model može kontrolirati bez prave baze.
 */

jest.mock('../src/config/appSettings', () => ({
  getSetting: jest.fn(),
  SETTING_KEYS: { AI_PROVIDER: 'ai_provider', GEMINI_MODEL: 'gemini_model' },
}));

const { getSetting } = require('../src/config/appSettings');
const { chat } = require('../src/services/llm/geminiProvider');

const ORIGINAL_ENV = process.env;
const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  global.fetch = jest.fn();
  getSetting.mockReset();
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
  global.fetch = ORIGINAL_FETCH;
});

describe('GeminiProvider.chat', () => {
  test('baca jasnu grešku kad GEMINI_API_KEY nije postavljen', async () => {
    delete process.env.GEMINI_API_KEY;

    await expect(chat([{ role: 'user', content: 'test' }]))
      .rejects.toThrow(/GEMINI_API_KEY nije postavljen/);

    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('koristi model iz runtime postavke (appSettings), ne hardkodiran', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    getSetting.mockResolvedValue('gemini-9.9-flash');
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'odgovor' }] } }] }),
    });

    await chat([{ role: 'user', content: 'test' }]);

    const [url] = global.fetch.mock.calls[0];
    expect(url).toContain('/models/gemini-9.9-flash:generateContent');
    expect(url).toContain('key=test-key');
  });

  test('vraća spojeni text iz candidates[0].content.parts na uspješan odgovor', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    getSetting.mockResolvedValue('gemini-2.5-flash');
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Bok! ' }, { text: 'Kako mogu pomoći?' }] } }],
      }),
    });

    const result = await chat([{ role: 'user', content: 'Bok' }]);

    expect(result).toEqual({ text: 'Bok! Kako mogu pomoći?', tool_calls: null });
  });

  test('šalje system poruke odvojeno kao system_instruction', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    getSetting.mockResolvedValue('gemini-2.5-flash');
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }),
    });

    await chat([
      { role: 'system', content: 'Ti si asistent za nabavu.' },
      { role: 'user', content: 'Bok' },
    ]);

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.system_instruction.parts[0].text).toBe('Ti si asistent za nabavu.');
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'Bok' }] }]);
  });

  test('baca grešku kad Gemini vrati ne-ok status', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    getSetting.mockResolvedValue('gemini-2.5-flash');
    global.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => 'API key invalid',
    });

    await expect(chat([{ role: 'user', content: 'test' }]))
      .rejects.toThrow(/Gemini API greška \(403\)/);
  });
});

describe('GeminiProvider.chat — tool-calling', () => {
  const TOOL = {
    name: 'create_request',
    description: 'Kreira zahtjev za nabavu.',
    parameters: {
      type: 'object',
      properties: {
        fk_department: { type: 'integer', description: 'ID odjela' },
        items: { type: 'array', items: { type: 'object', properties: { item_name: { type: 'string' } } } },
      },
      required: ['fk_department'],
    },
  };

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    getSetting.mockResolvedValue('gemini-2.5-flash');
  });

  test('šalje functionDeclarations s UPPERCASE tipovima iz kanonske (lowercase) sheme', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) });

    await chat([{ role: 'user', content: 'test' }], [TOOL]);

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.tools).toEqual([{
      functionDeclarations: [{
        name: 'create_request',
        description: 'Kreira zahtjev za nabavu.',
        parameters: {
          type: 'OBJECT',
          properties: {
            fk_department: { type: 'INTEGER', description: 'ID odjela' },
            items: { type: 'ARRAY', items: { type: 'OBJECT', properties: { item_name: { type: 'STRING' } } } },
          },
          required: ['fk_department'],
        },
      }],
    }]);
  });

  test('ne šalje "tools" polje kad nema alata', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) });

    await chat([{ role: 'user', content: 'test' }], []);

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.tools).toBeUndefined();
  });

  test('parsira functionCall iz odgovora u kanonski tool_calls oblik', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ functionCall: { name: 'create_request', args: { fk_department: 3 } } }] } }],
      }),
    });

    const result = await chat([{ role: 'user', content: 'test' }], [TOOL]);

    expect(result.text).toBeNull();
    expect(result.tool_calls).toEqual([{ id: 'call_0', name: 'create_request', arguments: { fk_department: 3 } }]);
  });

  test('šalje prethodni assistant functionCall i tool-rezultat kao functionResponse', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Gotovo.' }] } }] }) });

    const history = [
      { role: 'user', content: 'Trebam 5 tonera.' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_0', name: 'create_request', arguments: { fk_department: 3 } }],
      },
      { role: 'tool', tool_call_id: 'call_0', name: 'create_request', content: '{"ok":true,"request_number":"NAB-2026-0042"}' },
    ];

    await chat(history, [TOOL]);

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.contents[1]).toEqual({
      role: 'model',
      parts: [{ functionCall: { name: 'create_request', args: { fk_department: 3 } } }],
    });
    expect(body.contents[2]).toEqual({
      role: 'function',
      parts: [{ functionResponse: { name: 'create_request', response: { ok: true, request_number: 'NAB-2026-0042' } } }],
    });
  });
});

describe('GeminiProvider.chat — slika (vision, bez server-side OCR-a)', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key';
    getSetting.mockResolvedValue('gemini-2.5-flash');
  });

  test('poruka s "images" postaje inlineData part uz text part', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) });

    await chat([
      { role: 'user', content: 'Evo slike ponude.', images: [{ mimeType: 'image/png', data: 'ZmFrZS1wbmctYnl0ZXM=' }] },
    ]);

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.contents[0]).toEqual({
      role: 'user',
      parts: [
        { text: 'Evo slike ponude.' },
        { inlineData: { mimeType: 'image/png', data: 'ZmFrZS1wbmctYnl0ZXM=' } },
      ],
    });
  });

  test('poruka s VIŠE "images" (npr. dvije priložene ponude, različiti mimeType) postaje više inlineData partova', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) });

    await chat([
      {
        role: 'user',
        content: 'Evo dvije slike ponuda.',
        images: [
          { mimeType: 'image/png', data: 'cG5nLWJ5dGVz' },
          { mimeType: 'image/jpeg', data: 'anBnLWJ5dGVz' },
        ],
      },
    ]);

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.contents[0].parts).toEqual([
      { text: 'Evo dvije slike ponuda.' },
      { inlineData: { mimeType: 'image/png', data: 'cG5nLWJ5dGVz' } },
      { inlineData: { mimeType: 'image/jpeg', data: 'anBnLWJ5dGVz' } },
    ]);
  });

  test('default mimeType je image/png ako mimeType nije naveden po slici', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) });

    await chat([{ role: 'user', content: 'test', images: [{ data: 'abc123' }] }]);

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[1]).toEqual({ inlineData: { mimeType: 'image/png', data: 'abc123' } });
  });

  test('poruka bez "images" nema inlineData part', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }) });

    await chat([{ role: 'user', content: 'Bok' }]);

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.contents[0]).toEqual({ role: 'user', parts: [{ text: 'Bok' }] });
  });
});
