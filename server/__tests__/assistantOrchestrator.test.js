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
    expect(sentMessages[1].content).toMatch(/EKSPLICITNO zatraži potvrdu/);
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

    expect(createRequest).toHaveBeenCalledWith({ ...quoteDerivedArgs, userId: 2 });
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
    expect(parsed.message).toMatch(/propose_request/);
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

    expect(createRequest).toHaveBeenCalledWith({ ...VALID_ARGS, estimated_amount: undefined, comment: undefined, userId: 2 });
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

    expect(createRequest).not.toHaveBeenCalled();
    expect(proposeRequest).not.toHaveBeenCalled();
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

    expect(createRequest).toHaveBeenCalledWith({ ...VALID_ARGS, estimated_amount: undefined, comment: undefined, userId: 2 });
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

  test('uputa o preklapanju (ne zbrajati, eksplicitno pitati korisnika) prisutna je čim ima 2+ priloga', async () => {
    mockReferenceContext();
    const chat = jest.fn().mockResolvedValue({ text: 'ok', tool_calls: null });
    getActiveProvider.mockResolvedValue({ chat });

    await runAssistantChat({
      messages: [{ role: 'user', content: 'Evo dvije ponude za usporedbu.' }],
      userId: 2,
      attachments: [QUOTE_A, QUOTE_B],
    });

    const quoteSystemMsg = chat.mock.calls[0][0].find((m) => m.role === 'system' && m.content.includes(QUOTE_MARKER));
    expect(quoteSystemMsg.content).toMatch(/NIKAD ih\s*\n?\s*ne zbrajaj niti sam ne biraj koju koristiti/);
    expect(quoteSystemMsg.content).toMatch(/eksplicitno nabrojati opcije/);
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
