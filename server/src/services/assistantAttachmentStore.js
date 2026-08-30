// Privremeno server-side spremište IZVORNIH bajtova priloga uz AI razgovor
// (docs/AI.md). Postoji zato što create_request — koji izvornu ponudu sprema
// kao formalni prilog uz zahtjev — tipično stigne tek nekoliko poteza NAKON
// uploada, a multipart upload ide samo uz jednu poruku razgovora.
//
// Ranije su ti bajtovi putovali kroz KLIJENTA: orkestrator ih je vraćao kao
// base64 u skrivenoj "carrier" poruci, a klijent ih je vraćao natrag u svakom
// sljedećem zahtjevu. To je imalo dva stvarna problema:
//   1. Veličina — 5 priloga x 5 MB (limiti u assistantRoutes.js) je ~33 MB
//      base64 po zahtjevu, iznad express.json limita (10 MB) i nginx
//      client_max_body_size — drugi potez razgovora s dvije veće ponude tako
//      je padao, i to na generičku 500 poruku.
//   2. Povjerenje — bajtovi koji se spremaju na disk dolazili su iz tijela
//      zahtjeva, pa je krivotvorena carrier poruka mogla podmetnuti PROIZVOLJAN
//      sadržaj i mimeType, zaobilazeći magic-bytes provjeru koju ruta radi nad
//      stvarnim uploadom.
// Sada kroz klijenta putuje samo neprozirni ID, a bajtovi ostaju ovdje.
//
// NAMJERNO u memoriji, ne u bazi ni na disku: to je nedovršen draft koji ne
// smije ostaviti trag ako korisnik odustane (docs/AI.md, Sigurnost). Cijena je
// da spremište ne preživi restart servera i da ne bi radilo uz više instanci
// backenda — deployment je jedan backend kontejner (docker-compose.yml), a
// gubitak nakon restarta znači samo da se prilog ne spremi uz zahtjev, uz
// jasnu posljedicu (zahtjev bez priloga), ne krivi podatak.

const crypto = require('crypto');

// Razgovor s lokalnim modelom zna trajati minutama po potezu (izmjereni
// medijani 100-900s, docs/eval-runs/), pa TTL mora pokriti cijeli razgovor s
// rezervom, ne samo jedan poziv.
const ENTRY_TTL_MS = 60 * 60 * 1000;

// Gornja granica za SVE aktivne razgovore zajedno — zaštita od gomilanja
// napuštenih draftova. Kad se probije, izbacuje se najstariji unos (Map čuva
// redoslijed umetanja).
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

/** @type {Map<string, { userId: number, createdAt: number, bytes: number, files: Array<{fileName: string, mimeType: string, buffer: Buffer}> }>} */
const entries = new Map();
let totalBytes = 0;

function deleteEntry(id) {
  const entry = entries.get(id);
  if (!entry) return;
  totalBytes -= entry.bytes;
  entries.delete(id);
}

/**
 * Lijeno čišćenje isteklih unosa — namjerno bez setInterval-a, da spremište
 * ne drži Node proces (ni jest worker) živim samo zbog tajmera.
 */
function sweepExpired(now = Date.now()) {
  for (const [id, entry] of entries) {
    if (now - entry.createdAt >= ENTRY_TTL_MS) deleteEntry(id);
  }
}

function evictOldestUntilFits() {
  for (const id of entries.keys()) {
    if (totalBytes <= MAX_TOTAL_BYTES) return;
    console.warn(`[assistantAttachmentStore] granica od ${MAX_TOTAL_BYTES} B probijena — izbacujem najstariji prilog ${id}.`);
    deleteEntry(id);
  }
}

/**
 * Sprema izvorne bajtove priloga jednog poteza i vraća neprozirni ID koji
 * putuje kroz razgovor umjesto samih bajtova.
 *
 * @param {number} userId vlasnik — provjerava se pri dohvatu
 * @param {Array<{fileName: string, mimeType: string, buffer: Buffer}>} files
 * @returns {string|null} ID, ili null ako nema što spremiti
 */
function putAttachments(userId, files) {
  const usable = (files || []).filter((f) => f && Buffer.isBuffer(f.buffer) && f.buffer.length > 0);
  if (usable.length === 0) return null;

  sweepExpired();

  const id = crypto.randomUUID();
  const bytes = usable.reduce((sum, f) => sum + f.buffer.length, 0);
  entries.set(id, { userId, createdAt: Date.now(), bytes, files: usable });
  totalBytes += bytes;
  evictOldestUntilFits();

  return id;
}

/**
 * Dohvaća bajtove po ID-u iz carrier poruke. Vraća PRAZAN niz umjesto greške
 * kad unos ne postoji, istekao je ili pripada drugom korisniku — jedina
 * posljedica je zahtjev bez priloga, što je bolje od pada usred kreiranja.
 *
 * Provjera vlasništva je bitna jer ID prolazi kroz klijenta: bez nje bi tuđi
 * (pogođen ili prepisan) ID priložio tuđi dokument uz vlastiti zahtjev.
 *
 * @returns {Array<{fileName: string, mimeType: string, buffer: Buffer}>}
 */
function getAttachments(id, userId) {
  if (!id) return [];
  sweepExpired();

  const entry = entries.get(id);
  if (!entry) return [];
  if (entry.userId !== userId) {
    console.warn(`[assistantAttachmentStore] prilog ${id} tražen iz tuđeg konteksta (vlasnik ${entry.userId}, tražitelj ${userId}) — ignoriram.`);
    return [];
  }
  return entry.files;
}

/** Oslobađa unos čim je prilog stvarno spremljen uz zahtjev (ili kad ga više nema smisla čuvati). */
function dropAttachments(id) {
  if (id) deleteEntry(id);
}

/** Samo za testove — čisti globalno stanje između slučajeva. */
function _resetForTests() {
  entries.clear();
  totalBytes = 0;
}

module.exports = {
  putAttachments,
  getAttachments,
  dropAttachments,
  _resetForTests,
  ENTRY_TTL_MS,
  MAX_TOTAL_BYTES,
};
