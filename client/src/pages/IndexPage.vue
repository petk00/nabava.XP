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

          <!-- AI uvidi: zasad samo vizualni placeholder, bez stvarne analize. -->
          <section class="ai-card">
            <div class="ai-card__rule" aria-hidden="true"></div>

            <div class="ai-card__main">
              <div class="ai-card__label">Asistent nabave</div>
              <h2 class="ai-card__title">Pitajte, ne tražite</h2>
              <p class="ai-card__sub">
                Umjesto filtriranja tablice, opišite što vas zanima. Asistent čita zahtjeve,
                priložene ponude i otpremnice te odgovara s brojevima zahtjeva.
              </p>

              <div class="ai-card__prompts">
                <div
                  v-for="prompt in aiPrompts"
                  :key="prompt"
                  class="ai-prompt"
                >
                  <span class="ai-prompt__caret">&rsaquo;</span>
                  {{ prompt }}
                </div>
              </div>
            </div>

            <div class="ai-card__glyph" aria-hidden="true"></div>
          </section>

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

  </q-page>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from 'boot/axios';
import { getStoredUser } from 'src/utils/authStorage';

const user = getStoredUser();

// Prijedlozi za AI karticu — placeholder sadržaj, bez interakcije.
const aiPrompts = [
  'Sažmi status mojih zahtjeva u ovoj godini',
  'Usporedi priložene ponude i predloži povoljniju',
  'Kojim zahtjevima nedostaje ponuda ili otpremnica?',
];

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


/* ── AI kartica (placeholder) ── */
.ai-card {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 190px;
  gap: 20px;
  align-items: center;
  overflow: hidden;
  padding: 24px 26px;
  border-radius: 16px;
  border: 1.5px solid rgba(0, 175, 219, 0.42);
  /* Dvije mreže crta preko navy gradijenta — "nacrt" ispod sadržaja. */
  background:
    linear-gradient(rgba(0, 175, 219, 0.07) 1px, transparent 1px) 0 0 / 100% 26px,
    linear-gradient(90deg, rgba(0, 175, 219, 0.07) 1px, transparent 1px) 0 0 / 26px 100%,
    linear-gradient(155deg, #1b2d59 0%, #16294e 58%, #10203f 100%);
  box-shadow: 0 10px 30px rgba(22, 41, 78, 0.22);
}

.ai-card__rule {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, #00afdb 0%, rgba(0, 175, 219, 0) 62%);
  pointer-events: none;
}

.ai-card__main {
  position: relative;
  z-index: 1;
  min-width: 0;
}

.ai-card__label {
  color: #7fe1f7;
  font-family: ui-monospace, SFMono-Regular, 'Cascadia Mono', Menlo, Consolas, monospace;
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.ai-card__title {
  margin: 7px 0 5px;
  color: #ffffff;
  font-size: 1.25rem;
  font-weight: 700;
  letter-spacing: -0.005em;
  line-height: 1.2;
}

.ai-card__sub {
  margin: 0;
  max-width: 44ch;
  color: #b9c9e2;
  font-size: 0.8125rem;
  line-height: 1.4;
}

.ai-card__prompts {
  display: flex;
  flex-direction: column;
  margin-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.ai-prompt {
  all: unset;
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  box-sizing: border-box;
  padding: 9px 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  color: #dbe6f6;
  font-size: 0.8125rem;
}

.ai-prompt__caret {
  color: #00afdb;
  font-family: ui-monospace, SFMono-Regular, 'Cascadia Mono', Menlo, Consolas, monospace;
  font-size: 0.75rem;
  font-weight: 600;
}

/* Glif iz /ai-file-format-svgrepo-com.svg — fill mu je zapečen u datoteci,
   pa boju dobiva preko CSS maske. */
.ai-card__glyph {
  position: relative;
  z-index: 1;
  justify-self: center;
  width: 150px;
  height: 150px;
  opacity: 0.85;
  background: linear-gradient(165deg, #7fe1f7 0%, #00afdb 45%, rgba(0, 175, 219, 0.12) 100%);
  -webkit-mask: url('/ai-file-format-svgrepo-com.svg') center / contain no-repeat;
  mask: url('/ai-file-format-svgrepo-com.svg') center / contain no-repeat;
  filter: drop-shadow(0 0 18px rgba(0, 175, 219, 0.35));
  pointer-events: none;
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
  .ai-card { grid-template-columns: 1fr; padding: 20px; }
  .ai-card__glyph { display: none; }
}
</style>
