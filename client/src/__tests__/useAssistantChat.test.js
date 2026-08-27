import { beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';

vi.mock('src/utils/authStorage', () => ({
  getStoredUser: vi.fn(),
}));

vi.mock('boot/axios', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));

import { useAssistantChat } from '../composables/useAssistantChat';
import { getStoredUser } from 'src/utils/authStorage';
import { api } from 'boot/axios';

const EMPLOYEE = { id_user: 2, first_name: 'Zaposlenik', role_name: 'Zaposlenik' };
const ADMIN = { id_user: 1, first_name: 'Admin', role_name: 'Administrator' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getStoredUser).mockReturnValue(EMPLOYEE);
});

describe('submitAsk — slanje prve poruke', () => {
  test('šalje JSON s messages i prikazuje odgovor', async () => {
    api.post.mockResolvedValue({
      data: { text: 'Bok! Kako mogu pomoći?', created_request: null, tool_trace: [] },
    });

    const chat = useAssistantChat();
    chat.askInput.value = 'Bok';
    await chat.submitAsk();

    expect(api.post).toHaveBeenCalledWith('/assistant/chat', {
      messages: [{ role: 'user', content: 'Bok' }],
    });
    expect(chat.chatMessages.value).toEqual([
      { from: 'user', text: 'Bok' },
      { from: 'bot', text: 'Bok! Kako mogu pomoći?' },
    ]);
    expect(chat.askOpen.value).toBe(true);
    expect(chat.askInput.value).toBe('');
  });

  test('prazan unos bez priloga ne šalje ništa', async () => {
    const chat = useAssistantChat();
    chat.askInput.value = '   ';
    await chat.submitAsk();

    expect(api.post).not.toHaveBeenCalled();
    expect(chat.askOpen.value).toBe(false);
  });

  test('postavlja chatLoading tijekom poziva', async () => {
    let resolveCall;
    api.post.mockReturnValue(new Promise((resolve) => { resolveCall = resolve; }));

    const chat = useAssistantChat();
    chat.askInput.value = 'Bok';
    const promise = chat.submitAsk();

    // submitAsk() ima vlastiti scrollAssistantToBottom() PRIJE poziva
    // sendToBackend() (koji ima još jedan) — dvije nextTick runde da se
    // izvršavanje stvarno probije do (mockanog, čeka na resolveCall) api.post.
    await nextTick();
    await nextTick();
    expect(chat.chatLoading.value).toBe(true);

    resolveCall({ data: { text: 'ok', created_request: null, tool_trace: [] } });
    await promise;
    expect(chat.chatLoading.value).toBe(false);
  });
});

describe('sendChatMessage — nastavak razgovora', () => {
  test('dodaje poruku u postojeću povijest, ne resetira je', async () => {
    api.post.mockResolvedValue({ data: { text: 'Odgovor 1', created_request: null, tool_trace: [] } });
    const chat = useAssistantChat();
    chat.askInput.value = 'Prva poruka';
    await chat.submitAsk();

    api.post.mockResolvedValue({ data: { text: 'Odgovor 2', created_request: null, tool_trace: [] } });
    chat.chatInput.value = 'Druga poruka';
    await chat.sendChatMessage();

    expect(chat.chatMessages.value.map((m) => m.text)).toEqual([
      'Prva poruka', 'Odgovor 1', 'Druga poruka', 'Odgovor 2',
    ]);
    expect(api.post).toHaveBeenLastCalledWith('/assistant/chat', {
      messages: [
        { role: 'user', content: 'Prva poruka' },
        { role: 'assistant', content: 'Odgovor 1' },
        { role: 'user', content: 'Druga poruka' },
      ],
    });
  });
});

describe('prikaz grešaka — mreža/HTTP, UI se ne ruši', () => {
  test('HTTP greška (npr. 502) prikazuje poruku servera kao bot poruku', async () => {
    api.post.mockRejectedValue({
      response: { status: 502, data: { message: 'AI asistent trenutno nije dostupan. Pokušajte ponovno.' } },
    });

    const chat = useAssistantChat();
    chat.askInput.value = 'Bok';
    await expect(chat.submitAsk()).resolves.toBeUndefined();

    expect(chat.chatMessages.value.at(-1)).toEqual({
      from: 'bot',
      text: 'AI asistent trenutno nije dostupan. Pokušajte ponovno.',
    });
    expect(chat.chatLoading.value).toBe(false);
  });

  test('mrežna greška (nema response) prikazuje generičku poruku', async () => {
    api.post.mockRejectedValue({ request: {} }); // axios oblik: request postoji, response ne

    const chat = useAssistantChat();
    chat.askInput.value = 'Bok';
    await chat.submitAsk();

    expect(chat.chatMessages.value.at(-1).text).toMatch(/mrežnu vezu/i);
  });

  test('401 (istekla sesija) ne ruši UI — i dalje prikazuje poruku', async () => {
    api.post.mockRejectedValue({ response: { status: 401, data: {} } });

    const chat = useAssistantChat();
    chat.askInput.value = 'Bok';
    await chat.submitAsk();

    expect(chat.chatMessages.value.at(-1).text).toMatch(/Greška \(401\)/);
  });
});

describe('slanje s prilogom (PDF/slika ponude)', () => {
  test('attachFiles + submitAsk šalje multipart FormData s "messages" i "file"', async () => {
    api.post.mockResolvedValue({ data: { text: 'Analiziram ponudu...', created_request: null, tool_trace: [] } });

    const chat = useAssistantChat();
    const file = new File(['%PDF-1.4 fake'], 'ponuda.pdf', { type: 'application/pdf' });
    chat.attachFiles(file);
    expect(chat.pendingFiles.value).toEqual([file]);

    chat.askInput.value = 'Evo ponude.';
    await chat.submitAsk();

    expect(api.post).toHaveBeenCalledWith(
      '/assistant/chat',
      expect.any(FormData),
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    const sentFormData = api.post.mock.calls[0][1];
    expect(sentFormData.get('file')).toBe(file);
    expect(JSON.parse(sentFormData.get('messages'))).toEqual([{ role: 'user', content: 'Evo ponude.' }]);

    // prilozi se brišu nakon slanja
    expect(chat.pendingFiles.value).toEqual([]);
  });

  test('VIŠE priloga odjednom — svi idu pod isto "file" polje, redoslijedom', async () => {
    api.post.mockResolvedValue({ data: { text: 'Uspoređujem ponude...', created_request: null, tool_trace: [] } });

    const chat = useAssistantChat();
    const fileA = new File(['a'], 'ponuda-a.pdf', { type: 'application/pdf' });
    const fileB = new File(['b'], 'ponuda-b.pdf', { type: 'application/pdf' });
    chat.attachFiles([fileA, fileB]);
    expect(chat.pendingFiles.value).toEqual([fileA, fileB]);

    chat.askInput.value = 'Evo dvije ponude.';
    await chat.submitAsk();

    const sentFormData = api.post.mock.calls[0][1];
    expect(sentFormData.getAll('file')).toEqual([fileA, fileB]);
  });

  test('attachFiles pušta najviše MAX_QUOTE_FILES (5) priloga, višak se ignorira', () => {
    const chat = useAssistantChat();
    const files = Array.from({ length: 7 }, (_, i) => new File(['x'], `ponuda-${i}.pdf`, { type: 'application/pdf' }));
    chat.attachFiles(files);

    expect(chat.pendingFiles.value).toHaveLength(5);
  });

  test('prazan tekst uz prilog automatski dobiva razumnu poruku', async () => {
    api.post.mockResolvedValue({ data: { text: 'ok', created_request: null, tool_trace: [] } });
    const chat = useAssistantChat();
    chat.attachFiles(new File(['x'], 'ponuda.pdf', { type: 'application/pdf' }));
    chat.askInput.value = '';
    await chat.submitAsk();

    expect(api.post).toHaveBeenCalled();
    const sentFormData = api.post.mock.calls[0][1];
    const sentMessages = JSON.parse(sentFormData.get('messages'));
    expect(sentMessages[0].content).toBeTruthy();
  });

  test('removeAttachedFile uklanja SAMO odabrani prilog (po indeksu) prije slanja', () => {
    const chat = useAssistantChat();
    const fileA = new File(['a'], 'ponuda-a.pdf', { type: 'application/pdf' });
    const fileB = new File(['b'], 'ponuda-b.pdf', { type: 'application/pdf' });
    chat.attachFiles([fileA, fileB]);

    chat.removeAttachedFile(0);
    expect(chat.pendingFiles.value).toEqual([fileB]);
  });

  test('onFilePicked (iz q-file multiple v-model) dodaje pendingFiles i prazni fileInputModel', () => {
    const chat = useAssistantChat();
    const files = [new File(['x'], 'ponuda.pdf', { type: 'application/pdf' })];
    chat.fileInputModel.value = files;
    chat.onFilePicked(files);

    expect(chat.pendingFiles.value).toEqual(files);
    expect(chat.fileInputModel.value).toBeNull();
  });

  test('handleDrop (drag&drop) dodaje SVE datoteke iz dataTransfer', () => {
    const chat = useAssistantChat();
    const fileA = new File(['a'], 'ponuda-a.pdf', { type: 'application/pdf' });
    const fileB = new File(['b'], 'ponuda-b.pdf', { type: 'application/pdf' });
    chat.handleDrop({ dataTransfer: { files: [fileA, fileB] } });

    expect(chat.pendingFiles.value).toEqual([fileA, fileB]);
  });
});

describe('tool_trace — mora se vratiti u idućem zahtjevu (strukturna brava propose->create)', () => {
  test('tool_trace iz prvog odgovora ide u messages drugog zahtjeva, prije finalne assistant poruke', async () => {
    const toolTrace = [
      { role: 'system', content: '[ai-asistent:priložena-ponuda]\n...' },
      { role: 'assistant', content: '', tool_calls: [{ id: 'p1', name: 'propose_request', arguments: {} }] },
      { role: 'tool', tool_call_id: 'p1', name: 'propose_request', content: '{"ok":true,"proposal":{}}' },
    ];
    api.post.mockResolvedValueOnce({
      data: { text: 'Evo sažetka... Potvrđujete li kreiranje?', created_request: null, tool_trace: toolTrace },
    });

    const chat = useAssistantChat();
    chat.attachFiles(new File(['x'], 'ponuda.pdf', { type: 'application/pdf' }));
    chat.askInput.value = 'Evo ponude.';
    await chat.submitAsk();

    api.post.mockResolvedValueOnce({
      data: {
        text: 'Zahtjev NAB-2026-0001 je kreiran.',
        created_request: { id_purchase_request: 1, request_number: 'NAB-2026-0001', fk_request_status: 1 },
        tool_trace: [],
      },
    });
    chat.chatInput.value = 'Da, potvrđujem.';
    await chat.sendChatMessage();

    const secondCallBody = api.post.mock.calls[1][1];
    expect(secondCallBody.messages).toEqual([
      { role: 'user', content: 'Evo ponude.' },
      ...toolTrace,
      { role: 'assistant', content: 'Evo sažetka... Potvrđujete li kreiranje?' },
      { role: 'user', content: 'Da, potvrđujem.' },
    ]);
  });
});

describe('AI provider toggle — vidljivost i ponašanje po roli', () => {
  test('zaposlenik: isAdmin false, loadProviderSettings/changeProvider ne zovu API', async () => {
    vi.mocked(getStoredUser).mockReturnValue(EMPLOYEE);
    const chat = useAssistantChat();

    expect(chat.isAdmin).toBe(false);

    await chat.loadProviderSettings();
    expect(api.get).not.toHaveBeenCalled();

    await chat.changeProvider('gemini');
    expect(api.put).not.toHaveBeenCalled();
  });

  test('admin: isAdmin true, loadProviderSettings dohvaća trenutni provider', async () => {
    vi.mocked(getStoredUser).mockReturnValue(ADMIN);
    api.get.mockResolvedValue({ data: { provider: 'ollama', gemini_model: 'gemini-2.5-flash' } });

    const chat = useAssistantChat();
    expect(chat.isAdmin).toBe(true);

    await chat.loadProviderSettings();
    expect(api.get).toHaveBeenCalledWith('/assistant/settings');
    expect(chat.currentProvider.value).toBe('ollama');
    expect(chat.providerLabel.value).toMatch(/Ollama/);
  });

  test('admin: changeProvider zove PUT i ažurira currentProvider', async () => {
    vi.mocked(getStoredUser).mockReturnValue(ADMIN);
    api.put.mockResolvedValue({ data: { message: 'ok', provider: 'gemini', gemini_model: 'gemini-2.5-flash' } });

    const chat = useAssistantChat();
    await chat.changeProvider('gemini');

    expect(api.put).toHaveBeenCalledWith('/assistant/settings', { provider: 'gemini' });
    expect(chat.currentProvider.value).toBe('gemini');
  });
});
