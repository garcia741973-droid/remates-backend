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
        g.plant_live_weight_kg, g.plant_weighed_at,
        g.plant_weighed_by, g.plant_weight_observation,
        g.created_at, g.updated_at,
        COALESCE(ref.group_quantity, 0)::int AS group_quantity,
        COALESCE(ref.field_known_kg, 0)::numeric AS field_reference_known_kg,
        CASE
          WHEN COALESCE(ref.known_line_count, 0) = 0 THEN 'none'
          WHEN ref.known_line_count = ref.line_count THEN 'complete'
          ELSE 'partial'
        END AS field_reference_status,
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
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(gl.quantity), 0)::int AS group_quantity,
          COUNT(*)::int AS line_count,
          COUNT(*) FILTER (
            WHERE gl.quantity = c.quantity
              AND c.gross_weight_kg > 0
              AND c.weight_mode IN ('individual', 'category_total')
          )::int AS known_line_count,
          COALESCE(SUM(
            CASE
              WHEN gl.quantity = c.quantity
                AND c.gross_weight_kg > 0
                AND c.weight_mode IN ('individual', 'category_total')
              THEN c.gross_weight_kg
              ELSE 0
            END
          ), 0)::numeric AS field_known_kg
        FROM slaughterhouse_scale_group_lines gl
        JOIN slaughterhouse_field_partial_load_categories c
          ON c.id = gl.field_category_id
         AND c.company_id = gl.company_id
        WHERE gl.group_id = g.id
          AND gl.company_id = g.company_id
      ) ref ON TRUE
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
      `SELECT id, status, plant_live_weight_kg FROM slaughterhouse_scale_groups
       WHERE company_id = $1 AND troop_id = $2
       FOR UPDATE`,
      [companyId, troopId],
    );
    if (previousResult.rows.some((row) =>
      row.status !== 'draft' || row.plant_live_weight_kg != null)) {
      reject(409, 'Hay grupos pesados, confirmados o en Faena; ya no se pueden reorganizar');
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

// =========================================================
// PATCH /slaughterhouse/scale/troops/:troopId/groups/:groupId/plant-weight
// Registra UNA pesada viva TOTAL por grupo operativo.
// No modifica el peso global del camión ni los pesos de Campo.
// Primera pesada: bloquea reorganización; correcciones requieren
// flujo específico auditado (no sobrescribir silenciosamente).
// =========================================================
exports.registerSlaughterhouseScaleGroupPlantWeight = async (req, res) => {
  let client;
  let inTransaction = false;
  try {
    const { companyId, userId, troopId } = readContext(req);
    const rawGroupId = String(req.params.groupId ?? '');
    if (!/^\d+$/.test(rawGroupId) || BigInt(rawGroupId) <= 0n ||
        BigInt(rawGroupId) > 9223372036854775807n) {
      reject(400, 'ID de grupo inválido');
    }
    const groupId = BigInt(rawGroupId).toString();

    // NUMERIC(12,3) PostgreSQL. No aceptar exponentes ni más
    // de tres decimales: evita redondeos silenciosos.
    const rawWeight = req.body?.plant_live_weight_kg;
    const weightText = String(rawWeight ?? '').trim();
    const weight = Number(weightText);
    if (!/^\d+(?:\.\d{1,3})?$/.test(weightText) ||
        !Number.isFinite(weight) || weight <= 0 || weight >= 1000000000) {
      reject(400, 'Peso vivo del grupo inválido (kg, hasta 3 decimales)');
    }

    const rawObservation = req.body?.plant_weight_observation;
    if (rawObservation != null && typeof rawObservation !== 'string') {
      reject(400, 'Observación inválida');
    }
    const observation = rawObservation?.trim() || null;
    if (observation && observation.length > 2000) {
      reject(400, 'Observación demasiado extensa');
    }

    client = await pool.connect();
    await client.query('BEGIN');
    inTransaction = true;

    // Siempre bloquear primero la tropa: el guardado de
    // composición utiliza el mismo orden de bloqueo.
    const troopResult = await client.query(
      `SELECT st.id, st.reception_id, st.status,
              st.field_capture_status, st.received_quantity,
              sr.status AS reception_status
       FROM slaughterhouse_troops st
       JOIN slaughterhouse_receptions sr
         ON sr.id = st.reception_id
        AND sr.company_id = st.company_id
       WHERE st.id = $1 AND st.company_id = $2
       FOR UPDATE OF st`,
      [troopId, companyId],
    );
    if (!troopResult.rows.length) {
      reject(404, 'Tropa no encontrada o sin recepción válida');
    }
    const troop = troopResult.rows[0];
    if (troop.status !== 'received' ||
        !['open', 'in_slaughter'].includes(troop.reception_status)) {
      reject(409, 'La tropa ya no está disponible para pesar grupos');
    }
    if (troop.field_capture_status !== 'certified') {
      reject(409, 'La captura de Campo no está certificada');
    }
    const received = Number(troop.received_quantity);
    if (!Number.isSafeInteger(received) || received <= 0) {
      reject(409, 'La tropa no tiene animales recibidos');
    }

    const groupResult = await client.query(
      `SELECT g.id, g.status, g.reception_id,
              g.group_number, g.plant_live_weight_kg,
              g.plant_weighed_at, g.plant_weighed_by
       FROM slaughterhouse_scale_groups g
       WHERE g.id = $1 AND g.company_id = $2
         AND g.troop_id = $3 AND g.reception_id = $4
       FOR UPDATE`,
      [groupId, companyId, troopId, troop.reception_id],
    );
    if (!groupResult.rows.length) {
      reject(404, 'Grupo no encontrado en esta tropa y recepción');
    }
    const groupBefore = groupResult.rows[0];
    if (!['draft', 'confirmed'].includes(groupBefore.status)) {
      reject(409, 'El grupo ya está en Faena o cerrado');
    }
    if (groupBefore.plant_live_weight_kg != null) {
      reject(409, 'El grupo ya fue pesado. La corrección requiere una operación auditada');
    }

    // No aceptar grupos vacíos ni distribuciones incompletas.
    const allocationResult = await client.query(
      `SELECT g.id,
              COALESCE(SUM(gl.quantity), 0)::int AS quantity
       FROM slaughterhouse_scale_groups g
       LEFT JOIN slaughterhouse_scale_group_lines gl
         ON gl.group_id = g.id AND gl.company_id = g.company_id
       WHERE g.company_id = $1 AND g.troop_id = $2
         AND g.reception_id = $3 AND g.status <> 'cancelled'
       GROUP BY g.id`,
      [companyId, troopId, troop.reception_id],
    );
    const quantities = allocationResult.rows;
    if (!quantities.length ||
        quantities.some((row) => Number(row.quantity) <= 0) ||
        quantities.reduce((total, row) => total + Number(row.quantity), 0) !== received) {
      reject(409, 'La distribución de grupos no coincide con los animales recibidos');
    }

    // Validar nuevamente la asignación línea por línea.
    // El total de animales, por sí solo, no detecta que se
    // haya sustituido una categoría por otra.
    const certifiedResult = await client.query(
      `SELECT c.id, c.quantity
       FROM slaughterhouse_field_partial_load_categories c
       JOIN slaughterhouse_field_partial_loads pl
         ON pl.id = c.partial_load_id AND pl.company_id = c.company_id
       JOIN slaughterhouse_troops st
         ON st.id = pl.troop_id AND st.company_id = pl.company_id
       WHERE pl.company_id = $1 AND pl.troop_id = $2
         AND pl.purchase_lot_id = st.purchase_lot_id
         AND pl.status = 'certified'`,
      [companyId, troopId],
    );
    const assignedResult = await client.query(
      `SELECT gl.field_category_id, SUM(gl.quantity)::int AS quantity
       FROM slaughterhouse_scale_group_lines gl
       JOIN slaughterhouse_scale_groups g
         ON g.id = gl.group_id AND g.company_id = gl.company_id
       WHERE g.company_id = $1 AND g.troop_id = $2
         AND g.reception_id = $3 AND g.status <> 'cancelled'
       GROUP BY gl.field_category_id`,
      [companyId, troopId, troop.reception_id],
    );
    const certifiedLines = new Map(
      certifiedResult.rows.map((row) => [String(row.id), Number(row.quantity)]),
    );
    const assignedLines = new Map(
      assignedResult.rows.map((row) => [String(row.field_category_id), Number(row.quantity)]),
    );
    if (!certifiedLines.size || assignedLines.size !== certifiedLines.size ||
        [...certifiedLines].some(([id, quantity]) => assignedLines.get(id) !== quantity)) {
      reject(409, 'Los grupos no conservan exactamente las líneas certificadas de Campo');
    }

    // Rechazar si Faena clásica ya registró medias de esta tropa.
    const carcassResult = await client.query(
      `SELECT 1 FROM slaughterhouse_carcasses
       WHERE reception_id = $1 AND troop_id = $2 LIMIT 1`,
      [troop.reception_id, troopId],
    );
    if (carcassResult.rows.length) {
      reject(409, 'La tropa ya tiene medias carcasas; no puede iniciarse el pesaje por grupos');
    }

    const oldGroup = (await getGroupRows(client, companyId, troopId))
      .find((row) => String(row.id) === groupId);

    const updated = await client.query(
      `UPDATE slaughterhouse_scale_groups
       SET plant_live_weight_kg = $1::numeric,
           plant_weighed_at = NOW(),
           plant_weighed_by = $2,
           plant_weight_observation = $3,
           status = 'confirmed',
           confirmed_by = COALESCE(confirmed_by, $2),
           confirmed_at = COALESCE(confirmed_at, NOW()),
           updated_at = NOW()
       WHERE id = $4 AND company_id = $5 AND troop_id = $6
         AND reception_id = $7 AND status IN ('draft', 'confirmed')
         AND plant_live_weight_kg IS NULL
       RETURNING id`,
      [weightText, userId, observation, groupId,
        companyId, troopId, troop.reception_id],
    );
    if (!updated.rows.length) {
      reject(409, 'El grupo cambió durante el pesaje. Recarga Balanza');
    }

    const newGroup = (await getGroupRows(client, companyId, troopId))
      .find((row) => String(row.id) === groupId);
    await client.query(
      `INSERT INTO slaughterhouse_audit_log
         (company_id, user_id, entity_type, entity_id,
          action, old_data, new_data)
       VALUES ($1, $2, 'scale_group', $3,
               'scale_group_plant_weight_save', $4::jsonb, $5::jsonb)`,
      [companyId, userId, groupId,
        JSON.stringify(oldGroup), JSON.stringify(newGroup)],
    );

    await client.query('COMMIT');
    inTransaction = false;

    const fieldKg = Number(newGroup.field_reference_known_kg);
    const fullFieldReference = newGroup.field_reference_status === 'complete' &&
      fieldKg > 0;
    return res.json({
      success: true,
      troop_id: troopId,
      group: newGroup,
      difference_kg: fullFieldReference
        ? Number((weight - fieldKg).toFixed(3)) : null,
      difference_percent: fullFieldReference
        ? Number(((weight - fieldKg) / fieldKg * 100).toFixed(2)) : null,
    });
  } catch (error) {
    if (inTransaction && client) {
      try { await client.query('ROLLBACK'); }
      catch (rollbackError) {
        console.error('ROLLBACK SCALE GROUP WEIGHT ERROR:', rollbackError);
      }
    }
    if (error instanceof ScaleGroupsError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('REGISTER SCALE GROUP PLANT WEIGHT ERROR:', error);
    return res.status(500).json({ error: 'Error registrando peso vivo del grupo' });
  } finally {
    if (client) client.release();
  }
};