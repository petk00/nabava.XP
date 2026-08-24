/**
 * Unit testovi: assistantOrchestrator.runAssistantChat (function-calling
 * petlja, docs/AI.md). MySQL pool, provider selector i requestService su
 * mockani — testira se orkestracija (dispatch, izvršenje create_request
 * tool-a u auth kontekstu korisnika, vraćanje validacijskih grešaka modelu,
 * i gornja granica iteracija), bez pravih mrežnih poziva ili baze.
 */

jest.mock('../src/config/db');
jest.mock('../src/services/llm/providerSelector', () => ({ getActiveProvider: jest.fn() }));
jest.mock('../src/services/requestService', () => {
  const actual = jest.requireActual('../src/services/requestService');
  return { createRequest: jest.fn(), RequestValidationError: actual.RequestValidationError };
});

const db = require('../src/config/db');
const { getActiveProvider } = require('../src/services/llm/providerSelector');
const { createRequest, RequestValidationError } = require('../src/services/requestService');
const { runAssistantChat } = require('../src/services/assistantOrchestrator');

const FY_ROW = [[{ id_fiscal_year: 1, year: 2026 }], []];
const DEPT_ROWS = [[{ id_department: 3, name: 'Računovodstvo' }], []];
const CAT_ROWS = [[{ id_item_category: 7, name: 'Uredski pribor' }], []];
const NO_FY = [[], []];

/** Postavlja standardni (postoji aktivna godina) redoslijed db.query odgovora. */
function mockReferenceContext() {
  db.query
    .mockResolvedValueOnce(FY_ROW)
    .mockResolvedValueOnce(DEPT_ROWS)
    .mockResolvedValueOnce(CAT_ROWS);
}

const VALID_ARGS = {
  fk_fiscal_year: 1,
  fk_department: 3,
  justification: 'Zalihe pri kraju.',
  items: [{ fk_item_category: 7, item_name: 'Toner za pisač', quantity: 5 }],
};

const toolCallMessage = (args, id = 'call_1') => ({
  text: '',
  tool_calls: [{ id, name: 'create_request', arguments: args }],
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('runAssistantChat — bez tool-calla', () => {
  test('model odgovara čistim tekstom — vraća text bez kreiranog zahtjeva', async () => {
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({ text: 'Bok! Kako mogu pomoći?', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({
      messages: [{ role: 'user', content: 'Bok' }],
      userId: 2,
    });

    expect(result).toEqual({ text: 'Bok! Kako mogu pomoći?', created_request: null });
    expect(chat).toHaveBeenCalledTimes(1);
    expect(createRequest).not.toHaveBeenCalled();
  });

  test('model postavlja pojašnjavajuće pitanje umjesto poziva alata s nepotpunim podacima', async () => {
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({
      text: 'Za koji odjel je ova nabava?',
      tool_calls: null,
    });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({
      messages: [{ role: 'user', content: 'Trebam 5 tonera za pisač.' }],
      userId: 2,
    });

    expect(result.text).toBe('Za koji odjel je ova nabava?');
    expect(result.created_request).toBeNull();
    expect(createRequest).not.toHaveBeenCalled();
  });
});

describe('runAssistantChat — uspješno kreiranje', () => {
  test('poziva requestService.createRequest s auth userId, ne s onim što model pošalje', async () => {
    mockReferenceContext();
    createRequest.mockResolvedValue({
      id_purchase_request: 42,
      request_number: 'NAB-2026-0042',
      fk_request_status: 1,
    });

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage({ ...VALID_ARGS, userId: 999, fk_created_by_user: 999 }))
      .mockResolvedValueOnce({ text: 'Zahtjev NAB-2026-0042 je uspješno kreiran.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({
      messages: [{ role: 'user', content: '5 tonera, Računovodstvo, zalihe pri kraju.' }],
      userId: 2, // stvarni prijavljeni korisnik — model je (pokušao) poslati 999
    });

    expect(createRequest).toHaveBeenCalledTimes(1);
    expect(createRequest).toHaveBeenCalledWith({
      fk_fiscal_year: 1,
      fk_department: 3,
      justification: 'Zalihe pri kraju.',
      estimated_amount: undefined,
      comment: undefined,
      items: VALID_ARGS.items,
      userId: 2,
    });

    expect(result).toEqual({
      text: 'Zahtjev NAB-2026-0042 je uspješno kreiran.',
      created_request: { id_purchase_request: 42, request_number: 'NAB-2026-0042', fk_request_status: 1 },
    });
    expect(chat).toHaveBeenCalledTimes(2);
  });

  test('drugi poziv modelu dobiva tool rezultat kao role:"tool" poruku s ok:true', async () => {
    mockReferenceContext();
    createRequest.mockResolvedValue({
      id_purchase_request: 42,
      request_number: 'NAB-2026-0042',
      fk_request_status: 1,
    });

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS))
      .mockResolvedValueOnce({ text: 'Gotovo.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    await runAssistantChat({ messages: [{ role: 'user', content: 'test' }], userId: 2 });

    const secondCallMessages = chat.mock.calls[1][0];
    const toolResultMsg = secondCallMessages.find((m) => m.role === 'tool');
    expect(JSON.parse(toolResultMsg.content)).toEqual({
      ok: true,
      id_purchase_request: 42,
      request_number: 'NAB-2026-0042',
      fk_request_status: 1,
    });
  });

  test('drugi poziv create_request u istom razgovoru se ne izvršava ponovno (idempotentna kočnica)', async () => {
    mockReferenceContext();
    createRequest.mockResolvedValue({
      id_purchase_request: 42,
      request_number: 'NAB-2026-0042',
      fk_request_status: 1,
    });

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'call_1'))
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'call_2'))
      .mockResolvedValueOnce({ text: 'Zahtjev je već kreiran.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({ messages: [{ role: 'user', content: 'test' }], userId: 2 });

    expect(createRequest).toHaveBeenCalledTimes(1);
    expect(result.created_request).toEqual({
      id_purchase_request: 42,
      request_number: 'NAB-2026-0042',
      fk_request_status: 1,
    });

    const thirdCallMessages = chat.mock.calls[2][0];
    const secondToolResult = thirdCallMessages.find((m) => m.tool_call_id === 'call_2');
    expect(JSON.parse(secondToolResult.content).already_created).toBe(true);
  });
});

describe('runAssistantChat — validacijska greška ide modelu, ne korisniku kao HTTP error', () => {
  test('RequestValidationError se vraća kao tool rezultat, razgovor nastavlja', async () => {
    mockReferenceContext();
    createRequest.mockRejectedValue(
      new RequestValidationError(400, 'Odabrani odjel ne pripada odabranoj poslovnoj godini.')
    );

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS))
      .mockResolvedValueOnce({ text: 'Čini se da odjel nije ispravan za ovu godinu — možete li provjeriti?', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({ messages: [{ role: 'user', content: 'test' }], userId: 2 });

    // runAssistantChat NE baca grešku — vraća se normalan odgovor modela
    expect(result.text).toBe('Čini se da odjel nije ispravan za ovu godinu — možete li provjeriti?');
    expect(result.created_request).toBeNull();

    const secondCallMessages = chat.mock.calls[1][0];
    const toolResultMsg = secondCallMessages.find((m) => m.role === 'tool');
    expect(JSON.parse(toolResultMsg.content)).toEqual({
      ok: false,
      message: 'Odabrani odjel ne pripada odabranoj poslovnoj godini.',
    });
  });

  test('neočekivana (ne-validacijska) greška iz requestService ne curi klijentu/modelu kao raw error.message', async () => {
    mockReferenceContext();
    createRequest.mockRejectedValue(Object.assign(new Error('ER_DUP_ENTRY: Duplicate'), { code: 'ER_DUP_ENTRY' }));

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS))
      .mockResolvedValueOnce({ text: 'Došlo je do greške, pokušajmo ponovno.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    await runAssistantChat({ messages: [{ role: 'user', content: 'test' }], userId: 2 });

    const secondCallMessages = chat.mock.calls[1][0];
    const toolResultMsg = secondCallMessages.find((m) => m.role === 'tool');
    const parsed = JSON.parse(toolResultMsg.content);
    expect(parsed.ok).toBe(false);
    expect(parsed.message).not.toMatch(/ER_DUP_ENTRY/);
  });
});

describe('runAssistantChat — nepoznat tool poziv', () => {
  test('nepoznato ime alata ne poziva createRequest i vraća grešku modelu', async () => {
    mockReferenceContext();
    const chat = jest.fn()
      .mockResolvedValueOnce({ text: '', tool_calls: [{ id: 'call_x', name: 'delete_everything', arguments: {} }] })
      .mockResolvedValueOnce({ text: 'Ne mogu to napraviti.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({ messages: [{ role: 'user', content: 'test' }], userId: 2 });

    expect(createRequest).not.toHaveBeenCalled();
    expect(result.text).toBe('Ne mogu to napraviti.');
  });
});

describe('runAssistantChat — gornja granica iteracija', () => {
  test('petlja staje nakon MAX_ITERATIONS poziva modelu s jasnom porukom korisniku', async () => {
    mockReferenceContext();
    createRequest.mockRejectedValue(new RequestValidationError(400, 'Uvijek nedostaje nešto.'));

    const chat = jest.fn().mockResolvedValue(toolCallMessage(VALID_ARGS));
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({ messages: [{ role: 'user', content: 'test' }], userId: 2 });

    expect(chat).toHaveBeenCalledTimes(6);
    expect(createRequest).toHaveBeenCalledTimes(6);
    expect(result.created_request).toBeNull();
    expect(result.text).toMatch(/Nisam uspio dovršiti/);
  });
});

describe('runAssistantChat — bez aktivne poslovne godine', () => {
  test('create_request se ne nudi modelu kao alat kad nema aktivne godine', async () => {
    db.query.mockResolvedValueOnce(NO_FY);
    const chat = jest.fn().mockResolvedValue({ text: 'Trenutno nema otvorene poslovne godine.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    await runAssistantChat({ messages: [{ role: 'user', content: 'Trebam nabaviti nešto.' }], userId: 2 });

    expect(db.query).toHaveBeenCalledTimes(1); // department/category upiti se preskaču
    const [, toolsArg] = chat.mock.calls[0];
    expect(toolsArg).toEqual([]);
  });
});
