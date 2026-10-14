// Validacion de cierre para preliquidaciones por lineas certificadas de Campo.
// No modifica datos. La cantidad contratada es referencial: se compara la
// cantidad certificada en Campo con la recibida y la faenada.
// Los pagos nunca se generan desde esta funcion.

const closeMoney = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const sameNumber = (a, b, tolerance = 0.00001) =>
  a !== null && a !== undefined && b !== null && b !== undefined &&
  Number.isFinite(Number(a)) && Number.isFinite(Number(b)) &&
  Math.abs(Number(a) - Number(b)) <= tolerance;
const invalid = (code, message, details = {}) => ({
  ok: false, code, message, ...details,
});

async function validateCommercialClosing(client, companyId, preliquidation) {
  const lotId = Number(preliquidation.purchase_lot_id);
  const snapshot = typeof preliquidation.source_snapshot === 'string'
    ? JSON.parse(preliquidation.source_snapshot)
    : preliquidation.source_snapshot;
  if (!snapshot || snapshot.source_type !== 'field_commercial_lines_v1') {
    return invalid('COMMERCIAL_SNAPSHOT_REQUIRED',
      'El borrador no utiliza el modelo comercial por lineas; regenere correctamente el expediente');
  }
  const oldLines = snapshot.commercial_lines;
  if (!Array.isArray(oldLines) || oldLines.length === 0 ||
      snapshot.calculation_complete !== true ||
      Number(snapshot.pending_lines_count) !== 0 ||
      Number(snapshot.blocked_lines_count) !== 0) {
    return invalid('COMMERCIAL_LINES_INCOMPLETE',
      'Hay lineas sin precio, bloqueadas o sin calculo completo; recalcule el borrador');
  }

  // Las filas se leen bajo el candado del lote de compra obtenido previamente
  // por los endpoints review y approve, igual que confirmCommercialLinePrice.
  const rowsResult = await client.query(`
    SELECT pl.id AS partial_load_id, pl.partial_number,
           pl.status AS partial_status, c.id AS field_category_id,
           c.line_number, c.quantity, c.commercial_status,
           c.pricing_basis, c.weight_source, c.price_per_unit, c.currency,
           c.shrink_percent, c.gross_weight_kg
    FROM slaughterhouse_field_partial_loads pl
    JOIN slaughterhouse_troops st
      ON st.id = pl.troop_id AND st.company_id = pl.company_id
     AND st.purchase_lot_id = pl.purchase_lot_id
    LEFT JOIN slaughterhouse_field_partial_load_categories c
      ON c.partial_load_id = pl.id AND c.company_id = pl.company_id
    WHERE pl.company_id = $1 AND pl.purchase_lot_id = $2
      AND st.status <> 'cancelled'
    ORDER BY pl.troop_id, pl.partial_number, c.line_number, c.id
  `, [companyId, lotId]);
  const rows = rowsResult.rows;
  if (rows.length !== oldLines.length ||
      rows.some((r) => r.field_category_id == null || r.partial_status !== 'certified')) {
    return invalid('COMMERCIAL_LINES_CHANGED',
      'Cambio la cantidad de lineas o hay cargas sin certificar; recalcule el borrador');
  }

  const physical = await client.query(`
    SELECT sc.field_category_id,
           COUNT(*)::int AS halves_count,
           COUNT(DISTINCT sc.animal_sequence_number)::int AS animals_count,
           COUNT(DISTINCT (sc.animal_sequence_number, sc.half_number))::int
             AS unique_halves_count,
           COUNT(*) FILTER (WHERE sc.hook_weight_kg IS NULL)::int
             AS missing_weights,
           COALESCE(SUM(sc.hook_weight_kg),0)::numeric AS hook_weight_kg
    FROM slaughterhouse_carcasses sc
    JOIN slaughterhouse_troops st ON st.id = sc.troop_id
    WHERE st.company_id = $1 AND st.purchase_lot_id = $2
      AND st.status <> 'cancelled' AND sc.field_category_id IS NOT NULL
    GROUP BY sc.field_category_id
  `, [companyId, lotId]);
  const hookByLine = new Map(physical.rows.map((r) =>
    [String(r.field_category_id), r]));
  const previous = new Map(oldLines.map((r) => [String(r.field_category_id), r]));
  if (previous.size !== oldLines.length) {
    return invalid('COMMERCIAL_SNAPSHOT_DUPLICATED', 'El borrador contiene lineas duplicadas');
  }

  const currencies = new Set();
  let sumAmount = 0;
  let sumQuantity = 0;
  for (const row of rows) {
    const old = previous.get(String(row.field_category_id));
    if (!old ||
        String(old.partial_load_id) !== String(row.partial_load_id) ||
        String(old.partial_number) !== String(row.partial_number) ||
        String(old.line_number) !== String(row.line_number) ||
        !sameNumber(old.quantity, row.quantity) ||
        old.commercial_status !== row.commercial_status ||
        old.pricing_basis !== row.pricing_basis ||
        old.weight_source !== row.weight_source ||
        old.currency !== row.currency ||
        !sameNumber(old.unit_price, row.price_per_unit) ||
        !(old.gross_weight_kg == null
            ? row.gross_weight_kg == null
            : sameNumber(old.gross_weight_kg, row.gross_weight_kg)) ||
        !sameNumber(old.shrink_percent, Number(row.shrink_percent ?? 0)) ||
        old.calculation_status !== 'ready') {
      return invalid('COMMERCIAL_DRAFT_STALE',
        'Las condiciones de Campo cambiaron desde el ultimo recalculo',
        { field_category_id: row.field_category_id });
    }
    const quantity = Number(row.quantity);
    const price = Number(row.price_per_unit);
    const gross = Number(row.gross_weight_kg);
    const shrink = Number(row.shrink_percent ?? 0);
    const h = hookByLine.get(String(row.field_category_id));
    const hookKg = Number(h?.hook_weight_kg || 0);
    if (row.commercial_status !== 'confirmed' ||
        !Number.isInteger(quantity) || quantity <= 0 ||
        row.price_per_unit == null || !Number.isFinite(price) || price <= 0 ||
        !row.currency || !h || Number(h.halves_count) !== quantity * 2 ||
        Number(h.unique_halves_count) !== quantity * 2 ||
        Number(h.animals_count) !== quantity || Number(h.missing_weights) !== 0 ||
        !Number.isFinite(hookKg) || hookKg <= 0 ||
        !sameNumber(old.hook_weight_kg, hookKg, 0.001)) {
      return invalid('COMMERCIAL_PHYSICAL_MISMATCH',
        'Precios o pesos certificados incompletos o distintos del borrador',
        { field_category_id: row.field_category_id });
    }
    let amount;
    if (row.pricing_basis === 'hook_kg') {
      amount = closeMoney(hookKg * price);
    } else if (row.pricing_basis === 'live_kg' && row.weight_source === 'origin' &&
               Number.isFinite(gross) && gross > 0 &&
               Number.isFinite(shrink) && shrink >= 0 && shrink <= 100) {
      amount = closeMoney(gross * (1 - shrink / 100) * price);
    } else if (row.pricing_basis === 'per_head') {
      amount = closeMoney(quantity * price);
    } else {
      return invalid('COMMERCIAL_BASIS_UNSUPPORTED',
        'La modalidad u origen del precio no admite cierre en este motor',
        { field_category_id: row.field_category_id });
    }
    if (!sameNumber(old.amount, amount, 0.01)) {
      return invalid('COMMERCIAL_AMOUNT_CHANGED',
        'El importe calculado por linea ya no coincide con el borrador',
        { field_category_id: row.field_category_id });
    }
    currencies.add(row.currency);
    sumAmount = closeMoney(sumAmount + amount);
    sumQuantity += quantity;
  }

  const quantityResult = await client.query(`
    SELECT COALESCE(SUM(received_quantity),0)::int AS received,
           COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled'))::int
             AS pending_troops
    FROM slaughterhouse_troops
    WHERE company_id = $1 AND purchase_lot_id = $2 AND status <> 'cancelled'
  `, [companyId, lotId]);
  const received = Number(quantityResult.rows[0].received);
  if (Number(quantityResult.rows[0].pending_troops) !== 0 ||
      sumQuantity !== received ||
      !sameNumber(preliquidation.quantity, sumQuantity)) {
    return invalid('COMMERCIAL_QUANTITY_MISMATCH',
      'No concilian las cantidades certificadas en Campo y recibidas en planta',
      { certified: sumQuantity, received });
  }
  // A diferencia del contrato/guia, Campo y recepcion SI deben conciliar.
  // La comprobacion por linea de arriba exige 2 medias validas por animal.
  const allHalves = await client.query(`
    SELECT COUNT(*)::int AS halves,
           COUNT(*) FILTER (WHERE sc.hook_weight_kg IS NULL)::int AS missing
    FROM slaughterhouse_carcasses sc
    JOIN slaughterhouse_troops st ON st.id = sc.troop_id
    WHERE st.company_id = $1 AND st.purchase_lot_id = $2
      AND st.status <> 'cancelled'
  `, [companyId, lotId]);
  if (Number(allHalves.rows[0].halves) !== received * 2 ||
      Number(allHalves.rows[0].missing) !== 0) {
    return invalid('COMMERCIAL_SLAUGHTER_MISMATCH',
      'La cantidad de medias de Faena no coincide con los animales recibidos');
  }
  if (currencies.size !== 1 ||
      !sameNumber(snapshot.base_amount, sumAmount, 0.01) ||
      !sameNumber(preliquidation.base_amount, sumAmount, 0.01)) {
    return invalid('COMMERCIAL_TOTAL_STALE',
      'El subtotal comercial no coincide con los importes recalculados por linea');
  }

  const incidentResult = await client.query(`
    SELECT i.id, i.code, i.review_status
    FROM slaughterhouse_slaughter_incidents i
    WHERE i.company_id = $1 AND i.purchase_lot_id = $2
      AND i.requires_financial_review = TRUE
      AND (
        i.review_status IS NULL OR
        i.review_status NOT IN ('dismissed','converted_to_adjustment') OR
        (i.review_status = 'converted_to_adjustment' AND NOT EXISTS (
          SELECT 1 FROM slaughterhouse_preliquidation_adjustments a
          WHERE a.id = i.preliquidation_adjustment_id
            AND a.preliquidation_id = $3 AND a.target_type = 'seller'
            AND a.adjustment_type = 'discount'
        ))
      )
  `, [companyId, lotId, preliquidation.id]);
  if (incidentResult.rows.length > 0) {
    return invalid('COMMERCIAL_INCIDENTS_PENDING',
      'Existen incidencias financieras pendientes o sin ajuste vinculado',
      { incidents: incidentResult.rows });
  }
  return { ok: true, amount: sumAmount, quantity: sumQuantity, currency: [...currencies][0] };
}

module.exports = { validateCommercialClosing };
