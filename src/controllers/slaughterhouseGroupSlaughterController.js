const { pool } = require('../config/db');

// La ruta debe aplicar requireAuth, requireSlaughterhouseAdmin
// y requireSlaughterhousePermission('slaughter.manage').
exports.startSlaughterhouseScaleGroup = async (req, res) => {
  const companyId = Number(req.slaughterhouseAdmin?.company_id);
  const userId = Number(req.slaughterhouseAdmin?.user_id);
  const troopId = Number(req.params.troopId);
  const rawGroupId = String(req.params.groupId ?? '');

  if (!Number.isSafeInteger(companyId) || companyId <= 0 ||
      !Number.isSafeInteger(userId) || userId <= 0) {
    return res.status(403).json({ error: 'Operador de frigorífico no autorizado' });
  }
  if (!Number.isSafeInteger(troopId) || troopId <= 0 ||
      !/^\d+$/.test(rawGroupId) || BigInt(rawGroupId) <= 0n ||
      BigInt(rawGroupId) > 9223372036854775807n) {
    return res.status(400).json({ error: 'Tropa o grupo inválido' });
  }
  const groupId = BigInt(rawGroupId).toString();
  let client;
  let inTransaction = false;

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    inTransaction = true;

    // El primer grupo puede iniciar con tropa RECEIVED; los siguientes
    // podrán iniciar con la misma tropa ya IN_SLAUGHTER.
    const troopResult = await client.query(
      `SELECT st.id, st.purchase_lot_id, st.reception_id,
              st.received_quantity, st.field_capture_status, st.status,
              sr.status AS reception_status
       FROM slaughterhouse_troops st
       JOIN slaughterhouse_receptions sr
         ON sr.id = st.reception_id AND sr.company_id = st.company_id
       WHERE st.id = $1 AND st.company_id = $2
       FOR UPDATE OF st, sr`,
      [troopId, companyId],
    );
    if (!troopResult.rows.length) {
      await client.query('ROLLBACK');
      inTransaction = false;
      return res.status(404).json({ error: 'Tropa o recepción no encontrada' });
    }
    const troop = troopResult.rows[0];
    if (!['received', 'in_slaughter'].includes(troop.status) ||
        !['open', 'closed', 'in_slaughter'].includes(troop.reception_status) ||
        troop.field_capture_status !== 'certified' ||
        Number(troop.received_quantity) <= 0) {
      await client.query('ROLLBACK');
      inTransaction = false;
      return res.status(409).json({ error: 'La tropa no está habilitada para Faena por grupos' });
    }

    const groupResult = await client.query(
      `SELECT g.id, g.group_number, g.status, g.plant_live_weight_kg,
              g.reception_id, g.troop_id
       FROM slaughterhouse_scale_groups g
       WHERE g.id = $1 AND g.company_id = $2
         AND g.troop_id = $3 AND g.reception_id = $4
       FOR UPDATE OF g`,
      [groupId, companyId, troopId, troop.reception_id],
    );
    if (!groupResult.rows.length) {
      await client.query('ROLLBACK');
      inTransaction = false;
      return res.status(404).json({ error: 'Grupo no encontrado en esta tropa' });
    }
    const group = groupResult.rows[0];
    if (group.status !== 'confirmed' ||
        !(Number(group.plant_live_weight_kg) > 0)) {
      await client.query('ROLLBACK');
      inTransaction = false;
      return res.status(409).json({
        error: 'El grupo debe estar confirmado y pesado antes de iniciar Faena',
      });
    }

    // Verificar que TODOS los grupos sigan conservando la distribución
    // completa de las categorías certificadas, sin sustituciones.
    const sourceResult = await client.query(
      `SELECT c.id, c.quantity
       FROM slaughterhouse_field_partial_load_categories c
       JOIN slaughterhouse_field_partial_loads pl
         ON pl.id = c.partial_load_id AND pl.company_id = c.company_id
       WHERE pl.company_id = $1 AND pl.troop_id = $2
         AND pl.purchase_lot_id = $3 AND pl.status = 'certified'`,
      [companyId, troopId, troop.purchase_lot_id],
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
    const expected = new Map(sourceResult.rows.map(
      row => [String(row.id), Number(row.quantity)],
    ));
    const assigned = new Map(assignedResult.rows.map(
      row => [String(row.field_category_id), Number(row.quantity)],
    ));
    const expectedTotal = [...expected.values()].reduce((a, b) => a + b, 0);
    if (!expected.size || expected.size !== assigned.size ||
        expectedTotal !== Number(troop.received_quantity) ||
        [...expected].some(([id, count]) => assigned.get(id) !== count)) {
      await client.query('ROLLBACK');
      inTransaction = false;
      return res.status(409).json({
        error: 'Los grupos no coinciden con Campo y la cantidad recibida',
      });
    }

    const groupLines = await client.query(
      `SELECT COALESCE(SUM(quantity), 0)::int AS total
       FROM slaughterhouse_scale_group_lines
       WHERE company_id = $1 AND group_id = $2`,
      [companyId, groupId],
    );
    if (Number(groupLines.rows[0].total) <= 0) {
      await client.query('ROLLBACK');
      inTransaction = false;
      return res.status(409).json({ error: 'El grupo está vacío' });
    }

    // Nunca combinar Faena tradicional y por grupos dentro de la misma tropa.
    const legacyResult = await client.query(
      `SELECT 1 FROM slaughterhouse_carcasses
       WHERE reception_id = $1 AND troop_id = $2
         AND scale_group_id IS NULL LIMIT 1`,
      [troop.reception_id, troopId],
    );
    if (legacyResult.rows.length) {
      await client.query('ROLLBACK');
      inTransaction = false;
      return res.status(409).json({
        error: 'La tropa ya contiene medias de Faena tradicional',
      });
    }

    await client.query(
      `UPDATE slaughterhouse_scale_groups
       SET status = 'in_slaughter', updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND status = 'confirmed'`,
      [groupId, companyId],
    );
    await client.query(
      `UPDATE slaughterhouse_troops
       SET status = 'in_slaughter', updated_at = NOW()
       WHERE id = $1 AND company_id = $2 AND status = 'received'`,
      [troopId, companyId],
    );
    await client.query(
      `UPDATE slaughterhouse_receptions
       SET status = 'in_slaughter',
           closed_at = COALESCE(closed_at, NOW()),
           slaughter_started_at = COALESCE(slaughter_started_at, NOW()),
           updated_at = NOW()
       WHERE id = $1 AND company_id = $2
         AND status IN ('open', 'closed', 'in_slaughter')`,
      [troop.reception_id, companyId],
    );
    // Sincronizar el lote comercial, sin reabrir lotes cerrados/cancelados.
    await client.query(
      `UPDATE slaughterhouse_purchase_lots
       SET status = 'in_slaughter', updated_at = NOW()
       WHERE id = $1 AND company_id = $2
         AND status NOT IN ('completed', 'cancelled', 'in_slaughter')`,
      [troop.purchase_lot_id, companyId],
    );
    await client.query(
      `INSERT INTO slaughterhouse_audit_log
         (company_id, user_id, entity_type, entity_id,
          action, old_data, new_data)
       VALUES ($1, $2, 'scale_group', $3,
               'scale_group_slaughter_start', $4::jsonb, $5::jsonb)`,
      [companyId, userId, groupId,
        JSON.stringify({ status: group.status }),
        JSON.stringify({ status: 'in_slaughter', troop_id: troopId,
          reception_id: troop.reception_id })],
    );

    await client.query('COMMIT');
    inTransaction = false;
    return res.json({
      success: true,
      group_id: groupId,
      group_number: group.group_number,
      troop_id: troopId,
      reception_id: troop.reception_id,
      status: 'in_slaughter',
      group_quantity: Number(groupLines.rows[0].total),
      expected_half_carcasses: Number(groupLines.rows[0].total) * 2,
    });
  } catch (error) {
    if (client && inTransaction) {
      try { await client.query('ROLLBACK'); }
      catch (rollbackError) {
        console.error('ROLLBACK START SCALE GROUP ERROR:', rollbackError);
      }
    }
    console.error('START SCALE GROUP ERROR:', error);
    return res.status(500).json({ error: 'Error iniciando Faena por grupo' });
  } finally {
    if (client) client.release();
  }
};