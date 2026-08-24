// Poslovna logika za kreiranje zahtjeva za nabavu (POST /api/requests):
// validacija ulaza, provjera pripadnosti odjela/kategorija poslovnoj godini,
// generiranje broja zahtjeva NAB-GGGG-NNNN pod transakcijom i insert stavki.
// Izdvojeno iz requestRoutes.js da ruta ostane tanka i da isti kod jednog
// dana može zvati i AI agent (vidi docs/AI.md), ne samo ručni unos.

const db = require('../config/db');
const { STATUS } = require('../constants/status');

const MAX_JUSTIFICATION_LEN = 1000;

/** Očekivana (poslovna) greška — ruta je mapira na `status` bez logiranja. */
class RequestValidationError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function validateCreateInput({ fk_fiscal_year, fk_department, justification, estimated_amount, items }) {
  if (!fk_fiscal_year || !fk_department) {
    throw new RequestValidationError(400, 'Fiskalna godina i odjel su obavezni.');
  }

  if (!justification || !justification.trim()) {
    throw new RequestValidationError(400, 'Obrazloženje nabave je obavezno.');
  }

  if (justification.length > MAX_JUSTIFICATION_LEN) {
    throw new RequestValidationError(400, `Obrazloženje ne smije biti duže od ${MAX_JUSTIFICATION_LEN} znakova.`);
  }

  if (estimated_amount !== null && estimated_amount !== undefined && estimated_amount !== '') {
    const num = Number(estimated_amount);
    if (!Number.isFinite(num) || num < 0) {
      throw new RequestValidationError(400, 'Procijenjeni iznos mora biti pozitivan broj.');
    }
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new RequestValidationError(400, 'Zahtjev mora sadržavati barem jednu stavku.');
  }

  for (const [idx, item] of items.entries()) {
    if (!item.fk_item_category || !item.item_name || !item.item_name.trim()) {
      throw new RequestValidationError(400, `Stavka #${idx + 1}: kategorija i naziv su obavezni.`);
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new RequestValidationError(400, `Stavka #${idx + 1}: količina mora biti cijeli broj veći od 0.`);
    }
  }
}

/**
 * Kreira zahtjev za nabavu (status Poslano) i njegove stavke pod transakcijom.
 * @returns {Promise<{ id_purchase_request: number, request_number: string, fk_request_status: number }>}
 * @throws {RequestValidationError} kod neispravnog ulaza ili poslovnog pravila (400)
 * @throws {Error} s `error.code === 'ER_DUP_ENTRY'` kod konflikta pri generiranju broja, ili drugu neočekivanu grešku
 */
async function createRequest({ fk_fiscal_year, fk_department, justification, estimated_amount, comment, items, userId }) {
  validateCreateInput({ fk_fiscal_year, fk_department, justification, estimated_amount, items });

  const statusId = STATUS.POSLANO;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [fyRows] = await connection.query(
      'SELECT year, is_closed FROM FiscalYear WHERE id_fiscal_year = ? LIMIT 1',
      [fk_fiscal_year]
    );

    if (fyRows.length === 0) {
      await connection.rollback();
      throw new RequestValidationError(400, 'Fiskalna godina ne postoji.');
    }

    if (fyRows[0].is_closed) {
      await connection.rollback();
      throw new RequestValidationError(400, 'Odabrana poslovna godina je zatvorena. Kreiranje zahtjeva nije moguće.');
    }

    // odjel mora pripadati istoj poslovnoj godini
    const [deptCheck] = await connection.query(
      'SELECT id_department FROM Department WHERE id_department = ? AND fk_fiscal_year = ?',
      [fk_department, fk_fiscal_year]
    );
    if (deptCheck.length === 0) {
      await connection.rollback();
      throw new RequestValidationError(400, 'Odabrani odjel ne pripada odabranoj poslovnoj godini.');
    }

    // sve kategorije moraju pripadati istoj poslovnoj godini
    const categoryIds = [...new Set(items.map((i) => i.fk_item_category))];
    const [catCheck] = await connection.query(
      `SELECT id_item_category FROM ItemCategory WHERE id_item_category IN (?) AND fk_fiscal_year = ?`,
      [categoryIds, fk_fiscal_year]
    );
    if (catCheck.length !== categoryIds.length) {
      await connection.rollback();
      throw new RequestValidationError(400, 'Jedna ili više kategorija artikala ne pripada odabranoj poslovnoj godini.');
    }

    const year = fyRows[0].year;
    const prefix = `NAB-${year}-`;

    const [maxRows] = await connection.query(
      `
      SELECT request_number
      FROM PurchaseRequest
      WHERE request_number LIKE ?
      ORDER BY id_purchase_request DESC
      LIMIT 1
      FOR UPDATE
      `,
      [`${prefix}%`]
    );

    let nextSeq = 1;
    if (maxRows.length > 0) {
      const lastSeq = parseInt(maxRows[0].request_number.split('-')[2], 10);
      if (!Number.isNaN(lastSeq)) nextSeq = lastSeq + 1;
    }

    const requestNumber = `${prefix}${String(nextSeq).padStart(4, '0')}`;

    const commentValue = comment && comment.trim() ? comment.trim() : null;

    const [insertResult] = await connection.query(
      `
      INSERT INTO PurchaseRequest
        (request_number, fk_fiscal_year, fk_department, fk_request_status,
         fk_created_by_user, total_amount, justification, comment)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        requestNumber,
        fk_fiscal_year,
        fk_department,
        statusId,
        userId,
        estimated_amount === '' || estimated_amount === undefined ? null : estimated_amount,
        justification.trim(),
        commentValue,
      ]
    );

    const newRequestId = insertResult.insertId;

    const itemValues = items.map((it) => [
      newRequestId,
      it.fk_item_category,
      it.item_name.trim(),
      it.quantity,
    ]);

    await connection.query(
      `
      INSERT INTO PurchaseRequestItem
        (fk_purchase_request, fk_item_category, item_name, quantity)
      VALUES ?
      `,
      [itemValues]
    );

    await connection.query(
      `
      INSERT INTO RequestStatusHistory
        (fk_purchase_request, fk_request_status, fk_changed_by_user, comment)
      VALUES (?, ?, ?, ?)
      `,
      [newRequestId, statusId, userId, 'Zahtjev kreiran i poslan.']
    );

    await connection.commit();

    return {
      id_purchase_request: newRequestId,
      request_number: requestNumber,
      fk_request_status: statusId,
    };
  } catch (error) {
    if (!(error instanceof RequestValidationError)) {
      await connection.rollback();
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { createRequest, RequestValidationError, MAX_JUSTIFICATION_LEN };
