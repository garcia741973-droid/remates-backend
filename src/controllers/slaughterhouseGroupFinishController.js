const { pool } = require('../config/db');

// POST /slaughterhouse/scale/troops/:troopId/groups/:groupId/finish-slaughter
// Ruta protegida con requireAuth + requireSlaughterhouseAdmin
// + requireSlaughterhousePermission('slaughter.manage').
// Una transacción: grupo, incidencias, tropa, recepción y auditoría.

const positiveInteger = (raw) => {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
};

const bigintId = (raw) => {
  const value = String(raw ?? '');
  if (!/^\d+$/.test(value)) return null;
  const parsed = BigInt(value);
  return parsed > 0n && parsed <= 9223372036854775807n
    ? parsed.toString() : null;
};

const bad = (status, message, code) => {
  const error = new Error(message);
  error.httpStatus = status;
  error.code = code;
  throw error;
};

const parseIncidents = (raw) => {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > 50) {
    bad(400, 'Las incidencias deben ser una lista de máximo 50 elementos');
  }
  return raw.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      bad(400, `Incidencia ${index + 1} inválida`);
    }
    const description = String(item.description ?? '').trim();
    const code = item.code == null
      ? null : String(item.code).trim().toUpperCase() || null;
    const rawQuantity = item.quantity;
    const quantity = rawQuantity === undefined || rawQuantity === null ||
      rawQuantity === '' ? null : Number(rawQuantity);
    if (!description || description.length > 5000) {
      bad(400, `Descripción inválida en incidencia ${index + 1}`);
    }
    if (code && code.length > 50) {
      bad(400, `Código demasiado largo en incidencia ${index + 1}`);
    }
    if (quantity !== null &&
        (!Number.isFinite(quantity) || quantity < 0 || quantity > 999999999)) {
      bad(400, `Cantidad inválida en incidencia ${index + 1}`);
    }
    return {
      code,
      description,
      quantity,
      requires_financial_review: item.requires_financial_review === true ||
        item.requires_financial_review === 'true',
    };
  });
};

exports.finishSlaughterhouseScaleGroup = async (req, res) => {
  const companyId = positiveInteger(req.slaughterhouseAdmin?.company_id);
  const userId = positiveInteger(req.slaughterhouseAdmin?.user_id);
  const troopId = positiveInteger(req.params.troopId);
  const groupId = bigintId(req.params.groupId);
  if (!companyId || !userId) {
    return res.status(403).json({ error: 'Operador de frigorífico no autorizado' });
  }
  if (!troopId || !groupId) {
    return res.status(400).json({ error: 'Tropa o grupo inválido' });
  }

  let notes;
  let incidents;
  try {
    if (req.body?.notes != null && typeof req.body.notes !== 'string') {
      bad(400, 'Las observaciones deben ser texto');
    }
    notes = req.body?.notes?.trim() || null;
    if (notes && notes.length > 10000) {
      bad(400, 'Las observaciones exceden el límite permitido');
    }
    incidents = parseIncidents(req.body?.incidents);
  } catch (error) {
    return res.status(error.httpStatus || 400).json({ error: error.message });
  }

  let client;
  let inTransaction = false;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    inTransaction = true;

    // Mismo recurso y bloqueo que iniciar/registrar medias por grupo.
    // Bloqueamos también recepción antes de calcular sus cierres globales.
    const troopResult = await client.query(
      `SELECT st.id, st.company_id, st.purchase_lot_id, st.reception_id,
              st.status AS troop_status, st.received_quantity,
              sr.status AS reception_status
       FROM slaughterhouse_troops st
       JOIN slaughterhouse_receptions sr
         ON sr.id = st.reception_id AND sr.company_id = st.company_id
       WHERE st.id = $1 AND st.company_id = $2
       FOR UPDATE OF st, sr`,
      [troopId, companyId],
    );
    if (!troopResult.rows.length) bad(404, 'Tropa o recepción no encontrada');
    const troop = troopResult.rows[0];
    const receptionId = Number(troop.reception_id);
    if (troop.troop_status !== 'in_slaughter' ||
        troop.reception_status !== 'in_slaughter') {
      bad(409, 'La tropa y la recepción deben estar en Faena');
    }

    const groupResult = await client.query(
      `SELECT id, group_number, status, plant_live_weight_kg
       FROM slaughterhouse_scale_groups
       WHERE id = $1 AND company_id = $2 AND troop_id = $3
         AND reception_id = $4
       FOR UPDATE`,
      [groupId, companyId, troopId, receptionId],
    );
    if (!groupResult.rows.length) bad(404, 'Grupo no encontrado en esta tropa');
    const group = groupResult.rows[0];
    if (group.status !== 'in_slaughter' ||
        !(Number(group.plant_live_weight_kg) > 0)) {
      bad(409, 'El grupo debe estar en Faena y tener peso de Balanza');
    }

    // El flujo nuevo nunca debe convivir con medias tradicionales en la tropa.
    const traditional = await client.query(
      `SELECT 1 FROM slaughterhouse_carcasses
       WHERE reception_id = $1 AND troop_id = $2 AND scale_group_id IS NULL
       LIMIT 1`,
      [receptionId, troopId],
    );
    if (traditional.rows.length) {
      bad(409, 'Existen medias tradicionales en la tropa; requiere revisión');
    }

    const linesResult = await client.query(
      `SELECT gl.field_category_id, gl.quantity,
              COUNT(sc.id) FILTER (WHERE sc.half_number = 1)::int AS first_halves,
              COUNT(sc.id) FILTER (WHERE sc.half_number = 2)::int AS second_halves
       FROM slaughterhouse_scale_group_lines gl
       LEFT JOIN slaughterhouse_carcasses sc
         ON sc.reception_id = $1 AND sc.troop_id = $2
        AND sc.scale_group_id = gl.group_id
        AND sc.field_category_id = gl.field_category_id
       WHERE gl.company_id = $3 AND gl.group_id = $4
       GROUP BY gl.id, gl.field_category_id, gl.quantity
       ORDER BY gl.id`,
      [receptionId, troopId, companyId, groupId],
    );
    const lines = linesResult.rows;
    const groupQuantity = lines.reduce((total, line) => total + Number(line.quantity), 0);
    if (!lines.length || groupQuantity <= 0) {
      bad(409, 'El grupo no tiene animales certificados asignados');
    }
    const incompleteLine = lines.find((line) =>
      Number(line.first_halves) !== Number(line.quantity) ||
      Number(line.second_halves) !== Number(line.quantity));
    if (incompleteLine) {
      bad(409,
        `Faltan medias de la línea de Campo ${incompleteLine.field_category_id}: ` +
        `${incompleteLine.first_halves}/${incompleteLine.quantity} primeras y ` +
        `${incompleteLine.second_halves}/${incompleteLine.quantity} segundas`,
        'scale_group_incomplete',
      );
    }

    const animalsResult = await client.query(
      `SELECT animal_sequence_number,
              COUNT(*)::int AS halves,
              COUNT(*) FILTER (WHERE half_number = 1)::int AS first_halves,
              COUNT(*) FILTER (WHERE half_number = 2)::int AS second_halves,
              COUNT(DISTINCT field_category_id)::int AS field_lines
       FROM slaughterhouse_carcasses
       WHERE reception_id = $1 AND troop_id = $2 AND scale_group_id = $3
       GROUP BY animal_sequence_number`,
      [receptionId, troopId, groupId],
    );
    const animals = animalsResult.rows;
    if (animals.length !== groupQuantity || animals.some((animal) =>
      animal.animal_sequence_number == null || Number(animal.halves) !== 2 ||
      Number(animal.first_halves) !== 1 || Number(animal.second_halves) !== 1 ||
      Number(animal.field_lines) !== 1)) {
      bad(409, 'Las dos medias de cada animal deben conservar el mismo grupo y línea de Campo');
    }

    // Una secuencia de animal no puede aparecer en otro grupo o tropa.
    const crossGroupCollision = await client.query(
      `SELECT 1
       FROM slaughterhouse_carcasses own
       JOIN slaughterhouse_carcasses other
         ON other.reception_id = own.reception_id
        AND other.animal_sequence_number = own.animal_sequence_number
        AND other.id <> own.id
       WHERE own.reception_id = $1 AND own.troop_id = $2
         AND own.scale_group_id = $3
         AND (other.scale_group_id IS DISTINCT FROM own.scale_group_id
           OR other.troop_id IS DISTINCT FROM own.troop_id
           OR other.field_category_id IS DISTINCT FROM own.field_category_id)
       LIMIT 1`,
      [receptionId, troopId, groupId],
    );
    if (crossGroupCollision.rows.length) {
      bad(409, 'La numeración de animales está mezclada con otra tropa, grupo o línea');
    }

    const hookResult = await client.query(
      `SELECT COUNT(*)::int AS halves,
              COALESCE(SUM(hook_weight_kg), 0)::numeric AS hook_kg
       FROM slaughterhouse_carcasses
       WHERE reception_id = $1 AND troop_id = $2 AND scale_group_id = $3`,
      [receptionId, troopId, groupId],
    );
    const groupHalves = Number(hookResult.rows[0].halves);
    if (groupHalves !== groupQuantity * 2) {
      bad(409, 'La cantidad total de medias no coincide con el grupo');
    }

    // Incidencias ligadas al grupo; el análisis financiero es posterior.
    const savedIncidents = [];
    for (const incident of incidents) {
      const inserted = await client.query(
        `INSERT INTO slaughterhouse_slaughter_incidents
           (company_id, purchase_lot_id, reception_id, troop_id,
            scale_group_id, code, description, quantity,
            requires_financial_review, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, code, description, quantity,
                   requires_financial_review, review_status, created_at`,
        [companyId, troop.purchase_lot_id, receptionId, troopId, groupId,
          incident.code, incident.description, incident.quantity,
          incident.requires_financial_review, userId],
      );
      savedIncidents.push(inserted.rows[0]);
    }

    await client.query(
      `UPDATE slaughterhouse_scale_groups
       SET status = 'completed', slaughter_finished_at = NOW(),
           slaughter_finished_by = $1, slaughter_closing_notes = $2,
           updated_at = NOW()
       WHERE id = $3 AND company_id = $4 AND troop_id = $5
         AND status = 'in_slaughter'`,
      [userId, notes, groupId, companyId, troopId],
    );

    const pendingGroupsResult = await client.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE g.status <> 'completed')::int AS pending,
              COALESCE(SUM(alloc.quantity), 0)::int AS animals
       FROM slaughterhouse_scale_groups g
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(gl.quantity), 0)::int AS quantity
         FROM slaughterhouse_scale_group_lines gl
         WHERE gl.group_id = g.id AND gl.company_id = g.company_id
       ) alloc ON TRUE
       WHERE g.company_id = $1 AND g.troop_id = $2 AND g.reception_id = $3`,
      [companyId, troopId, receptionId],
    );
    const state = pendingGroupsResult.rows[0];
    const allGroupsFinished = Number(state.total) > 0 && Number(state.pending) === 0;
    let troopCompleted = false;
    let receptionCompleted = false;

    if (allGroupsFinished) {
      // Integridad final: las cantidades de todos los grupos deben
      // coincidir con los animales efectivamente recibidos.
      if (Number(state.animals) !== Number(troop.received_quantity)) {
        bad(409, 'Los grupos no cubren todos los animales recibidos');
      }
      const groupTotals = await client.query(
        `SELECT COUNT(*)::int AS halves
         FROM slaughterhouse_carcasses
         WHERE reception_id = $1 AND troop_id = $2 AND scale_group_id IS NOT NULL`,
        [receptionId, troopId],
      );
      if (Number(groupTotals.rows[0].halves) !== Number(troop.received_quantity) * 2) {
        bad(409, 'La tropa tiene medias pendientes o sobrantes');
      }
        const closingNotesResult = await client.query(
        `
        SELECT STRING_AGG(
            'Grupo ' || group_number || ': ' ||
            BTRIM(slaughter_closing_notes),
            ' | '
            ORDER BY group_number
        ) FILTER (
            WHERE NULLIF(
            BTRIM(slaughter_closing_notes),
            ''
            ) IS NOT NULL
        ) AS closing_notes
        FROM slaughterhouse_scale_groups
        WHERE company_id = $1
            AND troop_id = $2
            AND reception_id = $3
            AND status = 'completed'
        `,
        [companyId, troopId, receptionId],
        );

        const groupedClosingNotes =
        closingNotesResult.rows[0]?.closing_notes ?? null;

        await client.query(
        `
        UPDATE slaughterhouse_troops
        SET
            status = 'completed',
            notes = CASE
            WHEN $4::text IS NULL THEN notes
            ELSE concat_ws(
                ' | ',
                NULLIF(notes, ''),
                $4::text
            )
            END,
            updated_at = NOW()
        WHERE id = $1
            AND company_id = $2
            AND reception_id = $3
            AND status = 'in_slaughter'
        `,
        [
            troopId,
            companyId,
            receptionId,
            groupedClosingNotes,
        ],
        );
      troopCompleted = true;

      // La recepción agrupa potencialmente varias tropas.
      // No adelantar su cierre mientras cualquiera esté pendiente.
      const pendingTroops = await client.query(
        `SELECT COUNT(*)::int AS pending
         FROM slaughterhouse_troops
         WHERE company_id = $1 AND reception_id = $2
           AND status NOT IN ('completed', 'cancelled')`,
        [companyId, receptionId],
      );
      if (Number(pendingTroops.rows[0].pending) === 0) {
        await client.query(
          `UPDATE slaughterhouse_receptions
            SET
            status = 'completed',
            completed_at = COALESCE(completed_at, NOW()),
            updated_at = NOW()
           WHERE id = $1 AND company_id = $2 AND status = 'in_slaughter'`,
          [receptionId, companyId],
        );
        receptionCompleted = true;

        // Los lotes pueden tener otras tropas, aun en otras recepciones.
        // Solo completar cuando no queden tropas activas vinculadas.
        const completedLots = await client.query(
          `UPDATE slaughterhouse_purchase_lots spl
           SET status = 'completed', updated_at = NOW()
           WHERE spl.company_id = $1
             AND spl.status NOT IN ('completed', 'cancelled')
             AND EXISTS (
               SELECT 1 FROM slaughterhouse_troops st
               WHERE st.company_id = spl.company_id
                 AND st.purchase_lot_id = spl.id AND st.reception_id = $2
             )
             AND NOT EXISTS (
               SELECT 1 FROM slaughterhouse_troops pending
               WHERE pending.company_id = spl.company_id
                 AND pending.purchase_lot_id = spl.id
                 AND pending.status NOT IN ('completed', 'cancelled')
             )
           RETURNING id, capture_sheet_id`,
          [companyId, receptionId],
        );
        const captureIds = [...new Set(completedLots.rows
          .map((row) => row.capture_sheet_id)
          .filter((value) => value != null).map(Number))];
        if (captureIds.length) {
          // Una hoja compartida entre varios lotes no termina antes de tiempo.
          await client.query(
            `UPDATE slaughterhouse_capture_sheets sheet
             SET status = 'completed', updated_at = NOW()
             WHERE sheet.company_id = $1 AND sheet.id = ANY($2::int[])
               AND sheet.status NOT IN ('completed', 'cancelled')
               AND NOT EXISTS (
                 SELECT 1 FROM slaughterhouse_purchase_lots lot
                 WHERE lot.company_id = sheet.company_id
                   AND lot.capture_sheet_id = sheet.id
                   AND lot.status NOT IN ('completed', 'cancelled')
               )`,
            [companyId, captureIds],
          );
        }
      }
    }

    await client.query(
      `INSERT INTO slaughterhouse_audit_log
         (company_id, user_id, entity_type, entity_id,
          action, old_data, new_data)
       VALUES ($1, $2, 'scale_group', $3,
               'scale_group_slaughter_finish', $4::jsonb, $5::jsonb)`,
      [companyId, userId, groupId,
        JSON.stringify({ status: group.status }),
        JSON.stringify({ status: 'completed', troop_id: troopId,
          reception_id: receptionId, group_number: group.group_number,
          animals: groupQuantity, half_carcasses: groupHalves,
          hook_weight_total_kg: hookResult.rows[0].hook_kg,
          notes, incident_ids: savedIncidents.map((item) => item.id),
          troop_completed: troopCompleted,
          reception_completed: receptionCompleted })],
    );

    await client.query('COMMIT');
    inTransaction = false;
    return res.json({
      success: true, group_id: groupId, group_number: group.group_number,
      status: 'completed', troop_id: troopId, reception_id: receptionId,
      animals: groupQuantity, half_carcasses: groupHalves,
      hook_weight_total_kg: hookResult.rows[0].hook_kg,
      slaughter_closing_notes: notes, incidents: savedIncidents,
      troop_completed: troopCompleted,
      reception_completed: receptionCompleted,
    });
  } catch (error) {
    if (client && inTransaction) {
      try { await client.query('ROLLBACK'); }
      catch (rollbackError) {
        console.error('ROLLBACK FINISH SCALE GROUP ERROR:', rollbackError);
      }
    }
    if (error.httpStatus) {
      return res.status(error.httpStatus).json({
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
      });
    }
    console.error('FINISH SCALE GROUP ERROR:', error);
    return res.status(500).json({ error: 'Error finalizando Faena por grupo' });
  } finally {
    if (client) client.release();
  }
};