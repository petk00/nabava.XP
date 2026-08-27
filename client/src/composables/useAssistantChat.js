// src/composables/useAssistantChat.js
//
// Spaja ask-bar/chat overlay (IndexPage.vue) na POST /api/assistant/chat
// (docs/AI.md — function-calling AI asistent).
//
// Ključno: odgovor backend rute uključuje "tool_trace" (nove assistant/tool
// poruke iz tog poteza, npr. propose_request poziv+rezultat kad razgovor
// kreće od priloga). Klijent MORA vratiti tool_trace natrag backendu u
// sljedećem zahtjevu, zajedno s cijelom povijesti — bez toga se strukturna
// brava propose_request -> create_request ne može provjeriti (vidi
// assistantOrchestrator.js: conversationInvolvesAttachment,
// hasMatchingEarlierProposal). Zato se ovdje drži zasebna, backend-oblika
// `conversationHistory` (role/content/tool_calls/tool_call_id/name) — POTPUNO
// odvojena od `chatMessages`, koji je samo prikazni oblik ({from, text}) za
// postojeći, nedirani template.

import { ref, computed, nextTick } from 'vue';
import { api } from 'boot/axios';
import { getStoredUser } from 'src/utils/authStorage';

const PROVIDER_LABELS = { ollama: 'Ollama (lokalno)', gemini: 'Gemini' };

// Mora se poklapati s MAX_QUOTE_FILES u server/src/routes/assistantRoutes.js.
const MAX_QUOTE_FILES = 5;

const PROVIDER_OPTIONS = [
  { value: 'ollama', label: 'Ollama (lokalno)' },
  { value: 'gemini', label: 'Gemini' },
];

function resolveErrorMessage(error) {
  if (error.response) {
    return error.response.data?.message || `Greška (${error.response.status}). Pokušajte ponovno.`;
  }
  if (error.request) {
    return 'Nema odgovora s poslužitelja. Provjerite mrežnu vezu i pokušajte ponovno.';
  }
  return 'Greška pri slanju poruke. Pokušajte ponovno.';
}

export function useAssistantChat() {
  const isAdmin = getStoredUser()?.role_name === 'Administrator';

  // ── Prikazni state (template ga izravno koristi, oblik nediran) ──
  const askInput = ref('');
  const askOpen = ref(false);
  const chatInput = ref('');
  const chatMessages = ref([]); // { from: 'user'|'bot', text }
  const assistantBodyEl = ref(null);
  const chatLoading = ref(false);

  // ── Prilozi (PDF/slika ponude, do MAX_QUOTE_FILES odjednom) ──
  const pendingFiles = ref([]); // File[] — čekaju slanje, korisnik ih još može ukloniti pojedinačno
  const fileInputModel = ref(null); // v-model za skriveni <q-file multiple>, uvijek se odmah isprazni

  // ── AI provider toggle (admin-only na backendu) ──
  const currentProvider = ref(null);
  const providerLabel = computed(() =>
    currentProvider.value ? (PROVIDER_LABELS[currentProvider.value] || currentProvider.value) : 'Asistent'
  );
  const providerOptions = PROVIDER_OPTIONS;

  // ── Povijest poruka u backend obliku (messages + tool_trace) ──
  const conversationHistory = ref([]); // { role, content, tool_calls?, tool_call_id?, name? }[]

  async function scrollAssistantToBottom() {
    await nextTick();
    if (assistantBodyEl.value) {
      assistantBodyEl.value.scrollTop = assistantBodyEl.value.scrollHeight;
    }
  }

  function attachFiles(files) {
    if (!files) return;
    const list = Array.isArray(files) ? files : [files];
    const room = MAX_QUOTE_FILES - pendingFiles.value.length;
    if (room <= 0) return;
    pendingFiles.value.push(...list.slice(0, room));
  }

  function removeAttachedFile(index) {
    pendingFiles.value.splice(index, 1);
  }

  function onFilePicked(files) {
    attachFiles(files);
    fileInputModel.value = null;
  }

  function handleDrop(event) {
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) attachFiles(Array.from(files));
  }

  /** Šalje trenutnu conversationHistory (+ eventualne pendingFiles) backendu i obrađuje odgovor. */
  async function sendToBackend() {
    chatLoading.value = true;
    await scrollAssistantToBottom();

    try {
      let response;
      if (pendingFiles.value.length > 0) {
        const formData = new FormData();
        formData.append('messages', JSON.stringify(conversationHistory.value));
        for (const file of pendingFiles.value) {
          formData.append('file', file);
        }
        response = await api.post('/assistant/chat', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        // Kopija, ne izravna referenca — conversationHistory se odmah nakon
        // ovog poziva dalje mutira (tool_trace, finalni assistant odgovor).
        response = await api.post('/assistant/chat', { messages: [...conversationHistory.value] });
      }

      const { text, created_request: createdRequest, tool_trace: toolTrace } = response.data || {};

      // KLJUČNO: tool_trace ide u povijest PRIJE finalne assistant poruke —
      // isti redoslijed koji ga je orkestrator vratio (system uputa o prilogu
      // i/ili propose_request poziv+rezultat), inače sljedeći zahtjev neće
      // proći strukturnu bravu za create_request.
      if (Array.isArray(toolTrace) && toolTrace.length > 0) {
        conversationHistory.value.push(...toolTrace);
      }
      conversationHistory.value.push({ role: 'assistant', content: text || '' });

      chatMessages.value.push({ from: 'bot', text: text || 'Nema odgovora.' });

      return { createdRequest };
    } catch (error) {
      chatMessages.value.push({ from: 'bot', text: resolveErrorMessage(error) });
      return { error: true };
    } finally {
      pendingFiles.value = [];
      chatLoading.value = false;
      await scrollAssistantToBottom();
    }
  }

  async function submitAsk() {
    if (chatLoading.value) return;
    const text = askInput.value.trim() || (pendingFiles.value.length > 0 ? 'Evo priloženih ponuda.' : '');
    if (!text) return;

    askInput.value = '';
    chatMessages.value = [{ from: 'user', text }];
    conversationHistory.value = [{ role: 'user', content: text }];
    askOpen.value = true;
    await scrollAssistantToBottom();
    await sendToBackend();
  }

  async function sendChatMessage() {
    if (chatLoading.value) return;
    const text = chatInput.value.trim() || (pendingFiles.value.length > 0 ? 'Evo priloženih ponuda.' : '');
    if (!text) return;

    chatMessages.value.push({ from: 'user', text });
    conversationHistory.value.push({ role: 'user', content: text });
    chatInput.value = '';
    await scrollAssistantToBottom();
    await sendToBackend();
  }

  function closeAssistant() {
    askOpen.value = false;
    pendingFiles.value = [];
  }

  async function loadProviderSettings() {
    if (!isAdmin) return;
    try {
      const { data } = await api.get('/assistant/settings');
      currentProvider.value = data.provider;
    } catch (error) {
      console.error('[assistant] Greška pri dohvaćanju AI postavki:', error);
    }
  }

  async function changeProvider(value) {
    if (!isAdmin || value === currentProvider.value) return;
    try {
      const { data } = await api.put('/assistant/settings', { provider: value });
      currentProvider.value = data.provider;
    } catch (error) {
      console.error('[assistant] Greška pri promjeni AI providera:', error);
    }
  }

  return {
    // prikazni state (koristi ih postojeći template)
    askInput,
    askOpen,
    chatInput,
    chatMessages,
    assistantBodyEl,
    chatLoading,
    // prilozi
    pendingFiles,
    fileInputModel,
    attachFiles,
    removeAttachedFile,
    onFilePicked,
    handleDrop,
    // provider toggle
    isAdmin,
    currentProvider,
    providerLabel,
    providerOptions,
    loadProviderSettings,
    changeProvider,
    // razgovor
    conversationHistory,
    submitAsk,
    sendChatMessage,
    closeAssistant,
  };
}
