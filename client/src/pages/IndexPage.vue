<template>
  <q-page class="page">
    <div class="page-shell">

      <header class="page-header">
        <div class="page-header__main">
          <div class="page-header__eyebrow">{{ todayFormatted }}</div>
          <h1 class="page-header__title">
            Bok, <span class="page-header__name">{{ user?.first_name || 'korisniče' }}</span>
          </h1>
        </div>
      </header>

      <!-- Ask bar -->
      <div class="ask-bar">
        <label class="ask-bar__icon-btn" aria-label="Dodaj prilog">
          <q-icon name="add" size="20px" />
          <q-file
            v-model="fileInputModel"
            accept=".pdf,image/*"
            style="display:none"
            @update:model-value="onFilePicked"
          />
        </label>
        <input
          v-model="askInput"
          type="text"
          class="ask-bar__input"
          placeholder="Pitajte nabava.XP asistenta..."
          @keyup.enter="submitAsk"
        />
        <div class="ask-bar__right">
          <button v-if="isAssistantAdmin" type="button" class="ask-bar__model">
            {{ providerLabel }}
            <q-icon name="expand_more" size="16px" />
            <q-menu>
              <q-list style="min-width: 180px">
                <q-item
                  v-for="opt in providerOptions"
                  :key="opt.value"
                  clickable
                  v-close-popup
                  @click="changeProvider(opt.value)"
                >
                  <q-item-section>{{ opt.label }}</q-item-section>
                  <q-item-section v-if="opt.value === currentProvider" side>
                    <q-icon name="check" color="primary" size="16px" />
                  </q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </button>
          <button type="button" class="ask-bar__icon-btn" aria-label="Govorna naredba">
            <q-icon name="mic" size="18px" />
          </button>
        </div>
      </div>

      <div v-if="pendingFile && !askOpen" class="pending-file-chip">
        <q-icon name="attach_file" size="14px" />
        <span class="pending-file-chip__name">{{ pendingFile.name }}</span>
        <button type="button" aria-label="Ukloni prilog" @click="removeAttachedFile">
          <q-icon name="close" size="14px" />
        </button>
      </div>

      <div v-if="loading" class="loading-block">
        <q-spinner color="primary" size="28px" />
      </div>

      <template v-else>

        <!-- Cards grid -->
        <section class="card-grid">

          <!-- Novi zahtjev: kompaktni CTA banner -->
          <button class="dash-card dash-card--offer" @click="$router.push('/novizahtjev')">
            <img src="/solarlinear_NOVIZAHTJEV.svg" alt="" class="offer-deco" />
            <div class="offer-banner">
              <img src="/forward-2-svgrepo-com.svg" alt="" class="offer-banner__arrow" />
              <div class="offer-banner__text">
                <span class="offer-banner__title">Novi zahtjev</span>
                <span class="offer-banner__sub">Recite što trebate, priložite ponudu i pratite status u stvarnom vremenu</span>
              </div>
            </div>
          </button>

          <!-- Nedavni zahtjevi -->
          <div class="requests-section">
            <div class="section-header">
              <span class="card__title">
                <q-icon name="receipt_long" size="15px" />
                <span>Nedavni zahtjevi</span>
              </span>
              <div class="section-header__right">
                <span class="section-header__count">
                  {{ hasMoreRows ? `Prikazano ${displayedRows.length} od ${recentRows.length}` : recentRows.length }}
                </span>
                <button
                  v-if="hasMoreRows"
                  type="button"
                  class="section-header__more"
                  @click="$router.push('/zahtjevi')"
                >
                  Prikaži sve
                  <q-icon name="arrow_forward" size="12px" />
                </button>
              </div>
            </div>

            <div v-if="displayedRows.length" class="requests-list">
              <button
                v-for="row in displayedRows"
                :key="row.id_purchase_request"
                class="request-row"
                :style="{ borderLeftColor: buildRequestStyle(row).card.borderLeftColor }"
                @click="$router.push(`/zahtjevi/${row.id_purchase_request}`)"
              >
                <span class="lrb__number">{{ row.request_number }}</span>
                <span class="status-badge lrb__badge" :style="buildRequestStyle(row).badge">
                  <q-icon :name="statusIcon(row)" size="11px" class="badge-icon" />
                  {{ row.status_name }}
                </span>
                <span class="lrb__doc" :class="row.has_ponuda ? 'lrb__doc--on' : 'lrb__doc--off'">
                  <q-icon :name="row.has_ponuda ? 'check_circle' : 'radio_button_unchecked'" size="12px" />
                  Ponuda
                </span>
                <span class="lrb__doc" :class="row.has_otpremnica ? 'lrb__doc--on' : 'lrb__doc--off'">
                  <q-icon :name="row.has_otpremnica ? 'check_circle' : 'radio_button_unchecked'" size="12px" />
                  Otpremnica
                </span>
              </button>
            </div>
          </div>

        </section>

      </template>

    </div>

    <!-- Assistant overlay -->
    <div v-if="askOpen" class="assistant-overlay" @dragover.prevent @drop.prevent="handleDrop">
      <div class="assistant-overlay__header">
        <span class="assistant-overlay__title">
          <q-icon name="auto_awesome" size="18px" />
          Asistent
        </span>
        <button type="button" class="assistant-overlay__close" aria-label="Zatvori" @click="closeAssistant">
          <q-icon name="close" size="20px" />
        </button>
      </div>

      <div ref="assistantBodyEl" class="assistant-overlay__body">
        <div
          v-for="(msg, idx) in chatMessages"
          :key="idx"
          class="assistant-msg"
          :class="msg.from"
        >
          {{ msg.text }}
        </div>
        <div v-if="chatLoading" class="assistant-msg bot">
          <q-spinner size="16px" />
        </div>
      </div>

      <div v-if="pendingFile" class="pending-file-chip pending-file-chip--overlay">
        <q-icon name="attach_file" size="14px" />
        <span class="pending-file-chip__name">{{ pendingFile.name }}</span>
        <button type="button" aria-label="Ukloni prilog" @click="removeAttachedFile">
          <q-icon name="close" size="14px" />
        </button>
      </div>

      <form class="assistant-overlay__form" @submit.prevent="sendChatMessage">
        <input
          v-model="chatInput"
          type="text"
          class="assistant-overlay__input"
          placeholder="Pitajte nabava.XP asistenta..."
          autofocus
        />
        <button type="submit" class="assistant-overlay__send" aria-label="Pošalji" :disabled="chatLoading">
          <q-icon name="send" size="18px" />
        </button>
      </form>
    </div>

  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from 'boot/axios';
import { getStoredUser } from 'src/utils/authStorage';
import { useAssistantChat } from 'src/composables/useAssistantChat';

const user = getStoredUser();

const {
  askInput,
  askOpen,
  chatInput,
  chatMessages,
  assistantBodyEl,
  chatLoading,
  pendingFile,
  fileInputModel,
  removeAttachedFile,
  onFilePicked,
  handleDrop,
  isAdmin: isAssistantAdmin,
  currentProvider,
  providerLabel,
  providerOptions,
  loadProviderSettings,
  changeProvider,
  submitAsk,
  sendChatMessage,
  closeAssistant,
} = useAssistantChat();

const loading = ref(true);
const allRequests = ref([]);

const todayFormatted = computed(() => {
  const f = new Date().toLocaleDateString('hr-HR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return f.charAt(0).toUpperCase() + f.slice(1);
});

const recentRows = computed(() =>
  [...allRequests.value]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
);

const DASHBOARD_LIST_LIMIT = 8;
const displayedRows = computed(() => recentRows.value.slice(0, DASHBOARD_LIST_LIMIT));
const hasMoreRows = computed(() => recentRows.value.length > DASHBOARD_LIST_LIMIT);

const STATUS_STYLES = {
  1: { background: '#eff6ff', badge: '#1d4ed8', badgeBg: '#dbeafe', border: '#93c5fd' },
  2: { background: '#fffbeb', badge: '#b45309', badgeBg: '#fef3c7', border: '#fcd34d' },
  3: { background: '#fff7ed', badge: '#c2410c', badgeBg: '#ffedd5', border: '#fdba74' },
  4: { background: '#f0fdf4', badge: '#15803d', badgeBg: '#dcfce7', border: '#86efac' },
  5: { background: '#fef2f2', badge: '#b91c1c', badgeBg: '#fee2e2', border: '#fca5a5' },
  6: { background: '#faf5ff', badge: '#7c3aed', badgeBg: '#ede9fe', border: '#c4b5fd' },
  7: { background: '#dcfce7', badge: '#166534', badgeBg: '#bbf7d0', border: '#4ade80' },
};

const DEFAULT_STYLE = { background: '#f9fafb', badge: '#374151', badgeBg: '#f3f4f6', border: '#d1d5db' };

const STATUS_ICONS = {
  1: 'outbox',
  2: 'pending',
  3: 'undo',
  4: 'verified',
  5: 'close',
  6: 'local_shipping',
  7: 'task_alt',
};

const statusIcon = (row) => STATUS_ICONS[row.fk_request_status] ?? 'circle';

function buildRequestStyle(row) {
  const s = STATUS_STYLES[row.fk_request_status] ?? DEFAULT_STYLE;
  return {
    card:  { borderLeftColor: s.border },
    badge: { color: s.badge, background: s.badgeBg },
  };
}

onMounted(async () => {
  loadProviderSettings();
  try {
    const currentYear = new Date().getFullYear();
    const { data } = await api.get('/requests', { params: { limit: 500, fiscalYear: currentYear, onlyMine: 1 } });
    allRequests.value = Array.isArray(data.data) ? data.data : [];
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.page {
  padding: 32px 40px;
  background: transparent;
  color: #111827;
  font-family: 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}

.page-shell {
  max-width: 784px;
  margin: 0 auto;
}


/* ── Header ── */
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 28px;
}

.page-header__eyebrow {
  margin-bottom: 8px;
  color: #1b2d59;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.page-header__title {
  margin: 0;
  color: #111827;
  font-size: 2.25rem;
  font-weight: 600;
  letter-spacing: -0.015em;
  line-height: 1.1;
}

.page-header__name { color: #14bae4; }

/* ── Loading ── */
.loading-block {
  display: flex;
  justify-content: center;
  padding: 64px 0;
}

/* ── Ask bar (placeholder) ── */
.ask-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
  padding: 8px 10px 8px 14px;
  background: #ffffff;
  border: 1.5px solid rgba(0, 175, 219, 0.18);
  border-radius: 999px;
  box-shadow: 0 4px 18px rgba(0, 175, 219, 0.08);
  transition: border-color 0.15s, box-shadow 0.15s;
}

.ask-bar:focus-within {
  border-color: #00afdb;
  box-shadow: 0 4px 18px rgba(0, 175, 219, 0.16);
}

.ask-bar__icon-btn {
  all: unset;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: #6b7280;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.ask-bar__icon-btn:hover {
  background: #f0fbfe;
  color: #00afdb;
}

.ask-bar__input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: #111827;
  font-size: 0.9375rem;
  font-family: inherit;
}

.ask-bar__input::placeholder {
  color: #9ca3af;
}

.ask-bar__right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.ask-bar__model {
  all: unset;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 10px;
  border-radius: 999px;
  color: #16294e;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}

.ask-bar__model:hover {
  background: #f0fbfe;
}

/* ── Prilog uz poruku (nov element, ne mijenja postojeći ask-bar/overlay stil) ── */
.pending-file-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  margin: -14px auto 20px;
  padding: 4px 10px;
  background: #f0fbfe;
  border-radius: 999px;
  color: #16294e;
  font-size: 0.8125rem;
}

.pending-file-chip button {
  all: unset;
  display: flex;
  cursor: pointer;
  color: #6b7280;
}

.pending-file-chip__name {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pending-file-chip--overlay {
  margin: 0 auto 8px;
  max-width: 720px;
  width: 100%;
  box-sizing: border-box;
}

/* ── Card grid ── */
.card-grid {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 16px;
}

/* ── Base card ── */
.dash-card {
  all: unset;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 16px;
  min-height: 130px;
  padding: 20px 24px;
  box-sizing: border-box;
  cursor: pointer;
  border-left: 4px solid transparent;
  transition: all 0.2s ease;
}

/* ── CTA: Novi zahtjev (navy/cyan) ── */

.dash-card--offer {
  align-items: stretch;
  justify-content: center;
  height: auto;
  min-height: 96px;
  padding: 0;
  background: linear-gradient(145deg, #e8f6fd 0%, #cceef9 100%);
  border: 1.5px solid #00afdb;
  border-left: 1.5px solid #00afdb;
  box-shadow: 0 4px 24px rgba(0, 175, 219, 0.12);
}

.dash-card--offer:hover {
  background: linear-gradient(145deg, #d0edf9 0%, #b3e4f5 100%);
  border-color: #14bae4;
  box-shadow: 0 10px 32px rgba(0, 175, 219, 0.25);
  transform: scale(1.01);
}

.offer-deco {
  position: absolute;
  top: 50%;
  right: -40px;
  width: 180px;
  height: 180px;
  opacity: 0.08;
  transform: translateY(-50%) rotate(-18deg);
  pointer-events: none;
  z-index: 0;
}

.offer-banner {
  display: flex;
  align-items: center;
  gap: 18px;
  width: 100%;
  padding: 18px 24px;
  position: relative;
  z-index: 1;
}

.offer-banner__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.offer-banner__title {
  color: #1b2d59;
  font-size: 1.0625rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.offer-banner__sub {
  color: #16294e;
  opacity: 0.65;
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.3;
}

.offer-banner__arrow {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.dash-card--offer:hover .offer-banner__arrow {
  transform: translateX(3px);
}


/* ── Requests section ── */
.requests-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px;
}

.section-header .card__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #16294e;
  letter-spacing: 0.02em;
  line-height: 1.2;
  text-transform: uppercase;
}

.section-header .card__title .q-icon {
  color: #16294e;
}

.section-header__right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-header__count {
  color: #6b7280;
  font-size: 0.6875rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-transform: none;
  letter-spacing: normal;
}

.section-header__more {
  all: unset;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: #00afdb;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: gap 0.15s;
}

.section-header__more:hover {
  gap: 5px;
  color: #14bae4;
}

.requests-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.request-row {
  all: unset;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr;
  align-items: center;
  gap: 8px;
  padding: 7px 16px;
  background: #ffffff;
  border: 1.5px solid rgba(0, 175, 219, 0.18);
  border-left: 4px solid transparent;
  border-radius: 10px;
  box-shadow: 0 1px 4px rgba(0, 175, 219, 0.06);
  box-sizing: border-box;
  width: 100%;
  cursor: pointer;
  transition: background 0.12s;
}

.request-row:hover { background: #f0fbfe; }
.request-row:hover .lrb__chevron { color: #00afdb; transform: translateX(2px); }

/* ── Row sadržaj ── */
.lrb__number {
  font-size: 0.875rem;
  font-weight: 700;
  color: #00afdb;
  flex-shrink: 0;
}

.lrb__badge {
  justify-self: center;
}


.lrb__doc {
  justify-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 148px;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

.lrb__doc--on {
  background: #dcfce7;
  color: #15803d;
}

.lrb__doc--off {
  background: #f3f4f6;
  color: #d1d5db;
}



/* ── Status badge ── */
.status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 148px;
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

.badge-icon {
  margin-right: 4px;
  opacity: 0.85;
  vertical-align: middle;
}

@media (max-width: 760px) {
  .page { padding: 20px 16px; }
  .page-header__title { font-size: 1.75rem; }
  .status-badge { min-width: unset; }
}

/* ── Assistant overlay (placeholder) ── */
.assistant-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  background: #f9fafb;
}

.assistant-overlay__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 16px 24px;
  border-bottom: 1px solid #e5e7eb;
  background: #ffffff;
}

.assistant-overlay__title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #16294e;
  font-weight: 700;
  font-size: 0.9375rem;
}

.assistant-overlay__close {
  all: unset;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: #6b7280;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.assistant-overlay__close:hover {
  background: #f3f4f6;
  color: #111827;
}

.assistant-overlay__body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
}

.assistant-msg {
  padding: 12px 16px;
  border-radius: 16px;
  max-width: 75%;
  font-size: 0.9375rem;
  line-height: 1.45;
}

.assistant-msg.user {
  align-self: flex-end;
  background: #00afdb;
  color: white;
  border-bottom-right-radius: 4px;
}

.assistant-msg.bot {
  align-self: flex-start;
  background: #ffffff;
  color: #111827;
  border: 1px solid #e5e7eb;
  border-bottom-left-radius: 4px;
}

.assistant-overlay__form {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
  padding: 16px 24px 24px;
}

.assistant-overlay__input {
  flex: 1;
  padding: 14px 18px;
  border: 1.5px solid rgba(0, 175, 219, 0.18);
  border-radius: 999px;
  outline: none;
  background: #ffffff;
  color: #111827;
  font-size: 0.9375rem;
  font-family: inherit;
}

.assistant-overlay__input:focus {
  border-color: #00afdb;
}

.assistant-overlay__send {
  all: unset;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: #00afdb;
  color: white;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
}

.assistant-overlay__send:hover {
  background: #14bae4;
}

</style>