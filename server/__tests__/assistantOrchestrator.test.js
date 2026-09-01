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
  return {
    createRequest: jest.fn(),
    proposeRequest: jest.fn(),
    RequestValidationError: actual.RequestValidationError,
  };
});

const db = require('../src/config/db');
const { getActiveProvider } = require('../src/services/llm/providerSelector');
const { createRequest, proposeRequest, RequestValidationError } = require('../src/services/requestService');
const { runAssistantChat } = require('../src/services/assistantOrchestrator');
const {
  getAttachments: getStoredAttachments,
  _resetForTests: resetAttachmentStore,
} = require('../src/services/assistantAttachmentStore');

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

const proposeCallMessage = (args, id = 'propose_1') => ({
  text: '',
  tool_calls: [{ id, name: 'propose_request', arguments: args }],
});

const QUOTE_MARKER = '[ai-asistent:priložena-ponuda]';

/** Kanonska poruka koja predstavlja uspješan raniji propose_request rezultat (za resend u messages). */
const priorProposalToolMessage = (proposal, id = 'propose_1') => ({
  role: 'tool',
  tool_call_id: id,
  name: 'propose_request',
  content: JSON.stringify({ ok: true, proposal }),
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

    expect(result).toMatchObject({ text: 'Bok! Kako mogu pomoći?', created_request: null });
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

// Ollamin toggle lokalnih modela (AppSetting.ollama_model) zna izabrati model
// bez function-callinga (qwen2.5vl:7b). Provider to javlja preko
// getCapabilities(), a orchestrator tad NE smije slati alate — Ollama na
// `tools` takvom modelu vraća tvrd HTTP 400.
describe('runAssistantChat — model bez podrške za alate (getCapabilities)', () => {
  test('ne šalje alate i upozorava model da zahtjev ne može kreirati', async () => {
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({ text: 'Ponuda je na 1.200 €.', tool_calls: null });
    getActiveProvider.mockResolvedValue({
      chat,
      getCapabilities: jest.fn().mockResolvedValue({ model: 'qwen2.5vl:7b', supportsTools: false }),
    });

    const result = await runAssistantChat({
      messages: [{ role: 'user', content: 'Koliko je na ponudi?' }],
      userId: 2,
    });

    expect(result.text).toBe('Ponuda je na 1.200 €.');
    const [convo, tools] = chat.mock.calls[0];
    expect(tools).toEqual([]);
    expect(convo[0].content).toContain('ne podržava pozivanje alata');
    // Kontekst odjela/kategorija ostaje — model i dalje objašnjava ponude.
    expect(convo[0].content).toContain('Odjeli:');
  });

  test('provider koji javlja supportsTools: true dobiva alate kao i prije', async () => {
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({ text: 'Bok!', tool_calls: null });
    getActiveProvider.mockResolvedValue({
      chat,
      getCapabilities: jest.fn().mockResolvedValue({ model: 'gemma4:12b', supportsTools: true }),
    });

    await runAssistantChat({ messages: [{ role: 'user', content: 'Bok' }], userId: 2 });

    const [convo, tools] = chat.mock.calls[0];
    expect(tools.map((t) => t.name).sort()).toEqual(['create_request', 'propose_request']);
    expect(convo[0].content).not.toContain('ne podržava pozivanje alata');
  });

  test('provider bez getCapabilities() ponaša se kao prije toggle-a (alati se šalju)', async () => {
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({ text: 'Bok!', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    await runAssistantChat({ messages: [{ role: 'user', content: 'Bok' }], userId: 2 });

    expect(chat.mock.calls[0][1]).toHaveLength(2);
  });
});

describe('runAssistantChat — usage (token brojanje za RQ1/RQ2 eval harness)', () => {
  test('jedan poziv modelu — usage se izravno vraća', async () => {
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({
      text: 'Bok!',
      tool_calls: null,
      usage: { promptTokens: 100, completionTokens: 20 },
    });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({ messages: [{ role: 'user', content: 'Bok' }], userId: 2 });

    expect(result.usage).toMatchObject({ promptTokens: 100, completionTokens: 20 });
    // Uz tokene se broji i koliko je puta model pozvan te koliko je vremena
    // provedeno U MODELU (evalHarness.js: model_calls / model_latency_ms).
    expect(result.usage.modelCalls).toBe(1);
  });

  test('VIŠE poziva modelu u istom potezu (propose_request pa nastavak) — usage se ZBRAJA, ne prepisuje', async () => {
    mockReferenceContext();
    proposeRequest.mockResolvedValue({
      fk_fiscal_year: 1, fk_department: 3, items: VALID_ARGS.items,
    });

    const chat = jest.fn()
      .mockResolvedValueOnce({ ...proposeCallMessage(VALID_ARGS), usage: { promptTokens: 200, completionTokens: 30 } })
      .mockResolvedValueOnce({ text: 'Potvrđujete li?', tool_calls: null, usage: { promptTokens: 250, completionTokens: 15 } });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo ponude.' }],
      userId: 2,
      attachments: [{ filename: 'ponuda.pdf', kind: 'pdf', text: 'Toner x5' }],
    });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.usage).toMatchObject({ promptTokens: 450, completionTokens: 45 });
    expect(result.usage.modelCalls).toBe(2); // propose pa nastavak
  });

  test('provider ne vrati usage (npr. star mock/greška providera) — tretira se kao 0, ne baca grešku', async () => {
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({ text: 'ok', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({ messages: [{ role: 'user', content: 'Bok' }], userId: 2 });

    expect(result.usage).toMatchObject({ promptTokens: 0, completionTokens: 0, modelLatencyMs: 0 });
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
      attachments: [],
    });

    expect(result).toMatchObject({
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

describe('runAssistantChat — priložena ponuda (attachments, PDF)', () => {
  const QUOTE_TEXT = 'Mikrotron d.o.o.\nStavka: Grove EMG Detector kit, Količina 1, Ukupno 49,00 €';
  const QUOTE_ATTACHMENT = { filename: 'ponuda.pdf', kind: 'pdf', text: QUOTE_TEXT };

  test('attachments se ubrizgavaju kao dodatna system poruka prije korisnikovih poruka', async () => {
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({ text: 'Evo sažetka ponude...', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo ponude, napravi zahtjev.' }],
      userId: 2,
      attachments: [QUOTE_ATTACHMENT],
    });

    const sentMessages = chat.mock.calls[0][0];
    expect(sentMessages[0].role).toBe('system'); // referentni kontekst (odjeli/kategorije)
    expect(sentMessages[1].role).toBe('system'); // uputa o ponudi
    expect(sentMessages[1].content).toContain(QUOTE_TEXT);
    // Pravilo 9: propose_request prije create_request + izričita potvrda.
    expect(sentMessages[1].content).toMatch(/pozovi propose_request \(NE create_request\)/);
    expect(sentMessages[1].content).toMatch(/izričito pitaj za potvrdu/);
    expect(sentMessages[2]).toEqual({ role: 'user', content: 'Evo ponude, napravi zahtjev.' });
  });

  test('bez attachments nema dodatne system poruke o ponudi', async () => {
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({ text: 'Bok!', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    await runAssistantChat({ messages: [{ role: 'user', content: 'Bok' }], userId: 2 });

    const sentMessages = chat.mock.calls[0][0];
    expect(sentMessages.filter((m) => m.role === 'system')).toHaveLength(1);
  });

  test('bez korisnikove potvrde model ne zove tool — samo predlaže sažetak', async () => {
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({
      text: 'Predlažem zahtjev: Informatička služba, 1x Grove EMG Detector kit, iznos 49,00 €. Potvrđujete li kreiranje?',
      tool_calls: null,
    });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo ponude, napravi zahtjev.' }],
      userId: 2,
      attachments: [QUOTE_ATTACHMENT],
    });

    expect(createRequest).not.toHaveBeenCalled();
    expect(result.created_request).toBeNull();
    expect(result.text).toMatch(/Potvrđujete li/);
  });

  test('nakon korisnikove potvrde (sljedeći poziv) model zove tool s podacima iz ponude', async () => {
    mockReferenceContext();
    createRequest.mockResolvedValue({
      id_purchase_request: 55,
      request_number: 'NAB-2026-0055',
      fk_request_status: 1,
    });

    const quoteDerivedArgs = {
      fk_fiscal_year: 1,
      fk_department: 3,
      justification: 'Nabava opreme prema ponudi Mikrotron d.o.o.',
      estimated_amount: 49.0,
      comment: 'Ponuda dobavljača Mikrotron d.o.o.',
      items: [{ fk_item_category: 7, item_name: 'Grove EMG Detector kit', quantity: 1 }],
    };

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(quoteDerivedArgs))
      .mockResolvedValueOnce({ text: 'Zahtjev NAB-2026-0055 je kreiran.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    // Ova poruka simulira DRUGI HTTP poziv (klijent šalje punu povijest uklj.
    // agentov prijedlog i korisnikovu potvrdu) — attachments se više ne šalje,
    // sažetak je već u povijesti razgovora.
    const result = await runAssistantChat({
      messages: [
        { role: 'user', content: 'Evo ponude, napravi zahtjev.' },
        { role: 'assistant', content: 'Predlažem zahtjev: ... Potvrđujete li kreiranje?' },
        { role: 'user', content: 'Da, potvrđujem.' },
      ],
      userId: 2,
    });

    expect(createRequest).toHaveBeenCalledWith({ ...quoteDerivedArgs, userId: 2, attachments: [] });
    expect(result.created_request).toEqual({
      id_purchase_request: 55, request_number: 'NAB-2026-0055', fk_request_status: 1,
    });
  });
});

describe('runAssistantChat — model ne vrati ni tekst ni tool_call', () => {
  test('generacija prekinuta prije završetka (npr. done_reason "length") vraća jasnu poruku, ne prazan tekst', async () => {
    // Stvarno opaženo ponašanje gemma4:12b uz duži kontekst (ponuda + opsežan
    // "thinking" izlaz) — provider vrati ni text ni tool_calls.
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({ text: null, tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({ messages: [{ role: 'user', content: 'test' }], userId: 2 });

    expect(result.text).not.toBe('');
    expect(result.text.length).toBeGreaterThan(0);
    expect(createRequest).not.toHaveBeenCalled();
  });
});

// Sigurnosna mreža protiv LAŽNE potvrde kreiranja (guardFalseCreationClaim).
// Stvarno opaženo: gemma4:e4b, eval run 2026-08-31, scenarij 2 — nijedan alat
// nije pozvan, a model je javio "Vaš zahtjev za nabavu je uspješno kreiran.
// Vaš broj zahtjeva je **N/A**." Strukturna brava to ne hvata jer poziva nije
// ni bilo — samo rečenica.
// Rani izlaz kad je modelu rečeno da čeka potvrdu (awaitingUserConfirmation).
// Eval run 2026-08-31: scenariji 1 i 9 pali su jer je model nakon odbijenog
// create_request isti poziv ponavljao dok nije potrošio MAX_ITERATIONS —
// potez je završio bez odgovora, a model je zatim izmislio potvrdu.
describe('runAssistantChat — potez staje čim se čeka korisnikova potvrda', () => {
  const PROPOSAL_X = {
    fk_fiscal_year: 1, year: 2026, fk_department: 3, department_name: 'Računovodstvo',
    justification: 'Zalihe pri kraju.', estimated_amount: null, comment: null,
    items: [{ fk_item_category: 7, category_name: 'Uredski pribor', item_name: 'Toner za pisač', quantity: 5 }],
  };

  test('nakon propose+create u istom potezu model dobiva TOČNO jedan poziv za tekst, pa se staje', async () => {
    mockReferenceContext();
    proposeRequest.mockResolvedValue(PROPOSAL_X);

    // Model tvrdoglavo zove create_request; da nema ranog izlaza, petlja bi
    // ga puštala do MAX_ITERATIONS.
    const chat = jest.fn()
      .mockResolvedValueOnce(proposeCallMessage(VALID_ARGS, 'p1'))
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'c1'))
      .mockResolvedValue({ text: 'Evo prijedloga, potvrđujete li?', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo ponude, kreiraj.' }],
      userId: 2,
      attachments: [{ filename: 'ponuda.pdf', kind: 'pdf', text: 'Toner x5' }],
    });

    // 3 poziva: propose, create (odbijen), zaključni tekst. Ni jedan više.
    expect(chat).toHaveBeenCalledTimes(3);
    expect(createRequest).not.toHaveBeenCalled();
    expect(result.created_request).toBeNull();
    expect(result.text).toMatch(/potvrđujete/i);
  });

  test('zaključni poziv koji opet vraća tool_call ne produžuje potez', async () => {
    mockReferenceContext();
    proposeRequest.mockResolvedValue(PROPOSAL_X);

    // Model i u zaključnom pozivu pokušava alat — namjerno se ignorira.
    const chat = jest.fn()
      .mockResolvedValueOnce(proposeCallMessage(VALID_ARGS, 'p1'))
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'c1'))
      .mockResolvedValue(toolCallMessage(VALID_ARGS, 'c2'));
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo ponude, kreiraj.' }],
      userId: 2,
      attachments: [{ filename: 'ponuda.pdf', kind: 'pdf', text: 'Toner x5' }],
    });

    expect(chat).toHaveBeenCalledTimes(3);
    expect(createRequest).not.toHaveBeenCalled(); // KLJUČNO — ništa u bazu
    expect(result.created_request).toBeNull();
    expect(result.text).toMatch(/Potvrdite kreiranje|nisam uspio sažeti/i);
  });

  test('pretvoreni prijedlog (create bez propose) također zaustavlja potez', async () => {
    mockReferenceContext();
    proposeRequest.mockResolvedValue(PROPOSAL_X);

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'c1'))
      .mockResolvedValue({ text: 'Evo prijedloga, potvrđujete?', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo ponude, kreiraj.' }],
      userId: 2,
      attachments: [{ filename: 'ponuda.pdf', kind: 'pdf', text: 'Toner x5' }],
    });

    // 2 poziva: create (pretvoren u prijedlog) + zaključni tekst.
    expect(chat).toHaveBeenCalledTimes(2);
    expect(createRequest).not.toHaveBeenCalled();
    expect(result.created_request).toBeNull();
  });

  // Normalan tijek se NE smije skratiti: propose pa tekst, bez ranog izlaza.
  test('uredan propose bez create_request ne aktivira rani izlaz', async () => {
    mockReferenceContext();
    proposeRequest.mockResolvedValue(PROPOSAL_X);

    const chat = jest.fn()
      .mockResolvedValueOnce(proposeCallMessage(VALID_ARGS, 'p1'))
      .mockResolvedValueOnce({ text: 'Evo sažetka. Potvrđujete li?', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo ponude.' }],
      userId: 2,
      attachments: [{ filename: 'ponuda.pdf', kind: 'pdf', text: 'Toner x5' }],
    });

    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.text).toBe('Evo sažetka. Potvrđujete li?');
  });
});

describe('runAssistantChat — zaštita od lažne tvrdnje o kreiranju', () => {
  const lazneTvrdnje = [
    'Vaš zahtjev za nabavu je uspješno kreiran. Vaš broj zahtjeva je **N/A**.',
    'Zahtjev je kreiran.',
    'Uspješno sam kreirao zahtjev za vas.',
    'Broj vašeg zahtjeva je NAB-2026-9999.',
  ];

  test.each(lazneTvrdnje)('zamjenjuje lažnu tvrdnju: %s', async (tekst) => {
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({ text: tekst, tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await runAssistantChat({ messages: [{ role: 'user', content: 'Kreiraj.' }], userId: 2 });

    expect(result.created_request).toBeNull();
    expect(result.text).toMatch(/NIJE kreiran/);
    expect(result.text).not.toMatch(/N\/A|NAB-2026-9999/);
    warn.mockRestore();
  });

  // Najave i pitanja su legitimni — zaštita ih NE SMIJE dirati, inače bi
  // pokvarila normalan tijek u kojem model traži potvrdu prije kreiranja.
  const legitimni = [
    'Kreirat ću zahtjev čim potvrdite podatke.',
    'Mogu kreirati zahtjev za vas — želite li da nastavim?',
    'Prije nego kreiram zahtjev, trebam znati odjel.',
    'Želite li da kreiram zahtjev s ovim stavkama?',
  ];

  test.each(legitimni)('ne dira legitiman odgovor: %s', async (tekst) => {
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({ text: tekst, tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({ messages: [{ role: 'user', content: 'Trebam nešto.' }], userId: 2 });

    expect(result.text).toBe(tekst);
  });

  test('NE dira tvrdnju kad je zahtjev STVARNO kreiran', async () => {
    mockReferenceContext();
    createRequest.mockResolvedValue({ id_purchase_request: 7, request_number: 'NAB-2026-007', fk_request_status: 1 });
    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'c1'))
      .mockResolvedValueOnce({ text: 'Zahtjev je uspješno kreiran. Broj vašeg zahtjeva je NAB-2026-007.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({ messages: [{ role: 'user', content: 'Kreiraj.' }], userId: 2 });

    expect(result.created_request).toMatchObject({ request_number: 'NAB-2026-007' });
    expect(result.text).toMatch(/NAB-2026-007/);
    expect(result.text).not.toMatch(/NIJE kreiran/);
  });
});

describe('runAssistantChat — strukturna dvofazna potvrda (propose_request -> create_request)', () => {
  const PROPOSAL = {
    fk_fiscal_year: 1,
    year: 2026,
    fk_department: 3,
    department_name: 'Računovodstvo',
    justification: 'Zalihe pri kraju.',
    estimated_amount: null,
    comment: null,
    items: [{ fk_item_category: 7, category_name: 'Uredski pribor', item_name: 'Toner za pisač', quantity: 5 }],
  };

  test('propose_request vraća sažetak i NE piše u bazu (createRequest se ne zove)', async () => {
    mockReferenceContext();
    proposeRequest.mockResolvedValue(PROPOSAL);

    const chat = jest.fn()
      .mockResolvedValueOnce(proposeCallMessage(VALID_ARGS))
      .mockResolvedValueOnce({ text: 'Evo sažetka... Potvrđujete li kreiranje?', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo ponude.' }],
      userId: 2,
      attachments: [{ filename: 'ponuda.pdf', kind: 'pdf', text: 'Toner za pisač x5' }],
    });

    expect(proposeRequest).toHaveBeenCalledWith({
      fk_fiscal_year: VALID_ARGS.fk_fiscal_year,
      fk_department: VALID_ARGS.fk_department,
      justification: VALID_ARGS.justification,
      estimated_amount: undefined,
      comment: undefined,
      items: VALID_ARGS.items,
    });
    expect(createRequest).not.toHaveBeenCalled();
    expect(result.created_request).toBeNull();
    expect(result.text).toMatch(/Potvrđujete li/);
  });

  // Model koji PRESKAČE propose_request (stvarno opaženo kod qwen3.5:9b —
  // eval run 2026-08-31, scenarij 1: pokušaj 1 zvao create_request izravno).
  // Prije popravka brava je takav poziv golo odbijala, model bi prijedlog
  // prepričao u prozi, a proza nije tool rezultat — sljedeći potez opet nije
  // imao poklapajući prijedlog i razgovor se vrtio u krug bez ijednog
  // kreiranog zahtjeva. Sad se poziv PRETVARA u prijedlog.
  test('(a0) create_request bez ranijeg propose_request → pretvoren u prijedlog, ništa u bazu', async () => {
    mockReferenceContext();
    proposeRequest.mockResolvedValue(PROPOSAL);

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'create_1'))
      .mockResolvedValueOnce({ text: 'Evo prijedloga, potvrđujete?', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo ponude, kreiraj zahtjev.' }],
      userId: 2,
      attachments: [{ filename: 'ponuda.pdf', kind: 'pdf', text: 'Toner za pisač x5' }],
    });

    // Validacija je odrađena, ali NIŠTA nije zapisano.
    expect(proposeRequest).toHaveBeenCalledTimes(1);
    expect(createRequest).not.toHaveBeenCalled();
    expect(result.created_request).toBeNull();

    // Model je dobio strukturiran prijedlog (ne samo tekst greške) i uputu.
    const toolMsg = result.tool_trace.find((m) => m.role === 'tool' && m.name === 'create_request');
    const payload = JSON.parse(toolMsg.content);
    expect(payload.ok).toBe(false);
    expect(payload.awaiting_confirmation).toBe(true);
    expect(payload.proposal).toEqual(PROPOSAL);
  });

  test('(a1) pretvoreni prijedlog iz RANIJEG poteza vrijedi kao potvrda → create_request prolazi', async () => {
    mockReferenceContext();
    createRequest.mockResolvedValue({ id_purchase_request: 42, request_number: 'NAB-2026-042', fk_request_status: 1 });

    // Povijest koju klijent vraća: pretvoreni prijedlog iz prošlog poteza.
    const convertedProposalMsg = {
      role: 'tool',
      tool_call_id: 'create_prev',
      name: 'create_request',
      content: JSON.stringify({ ok: false, awaiting_confirmation: true, proposal: PROPOSAL }),
    };

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'create_2'))
      .mockResolvedValueOnce({ text: 'Zahtjev NAB-2026-042 je kreiran.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({
      messages: [
        { role: 'system', content: `${QUOTE_MARKER}\nPonuda...` },
        { role: 'user', content: 'Evo ponude.' },
        convertedProposalMsg,
        { role: 'assistant', content: 'Evo prijedloga, potvrđujete?' },
        { role: 'user', content: 'Da, potvrđujem.' },
      ],
      userId: 2,
      attachments: [],
    });

    expect(createRequest).toHaveBeenCalledTimes(1);
    expect(result.created_request).toMatchObject({ request_number: 'NAB-2026-042' });
  });

  // Najvažnije jamstvo: pretvorba NE smije otvoriti vrata kreiranju unutar
  // istog HTTP poziva — potvrda mora doći kao NOVA korisnikova poruka.
  test('(a2) pretvoreni prijedlog NE vrijedi kao potvrda u ISTOM potezu', async () => {
    mockReferenceContext();
    proposeRequest.mockResolvedValue(PROPOSAL);

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'create_a'))
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'create_b')) // odmah opet, bez nove poruke
      .mockResolvedValueOnce({ text: 'Pričekat ću vašu potvrdu.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo ponude, kreiraj odmah.' }],
      userId: 2,
      attachments: [{ filename: 'ponuda.pdf', kind: 'pdf', text: 'Toner za pisač x5' }],
    });

    expect(createRequest).not.toHaveBeenCalled(); // KLJUČNO — ništa u bazi
    expect(result.created_request).toBeNull();
  });

  test('(a) create_request odmah nakon propose_request U ISTOM requestu → odbijen, ništa se ne piše u bazu', async () => {
    mockReferenceContext();
    proposeRequest.mockResolvedValue(PROPOSAL);

    const chat = jest.fn()
      .mockResolvedValueOnce(proposeCallMessage(VALID_ARGS, 'propose_1'))
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'create_1')) // model "preskače" čekanje potvrde
      .mockResolvedValueOnce({ text: 'U redu, pričekat ću vašu potvrdu.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo ponude, kreiraj odmah.' }],
      userId: 2,
      attachments: [{ filename: 'ponuda.pdf', kind: 'pdf', text: 'Toner za pisač x5' }],
    });

    expect(proposeRequest).toHaveBeenCalledTimes(1);
    expect(createRequest).not.toHaveBeenCalled(); // KLJUČNA provjera — ništa u bazi
    expect(result.created_request).toBeNull();

    // model je dobio jasnu grešku, ne HTTP error korisniku
    const thirdCallMessages = chat.mock.calls[2][0];
    const rejection = thirdCallMessages.find((m) => m.tool_call_id === 'create_1');
    const parsed = JSON.parse(rejection.content);
    expect(parsed.ok).toBe(false);
    // Poruka više ne traži propose_request (model ga je upravo pozvao) nego
    // izričito čekanje korisnikove potvrde u novoj poruci.
    expect(parsed.message).toMatch(/Pričekaj izričitu potvrdu/);
    expect(parsed.awaiting_confirmation).toBeUndefined(); // nije pretvorba, prijedlog već postoji
  });

  test('(b) create_request u NOVOM requestu nakon ranijeg propose_request s korisnikovom potvrdom → uspijeva', async () => {
    mockReferenceContext();
    createRequest.mockResolvedValue({
      id_purchase_request: 60,
      request_number: 'NAB-2026-0060',
      fk_request_status: 1,
    });

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'create_2'))
      .mockResolvedValueOnce({ text: 'Zahtjev NAB-2026-0060 je kreiran.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    // Ovo simulira DRUGI HTTP poziv: klijent je poslušno dodao tool_trace iz
    // prvog odgovora (system marker + propose tool_call/rezultat + sažetak) u
    // svoju povijest, pa ih sad vraća zajedno s korisnikovom potvrdom.
    const result = await runAssistantChat({
      messages: [
        { role: 'system', content: `${QUOTE_MARKER}\nKorisnik je priložio ponudu...` },
        { role: 'user', content: 'Evo ponude.' },
        { role: 'assistant', content: '', tool_calls: [{ id: 'propose_1', name: 'propose_request', arguments: VALID_ARGS }] },
        priorProposalToolMessage(PROPOSAL, 'propose_1'),
        { role: 'assistant', content: 'Evo sažetka... Potvrđujete li kreiranje?' },
        { role: 'user', content: 'Da, potvrđujem.' },
      ],
      userId: 2,
      // attachments je prazan — datoteka se ne šalje ponovno.
    });

    expect(createRequest).toHaveBeenCalledWith({ ...VALID_ARGS, estimated_amount: undefined, comment: undefined, userId: 2, attachments: [] });
    expect(result.created_request).toEqual({
      id_purchase_request: 60, request_number: 'NAB-2026-0060', fk_request_status: 1,
    });
  });

  test('create_request izravno (bez ikakvog propose_request) u attachment-razgovoru → odbijen', async () => {
    mockReferenceContext();

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS))
      .mockResolvedValueOnce({ text: 'U redu, prvo ću provjeriti prijedlog.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo ponude, kreiraj odmah bez pitanja.' }],
      userId: 2,
      attachments: [{ filename: 'ponuda.pdf', kind: 'pdf', text: 'Toner za pisač x5' }],
    });

    // KLJUČNO i nepromijenjeno: ništa se ne piše u bazu.
    expect(createRequest).not.toHaveBeenCalled();
    // PROMIJENJENO (popravak deadlocka kod modela koji preskaču propose_request):
    // poziv se više ne odbija golo nego se PRETVARA u prijedlog — proposeRequest
    // se zato zove, ali samo radi validacije i sažetka, bez upisa. Detaljna
    // provjera payloada je u testu (a0) gore.
    expect(proposeRequest).toHaveBeenCalledTimes(1);
  });

  test('create_request odbijen kad se raniji propose_request odnosi na DRUGAČIJE podatke (drugi odjel)', async () => {
    mockReferenceContext();
    const differentDeptProposal = { ...PROPOSAL, fk_department: 99, department_name: 'Neki drugi odjel' };
    const argsForDifferentDept = { ...VALID_ARGS, fk_department: 99 };

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'create_3')) // pokušava za fk_department=3
      .mockResolvedValueOnce({ text: 'Trebam prvo predložiti ovaj novi odjel.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    await runAssistantChat({
      messages: [
        { role: 'system', content: `${QUOTE_MARKER}\n...` },
        { role: 'user', content: 'Evo ponude.' },
        priorProposalToolMessage(differentDeptProposal, 'propose_x'), // prijedlog je bio za fk_department=99, ne 3
        { role: 'user', content: 'Da, potvrđujem.' },
      ],
      userId: 2,
    });

    expect(createRequest).not.toHaveBeenCalled();
    void argsForDifferentDept; // referenca radi jasnoće scenarija u opisu testa
  });

  test('bez priloga (scenarij bez ponude) create_request se i dalje zove izravno, bez propose_request', async () => {
    mockReferenceContext();
    createRequest.mockResolvedValue({
      id_purchase_request: 61,
      request_number: 'NAB-2026-0061',
      fk_request_status: 1,
    });

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS))
      .mockResolvedValueOnce({ text: 'Zahtjev NAB-2026-0061 je kreiran.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({
      messages: [{ role: 'user', content: '5 tonera, Računovodstvo, zalihe pri kraju.' }],
      userId: 2,
      // nema attachments, nema ranijeg propose_request u povijesti
    });

    expect(proposeRequest).not.toHaveBeenCalled();
    expect(createRequest).toHaveBeenCalledTimes(1);
    expect(result.created_request).toEqual({
      id_purchase_request: 61, request_number: 'NAB-2026-0061', fk_request_status: 1,
    });
  });

  test('tool_trace sadrži quote-marker system poruku i propose/create razmjene za replay u sljedećem zahtjevu', async () => {
    mockReferenceContext();
    proposeRequest.mockResolvedValue(PROPOSAL);

    const chat = jest.fn()
      .mockResolvedValueOnce(proposeCallMessage(VALID_ARGS))
      .mockResolvedValueOnce({ text: 'Potvrđujete li kreiranje?', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo ponude.' }],
      userId: 2,
      attachments: [{ filename: 'ponuda.pdf', kind: 'pdf', text: 'Toner za pisač x5' }],
    });

    expect(result.tool_trace[0]).toEqual({ role: 'system', content: expect.stringContaining(QUOTE_MARKER) });
    expect(result.tool_trace.some((m) => m.role === 'assistant' && m.tool_calls?.[0]?.name === 'propose_request')).toBe(true);
    expect(result.tool_trace.some((m) => m.role === 'tool' && m.name === 'propose_request')).toBe(true);
  });
});

describe('runAssistantChat — slika ponude (vision, bez server-side OCR-a)', () => {
  const QUOTE_IMAGE = { mimeType: 'image/png', base64: 'ZmFrZS1wbmctYnl0ZXM=' };
  const QUOTE_IMAGE_ATTACHMENT = { filename: 'ponuda.png', kind: 'image', mimeType: QUOTE_IMAGE.mimeType, base64: QUOTE_IMAGE.base64 };
  const PROPOSAL_FOR_MATCH = {
    fk_fiscal_year: VALID_ARGS.fk_fiscal_year,
    fk_department: VALID_ARGS.fk_department,
    items: VALID_ARGS.items,
  };

  test('slika se šalje providerovom chat() na POSLJEDNJOJ user poruci, ne kao zaseban tekst', async () => {
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({ text: 'Vidim ponudu na slici...', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo slike ponude, molim predloži zahtjev.' }],
      userId: 2,
      attachments: [QUOTE_IMAGE_ATTACHMENT],
    });

    const sentMessages = chat.mock.calls[0][0];
    const userMsg = sentMessages.find((m) => m.role === 'user');
    expect(userMsg).toEqual({
      role: 'user',
      content: 'Evo slike ponude, molim predloži zahtjev.',
      images: [{ mimeType: QUOTE_IMAGE.mimeType, data: QUOTE_IMAGE.base64 }],
    });
    // Nema teksta ekstrahiranog za sliku, samo marker+upute
    const quoteSystemMsg = sentMessages.find((m) => m.role === 'system' && m.content.includes(QUOTE_MARKER));
    expect(quoteSystemMsg.content).not.toContain('"""'); // PDF-varijanta uvijek embeda tekst unutar """ bloka
  });

  test('ne mutira ulazni messages niz koji poziva runAssistantChat (kloniranje, ne mutacija)', async () => {
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({ text: 'ok', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const originalMessages = [{ role: 'user', content: 'Evo slike ponude.' }];
    await runAssistantChat({ messages: originalMessages, userId: 2, attachments: [QUOTE_IMAGE_ATTACHMENT] });

    expect(originalMessages[0]).toEqual({ role: 'user', content: 'Evo slike ponude.' });
    expect(originalMessages[0].images).toBeUndefined();
  });

  test('slika broji kao attachment za strukturnu bravu — propose_request obavezan prije create_request', async () => {
    mockReferenceContext();

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS)) // pokušava izravno create_request
      .mockResolvedValueOnce({ text: 'Prvo ću provjeriti prijedlog.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo slike, kreiraj odmah.' }],
      userId: 2,
      attachments: [QUOTE_IMAGE_ATTACHMENT],
    });

    expect(createRequest).not.toHaveBeenCalled();
  });

  test('QUOTE_MARKER iz slike-prilog poruke prepoznat u idućem zahtjevu (bez ponovnog slanja slike)', async () => {
    mockReferenceContext();
    createRequest.mockResolvedValue({ id_purchase_request: 70, request_number: 'NAB-2026-0070', fk_request_status: 1 });

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'create_img'))
      .mockResolvedValueOnce({ text: 'Zahtjev NAB-2026-0070 je kreiran.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    // Drugi HTTP poziv: klijent je vratio quote-marker system poruku (iz
    // tool_trace prvog odgovora) i raniji propose_request rezultat, ali BEZ
    // attachments — slika se ne šalje ponovno.
    const result = await runAssistantChat({
      messages: [
        { role: 'system', content: `${QUOTE_MARKER}\nKorisnik je priložio SLIKU ponude...` },
        { role: 'user', content: 'Evo slike ponude.' },
        priorProposalToolMessage(PROPOSAL_FOR_MATCH, 'propose_img'),
        { role: 'user', content: 'Da, potvrđujem.' },
      ],
      userId: 2,
      // attachments: [] (default) — nije ponovno priložena
    });

    expect(createRequest).toHaveBeenCalledWith({ ...VALID_ARGS, estimated_amount: undefined, comment: undefined, userId: 2, attachments: [] });
    expect(result.created_request).toEqual({ id_purchase_request: 70, request_number: 'NAB-2026-0070', fk_request_status: 1 });
  });
});

describe('runAssistantChat — VIŠE priloženih ponuda (usporedba dobavljača)', () => {
  const QUOTE_A = { filename: 'ponuda-a.pdf', kind: 'pdf', text: 'Dobavljač A: 5x laptop, 800 EUR/kom' };
  const QUOTE_B = { filename: 'ponuda-b.pdf', kind: 'pdf', text: 'Dobavljač B: 5x laptop, 750 EUR/kom' };

  test('jedan prilog dobiva neoznačenu labelu "Ponuda (dokument: ...)", bez rednog broja', async () => {
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({ text: 'ok', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo ponude.' }],
      userId: 2,
      attachments: [QUOTE_A],
    });

    const quoteSystemMsg = chat.mock.calls[0][0].find((m) => m.role === 'system' && m.content.includes(QUOTE_MARKER));
    expect(quoteSystemMsg.content).toContain('Ponuda (dokument: ponuda-a.pdf)');
    expect(quoteSystemMsg.content).not.toMatch(/Ponuda \d/);
  });

  test('dva PDF priloga dobivaju redom označene labele "Ponuda 1"/"Ponuda 2" sa svojim sadržajem', async () => {
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({ text: 'ok', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo dvije ponude za usporedbu.' }],
      userId: 2,
      attachments: [QUOTE_A, QUOTE_B],
    });

    const quoteSystemMsg = chat.mock.calls[0][0].find((m) => m.role === 'system' && m.content.includes(QUOTE_MARKER));
    expect(quoteSystemMsg.content).toContain('Ponuda 1 (dokument: ponuda-a.pdf)');
    expect(quoteSystemMsg.content).toContain(QUOTE_A.text);
    expect(quoteSystemMsg.content).toContain('Ponuda 2 (dokument: ponuda-b.pdf)');
    expect(quoteSystemMsg.content).toContain(QUOTE_B.text);
  });

  test('uputa o više ponuda (svaka pridonosi svojim stavkama, zbroji ukupno, NE pitati korisnika) prisutna je čim ima 2+ priloga', async () => {
    // Namjerna promjena dizajna (bila suprotna ranije: pitati korisnika kod
    // preklapajućih stavki) — korisnik eksplicitno potvrdio da svaka ponuda
    // pridonosi zahtjevu svojim vlastitim stavkama, čak i kad se artikl na
    // dvije ponude zove isto (npr. "laptop" na obje) — ne spaja se u jedan
    // redak niti se pita korisnika, iznos se jednostavno zbraja.
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({ text: 'ok', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo dvije ponude za usporedbu.' }],
      userId: 2,
      attachments: [QUOTE_A, QUOTE_B],
    });

    const quoteSystemMsg = chat.mock.calls[0][0].find((m) => m.role === 'system' && m.content.includes(QUOTE_MARKER));
    // Pravilo 3: svaka ponuda daje svoje stavke, bez spajanja i bez pitanja.
    expect(quoteSystemMsg.content).toMatch(/Ne\s+preskači, ne spajaj i NE pitaj korisnika koju ponudu odabrati/);
    expect(quoteSystemMsg.content).toMatch(/Ukupan iznos = zbroj svih ponuda/);
  });

  test('strukturna brava (propose prije create) i dalje vrijedi kad razgovor uključuje VIŠE priloga', async () => {
    mockReferenceContext();

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS)) // pokušava izravno create_request
      .mockResolvedValueOnce({ text: 'Prvo ću provjeriti prijedlog.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo dvije ponude, kreiraj odmah.' }],
      userId: 2,
      attachments: [QUOTE_A, QUOTE_B],
    });

    expect(createRequest).not.toHaveBeenCalled();
  });

  test('više slikovnih priloga šalje se kao niz {mimeType, data} na posljednjoj user poruci, redoslijedom', async () => {
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({ text: 'ok', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const imageA = { filename: 'a.png', kind: 'image', mimeType: 'image/png', base64: 'cG5nLWJ5dGVz' };
    const imageB = { filename: 'b.jpg', kind: 'image', mimeType: 'image/jpeg', base64: 'anBnLWJ5dGVz' };

    await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo dvije slike ponuda.' }],
      userId: 2,
      attachments: [imageA, imageB],
    });

    const userMsg = chat.mock.calls[0][0].find((m) => m.role === 'user');
    expect(userMsg.images).toEqual([
      { mimeType: 'image/png', data: 'cG5nLWJ5dGVz' },
      { mimeType: 'image/jpeg', data: 'anBnLWJ5dGVz' },
    ]);
  });

  test('mješoviti prilozi (PDF + slika) — oba se označe u uputi, samo slika ide u images na user poruci', async () => {
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({ text: 'ok', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const image = { filename: 'ponuda-c.png', kind: 'image', mimeType: 'image/png', base64: 'cG5nLWJ5dGVz' };

    await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo ponude u PDF-u i jedne na slici.' }],
      userId: 2,
      attachments: [QUOTE_A, image],
    });

    const sentMessages = chat.mock.calls[0][0];
    const quoteSystemMsg = sentMessages.find((m) => m.role === 'system' && m.content.includes(QUOTE_MARKER));
    expect(quoteSystemMsg.content).toContain('Ponuda 1 (dokument: ponuda-a.pdf)');
    expect(quoteSystemMsg.content).toContain('Ponuda 2 (dokument: ponuda-c.png)');

    const userMsg = sentMessages.find((m) => m.role === 'user');
    expect(userMsg.images).toEqual([{ mimeType: 'image/png', data: 'cG5nLWJ5dGVz' }]);
  });
});

describe('runAssistantChat — formalni prilog uz zahtjev pri create_request (docs/AI.md)', () => {
  // Mora se poklapati s ATTACHMENT_DATA_MARKER u assistantOrchestrator.js.
  const ATTACHMENT_DATA_MARKER = '[ai-asistent:prilog-podaci]';
  const QUOTE_ATTACHMENT = { filename: 'ponuda.pdf', kind: 'pdf', text: 'Toner x5', mimeType: 'application/pdf', base64: Buffer.from('%PDF-1.4 ponuda').toString('base64') };
  const PROPOSAL_FOR_MATCH = { fk_fiscal_year: VALID_ARGS.fk_fiscal_year, fk_department: VALID_ARGS.fk_department, items: VALID_ARGS.items };

  /** Povijest kakvu klijent vrati u POTVRDNOM potezu, s carrier porukom iz prvog poteza. */
  const historyWithCarrier = (carrierMessage) => [
    { role: 'system', content: `${QUOTE_MARKER}\n...` },
    carrierMessage,
    { role: 'user', content: 'Evo ponude.' },
    priorProposalToolMessage(PROPOSAL_FOR_MATCH, 'propose_1'),
    { role: 'user', content: 'Da, potvrđujem.' },
  ];

  /** Odradi prvi potez (upload) i vrati carrier poruku koju bi klijent echoedao. */
  async function uploadTurn(userId = 2, attachments = [QUOTE_ATTACHMENT]) {
    mockReferenceContext();
    getActiveProvider.mockResolvedValue({ chat: jest.fn().mockResolvedValue({ text: 'Evo sažetka...', tool_calls: null }) });
    const result = await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo ponude.' }],
      userId,
      attachments,
    });
    return result.tool_trace.find((m) => m.role === 'system' && m.content.startsWith(ATTACHMENT_DATA_MARKER));
  }

  beforeEach(() => {
    resetAttachmentStore();
  });

  test('prvi potez (upload) — carrier nosi SAMO referencu (bez base64) i NIKAD ne ide modelu', async () => {
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({ text: 'Evo sažetka...', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo ponude.' }],
      userId: 2,
      attachments: [QUOTE_ATTACHMENT],
    });

    const carrierInTrace = result.tool_trace.find((m) => m.role === 'system' && m.content.startsWith(ATTACHMENT_DATA_MARKER));
    expect(carrierInTrace).toBeDefined();

    // Bajtovi ostaju server-side — kroz klijenta putuje samo neprozirni ID
    // (inače bi 5 priloga x 5 MB = ~33 MB base64 probijalo express.json limit
    // u svakom sljedećem potezu razgovora).
    const payload = carrierInTrace.content.slice(ATTACHMENT_DATA_MARKER.length);
    expect(payload).not.toContain(QUOTE_ATTACHMENT.base64);
    expect(payload).toMatch(/^[0-9a-f-]{36}$/);

    const sentToModel = chat.mock.calls[0][0];
    expect(sentToModel.some((m) => typeof m.content === 'string' && m.content.startsWith(ATTACHMENT_DATA_MARKER))).toBe(false);
  });

  test('create_request u KASNIJEM potezu (bez ponovnog uploada) — prilog se sprema iz server-side spremišta, po ID-u iz carrier poruke', async () => {
    const carrier = await uploadTurn();

    mockReferenceContext();
    createRequest.mockResolvedValue({ id_purchase_request: 90, request_number: 'NAB-2026-0090', fk_request_status: 1 });
    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'create_att'))
      .mockResolvedValueOnce({ text: 'Zahtjev NAB-2026-0090 je kreiran.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    // Simulira TREĆI HTTP poziv: klijent je vjerno echoedao carrier poruku iz
    // PRVOG poteza (uz ostatak povijesti) — attachments param OVDJE je []
    // jer se datoteka ne šalje ponovno preko multipart-a.
    await runAssistantChat({
      messages: historyWithCarrier(carrier),
      userId: 2,
      attachments: [],
    });

    expect(createRequest).toHaveBeenCalledWith(expect.objectContaining({
      attachments: [{
        fileName: 'ponuda.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from(QUOTE_ATTACHMENT.base64, 'base64'),
      }],
    }));
  });

  test('carrier s TUĐIM ID-em ne priloži tuđi dokument — zahtjev se kreira bez priloga', async () => {
    // Carrier prolazi kroz klijenta, pa ga korisnik može prepisati; spremište
    // provjerava vlasništvo (assistantAttachmentStore.getAttachments).
    const carrierOfUser2 = await uploadTurn(2);

    mockReferenceContext();
    createRequest.mockResolvedValue({ id_purchase_request: 93, request_number: 'NAB-2026-0093', fk_request_status: 1 });
    getActiveProvider.mockResolvedValue({
      chat: jest.fn()
        .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'create_att'))
        .mockResolvedValueOnce({ text: 'Kreirano.', tool_calls: null }),
    });

    await runAssistantChat({
      messages: historyWithCarrier(carrierOfUser2),
      userId: 7, // DRUGI korisnik podmeće ID iz tuđeg razgovora
      attachments: [],
    });

    expect(createRequest).toHaveBeenCalledWith(expect.objectContaining({ attachments: [] }));
  });

  test('izmišljen/istekao ID u carrieru — zahtjev se kreira bez priloga, bez pada', async () => {
    mockReferenceContext();
    createRequest.mockResolvedValue({ id_purchase_request: 94, request_number: 'NAB-2026-0094', fk_request_status: 1 });
    getActiveProvider.mockResolvedValue({
      chat: jest.fn()
        .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'create_att'))
        .mockResolvedValueOnce({ text: 'Kreirano.', tool_calls: null }),
    });

    await runAssistantChat({
      messages: historyWithCarrier({ role: 'system', content: `${ATTACHMENT_DATA_MARKER}ne-postoji` }),
      userId: 2,
      attachments: [],
    });

    expect(createRequest).toHaveBeenCalledWith(expect.objectContaining({ attachments: [] }));
  });

  test('nakon uspješnog create_request spremište se oslobađa (isti ID više ne vraća prilog)', async () => {
    const carrier = await uploadTurn();

    mockReferenceContext();
    createRequest.mockResolvedValue({ id_purchase_request: 95, request_number: 'NAB-2026-0095', fk_request_status: 1 });
    getActiveProvider.mockResolvedValue({
      chat: jest.fn()
        .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'create_att'))
        .mockResolvedValueOnce({ text: 'Kreirano.', tool_calls: null }),
    });
    await runAssistantChat({ messages: historyWithCarrier(carrier), userId: 2, attachments: [] });

    const storeId = carrier.content.slice(ATTACHMENT_DATA_MARKER.length);
    expect(getStoredAttachments(storeId, 2)).toEqual([]);
  });

  test('tekstualni tok bez priloga — attachments prosljeđen u createRequest je uvijek prazan niz', async () => {
    mockReferenceContext();
    createRequest.mockResolvedValue({ id_purchase_request: 91, request_number: 'NAB-2026-0091', fk_request_status: 1 });

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS))
      .mockResolvedValueOnce({ text: 'Zahtjev kreiran.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    await runAssistantChat({
      messages: [{ role: 'user', content: '5 tonera, Računovodstvo, zalihe pri kraju.' }],
      userId: 2,
    });

    expect(createRequest).toHaveBeenCalledWith(expect.objectContaining({ attachments: [] }));
  });
});

describe('runAssistantChat — cross-turn kočnica protiv dvostrukog create_request (bez update tool-a)', () => {
  // Stvarnim eval testiranjem (gemma4:12b, 2026-08-26; sirovi podaci obrisani) otkriveno:
  // korisnikova poruka "promijenite količinu..." nakon što je zahtjev VEĆ
  // kreiran u ranijem potezu znala je navesti model da pozove create_request
  // PO DRUGI PUT, praveći pravi duplikat u bazi (createdRequest lokalna
  // varijabla štiti samo unutar JEDNOG HTTP poziva, ne kroz cijelu
  // konverzaciju).
  const priorCreateToolMessage = (created, id = 'create_1') => ({
    role: 'tool',
    tool_call_id: id,
    name: 'create_request',
    content: JSON.stringify({ ok: true, ...created }),
  });

  test('pokušaj create_request u SLJEDEĆEM potezu nakon što je zahtjev VEĆ kreiran ranije — odbijen, ne stvara duplikat', async () => {
    mockReferenceContext();

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'create_2')) // model pokušava "izmjenu" ponovnim create_request-om
      .mockResolvedValueOnce({ text: 'Zahtjev NAB-2026-0060 je već kreiran, ne mogu ga mijenjati kroz chat.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({
      messages: [
        { role: 'user', content: '5 tonera, Računovodstvo, zalihe pri kraju.' },
        { role: 'assistant', content: '', tool_calls: [{ id: 'create_1', name: 'create_request', arguments: VALID_ARGS }] },
        priorCreateToolMessage({ id_purchase_request: 60, request_number: 'NAB-2026-0060', fk_request_status: 1 }, 'create_1'),
        { role: 'assistant', content: 'Zahtjev NAB-2026-0060 je kreiran.' },
        { role: 'user', content: 'Zapravo promijenite količinu na 10.' },
      ],
      userId: 2,
    });

    expect(createRequest).not.toHaveBeenCalled(); // KLJUČNA provjera — nema duplikata u bazi
    expect(result.created_request).toBeNull();

    const rejection = result.tool_trace.find((m) => m.tool_call_id === 'create_2');
    const parsed = JSON.parse(rejection.content);
    expect(parsed.ok).toBe(false);
    expect(parsed.already_created_earlier).toBe(true);
    expect(parsed.message).toMatch(/NAB-2026-0060/);
    expect(parsed.message).toMatch(/dopunu|administratora/i);
  });

  test('drugi pokušaj u ISTOM potezu (nakon uspješnog create_request unutar tekuće petlje) i dalje koristi postojeću "already_created" kočnicu', async () => {
    mockReferenceContext();
    createRequest.mockResolvedValue({ id_purchase_request: 61, request_number: 'NAB-2026-0061', fk_request_status: 1 });

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'create_a'))
      .mockResolvedValueOnce(toolCallMessage(VALID_ARGS, 'create_b')) // model odmah pokuša opet u ISTOM potezu
      .mockResolvedValueOnce({ text: 'Zahtjev je kreiran.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({
      messages: [{ role: 'user', content: '5 tonera, Računovodstvo, zalihe pri kraju.' }],
      userId: 2,
    });

    expect(createRequest).toHaveBeenCalledTimes(1);
    const secondRejection = result.tool_trace.find((m) => m.tool_call_id === 'create_b');
    const parsed = JSON.parse(secondRejection.content);
    expect(parsed.already_created).toBe(true);
    expect(parsed.already_created_earlier).toBeUndefined();
  });
});

describe('runAssistantChat — finalni tekst prolazi kroz fixEkavica (safety net za ekavicu/srbizme)', () => {
  test('poznata ekavica riječ u modelovom odgovoru se ispravi prije nego stigne korisniku', async () => {
    // Stvarnim testom opaženo: gemma4:12b zna proklizniti na ekavicu unatoč
    // eksplicitnoj uputi u system promptu (docs/AI.md) — ovo je determinstički
    // ispravak koji se primjenjuje na SVAKI finalni tekstualni odgovor.
    //
    // Uzorak NAMJERNO ne tvrdi da je zahtjev kreiran: takva bi tvrdnja bez
    // stvarno kreiranog zahtjeva pala u guardFalseCreationClaim (vidi describe
    // "zaštita od lažne tvrdnje"), pa bi ovaj test mjerio pogrešnu stvar.
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({
      text: 'Za ovaj zahtev trebam još podatak o odjelu.',
      tool_calls: null,
    });
    getActiveProvider.mockResolvedValue({ chat });

    const result = await runAssistantChat({ messages: [{ role: 'user', content: 'Bok' }], userId: 2 });

    expect(result.text).toBe('Za ovaj zahtjev trebam još podatak o odjelu.');
  });
});

describe('runAssistantChat — fixEkavica i nad podacima koji idu u BAZU, ne samo nad tekstom odgovora', () => {
  test('create_request: obrazloženje i napomena se čiste prije upisa, naziv artikla ostaje netaknut', async () => {
    mockReferenceContext();
    createRequest.mockResolvedValue({
      id_purchase_request: 51,
      request_number: 'NAB-2026-0051',
      fk_request_status: 1,
    });

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage({
        ...VALID_ARGS,
        justification: 'Zahtev je hitan jer su uslovi rada loši.',
        comment: 'Dobavljač traži plaćanje pre isporuke.',
        // Naziv artikla dolazi prepisan s ponude — smije sadržavati niz koji
        // pravilo inače hvata, i NE smije se dirati (kataloška oznaka).
        items: [{ fk_item_category: 7, item_name: 'Adapter PRE-2000', quantity: 5 }],
      }))
      .mockResolvedValueOnce({ text: 'Zahtjev NAB-2026-0051 je kreiran.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    await runAssistantChat({ messages: [{ role: 'user', content: 'Trebam adaptere.' }], userId: 2 });

    expect(createRequest).toHaveBeenCalledWith(expect.objectContaining({
      justification: 'Zahtjev je hitan jer su uvjeti rada loši.',
      comment: 'Dobavljač traži plaćanje prije isporuke.',
      items: [{ fk_item_category: 7, item_name: 'Adapter PRE-2000', quantity: 5 }],
    }));
  });

  test('propose_request: sažetak za potvrdu ide kroz isti ispravak (korisnik potvrđuje isti tekst koji će se upisati)', async () => {
    mockReferenceContext();
    proposeRequest.mockResolvedValue({ department_name: 'Računovodstvo', items: [] });

    const chat = jest.fn()
      .mockResolvedValueOnce(proposeCallMessage({
        ...VALID_ARGS,
        justification: 'Zahtev za nabavu tonera.',
      }))
      .mockResolvedValueOnce({ text: 'Potvrđujete li kreiranje?', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    await runAssistantChat({ messages: [{ role: 'user', content: 'Trebam tonere.' }], userId: 2 });

    expect(proposeRequest).toHaveBeenCalledWith(expect.objectContaining({
      justification: 'Zahtjev za nabavu tonera.',
    }));
  });

  test('nedostajuća/ne-string polja ne ruše poziv (model izostavi comment)', async () => {
    mockReferenceContext();
    createRequest.mockResolvedValue({
      id_purchase_request: 52,
      request_number: 'NAB-2026-0052',
      fk_request_status: 1,
    });

    const chat = jest.fn()
      .mockResolvedValueOnce(toolCallMessage({ ...VALID_ARGS, comment: undefined }))
      .mockResolvedValueOnce({ text: 'Gotovo.', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    await runAssistantChat({ messages: [{ role: 'user', content: 'Trebam tonere.' }], userId: 2 });

    expect(createRequest).toHaveBeenCalledWith(expect.objectContaining({ comment: undefined }));
  });
});
