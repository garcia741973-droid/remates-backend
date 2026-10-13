const { pool } = require('../config/db');

// Los permisos se aplican en slaughterhouseRoutes.js:
// requireAuth + requireSlaughterhouseAdmin + plant_weight.manage.
// NO aceptar company_id ni user_id enviados desde el cliente.

class ScaleGroupsError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const reject = (status, message) => {
  throw new ScaleGroupsError(status, message);
};

const readContext = (req) => {
  const companyId = Number(req.slaughterhouseAdmin?.company_id);
  const userId = Number(req.slaughterhouseAdmin?.user_id);
  const troopId = Number(req.params.troopId);
  if (!Number.isSafeInteger(companyId) || companyId <= 0 ||
      !Number.isSafeInteger(userId) || userId <= 0) {
    reject(403, 'Operador de frigorífico no autorizado');
  }
  if (!Number.isSafeInteger(troopId) || troopId <= 0) {
    reject(400, 'ID de tropa inválido');
  }
  return { companyId, userId, troopId };
};

const getGroupRows = async (db, companyId, troopId) => {
  const result = await db.query(
    `
      SELECT
        g.id, g.company_id, g.reception_id, g.troop_id,
        g.group_number, g.group_label, g.status,
        g.created_by, g.confirmed_by, g.confirmed_at,
        g.created_at, g.updated_at,
        COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'field_category_id', gl.field_category_id,
                'quantity', gl.quantity
              )
              ORDER BY gl.id
            )
            FROM slaughterhouse_scale_group_lines gl
            WHERE gl.group_id = g.id
              AND gl.company_id = g.company_id
          ),
          '[]'::jsonb
        ) AS lines
      FROM slaughterhouse_scale_groups g
      WHERE g.company_id = $1 AND g.troop_id = $2
      ORDER BY g.group_number, g.id
    `,
    [companyId, troopId],
  );
  return result.rows;
};

// =========================================================
// GET /slaughterhouse/scale/troops/:troopId/groups
// Recuperar composición guardada por Balanza, sin editar.
// =========================================================
exports.getSlaughterhouseScaleGroups = async (req, res) => {
  try {
    const { companyId, troopId } = readContext(req);
    const troopResult = await pool.query(
      `SELECT st.id, st.reception_id, st.received_quantity,
              st.field_capture_status
       FROM slaughterhouse_troops st
       WHERE st.id = $1 AND st.company_id = $2`,
      [troopId, companyId],
    );
    if (!troopResult.rows.length) {
      return res.status(404).json({ error: 'Tropa no encontrada' });
    }
    const groups = await getGroupRows(pool, companyId, troopId);
    return res.json({
      troop_id: troopId,
      reception_id: troopResult.rows[0].reception_id,
      received_quantity: troopResult.rows[0].received_quantity,
      field_capture_status: troopResult.rows[0].field_capture_status,
      saved: groups.length > 0,
      groups,
    });
  } catch (error) {
    if (error instanceof ScaleGroupsError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('GET SCALE GROUPS ERROR:', error);
    return res.status(500).json({ error: 'Error consultando grupos de Balanza' });
  }
};

// =========================================================
// PUT /slaughterhouse/scale/troops/:troopId/groups
// Guardar borrador COMPLETO (reemplazo atómico).
// Formato: { groups: [ { group_label?, lines:
//   [ { field_category_id, quantity } ] } ] }
// No confirma Faena ni modifica Campo ni pesos.
// =========================================================
exports.saveSlaughterhouseScaleGroups = async (req, res) => {
  let client;
  let inTransaction = false;
  try {
    const { companyId, userId, troopId } = readContext(req);
    const inputGroups = req.body?.groups;
    if (!Array.isArray(inputGroups) ||
        inputGroups.length === 0 || inputGroups.length > 500) {
      reject(400, 'Debes enviar entre 1 y 500 grupos');
    }

    // Validar estructura antes de bloquear la base de datos.
    const parsedGroups = [];
    const allocatedByFieldLine = new Map();
    for (let index = 0; index < inputGroups.length; index++) {
      const group = inputGroups[index];
      if (!group || typeof group !== 'object' || Array.isArray(group)) {
        reject(400, `Grupo ${index + 1} inválido`);
      }
      const label = group.group_label == null
        ? null
        : String(group.group_label).trim();
      if (label && label.length > 120) {
        reject(400, `Nombre del grupo ${index + 1} demasiado largo`);
      }
      if (!Array.isArray(group.lines) ||
          group.lines.length === 0 || group.lines.length > 1000) {
        reject(400, `Grupo ${index + 1} sin líneas válidas`);
      }
      const seenInGroup = new Set();
      const lines = [];
      for (const raw of group.lines) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          reject(400, `Línea inválida en grupo ${index + 1}`);
        }
        const rawLineId = String(raw.field_category_id ?? '');
        const quantity = Number(raw.quantity);
        // Los IDs de Campo son BIGINT; conservarlos como cadenas.
        if (!/^\d+$/.test(rawLineId) ||
            BigInt(rawLineId) <= 0n ||
            BigInt(rawLineId) > 9223372036854775807n ||
            !Number.isSafeInteger(quantity) || quantity <= 0) {
          reject(400, `Línea o cantidad inválida en grupo ${index + 1}`);
        }
        const lineId = BigInt(rawLineId).toString();
        if (seenInGroup.has(lineId)) {
          reject(400, `Línea ${lineId} repetida en el mismo grupo`);
        }
        seenInGroup.add(lineId);
        allocatedByFieldLine.set(
          lineId,
          (allocatedByFieldLine.get(lineId) ?? 0) + quantity,
        );
        lines.push({ field_category_id: lineId, quantity });
      }
      parsedGroups.push({
        group_number: index + 1,
        group_label: label || null,
        lines,
      });
    }

    client = await pool.connect();
    await client.query('BEGIN');
    inTransaction = true;

    // Bloqueo de la tropa: evita guardar a la vez que otra
    // operación de Balanza o la transición hacia Faena.
    const troopResult = await client.query(
      `
        SELECT st.id, st.company_id, st.purchase_lot_id,
               st.reception_id, st.received_quantity,
               st.field_capture_status, st.status,
               sr.status AS reception_status
        FROM slaughterhouse_troops st
        JOIN slaughterhouse_receptions sr
          ON sr.id = st.reception_id
         AND sr.company_id = st.company_id
        WHERE st.id = $1 AND st.company_id = $2
        FOR UPDATE OF st
      `,
      [troopId, companyId],
    );
    if (!troopResult.rows.length) {
      reject(404, 'Tropa no encontrada o sin recepción válida');
    }
    const troop = troopResult.rows[0];
    if (troop.status !== 'received' ||
        !['open', 'in_slaughter'].includes(troop.reception_status)) {
      reject(409, 'La tropa ya no está disponible para organizar grupos');
    }
    if (troop.field_capture_status !== 'certified') {
      reject(409, 'La captura de Campo aún no está certificada');
    }
    const received = Number(troop.received_quantity);
    if (!Number.isSafeInteger(received) || received <= 0) {
      reject(409, 'La tropa no tiene animales recibidos');
    }

    // Revisar las líneas que EFECTIVAMENTE pertenecen a las
    // cargas certificadas de esta empresa, lote y tropa.
    const sourceResult = await client.query(
      `
        SELECT c.id, c.quantity
        FROM slaughterhouse_field_partial_load_categories c
        JOIN slaughterhouse_field_partial_loads pl
          ON pl.id = c.partial_load_id
         AND pl.company_id = c.company_id
        WHERE c.company_id = $1
          AND pl.purchase_lot_id = $2
          AND pl.troop_id = $3
          AND pl.status = 'certified'
        ORDER BY c.id
      `,
      [companyId, troop.purchase_lot_id, troopId],
    );
    if (!sourceResult.rows.length) {
      reject(409, 'No existen categorías certificadas para esta tropa');
    }
    const certifiedByFieldLine = new Map(
      sourceResult.rows.map((row) => [String(row.id), Number(row.quantity)]),
    );
    const certifiedQuantity = sourceResult.rows.reduce(
      (sum, row) => sum + Number(row.quantity), 0,
    );
    if (certifiedQuantity !== received) {
      reject(409,
        `Campo certificó ${certifiedQuantity} animales y Recepción registró ${received}. ` +
        'Conciliar antes de guardar grupos.');
    }
    if (allocatedByFieldLine.size !== certifiedByFieldLine.size) {
      reject(409, 'Faltan líneas certificadas o hay líneas ajenas a esta tropa');
    }
    for (const [lineId, quantity] of certifiedByFieldLine) {
      if (allocatedByFieldLine.get(lineId) !== quantity) {
        reject(409,
          `La línea ${lineId} tiene ${quantity} animales certificados; ` +
          `se intentaron asignar ${allocatedByFieldLine.get(lineId) ?? 0}`);
      }
    }

    // No permitir sustituciones si Faena ya comenzó.
    const carcassResult = await client.query(
      `SELECT 1 FROM slaughterhouse_carcasses
       WHERE reception_id = $1 AND troop_id = $2 LIMIT 1`,
      [troop.reception_id, troopId],
    );
    if (carcassResult.rows.length) {
      reject(409, 'La tropa ya tiene carcasas registradas; no se pueden reemplazar grupos');
    }
    const previousResult = await client.query(
      `SELECT id, status FROM slaughterhouse_scale_groups
       WHERE company_id = $1 AND troop_id = $2
       FOR UPDATE`,
      [companyId, troopId],
    );
    if (previousResult.rows.some((row) => row.status !== 'draft')) {
      reject(409, 'Hay grupos confirmados o en Faena; ya no se pueden reorganizar');
    }
    const oldGroups = await getGroupRows(client, companyId, troopId);

    // Sustituir grupos borrador dentro de la misma transacción.
    await client.query(
      `DELETE FROM slaughterhouse_scale_group_lines gl
       USING slaughterhouse_scale_groups g
       WHERE gl.group_id = g.id
         AND gl.company_id = g.company_id
         AND g.company_id = $1 AND g.troop_id = $2`,
      [companyId, troopId],
    );
    await client.query(
      `DELETE FROM slaughterhouse_scale_groups
       WHERE company_id = $1 AND troop_id = $2 AND status = 'draft'`,
      [companyId, troopId],
    );
    for (const group of parsedGroups) {
      const added = await client.query(
        `INSERT INTO slaughterhouse_scale_groups
           (company_id, reception_id, troop_id, group_number,
            group_label, status, created_by)
         VALUES ($1, $2, $3, $4, $5, 'draft', $6)
         RETURNING id`,
        [companyId, troop.reception_id, troopId,
          group.group_number, group.group_label, userId],
      );
      const groupId = added.rows[0].id;
      for (const line of group.lines) {
        await client.query(
          `INSERT INTO slaughterhouse_scale_group_lines
             (company_id, group_id, field_category_id, quantity)
           VALUES ($1, $2, $3, $4)`,
          [companyId, groupId, line.field_category_id, line.quantity],
        );
      }
    }
    const savedGroups = await getGroupRows(client, companyId, troopId);
    await client.query(
      `INSERT INTO slaughterhouse_audit_log
         (company_id, user_id, entity_type, entity_id,
          action, old_data, new_data)
       VALUES ($1, $2, 'troop', $3,
               'scale_groups_save', $4::jsonb, $5::jsonb)`,
      [companyId, userId, String(troopId),
        JSON.stringify(oldGroups), JSON.stringify(savedGroups)],
    );
    await client.query('COMMIT');
    inTransaction = false;
    return res.json({
      success: true,
      troop_id: troopId,
      received_quantity: received,
      total_groups: savedGroups.length,
      groups: savedGroups,
    });
  } catch (error) {
    if (inTransaction && client) {
      try { await client.query('ROLLBACK'); }
      catch (rollbackError) {
        console.error('ROLLBACK SCALE GROUPS ERROR:', rollbackError);
      }
    }
    if (error instanceof ScaleGroupsError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('SAVE SCALE GROUPS ERROR:', error);
    return res.status(500).json({ error: 'Error guardando grupos de Balanza' });
  } finally {
    if (client) client.release();
  }
};