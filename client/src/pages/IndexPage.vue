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

const loading = ref(true);
const allRequests = ref([]);

const todayFormatted = computed(() => {
  const f = new Date().toLocaleDateString('hr-HR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return f.charAt(0).toUpperCase() + f.slice(1);
});

const returnedAlertItem = computed(() =>
  allRequests.value.find(r => r.fk_request_status === 3) || null
);

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
    card:         { borderLeftColor: s.border },
    featuredCard: { borderColor: s.border, background: s.background },
    badge:        { color: s.badge, background: s.badgeBg },
  };
}

const formatCurrency = (value) => {
  if (value == null || value === 0) return '??? €';
  return new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format(value);
};

const truncate = (text, max) => {
  if (!text) return '—';
  return text.length > max ? text.slice(0, max) + '…' : text;
};

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('hr-HR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
};

const featuredHistory = ref([]);
const featuredAttachments = ref([]);
const featuredCreatedAt = ref(null);

const featuredHasPonuda = computed(() => featuredAttachments.value.some(a => a.document_type === 'Ponuda'));
const featuredHasOtpremnica = computed(() => featuredAttachments.value.some(a => a.document_type === 'Otpremnica'));

const tlIcon = (entry) => {
  if (entry.comment?.startsWith('Dokument dodan')) return 'attach_file';
  if (entry.comment?.startsWith('Dokument obrisan')) return 'delete';
  if (entry.comment?.startsWith('Zahtjev izmijenjen')) return 'edit';
  if (entry.comment?.startsWith('Dodan procijenjeni iznos')) return 'payments';
  const map = { 1: 'outbox', 2: 'pending', 3: 'undo', 5: 'close', 6: 'local_shipping', 7: 'task_alt' };
  return map[entry.fk_request_status] ?? 'circle';
};

const tlTitle = (entry) => {
  if (entry.comment?.startsWith('Dokument dodan: Ponuda')) return 'Priložena ponuda';
  if (entry.comment?.startsWith('Dokument dodan: Otpremnica')) return 'Priložena otpremnica';
  if (entry.comment?.startsWith('Dokument dodan')) return 'Priložen dokument';
  if (entry.comment?.startsWith('Dokument obrisan')) return 'Uklonjen dokument';
  if (entry.comment?.startsWith('Zahtjev izmijenjen')) return 'Izmjena zahtjeva';
  if (entry.comment?.startsWith('Dodan procijenjeni iznos')) return 'Upisan iznos';
  const labels = {
    'Poslano': 'Zahtjev poslan',
    'Na odobrenju': 'Preuzeto na obradu',
    'Zahtjeva izmjene': 'Zahtjeva izmjene',
    'Naručeno': 'Odobreno i naručeno',
    'Zatvoreno': 'Zahtjev zatvoren',
  };
  return labels[entry.status_name] ?? entry.status_name;
};

onMounted(async () => {
  try {
    const currentYear = new Date().getFullYear();
    const { data } = await api.get('/requests', { params: { limit: 500, fiscalYear: currentYear, onlyMine: 1 } });
    allRequests.value = Array.isArray(data.data) ? data.data : [];

    const sorted = [...allRequests.value].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (sorted[0]) {
      const id = sorted[0].id_purchase_request;
      const [{ data: detail }, { data: atts }] = await Promise.all([
        api.get(`/requests/${id}`),
        api.get(`/requests/${id}/attachments`),
      ]);
      featuredHistory.value = detail.history || [];
      featuredAttachments.value = Array.isArray(atts) ? atts : [];
      featuredCreatedAt.value = detail.created_at || sorted[0].created_at;
    }
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

/* ── Vraćen alert ── */
.returned-alert {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  padding: 11px 16px;
  border-left: 3px solid #c2410c;
  background: #fff7ed;
  color: #7c2d12;
  font-size: 0.8125rem;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.12s;
}

.returned-alert:hover { background: #ffedd5; }
.returned-alert__icon { flex-shrink: 0; color: #c2410c; }
.returned-alert__chevron { margin-left: auto; flex-shrink: 0; color: #c2410c; }


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

</style>