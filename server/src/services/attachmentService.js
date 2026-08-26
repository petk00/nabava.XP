// Zajednička logika za spremanje FORMALNOG priloga uz zahtjev (Attachment
// tablica + disk uploads/attachments/<requestId>/) — isti spremišni obrazac
// (putanja, DB shema) kao ručni upload (requestAttachmentRoutes.js), tako da
// je prilog nakon spremanja u svemu identičan i dohvatljiv kroz iste GET/
// download rute (attachmentRoutes.js), bez obzira je li stigao ručnim
// uploadom ili preko AI asistenta (assistantOrchestrator.js, kad agent
// stvarno kreira zahtjev na temelju priložene ponude).
//
// requestAttachmentRoutes.js ostaje na multer.diskStorage (datoteka je već
// na disku prije nego ruta uopće krene) i namjerno NIJE refaktoriran da
// poziva ovu funkciju — to bi zahtijevalo promjenu multer strategije u
// ionako testiranoj, radnoj ruti bez stvarne potrebe. Ovdje se umjesto toga
// vjerno replicira ISTI spremišni ugovor (putanja, DB stupci), što je ono
// što stvarno čini prilog "istim" iz perspektive baze/diska/preostalih ruta.

const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '../../uploads'));

function buildAttachmentDiskPath(requestId, originalName) {
  const dir = path.join(UPLOADS_DIR, 'attachments', String(requestId));
  fs.mkdirSync(dir, { recursive: true });
  const timestamp = Date.now();
  const safeName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  return path.join(dir, `${timestamp}-${safeName}`);
}

/** Best-effort brisanje — koristi se za cleanup kad SQL transakcija koja prati zapis padne. */
function cleanupAttachmentFile(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    console.error('Cleanup attachment file failed:', error.message);
  }
}

/**
 * Piše buffer na disk (uploads/attachments/<requestId>/) i insertira
 * Attachment red preko dane konekcije (pool ili transakcijska konekcija —
 * isti obrazac kao requestService.validateBusinessRules). Poziv NE čisti
 * datoteku sam na grešku — pozivatelj (npr. createRequest, unutar svoje
 * transakcije) odgovoran je za cleanup preko cleanupAttachmentFile.
 *
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} queryable
 * @returns {Promise<{ id_attachment: number, file_path: string }>}
 */
async function saveAttachmentBuffer(queryable, { requestId, uploadedByUserId, buffer, fileName, mimeType, documentType }) {
  const diskPath = buildAttachmentDiskPath(requestId, fileName);
  fs.writeFileSync(diskPath, buffer);

  const relativePath = path.relative(UPLOADS_DIR, diskPath);

  const [result] = await queryable.query(
    `INSERT INTO Attachment
      (fk_purchase_request, fk_uploaded_by_user, file_name, file_path, file_type, document_type)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [requestId, uploadedByUserId, fileName, relativePath, mimeType, documentType]
  );

  return { id_attachment: result.insertId, file_path: diskPath };
}

module.exports = { saveAttachmentBuffer, cleanupAttachmentFile, UPLOADS_DIR };
