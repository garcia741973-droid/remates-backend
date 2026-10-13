const { pool } = require('../config/db');

// Las rutas que usen este controlador DEBEN tener:
// requireAuth, requireSlaughterhouseAdmin,
// requireSlaughterhousePermission('slaughter.manage').

const parseBigIntId = (raw) => {
  const value = String(raw ?? '');
  if (!/^\d+$/.test(value)) return null;
  const id = BigInt(value);
  return id > 0n && id <= 9223372036854775807n ? id.toString() : null;
};

const fail = (status, message, code) => {
  const error = new Error(message);
  error.httpStatus = status;
  error.code = code;
  throw error;
};

exports.createSlaughterhouseScaleGroupCarcass = async (req, res) => {
  const companyId = Number(req.slaughterhouseAdmin?.company_id);
  const userId = Number(req.slaughterhouseAdmin?.user_id);
  const troopId = Number(req.params.troopId);
  const groupId = parseBigIntId(req.params.groupId);
  const hookWeightKg = Number(req.body?.hook_weight_kg);
  const hasFieldCategory = req.body?.field_category_id !== null &&
    req.body?.field_category_id !== undefined &&
    req.body?.field_category_id !== '';
  const requestedCategoryId = hasFieldCategory
    ? parseBigIntId(req.body.field_category_id) : null;
  const notes = String(req.body?.notes ?? '').trim() || null;
  const plantCarcassNumber =
    String(req.body?.plant_carcass_number ?? '').trim() || null;

  if (!Number.isSafeInteger(companyId) || companyId <= 0 ||
      !Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(403).json({ error: 'Operador de frigorífico no autorizado' });
  }
  if (!Number.isSafeInteger(troopId) || troopId <= 0 || !groupId) {
    return res.status(400).json({ error: 'Tropa o grupo inválido' });
  }
  if (!Number.isFinite(hookWeightKg) || hookWeightKg <= 0) {
    return res.status(400).json({ error: 'Peso de media carcasa inválido' });
  }
  if (hasFieldCategory && !requestedCategoryId) {
    return res.status(400).json({ error: 'Línea certificada inválida' });
  }
  if (notes && notes.length > 5000) {
    return res.status(400).json({ error: 'Observación demasiado extensa' });
  }

  let client;
  let inTransaction = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    inTransaction = true;

    // La recepción también se bloquea: conserva la secuencia global
    // de animales/medias entre todos los grupos y tropas del lote.
    const troopResult = await client.query(
      `SELECT st.id, st.status AS troop_status, st.received_quantity,
              st.reception_id, st.purchase_lot_id,
              sr.status AS reception_status
       FROM slaughterhouse_troops st
       JOIN slaughterhouse_receptions sr
         ON sr.id = st.reception_id AND sr.company_id = st.company_id
       WHERE st.id = $1 AND st.company_id = $2
       FOR UPDATE OF st, sr`,
      [troopId, companyId],
    );
    if (!troopResult.rows.length) {
      fail(404, 'Tropa o recepción no encontrada');
    }
    const troop = troopResult.rows[0];
    const receptionId = Number(troop.reception_id);
    if (troop.troop_status !== 'in_slaughter' ||
        troop.reception_status !== 'in_slaughter') {
      fail(409, 'La tropa y su recepción deben estar en Faena');
    }

    const groupResult = await client.query(
      `SELECT id, status, plant_live_weight_kg
       FROM slaughterhouse_scale_groups
       WHERE id = $1 AND company_id = $2 AND troop_id = $3
         AND reception_id = $4
       FOR UPDATE`,
      [groupId, companyId, troopId, receptionId],
    );
    if (!groupResult.rows.length) {
      fail(404, 'Grupo no encontrado en esta tropa');
    }
    const group = groupResult.rows[0];
    if (group.status !== 'in_slaughter' ||
        !(Number(group.plant_live_weight_kg) > 0)) {
      fail(409, 'Primero debe iniciarse Faena de este grupo pesado');
    }

    // No mezclar Faena antigua y nueva dentro de una misma tropa.
    const traditional = await client.query(
      `SELECT 1 FROM slaughterhouse_carcasses
       WHERE reception_id = $1 AND troop_id = $2
         AND scale_group_id IS NULL LIMIT 1`,
      [receptionId, troopId],
    );
    if (traditional.rows.length) {
      fail(409, 'Esta tropa contiene medias tradicionales sin grupo');
    }

    const groupQuantityResult = await client.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS total
       FROM slaughterhouse_scale_group_lines
       WHERE company_id = $1 AND group_id = $2`,
      [companyId, groupId],
    );
    const groupQuantity = Number(groupQuantityResult.rows[0].total);
    if (!Number.isSafeInteger(groupQuantity) || groupQuantity <= 0) {
      fail(409, 'El grupo no tiene animales asignados');
    }

    const groupProgress = await client.query(
      `SELECT COUNT(*)::int AS halves,
              COUNT(*) FILTER (WHERE half_number = 1)::int AS first_halves,
              COUNT(*) FILTER (WHERE half_number = 2)::int AS second_halves
       FROM slaughterhouse_carcasses
       WHERE reception_id = $1 AND troop_id = $2 AND scale_group_id = $3`,
      [receptionId, troopId, groupId],
    );
    const prevHalves = Number(groupProgress.rows[0].halves);
    if (prevHalves >= groupQuantity * 2) {
      fail(409, 'Ya se registraron todas las medias de este grupo');
    }

    // Mismo límite global que el flujo tradicional (incluye registros legacy).
    const receptionProgress = await client.query(
      `SELECT COUNT(*) FILTER (
                WHERE animal_sequence_number IS NULL OR half_number IS NULL
              )::int AS legacy_animals,
              COUNT(*) FILTER (
                WHERE animal_sequence_number IS NOT NULL AND half_number IS NOT NULL
              )::int AS modern_halves,
              COALESCE(MAX(sequence_number), 0)::int AS last_sequence
       FROM slaughterhouse_carcasses
       WHERE reception_id = $1`,
      [receptionId],
    );
    const rp = receptionProgress.rows[0];
    const receivedResult = await client.query(
      `SELECT COALESCE(SUM(received_quantity), 0)::int AS total
       FROM slaughterhouse_reception_trucks WHERE reception_id = $1`,
      [receptionId],
    );
    const received = Number(receivedResult.rows[0].total);
    if (Number(rp.legacy_animals) * 2 + Number(rp.modern_halves) >= received * 2) {
      fail(409, 'Ya se registraron las medias de todos los animales recibidos');
    }

    // No se debe alternar grupo/tropa con un animal que tiene una
    // sola media. La segunda conserva siempre GRUPO Y LÍNEA.
    const lastModernResult = await client.query(
      `SELECT animal_sequence_number, half_number, troop_id,
              scale_group_id, field_category_id
       FROM slaughterhouse_carcasses
       WHERE reception_id = $1 AND animal_sequence_number IS NOT NULL
         AND half_number IS NOT NULL
       ORDER BY sequence_number DESC, id DESC LIMIT 1`,
      [receptionId],
    );
    const last = lastModernResult.rows[0];
    const needsSecondHalf = last && Number(last.half_number) === 1;
    let animalNumber;
    let halfNumber;
    let fieldCategoryId;

    if (needsSecondHalf) {
      if (Number(last.troop_id) !== troopId ||
          String(last.scale_group_id ?? '') !== groupId) {
        fail(409, 'Primero complete la segunda media del animal anterior en su grupo');
      }
      fieldCategoryId = String(last.field_category_id ?? '');
      if (!fieldCategoryId) {
        fail(409, 'La primera media no tiene línea de Campo; requiere revisión');
      }
      if (hasFieldCategory && requestedCategoryId !== fieldCategoryId) {
        fail(409, 'La segunda media debe conservar la línea de Campo de la primera');
      }
      animalNumber = Number(last.animal_sequence_number);
      halfNumber = 2;
    } else {
      if (!requestedCategoryId) {
        fail(400, 'Seleccione la línea certificada para la primera media del animal');
      }
      const lineResult = await client.query(
        `SELECT gl.quantity,
                (SELECT COUNT(*)::int
                 FROM slaughterhouse_carcasses sc
                 WHERE sc.reception_id = $1 AND sc.troop_id = $2
                   AND sc.scale_group_id = $3
                   AND sc.field_category_id = gl.field_category_id
                   AND sc.half_number = 1) AS assigned_animals
         FROM slaughterhouse_scale_group_lines gl
         JOIN slaughterhouse_field_partial_load_categories fc
           ON fc.id = gl.field_category_id AND fc.company_id = gl.company_id
         JOIN slaughterhouse_field_partial_loads pl
           ON pl.id = fc.partial_load_id AND pl.company_id = fc.company_id
         WHERE gl.company_id = $4 AND gl.group_id = $3
           AND gl.field_category_id = $5
           AND pl.troop_id = $2 AND pl.purchase_lot_id = $6
           AND pl.status = 'certified'`,
        [receptionId, troopId, groupId, companyId, requestedCategoryId,
          troop.purchase_lot_id],
      );
      if (!lineResult.rows.length) {
        fail(409, 'La línea certificada no pertenece a este grupo');
      }
      const line = lineResult.rows[0];
      if (Number(line.assigned_animals) >= Number(line.quantity)) {
        fail(409, 'Se completó la cantidad de animales de esta línea en el grupo');
      }
      if (Number(groupProgress.rows[0].first_halves) >= groupQuantity) {
        fail(409, 'Se completó la cantidad de animales del grupo');
      }
      fieldCategoryId = requestedCategoryId;
      animalNumber = last
        ? Number(last.animal_sequence_number) + 1
        : Number(rp.legacy_animals) + 1;
      halfNumber = 1;
    }

    const nextSequence = Number(rp.last_sequence) + 1;
    const inserted = await client.query(
      `INSERT INTO slaughterhouse_carcasses
         (reception_id, sequence_number, plant_carcass_number,
          hook_weight_kg, notes, recorded_by, recorded_at,
          troop_id, animal_sequence_number, half_number,
          scale_group_id, field_category_id)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10, $11)
       RETURNING *`,
      [receptionId, nextSequence, plantCarcassNumber, hookWeightKg,
        notes, userId, troopId, animalNumber, halfNumber,
        groupId, fieldCategoryId],
    );
    const carcass = inserted.rows[0];

    await client.query(
      `INSERT INTO slaughterhouse_audit_log
         (company_id, user_id, entity_type, entity_id,
          action, old_data, new_data)
       VALUES ($1, $2, 'scale_group', $3,
               'scale_group_half_carcass_create', NULL, $4::jsonb)`,
      [companyId, userId, groupId, JSON.stringify({
        carcass_id: carcass.id, reception_id: receptionId, troop_id: troopId,
        animal_sequence_number: animalNumber, half_number: halfNumber,
        field_category_id: fieldCategoryId, hook_weight_kg: hookWeightKg,
      })],
    );
    await client.query('COMMIT');
    inTransaction = false;
    return res.status(201).json({
      success: true,
      carcass,
      group_id: groupId,
      group_quantity: groupQuantity,
      half_carcasses_count: prevHalves + 1,
      remaining_half_carcasses: groupQuantity * 2 - prevHalves - 1,
      next_half_number: halfNumber === 1 ? 2 : 1,
    });
  } catch (error) {
    if (client && inTransaction) {
      try { await client.query('ROLLBACK'); }
      catch (rollbackError) {
        console.error('ROLLBACK GROUP CARCASS ERROR:', rollbackError);
      }
    }
    if (error.httpStatus) {
      return res.status(error.httpStatus).json({
        error: error.message, ...(error.code ? { code: error.code } : {}),
      });
    }
    console.error('CREATE SCALE GROUP CARCASS ERROR:', error);
    return res.status(500).json({ error: 'Error registrando media de grupo' });
  } finally {
    if (client) client.release();
  }
};