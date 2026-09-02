const express = require('express');
const router = express.Router();
const db = require('../config/db');
const authenticateToken = require('../middleware/authMiddleware');
const { STATUS, STATUS_LABELS, LOCKED_STATUSES } = require('../constants/status');
const {
  createRequest, RequestValidationError, MAX_JUSTIFICATION_LEN, ITEM_NAME_MAX_LENGTH,
} = require('../services/requestService');

/**
 * State machine.
 *
 * Workflow:
 *   Poslano (1)
 *     → preuzmi → Na odobrenju (2)
 *     → odbij   → Odbijeno (5)        ← admin odbija odmah
 *
 *   Na odobrenju (2)
 *     → odobri           → Naručeno (6)   ← traži Ponudu
 *     → vrati-na-izmjenu → Vraćeno (3)
 *
 *   Vraćeno (3)
 *     → resubmit → Poslano (1)        ← kreator ponovno šalje
 *
 *   Naručeno (6)
 *     → zavrsi → Zatvoreno (7)        ← traži Ponudu, Otpremnicu, iznos
 */
const ACTIONS = {
  preuzmi: {
    from: STATUS.POSLANO,
    to: STATUS.NA_ODOBRENJU,
    adminOnly: true,
    defaultComment: 'Zahtjev preuzet na obradu.',
  },
  odbij: {
    from: [STATUS.POSLANO, STATUS.VRACENO],
    to: STATUS.ODBIJENO,
    adminOnly: true,
    requiresComment: true,
  },
  storno: {
    from: [STATUS.POSLANO, STATUS.NA_ODOBRENJU, STATUS.VRACENO, STATUS.NARUCENO],
    to: STATUS.ODBIJENO,
    adminOnly: true,
    requiresComment: true,
  },
  'vrati-u-obradu': {
    from: STATUS.VRACENO,
    to: STATUS.NA_ODOBRENJU,
    adminOnly: true,
    defaultComment: 'Zahtjev preuzet na ponovnu obradu bez čekanja ponovnog slanja.',
  },
  odobri: {
    from: STATUS.NA_ODOBRENJU,
    to: STATUS.NARUCENO,
    adminOnly: true,
    requiresOffer: true,
    defaultComment: 'Zahtjev odobren.',
  },
  'vrati-na-izmjenu': {
    from: STATUS.NA_ODOBRENJU,
    to: STATUS.VRACENO,
    adminOnly: true,
    requiresComment: true,
  },
  resubmit: {
    from: STATUS.VRACENO,
    to: STATUS.POSLANO,
    creatorOnly: true,
    defaultComment: 'Zahtjev ponovno poslan nakon ispravke.',
  },
  zavrsi: {
    from: STATUS.NARUCENO,
    to: STATUS.ZATVORENO,
    adminOnly: true,
    requiresOffer: true,
    requiresDelivery: true,
    requiresAmount: true,
    defaultComment: 'Zahtjev označen kao završen.',
  },
};

const { calcBudgetImpact } = require('../services/budgetService');

const isAdmin = (user) => user.role_name === 'Administrator';

const getRequestAccessCondition = (user) => {
  if (isAdmin(user)) {
    return { clause: 'pr.id_purchase_request = ?', extraParams: [] };
  }
  return {
    clause: 'pr.id_purchase_request = ? AND pr.fk_created_by_user = ?',
    extraParams: [user.id_user],
  };
};

/**
 * GET /api/requests
 * Lista zahtjeva s paginacijom i filterima (admin vidi sve, zaposlenik samo svoje).
 * Query params: page, limit, search, status, department, user (admin only)
 * Response: { data, total, page, limit, counts: { total, active, attention, closed } }
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const page    = Math.max(1, parseInt(req.query.page)  || 1);
    const limit   = Math.min(500, Math.max(1, parseInt(req.query.limit) || 10));
    const offset  = (page - 1) * limit;
    const search  = (req.query.search  || '').trim();
    const statusParam     = req.query.status     || '';
    const departmentParam = req.query.department || '';
    const userParam       = isAdmin(req.user) ? (req.query.user || '') : '';
    const fiscalYearParam = req.query.fiscalYear || '';
    const categoryParam   = req.query.category   || '';

    const adminUser = isAdmin(req.user);

    const onlyMine = req.query.onlyMine === '1';
    const baseConditions = (adminUser && !onlyMine) ? [] : ['pr.fk_created_by_user = ?'];
    const baseParams      = (adminUser && !onlyMine) ? [] : [req.user.id_user];

    const filterConditions = [...baseConditions];
    const filterParams     = [...baseParams];

    if (search) {
      filterConditions.push(
        `(pr.request_number LIKE ? OR CONCAT(u.first_name, ' ', u.last_name) LIKE ? OR d.name LIKE ?
          OR CASE pr.fk_request_status
            WHEN 1 THEN 'Poslano'
            WHEN 2 THEN 'Na odobrenju'
            WHEN 3 THEN 'Zahtjeva izmjene'
            WHEN 4 THEN 'Odobreno'
            WHEN 5 THEN 'Odbijeno'
            WHEN 6 THEN 'Naručeno'
            WHEN 7 THEN 'Zatvoreno'
          END LIKE ?)`
      );
      filterParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (statusParam) {
      if (statusParam === 'u_obradi') {
        filterConditions.push(`pr.fk_request_status IN (${STATUS.POSLANO},${STATUS.NA_ODOBRENJU},${STATUS.VRACENO})`);
      } else if (statusParam === 'ceka_otpremnicu') {
        filterConditions.push(
          `pr.fk_request_status = ? AND NOT EXISTS (
            SELECT 1 FROM Attachment a WHERE a.fk_purchase_request = pr.id_purchase_request AND a.document_type = 'Otpremnica'
          )`
        );
        filterParams.push(STATUS.NARUCENO);
      } else if (statusParam === 'spremno_za_zatvaranje') {
        filterConditions.push(
          `pr.fk_request_status = ? AND EXISTS (
            SELECT 1 FROM Attachment a WHERE a.fk_purchase_request = pr.id_purchase_request AND a.document_type = 'Otpremnica'
          )`
        );
        filterParams.push(STATUS.NARUCENO);
      } else {
        const statusId = Object.entries(STATUS_LABELS).find(([, label]) => label === statusParam)?.[0];
        if (statusId) {
          filterConditions.push('pr.fk_request_status = ?');
          filterParams.push(parseInt(statusId, 10));
        }
      }
    }

    if (departmentParam) {
      filterConditions.push('d.name = ?');
      filterParams.push(departmentParam);
    }

    if (userParam) {
      filterConditions.push("CONCAT(u.first_name, ' ', u.last_name) = ?");
      filterParams.push(userParam);
    }

    if (fiscalYearParam) {
      const yr = parseInt(fiscalYearParam, 10);
      if (Number.isInteger(yr)) {
        filterConditions.push('fy.year = ?');
        filterParams.push(yr);
      }
    }

    if (categoryParam) {
      filterConditions.push(
        `EXISTS (
          SELECT 1 FROM PurchaseRequestItem pri
          INNER JOIN ItemCategory ic ON pri.fk_item_category = ic.id_item_category
          WHERE pri.fk_purchase_request = pr.id_purchase_request
            AND ic.name = ?
        )`
      );
      filterParams.push(categoryParam);
    }

    const filterWhere = filterConditions.length
      ? 'WHERE ' + filterConditions.join(' AND ')
      : '';

    // Summary counts — always unfiltered (only access control)
    const summaryWhere  = adminUser ? '' : 'WHERE fk_created_by_user = ?';
    const summaryParams = adminUser ? [] : [req.user.id_user];
    const attentionStatusId  = adminUser ? STATUS.POSLANO : STATUS.VRACENO;
    const activeStatusIds    = [STATUS.POSLANO, STATUS.NA_ODOBRENJU, STATUS.VRACENO, STATUS.NARUCENO];

    const [[summary]] = await db.query(
      `SELECT
        COUNT(*) AS total,
        SUM(fk_request_status IN (${activeStatusIds.join(',')})) AS active,
        SUM(fk_request_status = ?) AS attention,
        SUM(fk_request_status = ?) AS closed,
        SUM(fk_request_status = ?) AS na_odobrenju,
        SUM(fk_request_status = ?) AS naruceno,
        SUM(fk_request_status IN (${STATUS.POSLANO},${STATUS.NA_ODOBRENJU},${STATUS.VRACENO})) AS u_obradi,
        SUM(fk_request_status = ? AND NOT EXISTS (
          SELECT 1 FROM Attachment a WHERE a.fk_purchase_request = id_purchase_request AND a.document_type = 'Otpremnica'
        )) AS ceka_otpremnicu,
        SUM(fk_request_status = ? AND EXISTS (
          SELECT 1 FROM Attachment a WHERE a.fk_purchase_request = id_purchase_request AND a.document_type = 'Otpremnica'
        )) AS spremno_za_zatvaranje
       FROM PurchaseRequest
       ${summaryWhere}`,
      [attentionStatusId, STATUS.ZATVORENO, STATUS.NA_ODOBRENJU, STATUS.NARUCENO, STATUS.NARUCENO, STATUS.NARUCENO, ...summaryParams]
    );

    const baseJoin = `
      FROM PurchaseRequest pr
      INNER JOIN FiscalYear fy ON pr.fk_fiscal_year = fy.id_fiscal_year
      INNER JOIN Department d  ON pr.fk_department  = d.id_department
      INNER JOIN AppUser u     ON pr.fk_created_by_user = u.id_user
      LEFT JOIN (
        SELECT fk_purchase_request, comment,
               ROW_NUMBER() OVER (PARTITION BY fk_purchase_request ORDER BY changed_at DESC) AS rn
        FROM RequestStatusHistory
        WHERE comment IS NOT NULL AND comment != ''
      ) lc ON lc.fk_purchase_request = pr.id_purchase_request AND lc.rn = 1
    `;

    const [[countRow]] = await db.query(
      `SELECT COUNT(*) AS total ${baseJoin} ${filterWhere}`,
      filterParams
    );
    const total = countRow?.total || 0;

    const [rows] = await db.query(
      `SELECT
        pr.id_purchase_request,
        pr.request_number,
        fy.year AS fiscal_year,
        d.name AS department_name,
        pr.fk_request_status,
        CONCAT(u.first_name, ' ', u.last_name) AS created_by,
        pr.total_amount,
        pr.created_at,
        pr.updated_at,
        pr.justification,
        lc.comment AS last_comment,
        EXISTS(SELECT 1 FROM Attachment a WHERE a.fk_purchase_request = pr.id_purchase_request AND a.document_type = 'Ponuda') AS has_ponuda,
        EXISTS(SELECT 1 FROM Attachment a WHERE a.fk_purchase_request = pr.id_purchase_request AND a.document_type = 'Otpremnica') AS has_otpremnica
       ${baseJoin}
       ${filterWhere}
       ORDER BY ${({ request_number: 'pr.request_number', department_name: 'd.name', created_by: 'u.last_name', created_at: 'pr.created_at', updated_at: 'pr.updated_at', status_name: 'pr.fk_request_status' }[req.query.sortBy] || 'pr.created_at')} ${req.query.order === 'ASC' ? 'ASC' : 'DESC'}, pr.id_purchase_request ${req.query.order === 'ASC' ? 'ASC' : 'DESC'}
       LIMIT ? OFFSET ?`,
      [...filterParams, limit, offset]
    );

    res.json({
      data: rows.map((row) => ({
        ...row,
        status_name: STATUS_LABELS[row.fk_request_status] || `Status #${row.fk_request_status}`,
      })),
      total,
      page,
      limit,
      counts: {
        total:            Number(summary.total)            || 0,
        active:           Number(summary.active)           || 0,
        attention:        Number(summary.attention)        || 0,
        closed:           Number(summary.closed)           || 0,
        na_odobrenju:     Number(summary.na_odobrenju)     || 0,
        naruceno:         Number(summary.naruceno)         || 0,
        u_obradi:         Number(summary.u_obradi)         || 0,
        ceka_otpremnicu:       Number(summary.ceka_otpremnicu)       || 0,
        spremno_za_zatvaranje: Number(summary.spremno_za_zatvaranje) || 0,
      },
    });
  } catch (error) {
    console.error('GET /api/requests error:', error);
    res.status(500).json({
      message: 'Greška pri dohvaćanju zahtjeva.',
    });
  }
});

/**
 * GET /api/requests/meta
 * Unique department names (and submitter names for admin) across all visible requests.
 * Used to populate filter dropdowns on the client.
 */
router.get('/meta', authenticateToken, async (req, res) => {
  try {
    const adminUser   = isAdmin(req.user);
    const userClause  = adminUser ? '' : 'WHERE pr.fk_created_by_user = ?';
    const userParam   = adminUser ? [] : [req.user.id_user];

    const [deptRows] = await db.query(
      `SELECT DISTINCT d.name
       FROM PurchaseRequest pr
       INNER JOIN Department d ON pr.fk_department = d.id_department
       ${userClause}
       ORDER BY d.name`,
      userParam
    );

    const [yearRows] = await db.query(
      `SELECT DISTINCT fy.year
       FROM PurchaseRequest pr
       INNER JOIN FiscalYear fy ON pr.fk_fiscal_year = fy.id_fiscal_year
       ${userClause}
       ORDER BY fy.year DESC`,
      userParam
    );

    const [catRows] = await db.query(
      `SELECT DISTINCT ic.name
       FROM PurchaseRequest pr
       INNER JOIN PurchaseRequestItem pri ON pri.fk_purchase_request = pr.id_purchase_request
       INNER JOIN ItemCategory ic ON pri.fk_item_category = ic.id_item_category
       ${userClause}
       ORDER BY ic.name`,
      userParam
    );

    const result = {
      departments: deptRows.map((r) => r.name),
      fiscalYears: yearRows.map((r) => r.year),
      categories:  catRows.map((r) => r.name),
    };

    if (adminUser) {
      const [userRows] = await db.query(
        `SELECT DISTINCT CONCAT(u.first_name, ' ', u.last_name) AS name
         FROM PurchaseRequest pr
         INNER JOIN AppUser u ON pr.fk_created_by_user = u.id_user
         ORDER BY name`
      );
      result.users = userRows.map((r) => r.name);
    }

    res.json(result);
  } catch (error) {
    console.error('GET /api/requests/meta error:', error);
    res.status(500).json({ message: 'Greška pri dohvatu metapodataka.' });
  }
});

/**
 * GET /api/requests/:id
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const access = getRequestAccessCondition(req.user);

    const [requestRows] = await db.query(
      `
      SELECT
        pr.id_purchase_request,
        pr.request_number,
        fy.year AS fiscal_year,
        pr.fk_department,
        d.name AS department_name,
        pr.fk_request_status,
        CONCAT(u.first_name, ' ', u.last_name) AS created_by,
        pr.total_amount,
        pr.justification,
        pr.comment,
        pr.created_at,
        pr.updated_at
      FROM PurchaseRequest pr
      INNER JOIN FiscalYear fy ON pr.fk_fiscal_year = fy.id_fiscal_year
      INNER JOIN Department d ON pr.fk_department = d.id_department
      INNER JOIN AppUser u ON pr.fk_created_by_user = u.id_user
      WHERE ${access.clause}
      LIMIT 1
      `,
      [id, ...access.extraParams]
    );

    if (requestRows.length === 0) {
      return res.status(404).json({ message: 'Zahtjev nije pronađen.' });
    }

    const [itemRows] = await db.query(
      `
      SELECT
        pri.id_purchase_request_item,
        pri.fk_item_category,
        pri.item_name,
        pri.quantity,
        ic.name AS category_name
      FROM PurchaseRequestItem pri
      INNER JOIN ItemCategory ic ON pri.fk_item_category = ic.id_item_category
      WHERE pri.fk_purchase_request = ?
      ORDER BY pri.id_purchase_request_item ASC
      `,
      [id]
    );

    const [historyRows] = await db.query(
      `
      SELECT
        rsh.id_request_status_history,
        rsh.fk_request_status,
        CONCAT(u.first_name, ' ', u.last_name) AS changed_by,
        rsh.changed_at,
        rsh.comment
      FROM RequestStatusHistory rsh
      INNER JOIN AppUser u ON rsh.fk_changed_by_user = u.id_user
      WHERE rsh.fk_purchase_request = ?
      ORDER BY rsh.changed_at ASC, rsh.id_request_status_history ASC
      `,
      [id]
    );

    const request = {
      ...requestRows[0],
      status_name:
        STATUS_LABELS[requestRows[0].fk_request_status]
        || `Status #${requestRows[0].fk_request_status}`,
    };

    // Adminu dodaj stanje budžeta odjela — za prikaz utjecaja odobrenja
    // u dijalogu. Potrošnja = isti izračun kao na stranici Financije.
    if (isAdmin(req.user)) {
      const [budgetRows] = await db.query(
        `
        SELECT
          d.department_limit,
          COALESCE(SUM(pr2.total_amount), 0) AS department_spent
        FROM Department d
        LEFT JOIN PurchaseRequest pr2
          ON pr2.fk_department = d.id_department
          AND pr2.fk_request_status IN (?, ?)
        WHERE d.id_department = ?
        GROUP BY d.id_department
        `,
        [STATUS.NARUCENO, STATUS.ZATVORENO, requestRows[0].fk_department]
      );
      if (budgetRows.length > 0) {
        request.department_limit = Number(budgetRows[0].department_limit);
        request.department_spent = Number(budgetRows[0].department_spent);
      }
    }

    res.json({
      request,
      items: itemRows,
      history: historyRows.map((entry) => ({
        ...entry,
        status_name:
          STATUS_LABELS[entry.fk_request_status] || `Status #${entry.fk_request_status}`,
      })),
    });
  } catch (error) {
    console.error('GET /api/requests/:id error:', error);
    res.status(500).json({
      message: 'Greška pri dohvaćanju detalja zahtjeva.',
    });
  }
});

/**
 * POST /api/requests
 */
router.post('/', authenticateToken, async (req, res) => {
  const {
    fk_fiscal_year,
    fk_department,
    justification,
    estimated_amount,
    comment,
    items,
  } = req.body;

  try {
    const result = await createRequest({
      fk_fiscal_year,
      fk_department,
      justification,
      estimated_amount,
      comment,
      items,
      userId: req.user.id_user,
    });

    return res.status(201).json({
      message: 'Zahtjev je uspješno kreiran.',
      ...result,
    });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return res.status(error.status).json({ message: error.message });
    }

    console.error('POST /api/requests error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        message: 'Konflikt pri generiranju broja zahtjeva. Pokušajte ponovno.',
      });
    }

    return res.status(500).json({
      message: 'Greška pri kreiranju zahtjeva.',
    });
  }
});

/**
 * PATCH /api/requests/:id/status
 */
router.patch('/:id/status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { action, comment } = req.body;

  const definition = ACTIONS[action];
  if (!definition) {
    return res.status(400).json({
      message: `Nepoznata akcija. Dozvoljene: ${Object.keys(ACTIONS).join(', ')}.`,
    });
  }

  if (definition.adminOnly && !isAdmin(req.user)) {
    return res.status(403).json({
      message: 'Samo administrator može izvršiti ovu akciju.',
    });
  }

  if (definition.requiresComment && (!comment || !comment.trim())) {
    return res.status(400).json({
      message: 'Komentar je obavezan za ovu akciju.',
    });
  }

  const userId = req.user.id_user;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [requestRows] = await connection.query(
      `
      SELECT fk_request_status, fk_created_by_user, total_amount, fk_department
      FROM PurchaseRequest
      WHERE id_purchase_request = ?
      FOR UPDATE
      `,
      [id]
    );

    if (requestRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Zahtjev nije pronađen.' });
    }

    const currentStatus = requestRows[0].fk_request_status;
    const isCreator = requestRows[0].fk_created_by_user === userId;

    if (definition.creatorOnly && !isCreator && !isAdmin(req.user)) {
      await connection.rollback();
      return res.status(403).json({
        message: 'Možete izvršiti ovu akciju samo na svom zahtjevu.',
      });
    }

    if (LOCKED_STATUSES.includes(currentStatus)) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Zahtjev je zaključan i više se ne može mijenjati.',
      });
    }

    const validFrom = Array.isArray(definition.from) ? definition.from : [definition.from];
    if (!validFrom.includes(currentStatus)) {
      await connection.rollback();
      return res.status(400).json({
        message: `Akcija "${action}" nije dozvoljena u trenutnom statusu.`,
      });
    }

    // Provjera dokumenata
    if (definition.requiresOffer || definition.requiresDelivery) {
      const [docRows] = await connection.query(
        `
        SELECT document_type
        FROM Attachment
        WHERE fk_purchase_request = ?
          AND document_type IN ('Ponuda', 'Otpremnica')
        `,
        [id]
      );
      const types = new Set(docRows.map((r) => r.document_type));

      if (definition.requiresOffer && !types.has('Ponuda')) {
        await connection.rollback();
        return res.status(400).json({
          message: 'Zahtjev mora imati uploadanu Ponudu.',
        });
      }
      if (definition.requiresDelivery && !types.has('Otpremnica')) {
        await connection.rollback();
        return res.status(400).json({
          message: 'Zahtjev mora imati uploadanu Otpremnicu.',
        });
      }
    }

    // Provjera iznosa
    if (definition.requiresAmount) {
      const amount = Number(requestRows[0].total_amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        await connection.rollback();
        return res.status(400).json({
          message: 'Procijenjeni iznos mora biti unesen prije završetka zahtjeva.',
        });
      }
    }

    // Kod odobrenja provjeri utjecaj na limit odjela — prekoračenje ne
    // blokira (SRS 7.3), ali se trajno bilježi u povijest aktivnosti.
    let overLimitNote = '';
    if (action === 'odobri') {
      const [budgetRows] = await connection.query(
        `
        SELECT
          d.department_limit,
          COALESCE(SUM(pr2.total_amount), 0) AS department_spent
        FROM Department d
        LEFT JOIN PurchaseRequest pr2
          ON pr2.fk_department = d.id_department
          AND pr2.fk_request_status IN (?, ?)
        WHERE d.id_department = ?
        GROUP BY d.id_department
        `,
        [STATUS.NARUCENO, STATUS.ZATVORENO, requestRows[0].fk_department]
      );
      if (budgetRows.length > 0) {
        const impact = calcBudgetImpact(
          budgetRows[0].department_limit,
          budgetRows[0].department_spent,
          requestRows[0].total_amount
        );
        if (impact.overLimit) {
          overLimitNote = ` (odobreno uz prekoračenje limita odjela: ${impact.percentAfter} % iskorištenosti)`;
        }
      }
    }

    await connection.query(
      `
      UPDATE PurchaseRequest
      SET fk_request_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id_purchase_request = ?
      `,
      [definition.to, id]
    );

    const historyComment =
      (comment && comment.trim() ? comment.trim() : definition.defaultComment) + overLimitNote;

    await connection.query(
      `
      INSERT INTO RequestStatusHistory
        (fk_purchase_request, fk_request_status, fk_changed_by_user, comment)
      VALUES (?, ?, ?, ?)
      `,
      [id, definition.to, userId, historyComment]
    );

    await connection.commit();

    return res.json({
      message: `Akcija "${action}" je uspješno izvršena.`,
      fk_request_status: definition.to,
    });
  } catch (error) {
    await connection.rollback();
    console.error('PATCH /api/requests/:id/status error:', error);
    return res.status(500).json({
      message: 'Greška pri izvršavanju akcije.',
    });
  } finally {
    connection.release();
  }
});

/**
 * PUT /api/requests/:id
 */
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { fk_department, justification, estimated_amount, items, comment } = req.body;
  const userId = req.user.id_user;
  const userIsAdmin = isAdmin(req.user);

  if (!fk_department) {
    return res.status(400).json({ message: 'Odjel je obavezan.' });
  }
  if (!justification || !justification.trim()) {
    return res.status(400).json({ message: 'Obrazloženje je obavezno.' });
  }
  if (justification.length > MAX_JUSTIFICATION_LEN) {
    return res.status(400).json({
      message: `Obrazloženje ne smije biti duže od ${MAX_JUSTIFICATION_LEN} znakova.`,
    });
  }
  if (estimated_amount !== null && estimated_amount !== undefined && estimated_amount !== '') {
    const num = Number(estimated_amount);
    if (!Number.isFinite(num) || num < 0) {
      return res.status(400).json({
        message: 'Procijenjeni iznos mora biti pozitivan broj.',
      });
    }
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Zahtjev mora imati barem jednu stavku.' });
  }
  for (const [idx, item] of items.entries()) {
    if (!item.fk_item_category || !item.item_name || !item.item_name.trim()) {
      return res.status(400).json({
        message: `Stavka #${idx + 1}: kategorija i naziv su obavezni.`,
      });
    }
    if (item.item_name.trim().length > ITEM_NAME_MAX_LENGTH) {
      return res.status(400).json({
        message: `Stavka #${idx + 1}: naziv je predug (${item.item_name.trim().length} znakova, `
          + `najviše ${ITEM_NAME_MAX_LENGTH}).`,
      });
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      return res.status(400).json({
        message: `Stavka #${idx + 1}: količina mora biti cijeli broj veći od 0.`,
      });
    }
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [requestRows] = await connection.query(
      `
      SELECT fk_request_status, fk_created_by_user, fk_fiscal_year,
             fk_department, justification, total_amount
      FROM PurchaseRequest
      WHERE id_purchase_request = ?
      FOR UPDATE
      `,
      [id]
    );

    if (requestRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Zahtjev nije pronađen.' });
    }

    const currentStatus = requestRows[0].fk_request_status;
    const isCreator = requestRows[0].fk_created_by_user === userId;
    const fyId = requestRows[0].fk_fiscal_year;

    if (LOCKED_STATUSES.includes(currentStatus)) {
      await connection.rollback();
      return res.status(400).json({
        message: 'Zahtjev je zaključan i više se ne može mijenjati.',
      });
    }

    if (!userIsAdmin) {
      if (currentStatus !== STATUS.VRACENO) {
        await connection.rollback();
        return res.status(403).json({
          message: 'Zahtjev možete editirati samo kad je vraćen na izmjenu.',
        });
      }
      if (!isCreator) {
        await connection.rollback();
        return res.status(403).json({
          message: 'Možete editirati samo svoje zahtjeve.',
        });
      }
    }

    // odjel mora pripadati poslovnoj godini zahtjeva
    const [deptCheck] = await connection.query(
      'SELECT id_department FROM Department WHERE id_department = ? AND fk_fiscal_year = ?',
      [fk_department, fyId]
    );
    if (deptCheck.length === 0) {
      await connection.rollback();
      return res.status(400).json({ message: 'Odabrani odjel ne pripada poslovnoj godini ovog zahtjeva.' });
    }

    // sve kategorije moraju pripadati poslovnoj godini zahtjeva
    const categoryIds = [...new Set(items.map((i) => i.fk_item_category))];
    const [catCheck] = await connection.query(
      `SELECT id_item_category FROM ItemCategory WHERE id_item_category IN (?) AND fk_fiscal_year = ?`,
      [categoryIds, fyId]
    );
    if (catCheck.length !== categoryIds.length) {
      await connection.rollback();
      return res.status(400).json({ message: 'Jedna ili više kategorija artikala ne pripada poslovnoj godini ovog zahtjeva.' });
    }

    await connection.query(
      `
      UPDATE PurchaseRequest
      SET fk_department = ?,
          justification = ?,
          total_amount = ?,
          comment = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id_purchase_request = ?
      `,
      [
        fk_department,
        justification.trim(),
        estimated_amount === '' || estimated_amount === undefined ? null : estimated_amount,
        comment && comment.trim() ? comment.trim() : null,
        id,
      ]
    );

    await connection.query(
      'DELETE FROM PurchaseRequestItem WHERE fk_purchase_request = ?',
      [id]
    );

    const itemValues = items.map((it) => [
      id,
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
      [id, currentStatus, userId, (() => {
        const prev = requestRows[0];
        const newAmt = (estimated_amount === '' || estimated_amount == null) ? null : Number(estimated_amount);
        const oldAmt = prev.total_amount == null ? null : Number(prev.total_amount);
        const onlyAmountChanged =
          newAmt !== oldAmt &&
          fk_department === prev.fk_department &&
          justification.trim() === (prev.justification || '').trim();
        return onlyAmountChanged ? 'Dodan procijenjeni iznos.' : 'Zahtjev izmijenjen.';
      })()]
    );

    await connection.commit();
    return res.json({ message: 'Zahtjev uspješno ažuriran.' });
  } catch (error) {
    await connection.rollback();
    console.error('PUT /api/requests/:id error:', error);
    return res.status(500).json({
      message: 'Greška pri ažuriranju zahtjeva.',
    });
  } finally {
    connection.release();
  }
});

module.exports = router;