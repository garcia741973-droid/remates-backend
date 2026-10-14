const { pool } = require('../config/db');

// La ruta debe usar requireAuth, requireSlaughterhouseAdmin y
// requireSlaughterhousePermission('slaughter.manage').
// Esta operación SOLO permite corregir grupos aún en Faena.
// Correcciones posteriores al cierre requieren otro procedimiento,
// autorización y verificación de liquidaciones, que NO se implementan aquí.

const parseBigIntId = (raw) => {
  const value = String(raw ?? '');
  if (!/^\d{1,19}$/.test(value)) return null;
  const id = BigInt(value);
  return id > 0n && id <= 9223372036854775807n ? id.toString() : null;
};

const fail = (status, message) => {
  const error = new Error(message);
  error.httpStatus = status;
  throw error;
};

exports.correctSlaughterhouseScaleGroupCarcass = async (req, res) => {
  const companyId = Number(req.slaughterhouseAdmin?.company_id);
  const userId = Number(req.slaughterhouseAdmin?.user_id);
  const troopId = Number(req.params.troopId);
  const groupId = parseBigIntId(req.params.groupId);
  const carcassId = parseBigIntId(req.params.carcassId);
  const weightInput = req.body?.hook_weight_kg;
  const hookWeightKg = Number(weightInput);
  const reason = req.body?.reason;

  if (!Number.isSafeInteger(companyId) || companyId <= 0 ||
      !Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(403).json({ error: 'Operador de frigorífico no autorizado' });
  }
  if (!Number.isSafeInteger(troopId) || troopId <= 0 || !groupId || !carcassId) {
    return res.status(400).json({ error: 'Tropa, grupo o media inválidos' });
  }
  if (weightInput === null || weightInput === undefined || weightInput === '' ||
      !Number.isFinite(hookWeightKg) || hookWeightKg <= 0) {
    return res.status(400).json({ error: 'Peso de media carcasa inválido' });
  }
  if (typeof reason !== 'string' || reason.trim().length < 5 ||
      reason.trim().length > 500) {
    return res.status(400).json({
      error: 'Indique un motivo de corrección de 5 a 500 caracteres',
    });
  }
  const cleanReason = reason.trim();

  let client;
  let inTransaction = false;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    inTransaction = true;

    // Orden de bloqueos consistente con el alta y cierre de Faena:
    // tropa + recepción, grupo, y finalmente media carcasa.
    const troopResult = await client.query(
      `SELECT st.id, st.reception_id, st.status AS troop_status,
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
      fail(409, 'La tropa o recepción ya no está en Faena');
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
    if (groupResult.rows[0].status !== 'in_slaughter') {
      fail(409, 'Este grupo no está en Faena. Los grupos cerrados requieren autorización y control de liquidación');
    }

    const carcassResult = await client.query(
      `SELECT sc.*
       FROM slaughterhouse_carcasses sc
       WHERE sc.id = $1 AND sc.reception_id = $2
         AND sc.troop_id = $3 AND sc.scale_group_id = $4
         AND EXISTS (
           SELECT 1 FROM slaughterhouse_scale_group_lines gl
           WHERE gl.company_id = $5 AND gl.group_id = sc.scale_group_id
             AND gl.field_category_id = sc.field_category_id
         )
       FOR UPDATE OF sc`,
      [carcassId, receptionId, troopId, groupId, companyId],
    );
    if (!carcassResult.rows.length) {
      fail(404, 'Media no encontrada en este grupo o con línea de Campo inválida');
    }

    const previous = carcassResult.rows[0];
    const previousWeightKg = Number(previous.hook_weight_kg);
    if (previousWeightKg === hookWeightKg) {
      fail(409, 'El peso nuevo coincide con el peso registrado');
    }

    // Solo se altera el peso y la fecha de modificación.
    // recorded_by, recorded_at, grupo, clasificación y secuencias se conservan.
    const updatedResult = await client.query(
      `UPDATE slaughterhouse_carcasses
       SET hook_weight_kg = $1, updated_at = NOW()
       WHERE id = $2 AND reception_id = $3 AND troop_id = $4
         AND scale_group_id = $5
       RETURNING *`,
      [hookWeightKg, carcassId, receptionId, troopId, groupId],
    );
    if (updatedResult.rows.length !== 1) {
      fail(409, 'No se pudo actualizar la media de este grupo');
    }
    const carcass = updatedResult.rows[0];

    // Validar que no se alteró el peso por redondeo de la columna.
    if (Number(carcass.hook_weight_kg) <= 0) {
      fail(409, 'El peso corregido no es válido');
    }

    const base = {
      carcass_id: previous.id,
      reception_id: receptionId,
      troop_id: troopId,
      scale_group_id: groupId,
      field_category_id: previous.field_category_id,
      animal_sequence_number: previous.animal_sequence_number,
      half_number: previous.half_number,
      sequence_number: previous.sequence_number,
    };

    // Se auditan valores anterior/nuevo y motivo. Si falla la auditoría,
    // la transacción revierte también el UPDATE de la media.
    await client.query(
      `INSERT INTO slaughterhouse_audit_log
         (company_id, user_id, entity_type, entity_id,
          action, old_data, new_data)
       VALUES ($1, $2, 'scale_group', $3,
               'scale_group_half_carcass_weight_correct', $4::jsonb, $5::jsonb)`,
      [companyId, userId, groupId,
        JSON.stringify({ ...base, hook_weight_kg: previousWeightKg }),
        JSON.stringify({ ...base, hook_weight_kg: Number(carcass.hook_weight_kg),
          reason: cleanReason }),
      ],
    );

    await client.query('COMMIT');
    inTransaction = false;

    return res.json({
      success: true,
      message: 'Peso de media carcasa corregido con auditoría',
      carcass,
      corrected: {
        carcass_id: carcass.id,
        scale_group_id: groupId,
        field_category_id: carcass.field_category_id,
        animal_sequence_number: carcass.animal_sequence_number,
        half_number: carcass.half_number,
        previous_weight_kg: previousWeightKg,
        new_weight_kg: Number(carcass.hook_weight_kg),
        reason: cleanReason,
      },
    });
  } catch (error) {
    if (client && inTransaction) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('ROLLBACK GROUP CARCASS CORRECTION ERROR:', rollbackError);
      }
    }
    if (error.httpStatus) {
      return res.status(error.httpStatus).json({ error: error.message });
    }
    console.error('CORRECT GROUP CARCASS ERROR:', error);
    return res.status(500).json({ error: 'Error corrigiendo media de grupo' });
  } finally {
    if (client) client.release();
  }
};