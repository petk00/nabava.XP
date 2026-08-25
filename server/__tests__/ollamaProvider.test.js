/**
 * Unit testovi: OllamaProvider (docs/AI.md, Faza 1).
 * global.fetch je mockan — ne gađa pravi Ollama.
 */

const { chat } = require('../src/services/llm/ollamaProvider');

const ORIGINAL_ENV = process.env;
const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  global.fetch = jest.fn();
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
  global.fetch = ORIGINAL_FETCH;
});

describe('OllamaProvider.chat', () => {
  test('vraća text iz message.content na uspješan odgovor', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: 'Bok! Kako mogu pomoći?' } }),
    });

    const result = await chat([{ role: 'user', content: 'Bok' }]);

    expect(result).toEqual({
      text: 'Bok! Kako mogu pomoći?',
      tool_calls: null,
      usage: { promptTokens: null, completionTokens: null },
    });
  });

  test('vraća prompt/completion tokene iz prompt_eval_count/eval_count', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: { content: 'ok' },
        prompt_eval_count: 19,
        eval_count: 142,
      }),
    });

    const result = await chat([{ role: 'user', content: 'Bok' }]);

    expect(result.usage).toEqual({ promptTokens: 19, completionTokens: 142 });
  });

  test('zove default localhost:11434 kad OLLAMA_BASE_URL nije postavljen', async () => {
    delete process.env.OLLAMA_BASE_URL;
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ message: { content: 'ok' } }) });

    await chat([{ role: 'user', content: 'test' }]);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:11434/api/chat',
      expect.objectContaining({ method: 'POST' })
    );
  });

  test('poštuje OLLAMA_BASE_URL iz env-a i šalje model gemma4:12b', async () => {
    process.env.OLLAMA_BASE_URL = 'http://ollama-host:11434';
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ message: { content: 'ok' } }) });

    await chat([{ role: 'user', content: 'test' }]);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://ollama-host:11434/api/chat',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.model).toBe('gemma4:12b');
    expect(body.stream).toBe(false);
  });

  test('baca grešku kad Ollama vrati ne-ok status', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'model not loaded',
    });

    await expect(chat([{ role: 'user', content: 'test' }]))
      .rejects.toThrow(/Ollama API greška \(500\)/);
  });

  test('baca jasnu grešku kad Ollama uopće nije dostupan (mrežna greška)', async () => {
    global.fetch.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(chat([{ role: 'user', content: 'test' }]))
      .rejects.toThrow(/Ollama nije dostupan/);
  });
});

describe('OllamaProvider.chat — tool-calling', () => {
  const TOOL = {
    name: 'create_request',
    description: 'Kreira zahtjev za nabavu.',
    parameters: { type: 'object', properties: {}, required: [] },
  };

  test('šalje tools u OpenAI-kompatibilnom obliku kad su prisutni', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ message: { content: 'ok' } }) });

    await chat([{ role: 'user', content: 'test' }], [TOOL]);

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.tools).toEqual([
      { type: 'function', function: { name: TOOL.name, description: TOOL.description, parameters: TOOL.parameters } },
    ]);
  });

  test('ne šalje "tools" polje kad nema alata', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ message: { content: 'ok' } }) });

    await chat([{ role: 'user', content: 'test' }], []);

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.tools).toBeUndefined();
  });

  test('normalizira message.tool_calls u kanonski oblik { id, name, arguments }', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: '',
          tool_calls: [{ id: 'call_1', function: { name: 'create_request', arguments: { fk_department: 3 } } }],
        },
      }),
    });

    const result = await chat([{ role: 'user', content: 'test' }], [TOOL]);

    expect(result.text).toBeNull();
    expect(result.tool_calls).toEqual([{ id: 'call_1', name: 'create_request', arguments: { fk_department: 3 } }]);
  });

  test('parsira tool_calls.function.arguments kad Ollama vrati JSON string umjesto objekta', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: '',
          tool_calls: [{ id: 'call_1', function: { name: 'create_request', arguments: '{"fk_department":3}' } }],
        },
      }),
    });

    const result = await chat([{ role: 'user', content: 'test' }], [TOOL]);

    expect(result.tool_calls).toEqual([{ id: 'call_1', name: 'create_request', arguments: { fk_department: 3 } }]);
  });

  test('šalje prethodne assistant tool_calls i tool-rezultat poruke u Ollaminom obliku', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ message: { content: 'Gotovo.' } }) });

    const history = [
      { role: 'user', content: 'Trebam 5 tonera.' },
      {
        role: 'assistant',
        content: '',
        tool_calls: [{ id: 'call_1', name: 'create_request', arguments: { fk_department: 3 } }],
      },
      { role: 'tool', tool_call_id: 'call_1', name: 'create_request', content: '{"ok":true}' },
    ];

    await chat(history, [TOOL]);

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.messages[1]).toEqual({
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'create_request', arguments: { fk_department: 3 } } }],
    });
    expect(body.messages[2]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' });
  });
});

describe('OllamaProvider.chat — slika (vision, bez server-side OCR-a)', () => {
  test('poruka s "images" prosljeđuje se Ollami kao flat base64 niz (bez mimeType-a, bez data: prefiksa)', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ message: { content: 'Vidim ponudu...' } }) });

    await chat([
      { role: 'user', content: 'Evo slike ponude.', images: [{ mimeType: 'image/png', data: 'ZmFrZS1wbmctYnl0ZXM=' }] },
    ]);

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.messages[0]).toEqual({
      role: 'user',
      content: 'Evo slike ponude.',
      images: ['ZmFrZS1wbmctYnl0ZXM='],
    });
  });

  test('poruka s VIŠE "images" (npr. dvije priložene ponude) prosljeđuje sve, redoslijedom', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ message: { content: 'Vidim ponude...' } }) });

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
    expect(body.messages[0].images).toEqual(['cG5nLWJ5dGVz', 'anBnLWJ5dGVz']);
  });

  test('poruka bez "images" ne dobiva images polje (nema praznog niza)', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ message: { content: 'ok' } }) });

    await chat([{ role: 'user', content: 'Bok' }]);

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.messages[0]).toEqual({ role: 'user', content: 'Bok' });
    expect(body.messages[0].images).toBeUndefined();
  });
});
