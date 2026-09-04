<template>
  <q-page class="page">

    <!-- Loading -->
    <div v-if="loading" class="loading-block no-print">
      <q-spinner color="primary" size="32px" />
    </div>

    <!-- ═══════════════════════════════════════
         MAIN CONTENT
         ═══════════════════════════════════════ -->
    <div v-else-if="request" class="page-body">

      <!-- Stepper -->
      <div class="status-stepper no-print">
        <div class="stepper-steps">
          <template v-for="(step, i) in STEPPER_STEPS" :key="i">
            <div class="stepper-item">
              <div class="stepper-dot" :class="`stepper-dot--${stepperState(i)}`">
                <q-icon :name="stepperDotIcon(i)" size="11px" />
              </div>
              <div class="stepper-label" :class="`stepper-label--${stepperState(i)}`">{{ step }}</div>
            </div>
            <div
              v-if="i < STEPPER_STEPS.length - 1"
              class="stepper-connector"
              :class="stepperState(i) === 'done' ? 'stepper-connector--done' : ''"
            />
          </template>
        </div>
        <div v-if="status === STATUS.VRACENO" class="stepper-note stepper-note--warn">
          <q-icon name="info" size="12px" /> Zahtijeva izmjene od podnositelja
        </div>
        <div v-if="status === STATUS.ODBIJENO" class="stepper-note stepper-note--error">
          <q-icon name="block" size="12px" /> Zahtjev odbijen
        </div>
      </div>

      <!-- ───── Main content ───── -->
      <div class="main-col no-print">

        <!-- Header: identity + actions, puna širina -->
        <div class="card no-print">

          <!-- Top row: nav / request info / action buttons -->
          <div class="merged-top">
            <div class="merged-top__row">
              <div class="action-bar__identity">
                <button class="breadcrumb__back" type="button" @click="goBack">
                  <q-icon name="arrow_back" size="13px" />
                  <span>{{ isAdmin ? 'Zahtjevi' : 'Moji zahtjevi' }}</span>
                </button>
                <div class="action-bar__vsep" />
                <span class="action-bar__req-number">{{ request.request_number }}</span>
                <div class="action-bar__vsep" />
                <span class="action-bar__req-number">
                  <span v-if="hasAmount">{{ formatCurrency(request.total_amount) }}</span>
                  <button v-else-if="canEdit" class="btn-add-amount" @click="editRequest">
                    <q-icon name="add" size="12px" />Dodaj iznos
                  </button>
                  <span v-else style="color:#c4c9d4;font-weight:400;font-style:italic;">Iznos nije određen</span>
                </span>
                <div class="action-bar__vsep" />
                <span class="action-bar__req-number">{{ request.created_by }}<span style="font-weight:400;color:#6b7280;"> ({{ request.department_name }})</span></span>
              </div>
              <div style="flex:1" />
              <div class="action-bar__actions">
                <!-- Upload gumbi -->
                <template v-if="canUploadAny">
                  <label v-if="canUploadPonuda" class="btn btn--ghost btn--sm" style="cursor:pointer;">
                    <q-icon name="upload_file" size="13px" /><span>Dodaj ponudu</span>
                    <q-file v-model="ponudaFileInput" accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.zip" style="display:none" @update:model-value="val => { if (val) uploadDirect(val, 'Ponuda') }" />
                  </label>
                  <label v-if="canUploadOtpremnica" class="btn btn--ghost btn--sm" style="cursor:pointer;">
                    <q-icon name="upload_file" size="13px" /><span>Dodaj otpremnicu</span>
                    <q-file v-model="otpremnicaFileInput" accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.zip" style="display:none" @update:model-value="val => { if (val) uploadDirect(val, 'Otpremnica') }" />
                  </label>
                  <div class="action-bar__vsep" />
                </template>

                <!-- Neutralne: Uredi, PDF -->
                <button v-if="canEdit && !canResubmit" class="btn btn--ghost btn--sm" @click="editRequest">
                  <q-icon name="edit" size="14px" /><span>Uredi</span>
                </button>
                <button v-if="canDownloadPdf" class="btn btn--ghost btn--sm" :disabled="pdfGenerating" @click="downloadPdf">
                  <q-spinner v-if="pdfGenerating" size="12px" />
                  <q-icon v-else name="download" size="14px" />
                  <span>{{ pdfGenerating ? 'Generiranje…' : 'PDF' }}</span>
                </button>

                <!-- Separator ispred destruktivnih -->
                <div v-if="((canEdit && !canResubmit) || canDownloadPdf) && (canDecide || canTakeOver || (isAdmin && status && !LOCKED_STATUSES.includes(status)))" class="action-bar__vsep" />

                <!-- Destruktivne (prigušene) -->
                <button v-if="canDecide" class="btn btn--warning btn--sm" :disabled="submittingAction" @click="openActionDialog('vrati-na-izmjenu')">
                  <q-icon name="undo" size="14px" /><span>Vrati na dopunu</span>
                </button>
                <!-- Odbij: tekst danger, border se pojačava tek na hover -->
                <button v-if="canTakeOver || canDecide" class="btn btn--text-danger btn--sm" :disabled="submittingAction" @click="openActionDialog('odbij')">
                  <q-icon name="close" size="14px" /><span>Odbij</span>
                </button>
                <!-- Storniraj u overflow "..." — rijetka akcija, vizualno potisnuta -->
                <div v-if="isAdmin && status && !LOCKED_STATUSES.includes(status)" style="display:inline-flex;">
                  <button class="icon-btn" :disabled="submittingAction">
                    <q-icon name="more_vert" size="16px" />
                    <q-tooltip>Više opcija</q-tooltip>
                  </button>
                  <q-menu auto-close>
                    <q-list dense style="min-width:160px;padding:4px 0;">
                      <q-item clickable :disable="submittingAction" @click="openActionDialog('storno')">
                        <q-item-section avatar style="min-width:32px;">
                          <q-icon name="block" size="14px" color="negative" />
                        </q-item-section>
                        <q-item-section style="font-size:0.8125rem;color:#c50f1f;font-weight:500;">Storniraj zahtjev</q-item-section>
                      </q-item>
                    </q-list>
                  </q-menu>
                </div>

                <!-- Separator + primarna CTA — uvijek krajnje desno, najistaknutiji -->
                <div v-if="primaryCta && hasActionsBeforeCta" class="action-bar__vsep" />
                <button v-if="primaryCta" class="btn btn--cta btn--sm" :disabled="primaryCta.disabled || submittingAction" @click="triggerPrimaryCta">
                  <q-spinner v-if="submittingAction" size="12px" color="white" />
                  <q-icon v-else :name="primaryCta.icon" size="14px" />
                  <span>{{ primaryCta.label }}</span>
                  <q-tooltip v-if="ctaDisabledTooltip">{{ ctaDisabledTooltip }}</q-tooltip>
                </button>
              </div>
            </div>
            <div v-if="pageAlert && pageAlert.type !== 'info'" class="merged-alert" :class="`merged-alert--${pageAlert.type}`">
              <q-icon :name="pageAlert.icon" size="14px" />
              <span>{{ pageAlert.title }}</span>
              <span v-if="pageAlert.desc" class="merged-alert__desc">— {{ pageAlert.desc }}</span>
            </div>
          </div>

        </div>

        <!-- meta strip -->
        <div class="card">
          <div class="meta-strip">

            <!-- Kol 1: dokumenti -->
            <div class="meta-col">
              <div class="info-section-label">Dokumenti</div>
              <div class="doc-grid">
                <div class="doc-row">
                  <div class="doc-row__name">
                    <q-icon name="receipt_long" size="14px" :class="hasPonuda ? 'doc-slot__icon--ok' : 'doc-slot__icon--missing'" />
                    <span class="doc-slot__type">Ponuda</span>
                  </div>
                  <div class="doc-row__status">
                    <span v-if="ponudaFile" class="doc-badge doc-badge--ok"><q-icon name="check_circle" size="10px" /> Priložena</span>
                    <span v-else class="doc-badge doc-badge--missing">Nedostaje</span>
                  </div>
                  <div class="doc-row__actions">
                    <template v-if="ponudaFile">
                      <button class="icon-btn" :class="{ 'icon-btn--muted': !canPreview(ponudaFile) }" @click="previewOrDownload(ponudaFile)"><q-icon name="visibility" size="13px" /><q-tooltip>{{ canPreview(ponudaFile) ? 'Prikaži' : 'Pregled nije moguć za ovaj tip datoteke — klikni za preuzimanje' }}</q-tooltip></button>
                      <button class="icon-btn" @click="downloadAttachment(ponudaFile)"><q-icon name="download" size="13px" /><q-tooltip>Preuzmi</q-tooltip></button>
                      <button v-if="canDeleteFile(ponudaFile)" class="icon-btn icon-btn--danger" @click="deleteAttachment(ponudaFile)"><q-icon name="delete_outline" size="13px" /><q-tooltip>Obriši</q-tooltip></button>
                    </template>
                  </div>
                </div>
                <div class="doc-row" v-if="otpremnicaFile || [STATUS.NARUCENO, STATUS.ZATVORENO].includes(status)">
                  <div class="doc-row__name">
                    <q-icon name="local_shipping" size="14px" :class="hasOtpremnica ? 'doc-slot__icon--ok' : 'doc-slot__icon--missing'" />
                    <span class="doc-slot__type">Otpremnica</span>
                  </div>
                  <div class="doc-row__status">
                    <span v-if="otpremnicaFile" class="doc-badge doc-badge--ok"><q-icon name="check_circle" size="10px" /> Priložena</span>
                    <span v-else class="doc-badge doc-badge--missing">Nedostaje</span>
                  </div>
                  <div class="doc-row__actions">
                    <template v-if="otpremnicaFile">
                      <button class="icon-btn" :class="{ 'icon-btn--muted': !canPreview(otpremnicaFile) }" @click="previewOrDownload(otpremnicaFile)"><q-icon name="visibility" size="13px" /><q-tooltip>{{ canPreview(otpremnicaFile) ? 'Prikaži' : 'Pregled nije moguć za ovaj tip datoteke — klikni za preuzimanje' }}</q-tooltip></button>
                      <button class="icon-btn" @click="downloadAttachment(otpremnicaFile)"><q-icon name="download" size="13px" /><q-tooltip>Preuzmi</q-tooltip></button>
                      <button v-if="canDeleteFile(otpremnicaFile)" class="icon-btn icon-btn--danger" @click="deleteAttachment(otpremnicaFile)"><q-icon name="delete_outline" size="13px" /><q-tooltip>Obriši</q-tooltip></button>
                    </template>
                  </div>
                </div>
              </div>
            </div>

            <!-- Kol 2: svrha + napomena -->
            <div class="meta-col meta-col--prose">
              <div class="meta-section">
                <div class="info-section-label">Svrha nabave</div>
                <p class="prose prose--meta">{{ request.justification || '—' }}</p>
              </div>
              <div class="meta-section">
                <div class="info-section-label">Napomena</div>
                <p class="prose prose--meta" :style="!request.comment ? 'color:#c4c9d4;font-style:italic;' : ''">
                  {{ request.comment || 'Nema napomene.' }}
                </p>
              </div>
            </div>

          </div>
        </div>

        <!-- Stavke — primarni sadržaj, uvijek vidljiv (nije collapsible) -->
        <div class="card">
          <div class="section-header">
            <span class="card__title">
              <q-icon name="list" size="15px" />
              <span>Stavke</span>
              <span class="count-pill">{{ items.length }}</span>
              <!-- AI analiza stavki: zasad samo gumb, akcija se dodaje naknadno. -->
              <button type="button" class="ai-items-btn" aria-label="AI analiza stavki">
                <q-icon name="auto_awesome" size="14px" />
                <span>AI</span>
              </button>
            </span>
          </div>
          <div class="card__body card__body--flush">
            <div v-if="items.length === 0" class="card__empty">Nema stavki.</div>
            <table v-else class="items-table">
              <colgroup>
                <col style="width:55%">
                <col style="width:auto">
                <col style="width:80px">
              </colgroup>
              <thead>
                <tr>
                  <th>Naziv artikla</th>
                  <th>Kategorija</th>
                  <th class="text-right">Kol.</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in items" :key="item.id_purchase_request_item">
                  <td>{{ item.item_name }}</td>
                  <td class="muted">{{ item.category_name }}</td>
                  <td class="text-right num">{{ item.quantity }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Aktivnosti — sekundarni audit log, collapsible, default zatvoren -->
        <div class="card">
          <button class="accordion-header" type="button" @click="historyOpen = !historyOpen">
            <span class="card__title">
              <q-icon name="history" size="15px" />
              <span>Povijest aktivnosti</span>
              <span class="count-pill">{{ history.length }}</span>
            </span>
            <q-icon :name="historyOpen ? 'expand_less' : 'expand_more'" size="18px" color="grey-5" />
          </button>
          <div v-if="historyOpen" class="card__body card__body--flush accordion-body">
            <div v-if="history.length === 0" class="card__empty">Nema zapisa.</div>
            <ol v-else class="timeline">
              <li
                v-for="entry in visibleHistory"
                :key="entry.id_request_status_history"
                class="timeline-item"
                :class="`timeline-item--${timelineKind(entry)}`"
              >
                <div class="timeline-dot">
                  <q-icon :name="timelineIcon(entry)" size="11px" />
                </div>
                <div class="timeline-content">
                  <div class="timeline-title">{{ timelineTitle(entry) }}</div>
                  <div class="timeline-meta">
                    {{ entry.changed_by }} ·
                    <span class="timeline-reldate" :title="formatDate(entry.changed_at)">
                      {{ relativeDate(entry.changed_at) }}
                      <q-tooltip>{{ formatDate(entry.changed_at) }}</q-tooltip>
                    </span>
                  </div>
                  <div v-if="entry.comment" class="timeline-comment">{{ entry.comment }}</div>
                </div>
              </li>
            </ol>
            <div v-if="!showAllHistory && history.length > TIMELINE_INITIAL" class="timeline-more">
              <button class="btn btn--ghost btn--sm" @click="showAllHistory = true">
                Prikaži sve ({{ history.length }})
              </button>
            </div>
          </div>
        </div>

        </div><!-- /main-col -->
    </div><!-- /page-body -->

    <!-- 404 -->
    <div v-else class="empty-page no-print">
      <q-icon name="error_outline" size="32px" style="color:#9ca3af;margin-bottom:8px;" />
      <div style="font-size:0.8125rem;font-weight:500;color:#374151;">Zahtjev nije pronađen.</div>
    </div>

    <!-- ════════════════════════════════════════════
         PRINT VIEW
         ════════════════════════════════════════════ -->
    <article v-if="request" class="print-view">
      <header class="print-header">
        <div class="print-header__left">
          <img :src="ORG.logoPath" alt="Logo" class="print-header__logo" />
          <div class="print-header__inst">{{ ORG.name }}</div>
        </div>
        <div class="print-header__right">
          <div>{{ ORG.nameLatin }}</div>
          <div class="print-header__right-en">{{ ORG.nameEnglish }}</div>
        </div>
      </header>
      <div class="print-header__contact">
        {{ ORG.address }} · Telefon {{ ORG.phone }} · E-mail: {{ ORG.email }} · {{ ORG.web }}<br>
        OIB: {{ ORG.oib }} · MB: {{ ORG.mb }} · RKP: {{ ORG.rkp }} · IBAN: {{ ORG.iban }}
      </div>
      <div class="print-header__line"></div>
      <div class="print-title-box"><h1>ZAHTJEV ZA NABAVU</h1></div>
      <div class="print-fields">
        <div class="print-fields__label">Broj zahtjeva:</div>
        <div class="print-fields__value">{{ request.request_number }}</div>
        <div class="print-fields__label">Datum:</div>
        <div class="print-fields__value">{{ formatDateOnly(request.created_at) }}</div>
        <div class="print-fields__label">Zahtjev podnio: <span class="print-fields__label-sub">(ime i prezime djelatnika)</span></div>
        <div class="print-fields__value">{{ request.created_by }}</div>
        <div class="print-fields__label">Odjel / Služba:</div>
        <div class="print-fields__value">{{ request.department_name }}</div>
        <div class="print-fields__label">Predmet nabave: <span class="print-fields__label-sub">(kategorija)</span></div>
        <div class="print-fields__value">{{ predmetNabave }}</div>
      </div>
      <div class="print-purpose">
        <div class="print-purpose__box">
          <div class="print-purpose__label">Svrha nabave (obrazloženje):</div>
          <div class="print-purpose__text">{{ request.justification || '—' }}</div>
        </div>
      </div>
      <div v-if="items.length > 0" class="print-items">
        <div class="print-items__title">Specifikacija stavki:</div>
        <table>
          <thead>
            <tr>
              <th style="width:55%;">Naziv artikla</th>
              <th style="width:30%;">Kategorija</th>
              <th class="num" style="width:15%;">Količina</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in items" :key="item.id_purchase_request_item">
              <td>{{ item.item_name }}</td>
              <td>{{ item.category_name }}</td>
              <td class="num">{{ item.quantity }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="print-total">
        Ukupna nabava se procjenjuje na iznos od <strong>{{ formatCurrency(request.total_amount) }}</strong>.
      </div>
      <div class="print-stamp">
        <span>Status: <strong>{{ request.status_name }}</strong></span>
        <span>Ispisano: {{ todayDate }}</span>
      </div>
    </article>

    <!-- Action dialog -->
    <q-dialog v-model="actionDialog" persistent>
      <q-card class="dialog-card">
        <div class="dialog-header">
          <div class="dialog-title">{{ dialogTitle }}</div>
          <div class="dialog-desc">{{ dialogDescription }}</div>
        </div>
        <div class="dialog-body">
          <div
            v-if="pendingAction === 'odobri' && budgetImpact"
            class="dialog-budget"
            :class="{ 'dialog-budget--over': budgetImpact.over }"
          >
            <div class="dialog-budget__row">
              <span class="dialog-budget__label">Odjel</span>
              <span class="dialog-budget__value">{{ request.department_name }}</span>
            </div>
            <div class="dialog-budget__row">
              <span class="dialog-budget__label">Potrošeno / limit</span>
              <span class="dialog-budget__value">
                {{ formatCurrency(budgetImpact.spent) }} /
                {{ budgetImpact.noLimit ? 'bez limita' : formatCurrency(budgetImpact.limit) }}
              </span>
            </div>
            <div v-if="!budgetImpact.noAmount" class="dialog-budget__row">
              <span class="dialog-budget__label">Nakon odobrenja</span>
              <span class="dialog-budget__value" :class="{ 'dialog-budget__value--over': budgetImpact.over }">
                {{ formatCurrency(budgetImpact.after) }}
                <template v-if="budgetImpact.pct !== null"> ({{ budgetImpact.pct }} %)</template>
              </span>
            </div>
            <div v-if="budgetImpact.over" class="dialog-budget__warn">
              <q-icon name="warning" size="14px" />
              Ovim odobrenjem odjel prelazi limit. Odobrenje nije blokirano, ali će prekoračenje biti zabilježeno u povijesti.
            </div>
            <div v-else-if="budgetImpact.noAmount" class="dialog-budget__hint">
              Zahtjev nema unesen iznos — potrošnja odjela neće biti evidentirana do zatvaranja.
            </div>
          </div>
          <q-input
            v-model="actionComment"
            type="textarea"
            outlined
            :label="dialogInputLabel"
            rows="4"
            :disable="submittingAction"
            autofocus
          />
        </div>
        <div class="dialog-actions">
          <button class="btn btn--ghost" :disabled="submittingAction" @click="closeActionDialog">
            Odustani
          </button>
          <button
            class="btn"
            :class="dialogConfirmClass"
            :disabled="submittingAction"
            @click="confirmAction"
          >
            <q-spinner v-if="submittingAction" size="14px" color="white" />
            <q-icon v-else :name="dialogConfirmIcon" size="16px" />
            <span>{{ dialogConfirmLabel }}</span>
          </button>
        </div>
      </q-card>
    </q-dialog>

  </q-page>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { jsPDF } from 'jspdf';
import { api } from 'boot/axios';
import { getStoredUser } from 'src/utils/authStorage';

const ORG = {
  name: 'VELEUČILIŠTE U RIJECI',
  nameLatin: 'COLLEGIUM FLUMINENSE',
  nameEnglish: 'POLYTECHNIC OF RIJEKA',
  address: '51000 RIJEKA - HR - Trpimirova 2/V',
  phone: '(051) 321-300',
  email: 'ured@veleri.hr',
  web: 'https://www.veleri.hr',
  oib: '29573709870',
  mb: '01387332',
  rkp: '22494',
  iban: 'HR6824020061100451485',
  logoPath: '/veleri_logo_solo.svg',
};

const STATUS = {
  POSLANO:      1,
  NA_ODOBRENJU: 2,
  VRACENO:      3,
  ODOBRENO:     4,
  ODBIJENO:     5,
  NARUCENO:     6,
  ZATVORENO:    7,
};
const LOCKED_STATUSES = [STATUS.ODBIJENO, STATUS.ZATVORENO];

const UPLOAD_RULES = {
  Ponuda:     [STATUS.POSLANO, STATUS.NA_ODOBRENJU, STATUS.VRACENO, STATUS.NARUCENO],
  Otpremnica: [STATUS.NARUCENO],
};

const STEPPER_STEPS = ['Poslano', 'Na odobrenju', 'Odobreno', 'Naručeno', 'Zatvoreno'];
const STEPPER_ACTIVE_STEP = {
  [STATUS.POSLANO]:      0,
  [STATUS.NA_ODOBRENJU]: 1,
  [STATUS.VRACENO]:      1,
  [STATUS.ODOBRENO]:     2,
  [STATUS.ODBIJENO]:     2,
  [STATUS.NARUCENO]:     3,
  [STATUS.ZATVORENO]:    4,
};

const route   = useRoute();
const router  = useRouter();
const $q      = useQuasar();

const loading          = ref(false);
const request          = ref(null);
const items            = ref([]);
const history          = ref([]);
const attachments      = ref([]);
const TIMELINE_INITIAL = 10;
const showAllHistory   = ref(false);
const historyOpen      = ref(false);
const showUpload       = ref(false);

const visibleHistory = computed(() =>
  showAllHistory.value ? history.value : history.value.slice(0, TIMELINE_INITIAL)
);

const uploading         = ref(false);
const uploadForm        = ref({ document_type: null, file: null });
const actionDialog      = ref(false);
const pendingAction     = ref(null);

// Utjecaj odobrenja na budžet odjela — podaci dolaze iz GET /requests/:id
// (department_limit/department_spent postoje samo za admina)
const budgetImpact = computed(() => {
  const r = request.value;
  if (!r || r.department_limit === undefined || r.department_limit === null) return null;
  const limit  = Number(r.department_limit) || 0;
  const spent  = Number(r.department_spent) || 0;
  const amount = Number(r.total_amount) || 0;
  const after  = spent + amount;
  return {
    limit,
    spent,
    after,
    pct: limit > 0 ? Math.round((after / limit) * 100) : null,
    over: limit > 0 && after > limit,
    noAmount: !(amount > 0),
    noLimit: limit <= 0,
  };
});
const actionComment     = ref('');
const submittingAction  = ref(false);
const pdfGenerating     = ref(false);
const currentUser       = ref(null);

/* ── Computed ── */

const isAdmin  = computed(() => currentUser.value?.role_name === 'Administrator');
const status   = computed(() => request.value?.fk_request_status);

const hasPonuda      = computed(() => attachments.value.some((a) => a.document_type === 'Ponuda'));
const hasOtpremnica  = computed(() => attachments.value.some((a) => a.document_type === 'Otpremnica'));
const ponudaFile     = computed(() => attachments.value.find((a) => a.document_type === 'Ponuda') || null);
const otpremnicaFile = computed(() => attachments.value.find((a) => a.document_type === 'Otpremnica') || null);
const canUploadPonuda     = computed(() => allowedDocumentTypes.value.includes('Ponuda'));
const canUploadOtpremnica = computed(() => allowedDocumentTypes.value.includes('Otpremnica'));
const ponudaFileInput     = ref(null);
const otpremnicaFileInput = ref(null);
const hasAmount    = computed(() => { const v = Number(request.value?.total_amount); return Number.isFinite(v) && v > 0; });
const canFinishNow = computed(() => hasPonuda.value && hasOtpremnica.value && hasAmount.value);

const missingForFinish = computed(() => {
  const m = [];
  if (!hasPonuda.value)     m.push('ponuda');
  if (!hasOtpremnica.value) m.push('otpremnica');
  if (!hasAmount.value)     m.push('iznos');
  return m;
});

const canEdit      = computed(() => { if (!status.value || LOCKED_STATUSES.includes(status.value)) return false; return isAdmin.value || status.value === STATUS.VRACENO; });
const canTakeOver  = computed(() => isAdmin.value && status.value === STATUS.POSLANO);
const canDecide    = computed(() => isAdmin.value && status.value === STATUS.NA_ODOBRENJU);
const canResubmit  = computed(() => !isAdmin.value && status.value === STATUS.VRACENO);
const canFinish    = computed(() => isAdmin.value && status.value === STATUS.NARUCENO);
const canDownloadPdf = computed(() => isAdmin.value && [STATUS.NARUCENO, STATUS.ZATVORENO].includes(status.value));
const hasActionsBeforeCta = computed(() =>
  canUploadAny.value ||
  (canEdit.value && !canResubmit.value) ||
  canDownloadPdf.value ||
  canDecide.value ||
  canTakeOver.value ||
  (isAdmin.value && !!status.value && !LOCKED_STATUSES.includes(status.value))
);

const lastReturnComment = computed(() => {
  const entries = history.value.filter((h) => h.fk_request_status === STATUS.VRACENO);
  return entries.length ? entries[entries.length - 1].comment || null : null;
});

const allowedDocumentTypes = computed(() => {
  if (!status.value) return [];
  return Object.entries(UPLOAD_RULES)
    .filter(([type, allowed]) => {
      if (!allowed.includes(status.value)) return false;
      if (type === 'Ponuda')     return !hasPonuda.value;
      if (type === 'Otpremnica') return !hasOtpremnica.value;
      return true;
    })
    .map(([type]) => type);
});
const canUploadAny       = computed(() => allowedDocumentTypes.value.length > 0);
const effectiveDocumentType = computed(() => allowedDocumentTypes.value.length === 1 ? allowedDocumentTypes.value[0] : uploadForm.value.document_type);

const predmetNabave = computed(() => {
  if (!items.value.length) return '—';
  return [...new Set(items.value.map(i => i.category_name).filter(Boolean))].sort().join(', ');
});
const todayDate = computed(() => new Date().toLocaleDateString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric' }));
const canDeleteFile = (att) => !LOCKED_STATUSES.includes(status.value) && (isAdmin.value || att.fk_uploaded_by_user === currentUser.value?.id_user);

/* ── Status badge ── */
const statusBadgeClass = computed(() => {
  switch (status.value) {
    case STATUS.POSLANO:      return 'badge--poslano';
    case STATUS.NA_ODOBRENJU: return 'badge--na-odobrenju';
    case STATUS.VRACENO:      return 'badge--vraceno';
    case STATUS.ODOBRENO:     return 'badge--odobreno';
    case STATUS.ODBIJENO:     return 'badge--odbijeno';
    case STATUS.NARUCENO:     return 'badge--naruceno';
    case STATUS.ZATVORENO:    return 'badge--zatvoreno';
    default:                  return '';
  }
});

/* ── Page alert ── */
const pageAlert = computed(() => {
  if (canTakeOver.value)
    return { type: 'info', icon: 'assignment_turned_in', title: 'Novi zahtjev čeka pregled', desc: 'Preuzmite na obradu ili odmah odbijte.' };
  if (canDecide.value && !hasPonuda.value)
    return { type: 'warning', icon: 'warning', title: 'Nedostaje ponuda', desc: 'Priložite ponudu prije odobravanja.' };
  if (canDecide.value)
    return { type: 'decision', icon: 'how_to_reg', title: 'Potrebna vaša odluka', desc: 'Odobrite zahtjev ili ga vratite na dopunu.' };
  if (canResubmit.value)
    return { type: 'info', icon: 'edit_note', title: 'Vraćeno na dopunu', desc: lastReturnComment.value || 'Uredite zahtjev i pošaljite ga ponovno.' };
  if (canFinish.value && !canFinishNow.value)
    return { type: 'warning', icon: 'pending_actions', title: `Nedostaje za završetak: ${missingForFinish.value.join(', ')}`, desc: null };
  return null;
});

/* ── Stepper ── */
const stepperState = (i) => {
  const s = status.value;
  if (!s) return 'upcoming';
  const active = STEPPER_ACTIVE_STEP[s] ?? 0;
  if (i < active)    return 'done';
  if (i === active) {
    if (s === STATUS.VRACENO)   return 'active-warn';
    if (s === STATUS.ODBIJENO)  return 'active-error';
    if (s === STATUS.ZATVORENO) return 'done';
    return 'active';
  }
  return s === STATUS.ODBIJENO ? 'locked' : 'upcoming';
};
const stepperDotIcon = (i) => {
  const st = stepperState(i);
  if (st === 'done')         return 'check';
  if (st === 'active-warn')  return 'warning';
  if (st === 'active-error') return 'close';
  if (st === 'locked')       return 'lock';
  return 'circle';
};

/* ── Primary CTA ── */
const primaryCta = computed(() => {
  const s = status.value;
  if (!s) return null;
  if (isAdmin.value) {
    if (s === STATUS.POSLANO)      return { label: 'Preuzmi na obradu', action: 'preuzmi',        icon: 'assignment_turned_in', quick: true,  disabled: false };
    if (s === STATUS.NA_ODOBRENJU) return { label: 'Odobri',            action: 'odobri',          icon: 'check',               quick: false, disabled: !hasPonuda.value };
    if (s === STATUS.VRACENO)      return { label: 'Preuzmi na obradu', action: 'vrati-u-obradu',  icon: 'assignment_turned_in', quick: true,  disabled: false };
    if (s === STATUS.NARUCENO)     return { label: 'Označi završeno',   action: 'zavrsi',          icon: 'task_alt',            quick: true,  disabled: !canFinishNow.value };
  } else {
    if (s === STATUS.VRACENO)      return { label: 'Pošalji ponovno',   action: 'resubmit',        icon: 'send',                quick: true,  disabled: false };
  }
  return null;
});
const triggerPrimaryCta = () => {
  if (!primaryCta.value || primaryCta.value.disabled || submittingAction.value) return;
  primaryCta.value.quick ? quickAction(primaryCta.value.action) : openActionDialog(primaryCta.value.action);
};
const ctaDisabledTooltip = computed(() => {
  if (!primaryCta.value?.disabled) return null;
  if (status.value === STATUS.NARUCENO && !hasAmount.value) return 'Unesi iznos prije završetka zahtjeva';
  return null;
});

/* ── Dialog helpers ── */
const dialogTitle = computed(() => {
  switch (pendingAction.value) {
    case 'odobri': return 'Odobravanje zahtjeva';
    case 'odbij':  return 'Odbijanje zahtjeva';
    case 'vrati-na-izmjenu': return 'Vraćanje na dopunu';
    case 'storno': return 'Storniranje zahtjeva';
    default:       return 'Akcija nad zahtjevom';
  }
});
const dialogDescription = computed(() => {
  switch (pendingAction.value) {
    case 'odobri':           return 'Komentar je neobavezan, ali preporučen.';
    case 'odbij':            return 'Komentar je obavezan pri odbijanju zahtjeva.';
    case 'vrati-na-izmjenu': return 'Komentar je obavezan kako bi podnositelj znao što ispraviti.';
    case 'storno':           return 'Navedite razlog storniranja. Akcija je nepovratna.';
    default:                 return '';
  }
});
const dialogInputLabel   = computed(() => pendingAction.value === 'odobri' ? 'Komentar (neobavezno)' : 'Komentar *');
const dialogConfirmClass = computed(() => {
  switch (pendingAction.value) {
    case 'odobri':           return 'btn--primary';
    case 'vrati-na-izmjenu': return 'btn--warning';
    case 'odbij': case 'storno': return 'btn--danger';
    default: return 'btn--primary';
  }
});
const dialogConfirmIcon  = computed(() => ({ odobri: 'check', 'vrati-na-izmjenu': 'undo', odbij: 'close', storno: 'block' }[pendingAction.value] || ''));
const dialogConfirmLabel = computed(() => ({ odobri: 'Odobri', 'vrati-na-izmjenu': 'Vrati na dopunu', odbij: 'Odbij', storno: 'Storniraj' }[pendingAction.value] || 'Potvrdi'));

/* ── API ── */
const fetchRequestDetails = async (isRefresh = false) => {
  loading.value = true;
  try {
    const [detailsRes, attachmentsRes] = await Promise.all([
      api.get(`/requests/${route.params.id}`),
      api.get(`/requests/${route.params.id}/attachments`),
    ]);
    request.value     = detailsRes.data.request;
    items.value       = detailsRes.data.items || [];
    history.value     = detailsRes.data.history || [];
    attachments.value = Array.isArray(attachmentsRes.data) ? attachmentsRes.data : [];
  } catch (error) {
    $q.notify({ type: 'negative', message: error.response?.data?.message || 'Greška pri dohvaćanju zahtjeva.' });
    if (!isRefresh) request.value = null;
  } finally {
    loading.value = false;
  }
};

const uploadDirect = async (file, docType) => {
  if (!file || !docType) return;
  uploading.value = true;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('document_type', docType);
  try {
    await api.post(`/requests/${route.params.id}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    $q.notify({ type: 'positive', message: `${docType} uspješno dodana.` });
    if (docType === 'Ponuda')     ponudaFileInput.value = null;
    if (docType === 'Otpremnica') otpremnicaFileInput.value = null;
    await fetchRequestDetails(true);
  } catch (error) {
    $q.notify({ type: 'negative', message: error.response?.data?.message || 'Greška pri uploadu.' });
  } finally {
    uploading.value = false;
  }
};

const uploadAttachment = async () => {
  const docType = effectiveDocumentType.value;
  if (!uploadForm.value.file || !docType) return;
  uploading.value = true;
  const formData = new FormData();
  formData.append('file', uploadForm.value.file);
  formData.append('document_type', docType);
  try {
    await api.post(`/requests/${route.params.id}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    $q.notify({ type: 'positive', message: `${docType} uspješno dodana.` });
    uploadForm.value = { document_type: null, file: null };
    showUpload.value = false;
    await fetchRequestDetails(true);
  } catch (error) {
    $q.notify({ type: 'negative', message: error.response?.data?.message || 'Greška pri uploadu.' });
  } finally {
    uploading.value = false;
  }
};

const canPreview = (att) => { const t = att.file_type || ''; return t.includes('pdf') || t.startsWith('image/') || t.startsWith('text/'); };

const previewAttachment = async (att) => {
  try {
    const r = await api.get(`/attachments/download/${att.id_attachment}`, { responseType: 'blob' });
    window.open(window.URL.createObjectURL(new Blob([r.data], { type: att.file_type })), '_blank');
  } catch { $q.notify({ type: 'negative', message: 'Greška pri otvaranju datoteke.' }); }
};

const previewOrDownload = (att) => { if (canPreview(att)) previewAttachment(att); else downloadAttachment(att); };

const downloadAttachment = async (att) => {
  try {
    const r = await api.get(`/attachments/download/${att.id_attachment}`, { responseType: 'blob' });
    const url  = window.URL.createObjectURL(new Blob([r.data]));
    const link = document.createElement('a');
    link.href = url; link.setAttribute('download', att.file_name);
    document.body.appendChild(link); link.click(); link.remove();
    window.URL.revokeObjectURL(url);
  } catch { $q.notify({ type: 'negative', message: 'Greška pri preuzimanju datoteke.' }); }
};

const deleteAttachment = (att) => {
  $q.dialog({ title: 'Brisanje dokumenta', message: `Obrisati "${att.file_name}"?`, cancel: { flat: true, label: 'Odustani' }, ok: { color: 'negative', label: 'Obriši', unelevated: true } })
    .onOk(async () => {
      try {
        await api.delete(`/attachments/delete/${att.id_attachment}`);
        $q.notify({ type: 'positive', message: 'Dokument obrisan.' });
        await fetchRequestDetails(true);
      } catch (error) { $q.notify({ type: 'negative', message: error.response?.data?.message || 'Greška pri brisanju.' }); }
    });
};

const quickAction = async (action) => {
  submittingAction.value = true;
  try {
    await api.patch(`/requests/${route.params.id}/status`, { action });
    const msgs = { preuzmi: 'Zahtjev preuzet na obradu.', resubmit: 'Zahtjev je ponovno poslan.', zavrsi: 'Zahtjev je označen kao završen.', 'vrati-u-obradu': 'Zahtjev preuzet na ponovnu obradu.' };
    $q.notify({ type: 'positive', message: msgs[action] || 'Akcija izvršena.' });
    await fetchRequestDetails(true);
  } catch (error) { $q.notify({ type: 'negative', message: error.response?.data?.message || 'Greška pri izvršavanju akcije.' }); }
  finally { submittingAction.value = false; }
};

const openActionDialog  = (action) => { pendingAction.value = action; actionComment.value = ''; actionDialog.value = true; };
const closeActionDialog = () => { actionDialog.value = false; pendingAction.value = null; actionComment.value = ''; };
const confirmAction = async () => {
  if (['odbij', 'vrati-na-izmjenu', 'storno'].includes(pendingAction.value) && !actionComment.value.trim()) {
    $q.notify({ type: 'negative', message: 'Komentar je obavezan za ovu akciju.' }); return;
  }
  submittingAction.value = true;
  try {
    await api.patch(`/requests/${route.params.id}/status`, { action: pendingAction.value, comment: actionComment.value.trim() || null });
    $q.notify({ type: 'positive', message: 'Status zahtjeva ažuriran.' });
    closeActionDialog(); await fetchRequestDetails(true);
  } catch (error) { $q.notify({ type: 'negative', message: error.response?.data?.message || 'Greška pri promjeni statusa.' }); }
  finally { submittingAction.value = false; }
};

const editRequest = () => router.push(`/zahtjevi/${route.params.id}/edit`);
const goBack      = () => router.push(isAdmin.value ? '/zahtjevi' : '/dashboard');

/* ── Formatiranje ── */
const formatCurrency = (v) => v == null ? '—' : new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format(v);
const formatDate     = (v) => { if (!v) return '—'; return new Date(v).toLocaleString('hr-HR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
const formatDateOnly = (v) => { if (!v) return '—'; const d = new Date(v); return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}.`; };
const relativeDate   = (ts) => {
  if (!ts) return '—';
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  const m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (s < 60)  return 'upravo sada';
  if (m < 60)  return `prije ${m} min`;
  if (h < 24)  return `prije ${h} ${h === 1 ? 'sat' : h < 5 ? 'sata' : 'sati'}`;
  if (d === 1) return 'jučer';
  if (d < 7)   return `prije ${d} dana`;
  if (d < 30)  return `prije ${Math.floor(d/7)} ${Math.floor(d/7)===1?'tjedan':'tjedna'}`;
  if (d < 365) return `prije ${Math.floor(d/30)} mj.`;
  return `prije ${Math.floor(d/365)} god.`;
};

/* ── Status helpers ── */
const timelineKind  = (e) => { if (e.comment?.startsWith('Dokument dodan')) return 'doc-add'; if (e.comment?.startsWith('Dokument obrisan')) return 'doc-del'; if (e.comment?.startsWith('Zahtjev izmijenjen')) return 'edit'; if (e.comment?.startsWith('Dodan procijenjeni iznos')) return 'amount'; return `s-${e.fk_request_status}`; };
const timelineIcon  = (e) => { if (e.comment?.startsWith('Dokument dodan')) return 'attach_file'; if (e.comment?.startsWith('Dokument obrisan')) return 'delete'; if (e.comment?.startsWith('Zahtjev izmijenjen')) return 'edit'; if (e.comment?.startsWith('Dodan procijenjeni iznos')) return 'payments'; const m={[STATUS.POSLANO]:'outbox',[STATUS.NA_ODOBRENJU]:'pending',[STATUS.VRACENO]:'undo',[STATUS.ODBIJENO]:'close',[STATUS.NARUCENO]:'local_shipping',[STATUS.ZATVORENO]:'task_alt'}; return m[e.fk_request_status]||'circle'; };
const parseDocType  = (c) => c?.split(': ')[1]?.split(' — ')[0] ?? null;
const timelineTitle = (e) => {
  if (e.comment?.startsWith('Dokument dodan'))          { const t=parseDocType(e.comment); return t==='Ponuda'?'Priložena ponuda':t==='Otpremnica'?'Priložena otpremnica':'Priložen dokument'; }
  if (e.comment?.startsWith('Dokument obrisan'))        { const t=parseDocType(e.comment); return t==='Ponuda'?'Uklonjena ponuda':t==='Otpremnica'?'Uklonjena otpremnica':'Uklonjen dokument'; }
  if (e.comment?.startsWith('Zahtjev izmijenjen'))      return 'Izmjena zahtjeva';
  if (e.comment?.startsWith('Dodan procijenjeni iznos')) return 'Upisan iznos';
  return {'Poslano':'Zahtjev poslan','Na odobrenju':'Preuzeto na obradu','Zahtjeva izmjene':'Vraćeno na dopunu','Naručeno':'Odobreno i naručeno','Zatvoreno':'Zahtjev zatvoren'}[e.status_name] ?? e.status_name;
};
const fileIcon = (m) => { if (!m) return 'insert_drive_file'; if (m.includes('pdf')) return 'picture_as_pdf'; if (m.includes('image')) return 'image'; if (m.includes('word')||m.includes('document')) return 'description'; if (m.includes('excel')||m.includes('sheet')) return 'table_chart'; if (m.includes('zip')) return 'folder_zip'; return 'insert_drive_file'; };

/* ── PDF ── */
const loadImage  = (src) => new Promise((res) => { const img=new Image(); img.onload=()=>{const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext('2d').drawImage(img,0,0);res({data:c.toDataURL('image/png'),w:img.naturalWidth,h:img.naturalHeight});}; img.onerror=()=>res(null); img.src=src; });
const embedFont  = async (pdf, url, name, style='normal') => { try { const r=await fetch(url); if(!r.ok) return false; const buf=await r.arrayBuffer(); const b64=btoa(new Uint8Array(buf).reduce((s,b)=>s+String.fromCharCode(b),'')); const fn=`${name}-${style}.ttf`; pdf.addFileToVFS(fn,b64); pdf.addFont(fn,name,style); return true; } catch { return false; } };

const downloadPdf = async () => {
  if (!request.value) return;
  pdfGenerating.value = true;
  try {
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const M=10, PW=210, CW=PW-2*M; let y=M;
    const fontLoaded = await embedFont(pdf, '/fonts/Times New Roman.ttf', 'TimesNewRoman', 'normal');
    await embedFont(pdf, '/fonts/Times New Roman Bold.ttf', 'TimesNewRoman', 'bold');
    const F = fontLoaded ? 'TimesNewRoman' : 'helvetica';
    const logo = await loadImage(ORG.logoPath);
    const LOGO_H=24, LOGO_W=logo?(LOGO_H*logo.w/logo.h):0;
    if (logo) pdf.addImage(logo.data,'PNG',M,y-2,LOGO_W,LOGO_H);
    pdf.setFont(F,'bold'); pdf.setFontSize(16); pdf.setTextColor(27,45,89);
    pdf.text(ORG.name, M+(logo?LOGO_W+4:0), y+7);
    const TX=PW-M;
    pdf.setFont(F,'bold'); pdf.setFontSize(11); pdf.setTextColor(0,175,219);
    pdf.text(ORG.nameLatin,TX,y+5,{align:'right'});
    pdf.setTextColor(27,45,89); pdf.text(ORG.nameEnglish,TX,y+10,{align:'right'});
    y+=13;
    pdf.setFont(F,'normal'); pdf.setFontSize(7); pdf.setTextColor(31,56,100);
    pdf.text(`${ORG.address} · Telefon ${ORG.phone} · E-mail: ${ORG.email} · ${ORG.web}`,PW/2,y+4,{align:'center'});
    y+=10;
    pdf.setLineWidth(0.5); pdf.setDrawColor(0,0,0); pdf.line(M,y,PW-M,y); y+=10;
    pdf.setFont(F,'bold'); pdf.setFontSize(13); pdf.setTextColor(0,0,0);
    const titleW=CW-10; pdf.rect(M+(CW-titleW)/2,y,titleW,10);
    pdf.text('ZAHTJEV ZA NABAVU',PW/2,y+6.5,{align:'center'}); y+=18;
    const fields=[['Broj zahtjeva:',request.value.request_number],['Datum:',formatDateOnly(request.value.created_at)],['Zahtjev podnio:',request.value.created_by],['Odjel / Služba:',request.value.department_name],['Predmet nabave:',predmetNabave.value]];
    pdf.setFontSize(11);
    for (const [label,value] of fields) { pdf.setFont(F,'normal'); pdf.setTextColor(0,0,0); pdf.text(label,M,y); pdf.text(String(value??'—'),M+60,y); y+=8; }
    y+=4;
    pdf.setFont(F,'normal'); pdf.setFontSize(11); pdf.setTextColor(0,0,0);
    pdf.text('Svrha nabave (obrazloženje):',M,y); y+=4;
    const boxY=y, boxH=40; pdf.rect(M,boxY,CW,boxH);
    pdf.text(pdf.splitTextToSize(request.value.justification||'—',CW-6),M+3,boxY+6); y+=boxH+8;
    if (items.value.length>0) {
      pdf.setFont(F,'italic'); pdf.setFontSize(10); pdf.setTextColor(80,80,80);
      pdf.text('Specifikacija stavki:',M,y); y+=5;
      const colW=[CW*0.55,CW*0.30,CW*0.15];
      pdf.setFont(F,'bold'); pdf.setFontSize(10); pdf.setTextColor(0,0,0);
      let cx=M; ['Naziv artikla','Kategorija','Količina'].forEach((h,i)=>{pdf.rect(cx,y,colW[i],7);pdf.text(h,cx+2,y+5);cx+=colW[i];}); y+=7;
      pdf.setFont(F,'normal');
      for (const item of items.value) { cx=M; [item.item_name,item.category_name,String(item.quantity)].forEach((cell,i)=>{pdf.rect(cx,y,colW[i],7);pdf.text(String(cell??''),cx+2,y+5);cx+=colW[i];}); y+=7; }
      y+=6;
    }
    pdf.setFont(F,'normal'); pdf.setFontSize(11); pdf.setTextColor(0,0,0);
    pdf.text(`Ukupna nabava se procjenjuje na iznos od `,M,y);
    pdf.setFont(F,'bold'); pdf.text(formatCurrency(request.value.total_amount),M+83,y);
    pdf.text('.',M+83+pdf.getTextWidth(formatCurrency(request.value.total_amount)),y); y+=14;
    pdf.setLineWidth(0.3); pdf.line(M,y,PW-M,y); y+=5;
    pdf.setFont(F,'normal'); pdf.setFontSize(9); pdf.setTextColor(0,0,0);
    pdf.text(`Status: ${request.value.status_name}`,M,y);
    pdf.text(`Ispisano: ${todayDate.value}`,PW-M,y,{align:'right'});
    pdf.save(`${request.value.request_number}.pdf`);
  } catch (err) { console.error('PDF greška:',err); $q.notify({ type: 'negative', message: 'Greška pri generiranju PDF-a.' }); }
  finally { pdfGenerating.value = false; }
};

onMounted(() => { currentUser.value = getStoredUser(); fetchRequestDetails(); });
</script>

<style scoped>
/* ── Base ── */
.page {
  padding: 0;
  background: transparent;
  font-family: 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  color: #111827;
}

/* ── Page body ── */
.loading-block { display: flex; justify-content: center; align-items: center; min-height: 240px; }
.page-body { max-width: 1120px; margin: 0 auto; padding: 32px 40px 40px; display: flex; flex-direction: column; gap: 16px; }
.empty-page { display: flex; flex-direction: column; align-items: center; padding: 60px; }

/* ── Alert box ── */
.alert-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  border-left: 3px solid;
  flex-wrap: wrap;
}
.alert-box--info     { background: #f0f9ff; border-color: #00afdb; color: #0e7490; }
.alert-box--warning  { background: #fffbeb; border-color: #B7791F; color: #B7791F; }
.alert-box--decision { background: #f0fdf4; border-color: #16a34a; color: #15803d; }
.alert-box__icon { flex-shrink: 0; }
.alert-box__body { flex: 1; font-size: 0.8125rem; min-width: 200px; }
.alert-box__title { font-weight: 600; }
.alert-box__desc  { color: inherit; opacity: 0.8; }
.alert-box__actions { display: flex; gap: 6px; flex-shrink: 0; }

/* ── Stepper ── */
.status-stepper {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 8px 20px;
}
.stepper-steps { display: flex; align-items: flex-start; }
.stepper-item  { display: flex; flex-direction: column; align-items: center; min-width: 50px; }
.stepper-connector { flex: 1; height: 2px; background: #e5e7eb; margin-top: 9px; min-width: 12px; transition: background 0.2s; }
.stepper-connector--done { background: #00afdb; }
.stepper-dot {
  width: 20px; height: 20px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid #d1d5db; background: white; color: #9ca3af;
  position: relative; z-index: 1; transition: all 0.2s; flex-shrink: 0;
}
.stepper-dot--done        { background: #00afdb; border-color: #00afdb; color: white; }
.stepper-dot--active      { background: #16294E; border-color: #16294E; color: white; }
.stepper-dot--active-warn { background: #B7791F; border-color: #B7791F; color: white; }
.stepper-dot--active-error{ background: #c50f1f; border-color: #c50f1f; color: white; }
.stepper-dot--upcoming    { background: white;   border-color: #d1d5db; color: #d1d5db; }
.stepper-dot--locked      { background: #f3f4f6; border-color: #e5e7eb; color: #d1d5db; }
.stepper-label {
  font-size: 0.75rem; font-weight: 500; color: #9ca3af;
  text-align: center; margin-top: 3px; white-space: nowrap;
}
.stepper-label--done        { color: #0e7490; font-weight: 600; }
.stepper-label--active      { color: #16294E; font-weight: 700; }
.stepper-label--active-warn { color: #B7791F; font-weight: 700; }
.stepper-label--active-error{ color: #c50f1f; font-weight: 700; }
.stepper-label--locked      { color: #d1d5db; }
.stepper-note {
  display: flex; align-items: center; gap: 5px;
  margin-top: 6px; padding: 4px 8px; border-radius: 6px; font-size: 0.6875rem; font-weight: 500;
}
.stepper-note--warn  { background: #fffbeb; color: #B7791F; border: 1px solid rgba(183,121,31,0.2); }
.stepper-note--error { background: #fef2f2; color: #c50f1f; border: 1px solid rgba(197,15,31,0.2); }

.main-col { display: flex; flex-direction: column; gap: 14px; }

/* ── Compact card modifier ── */
.card--compact .card__header { padding: 10px 14px; }
.card--compact .card__body   { padding: 12px 14px; }
.card--compact .card__body--flush { padding: 0; }
.card--compact .card__empty  { padding: 20px 14px; }

/* ── Info grid ── */
.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px 20px;
  margin: 0; padding: 0;
}
.info-cell { display: flex; flex-direction: column; gap: 2px; }
.info-cell dt { font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; margin: 0; }
.info-cell dd { font-size: 0.8125rem; font-weight: 400; color: #374151; line-height: 1.5; margin: 2px 0 0; }

.info-divider { height: 1px; background: #e5e7eb; margin: 12px 0; }
.info-section-label { font-size: 0.6875rem; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
.info-section-count { font-size: 0.625rem; background: #f3f4f6; color: #6b7280; padding: 1px 6px; border-radius: 9999px; font-variant-numeric: tabular-nums; }
.prose { font-size: 0.8125rem; color: #111827; line-height: 1.6; margin: 0; white-space: pre-wrap; }

/* ── Items table ── */
.items-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.items-table--tight { max-width: 640px; }
.items-table thead th {
  text-align: left; font-size: 0.625rem; font-weight: 600;
  letter-spacing: 0.04em; text-transform: uppercase; color: #6b7280;
  background: #fafafa; padding: 8px 14px; border-bottom: 1px solid #e5e7eb;
}
.items-table tbody td { padding: 9px 14px; font-size: 0.8125rem; color: #111827; border-bottom: 1px solid #f0f0f0; }
.items-table tbody tr:last-child td { border-bottom: none; }
.text-right { text-align: right; }
.muted { color: #6b7280; }
.num   { font-variant-numeric: tabular-nums; font-weight: 500; }

/* ── Doc slots ── */
.doc-slots { display: flex; flex-direction: column; }
.doc-slot {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 8px 0; border-bottom: 1px solid #f0f0f0; flex-wrap: wrap;
}
.doc-slot:last-child { border-bottom: none; }
.doc-slot__left { display: flex; align-items: center; gap: 7px; min-width: 0; }
.doc-slot__icon--ok      { color: #107C10; flex-shrink: 0; }
.doc-slot__icon--missing { color: #d1d5db; flex-shrink: 0; }
.doc-slot__type { font-size: 0.8125rem; font-weight: 500; color: #374151; white-space: nowrap; }
.doc-slot__filename {
  font-size: 0.75rem; color: #6b7280;
  max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.doc-slot__right { display: flex; align-items: center; gap: 3px; flex-shrink: 0; }
.doc-badge {
  display: inline-flex; align-items: center; justify-content: center; gap: 3px;
  font-size: 0.625rem; font-weight: 600; padding: 2px 8px;
  border-radius: 9999px; border: 1px solid; white-space: nowrap;
  min-width: 72px;
}
.doc-badge--ok      { background: #f0fdf4; color: #107C10; border-color: #bbf7d0; }
.doc-badge--missing { background: #f9fafb; color: #9ca3af; border-color: #e5e7eb; }
.doc-upload-btn { cursor: pointer; }

/* ── Section header (zajednički pattern: ikona + naslov + pill broj, opcionalno chevron) ── */
.section-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #e5e7eb;
}
/* Section naslovi (Stavke, Povijest aktivnosti) — jasno iznad field labela (Dokumenti, Svrha nabave) u hijerarhiji */
.section-header .card__title,
.accordion-header .card__title {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #16294E;
  letter-spacing: 0.02em;
  line-height: 1.2;
  text-transform: uppercase;
}
.section-header .card__title .q-icon,
.accordion-header .card__title .q-icon {
  color: #16294E;
}
/* AI gumb uz naslov Stavke — .q-icon boju mora pregaziti pravilo
   `.section-header .card__title .q-icon` (ista specificnost, dolazi ranije). */
.ai-items-btn {
  all: unset;
  box-sizing: border-box;
  display: inline-flex; align-items: center; gap: 4px;
  height: 20px; padding: 0 8px;
  border: 1px solid rgba(0, 175, 219, 0.35);
  border-radius: 9999px;
  background: rgba(0, 175, 219, 0.08);
  color: #0e7490;
  font-size: 0.6875rem; font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.section-header .ai-items-btn .q-icon { color: inherit; }
.ai-items-btn:hover {
  background: rgba(0, 175, 219, 0.18);
  border-color: #00afdb;
  color: #0369a1;
}
.ai-items-btn:focus-visible {
  outline: 2px solid #00afdb;
  outline-offset: 2px;
}

.count-pill {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 20px; height: 20px; padding: 0 6px;
  border-radius: 9999px;
  background: rgba(0, 175, 219, 0.12);
  color: #0e7490;
  font-size: 0.6875rem; font-weight: 700;
  font-variant-numeric: tabular-nums;
}

/* ── Accordion ── */
.accordion-header {
  all: unset; box-sizing: border-box;
  display: flex; width: 100%; align-items: center; justify-content: space-between;
  padding: 10px 14px; cursor: pointer;
  border-bottom: 1px solid #e5e7eb;
  transition: background 0.12s;
  border-radius: 12px 12px 0 0;
}
.accordion-header:hover { background: #f9fafb; }
.card__body--flush { padding: 0; }
.card__empty { padding: 24px 14px; text-align: center; color: #9ca3af; font-size: 0.8125rem; }

/* ── Timeline ── */
.timeline { list-style: none; margin: 0; padding: 10px 14px; position: relative; }
.timeline-more { padding: 0 14px 10px; display: flex; justify-content: center; }
.timeline-item {
  display: flex; gap: 10px; padding: 5px 0 12px; position: relative;
}
.timeline-item::before {
  content: ''; position: absolute; left: 9px; top: 25px; bottom: 0;
  width: 1px; background: #e5e7eb;
}
.timeline-item:last-child::before { display: none; }
.timeline-dot {
  width: 20px; height: 20px; border-radius: 50%;
  background: white; border: 1px solid #d1d5db;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; position: relative; z-index: 1; color: #6b7280; margin-top: 2px;
}
.timeline-item--doc-add .timeline-dot  { background: #f0fdf4; border-color: #bbf7d0; color: #107C10; }
.timeline-item--doc-del .timeline-dot  { background: #fef2f2; border-color: #fecaca; color: #c50f1f; }
.timeline-item--edit .timeline-dot     { background: rgba(0,175,219,0.08); border-color: rgba(0,175,219,0.3); color: #0e7490; }
.timeline-item--amount .timeline-dot   { background: #f0fdf4; border-color: #bbf7d0; color: #15803d; }
.timeline-item--s-1 .timeline-dot { background: #eff6ff; border-color: #bfdbfe; color: #2563eb; }
.timeline-item--s-2 .timeline-dot { background: #fffbeb; border-color: #fde68a; color: #B7791F; }
.timeline-item--s-3 .timeline-dot { background: #fff7ed; border-color: #fed7aa; color: #C2410C; }
.timeline-item--s-5 .timeline-dot { background: #fef2f2; border-color: #fecaca; color: #c50f1f; }
.timeline-item--s-6 .timeline-dot { background: rgba(0,175,219,0.08); border-color: rgba(0,175,219,0.3); color: #0e7490; }
.timeline-item--s-7 .timeline-dot { background: #f0fdf4; border-color: #bbf7d0; color: #107C10; }
.timeline-content { flex: 1; min-width: 0; padding-top: 1px; }
.timeline-title   { font-size: 0.8125rem; font-weight: 600; color: #111827; }
.timeline-meta    { font-size: 0.6875rem; color: #6b7280; margin-top: 1px; }
.timeline-reldate { border-bottom: 1px dashed #d1d5db; cursor: default; }
.timeline-comment { margin-top: 5px; padding: 6px 10px; background: #fafafa; border: 1px solid #e5e7eb; border-radius: 4px; font-size: 0.75rem; color: #111827; line-height: 1.5; }

/* ── Merged card top row ── */
.merged-top {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 16px;
  border-bottom: 1px solid #e5e7eb;
}
.merged-top__row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.action-bar__identity {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.action-bar__vsep {
  width: 1px; height: 22px;
  background: #e5e7eb; flex-shrink: 0;
}
.action-bar__req-number {
  font-size: 0.8125rem; font-weight: 700;
  color: #16294E; letter-spacing: 0.02em; white-space: nowrap;
}
.btn-add-amount {
  all: unset;
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 0.75rem; font-weight: 600; color: #00afdb;
  cursor: pointer; padding: 1px 6px; border-radius: 6px;
  transition: background 0.12s; letter-spacing: 0.01em;
}
.btn-add-amount:hover { background: rgba(0, 175, 219, 0.1); }
.action-bar__actions {
  display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
}

/* meta strip — vertikalni stack sekcija (DOKUMENTI / SVRHA NABAVE / NAPOMENA) */
.meta-strip {
  display: flex;
  flex-direction: column;
  padding: 16px;
}
.meta-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  white-space: nowrap;
}
.meta-col + .meta-col {
  padding-top: 16px;
  border-top: 1px solid #f0f0f0;
}
.meta-col--prose { gap: 16px; white-space: normal; }
.meta-section { display: flex; flex-direction: column; gap: 4px; }

.prose--meta { margin: 2px 0 0; font-size: 0.8125rem; color: #374151; line-height: 1.5; white-space: normal; }

/* doc rows inside meta-col — grid: [naziv 1fr][status auto][akcije auto], poravnato po stupcima */
.doc-grid {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 6px 14px;
}
.doc-row { display: contents; }
.doc-row__name {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}
.doc-row__status { justify-self: start; }
.doc-row__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  justify-self: end;
  min-height: 30px;
}
/* Oko-ikona kad inline preview nije moguć za tip datoteke — prigušena, klik i dalje radi (fallback na preuzimanje) */
.icon-btn--muted { opacity: 0.35; }
.icon-btn--muted:hover { opacity: 0.7; }

/* ── Merged card inline alert ── */
.merged-alert {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 11px;
  border-radius: 8px;
  font-size: 0.8125rem;
  font-weight: 600;
  border: 1.5px solid;
  white-space: nowrap;
  flex-shrink: 0;
}
.merged-alert--warning  { background: #fffbeb; border-color: #B7791F; color: #B7791F; }
.merged-alert--decision { background: #f0fdf4; border-color: #16a34a; color: #15803d; }
.merged-alert__desc { font-weight: 400; opacity: 0.85; }

/* ── Responsive ── */
@media (max-width: 640px) {
  .page-body { padding: 14px 16px 32px; }
  .stepper-label { display: none; }
  .action-bar { gap: 8px; }
  .action-bar__identity { flex-wrap: wrap; }
}
@media (max-width: 480px) {
  .status-stepper { overflow-x: auto; }
  .stepper-steps  { min-width: 320px; }
}

/* ══════════════════════════════════════════
   PRINT VIEW
   ══════════════════════════════════════════ */
.print-view { display: none; }

@media print {
  @page { size: A4; margin: 18mm; }
  body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print { display: none !important; }
  .q-layout, .q-page-container, .q-page { background: white !important; }
  .page { background: white !important; padding: 0 !important; }
  .print-view { display: block !important; color: black; font-family: 'Times New Roman', Times, serif; font-size: 11pt; line-height: 1.4; }
  .print-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 4px; }
  .print-header__left { display: flex; align-items: center; gap: 12px; }
  .print-header__logo { width: 48px; height: 48px; object-fit: contain; }
  .print-header__inst { font-size: 11pt; font-weight: 700; color: #1F3864; letter-spacing: 0.04em; }
  .print-header__right { text-align: right; font-size: 8pt; color: #1F3864; font-weight: 700; letter-spacing: 0.02em; }
  .print-header__right-en { font-style: italic; font-weight: 400; }
  .print-header__contact { font-size: 8pt; color: #555; text-align: center; margin-top: 6px; }
  .print-header__line { border-top: 1.5px solid black; margin: 8px 0 22px; }
  .print-title-box { border: 1px solid black; padding: 4px 0; text-align: center; margin-bottom: 20px; }
  .print-title-box h1 { font-size: 12pt; font-weight: 700; letter-spacing: 0.05em; margin: 0; }
  .print-fields { display: grid; grid-template-columns: 200px 1fr; gap: 14px 16px; margin-bottom: 24px; }
  .print-fields__label { font-size: 11pt; }
  .print-fields__label-sub { font-style: italic; font-size: 10pt; display: block; }
  .print-fields__value { font-size: 11pt; }
  .print-purpose { margin-bottom: 18px; }
  .print-purpose__box { border: 1px solid black; padding: 10px 12px; min-height: 130px; }
  .print-purpose__label { font-size: 11pt; margin-bottom: 6px; }
  .print-purpose__text { font-size: 11pt; line-height: 1.55; white-space: pre-wrap; }
  .print-items { margin: 16px 0 22px; }
  .print-items__title { font-size: 10pt; font-style: italic; color: #555; margin-bottom: 4px; }
  .print-items table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  .print-items th, .print-items td { border: 1px solid black; padding: 4px 8px; text-align: left; }
  .print-items th { font-weight: 700; background: #F0F0F0; }
  .print-items .num { text-align: right; }
  .print-total { font-size: 11pt; margin: 18px 0 8px; }
  .print-stamp { margin-top: 28px; padding-top: 12px; border-top: 1px solid black; display: flex; justify-content: space-between; font-size: 9pt; }
}
</style>
