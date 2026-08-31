/**
 * Unit testovi: OllamaProvider (docs/AI.md, Faza 1).
 * node:http je mockan — ne gađa pravi Ollama. (2026-08-29: chat() koristi
 * node:http/https umjesto fetch() — undici-jev tvrd 5-min headersTimeout je
 * lažno prekidao spore, ali uredne odgovore prije REQUEST_TIMEOUT_MS-a, vidi
 * ollamaProvider.js komentar iznad performChatRequest.)
 */

const http = require('node:http');

jest.mock('node:http');

// Model se od uvođenja toggle-a lokalnih modela čita iz AppSetting-a
// (ollamaProvider.getActiveModel) — bez ovog mocka test bi otvarao pravu
// MySQL vezu. Default je gemma4:12b, pojedini test si ga prepiše.
jest.mock('../src/config/appSettings', () => ({
  SETTING_KEYS: { OLLAMA_MODEL: 'ollama_model' },
  getSetting: jest.fn().mockResolvedValue('gemma4:e4b'),
}));

const { getSetting } = require('../src/config/appSettings');
const { chat, getCapabilities } = require('../src/services/llm/ollamaProvider');
const { OLLAMA_MODELS, DEFAULT_OLLAMA_MODEL } = require('../src/services/llm/ollamaModels');

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  http.request.mockReset();
  getSetting.mockResolvedValue('gemma4:e4b');
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

/** Simulira uspješan http.request poziv — vraća zadani JSON body. */
function mockHttpSuccessOnce(bodyObj, { status = 200, statusText = 'OK' } = {}) {
  http.request.mockImplementationOnce((options, callback) => {
    const resListeners = {};
    const res = {
      statusCode: status,
      statusMessage: statusText,
      on: (event, cb) => {
        resListeners[event] = cb;
      },
    };
    const req = {
      on: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
    };
    Promise.resolve().then(() => {
      callback(res);
      resListeners.data(Buffer.from(JSON.stringify(bodyObj)));
      resListeners.end();
    });
    return req;
  });
}

/** Simulira mrežnu grešku (npr. ECONNREFUSED) — req emitira 'error'. */
function mockHttpErrorOnce(err) {
  http.request.mockImplementationOnce(() => {
    const listeners = {};
    const req = {
      on: jest.fn((event, cb) => {
        listeners[event] = cb;
      }),
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn(),
    };
    Promise.resolve().then(() => listeners.error && listeners.error(err));
    return req;
  });
}

/** Simulira istek REQUEST_TIMEOUT_MS-a — req emitira 'timeout', pa (stvarnim kodom) destroy(TimeoutError) -> 'error'. */
function mockHttpTimeoutOnce() {
  http.request.mockImplementationOnce(() => {
    const listeners = {};
    const req = {
      on: jest.fn((event, cb) => {
        listeners[event] = cb;
      }),
      write: jest.fn(),
      end: jest.fn(),
      destroy: jest.fn((err) => listeners.error && listeners.error(err)),
    };
    Promise.resolve().then(() => listeners.timeout && listeners.timeout());
    return req;
  });
}

function lastRequestBody() {
  const writeCalls = http.request.mock.results.map((r) => r.value.write.mock.calls[0]?.[0]);
  const lastBuffer = writeCalls[writeCalls.length - 1];
  return JSON.parse(lastBuffer.toString('utf8'));
}

function lastRequestOptions() {
  const calls = http.request.mock.calls;
  return calls[calls.length - 1][0];
}

describe('OllamaProvider.chat', () => {
  test('vraća text iz message.content na uspješan odgovor', async () => {
    mockHttpSuccessOnce({ message: { content: 'Bok! Kako mogu pomoći?' } });

    const result = await chat([{ role: 'user', content: 'Bok' }]);

    expect(result).toEqual({
      text: 'Bok! Kako mogu pomoći?',
      tool_calls: null,
      usage: { promptTokens: null, completionTokens: null },
    });
  });

  test('vraća prompt/completion tokene iz prompt_eval_count/eval_count', async () => {
    mockHttpSuccessOnce({ message: { content: 'ok' }, prompt_eval_count: 19, eval_count: 142 });

    const result = await chat([{ role: 'user', content: 'Bok' }]);

    expect(result.usage).toEqual({ promptTokens: 19, completionTokens: 142 });
  });

  test('zove default localhost:11434 kad OLLAMA_BASE_URL nije postavljen', async () => {
    delete process.env.OLLAMA_BASE_URL;
    mockHttpSuccessOnce({ message: { content: 'ok' } });

    await chat([{ role: 'user', content: 'test' }]);

    const options = lastRequestOptions();
    expect(options).toEqual(
      expect.objectContaining({ hostname: 'localhost', port: '11434', path: '/api/chat', method: 'POST' })
    );
  });

  test('poštuje OLLAMA_BASE_URL iz env-a i šalje aktivni model', async () => {
    process.env.OLLAMA_BASE_URL = 'http://ollama-host:11434';
    mockHttpSuccessOnce({ message: { content: 'ok' } });

    await chat([{ role: 'user', content: 'test' }]);

    const options = lastRequestOptions();
    expect(options).toEqual(expect.objectContaining({ hostname: 'ollama-host', port: '11434', method: 'POST' }));
    const body = lastRequestBody();
    expect(body.model).toBe('gemma4:e4b');
    expect(body.stream).toBe(false);
  });

  test('baca grešku kad Ollama vrati ne-ok status', async () => {
    http.request.mockImplementationOnce((options, callback) => {
      const resListeners = {};
      const res = {
        statusCode: 500,
        statusMessage: 'Internal Server Error',
        on: (event, cb) => {
          resListeners[event] = cb;
        },
      };
      const req = { on: jest.fn(), write: jest.fn(), end: jest.fn(), destroy: jest.fn() };
      Promise.resolve().then(() => {
        callback(res);
        resListeners.data(Buffer.from('model not loaded'));
        resListeners.end();
      });
      return req;
    });

    await expect(chat([{ role: 'user', content: 'test' }])).rejects.toThrow(/Ollama API greška \(500\)/);
  });

  test('baca jasnu grešku kad Ollama uopće nije dostupan (mrežna greška NA OBA pokušaja)', async () => {
    jest.useFakeTimers();
    mockHttpErrorOnce(new Error('connect ECONNREFUSED'));
    mockHttpErrorOnce(new Error('connect ECONNREFUSED'));

    const pending = expect(chat([{ role: 'user', content: 'test' }])).rejects.toThrow(/Ollama nije dostupan/);
    await jest.runAllTimersAsync();
    await pending;

    expect(http.request).toHaveBeenCalledTimes(2); // prvi pokušaj + 1 retry
    jest.useRealTimers();
  });

  test('mrežna greška na PRVOM pokušaju, uspjeh na retry-u — vraća rezultat, ne baca grešku', async () => {
    // Stvarnim eval runom (docs/eval-runs/2026-08-26-ollama-5x.md) potvrđeno:
    // Ollamin scheduler zna usred rada reloadati model pod memorijskim
    // pritiskom, prekidajući baš zahtjev koji je tad u tijeku — reload traje
    // par sekundi, pa retry nakon kratke pauze uobičajeno uspije.
    jest.useFakeTimers();
    mockHttpErrorOnce(new Error('fetch failed'));
    mockHttpSuccessOnce({ message: { content: 'Vidim sliku ponude...' } });

    const pending = chat([{ role: 'user', content: 'test' }]);
    await jest.runAllTimersAsync();
    const result = await pending;

    expect(result.text).toBe('Vidim sliku ponude...');
    expect(http.request).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });

  test('baca jasnu grešku o isteku vremena kad Ollama nikad ne odgovori (TimeoutError, JEDAN neprekinut pokušaj)', async () => {
    // Stvarnim eval harness testiranjem opaženo: povremeno (temperature:1)
    // gemma4:12b zna "razmišljati" jako dugo bez ikakvog napretka — bez
    // timeouta takav zahtjev visi neograničeno. VAŽNO (2026-08-29): ovo mora
    // biti JEDAN neprekinut pokušaj do punog REQUEST_TIMEOUT_MS-a, ne dva
    // kraća (undici-jev 5-min limit je ranije lažno prekidao prvi pokušaj i
    // retry ga je bacao od nule) — zato ovdje NEMA retryja nakon timeouta.
    mockHttpTimeoutOnce();

    await expect(chat([{ role: 'user', content: 'test' }])).rejects.toThrow(/Ollama nije odgovorio u 10 min/);

    expect(http.request).toHaveBeenCalledTimes(1); // NEMA retryja na pravi timeout
    const options = lastRequestOptions();
    expect(options.timeout).toBe(10 * 60 * 1000); // pun budžet u JEDNOM pokušaju, ne 5 min
  });
});

describe('OllamaProvider — odabir lokalnog modela (AppSetting.ollama_model)', () => {
  test('šalje model zapisan u postavkama, ne hardkodiran default', async () => {
    getSetting.mockResolvedValue('gemma4:e4b');
    mockHttpSuccessOnce({ message: { content: 'ok' } });

    await chat([{ role: 'user', content: 'test' }]);

    expect(lastRequestBody().model).toBe('gemma4:e4b');
  });

  test('pada natrag na default kad je u postavkama model izvan kataloga', async () => {
    getSetting.mockResolvedValue('model-koji-ne-postoji:1b');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockHttpSuccessOnce({ message: { content: 'ok' } });

    await chat([{ role: 'user', content: 'test' }]);

    expect(lastRequestBody().model).toBe(DEFAULT_OLLAMA_MODEL);
    warn.mockRestore();
  });

  test('getCapabilities javlja aktivni model i njegovu podršku za alate', async () => {
    await expect(getCapabilities()).resolves.toEqual({ model: 'gemma4:e4b', supportsTools: true });
  });

  // Ollama na `tools` poslan modelu bez te sposobnosti vraća tvrd HTTP 400
  // ("<model> does not support tools") — provjereno pravim pozivom na
  // qwen2.5vl:7b prije nego je uklonjen iz kataloga (docs/eval-runs/).
  // Katalog trenutno nema takav model, pa se grana provjerava privremenim
  // unosom: mehanizam mora ostati ispravan ako se takav model opet doda.
  test('NE šalje tools modelu bez podrške za alate', async () => {
    OLLAMA_MODELS.push({ value: 'test-bez-alata:1b', label: 'test', supportsTools: false });
    getSetting.mockResolvedValue('test-bez-alata:1b');
    mockHttpSuccessOnce({ message: { content: 'ok' } });

    await chat([{ role: 'user', content: 'test' }], [
      { name: 'create_request', description: 'x', parameters: { type: 'object', properties: {} } },
    ]);

    expect(lastRequestBody().tools).toBeUndefined();
    OLLAMA_MODELS.pop();
  });
});

describe('OllamaProvider.chat — tool-calling', () => {
  const TOOL = {
    name: 'create_request',
    description: 'Kreira zahtjev za nabavu.',
    parameters: { type: 'object', properties: {}, required: [] },
  };

  test('šalje tools u OpenAI-kompatibilnom obliku kad su prisutni', async () => {
    mockHttpSuccessOnce({ message: { content: 'ok' } });

    await chat([{ role: 'user', content: 'test' }], [TOOL]);

    const body = lastRequestBody();
    expect(body.tools).toEqual([
      { type: 'function', function: { name: TOOL.name, description: TOOL.description, parameters: TOOL.parameters } },
    ]);
  });

  test('ne šalje "tools" polje kad nema alata', async () => {
    mockHttpSuccessOnce({ message: { content: 'ok' } });

    await chat([{ role: 'user', content: 'test' }], []);

    const body = lastRequestBody();
    expect(body.tools).toBeUndefined();
  });

  test('normalizira message.tool_calls u kanonski oblik { id, name, arguments }', async () => {
    mockHttpSuccessOnce({
      message: {
        content: '',
        tool_calls: [{ id: 'call_1', function: { name: 'create_request', arguments: { fk_department: 3 } } }],
      },
    });

    const result = await chat([{ role: 'user', content: 'test' }], [TOOL]);

    expect(result.text).toBeNull();
    expect(result.tool_calls).toEqual([{ id: 'call_1', name: 'create_request', arguments: { fk_department: 3 } }]);
  });

  test('parsira tool_calls.function.arguments kad Ollama vrati JSON string umjesto objekta', async () => {
    mockHttpSuccessOnce({
      message: {
        content: '',
        tool_calls: [{ id: 'call_1', function: { name: 'create_request', arguments: '{"fk_department":3}' } }],
      },
    });

    const result = await chat([{ role: 'user', content: 'test' }], [TOOL]);

    expect(result.tool_calls).toEqual([{ id: 'call_1', name: 'create_request', arguments: { fk_department: 3 } }]);
  });

  test('šalje prethodne assistant tool_calls i tool-rezultat poruke u Ollaminom obliku', async () => {
    mockHttpSuccessOnce({ message: { content: 'Gotovo.' } });

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

    const body = lastRequestBody();
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
    mockHttpSuccessOnce({ message: { content: 'Vidim ponudu...' } });

    await chat([
      { role: 'user', content: 'Evo slike ponude.', images: [{ mimeType: 'image/png', data: 'ZmFrZS1wbmctYnl0ZXM=' }] },
    ]);

    const body = lastRequestBody();
    expect(body.messages[0]).toEqual({
      role: 'user',
      content: 'Evo slike ponude.',
      images: ['ZmFrZS1wbmctYnl0ZXM='],
    });
  });

  test('poruka s VIŠE "images" (npr. dvije priložene ponude) prosljeđuje sve, redoslijedom', async () => {
    mockHttpSuccessOnce({ message: { content: 'Vidim ponude...' } });

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

    const body = lastRequestBody();
    expect(body.messages[0].images).toEqual(['cG5nLWJ5dGVz', 'anBnLWJ5dGVz']);
  });

  test('poruka bez "images" ne dobiva images polje (nema praznog niza)', async () => {
    mockHttpSuccessOnce({ message: { content: 'ok' } });

    await chat([{ role: 'user', content: 'Bok' }]);

    const body = lastRequestBody();
    expect(body.messages[0]).toEqual({ role: 'user', content: 'Bok' });
    expect(body.messages[0].images).toBeUndefined();
  });
});
