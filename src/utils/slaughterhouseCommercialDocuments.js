// Modelo documental de lineas comerciales certificadas en Campo.
// Fuente economica: snapshot de preliquidacion. Solo lecturas: nunca recalcula
// ni modifica una preliquidacion aprobada. No realiza pagos ni emite QR.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const almost = (a, b, precision = 0.001) =>
  a != null && b != null && Number.isFinite(Number(a)) &&
  Number.isFinite(Number(b)) && Math.abs(Number(a) - Number(b)) <= precision;

const commercialPricingLabel = (basis) => ({
  hook_kg: 'Peso gancho', live_kg: 'Peso vivo', per_head: 'Por cabeza',
}[basis] || basis || 'Sin modalidad');

const commercialWeightSourceLabel = (source) => ({
  origin: 'Origen / Campo', plant: 'Planta',
  not_applicable: 'No aplica',
}[source] || source || 'No aplica');

async function loadCommercialDocumentLines(pool, companyId, purchaseLotId, preliq) {
  if (!preliq) return null;
  const snapshot = typeof preliq.source_snapshot === 'string'
    ? JSON.parse(preliq.source_snapshot)
    : preliq.source_snapshot;
  if (!snapshot || snapshot.source_type !== 'field_commercial_lines_v1') {
    return null; // Compatibilidad con expedientes legacy.
  }
  const previous = snapshot.commercial_lines;
  if (!Array.isArray(previous) || !previous.length ||
      new Set(previous.map((x) => String(x.field_category_id))).size !== previous.length) {
    throw new Error('DOCUMENT_COMMERCIAL_SNAPSHOT_INVALID: lineas faltantes o duplicadas');
  }

  const result = await pool.query(`
    SELECT pl.id AS partial_load_id, pl.partial_number,
           pl.status AS partial_status,
           c.id AS field_category_id, c.line_number,
           c.actual_classification_id, c.quantity, c.commercial_status,
           c.pricing_basis, c.weight_source, c.price_per_unit,
           c.currency, c.shrink_percent, c.gross_weight_kg,
           ac.display_name AS classification_name,
           ac.generated_code AS classification_code
    FROM slaughterhouse_field_partial_loads pl
    JOIN slaughterhouse_troops st ON st.id = pl.troop_id
      AND st.company_id = pl.company_id
      AND st.purchase_lot_id = pl.purchase_lot_id
    JOIN slaughterhouse_field_partial_load_categories c
      ON c.company_id = pl.company_id AND c.partial_load_id = pl.id
    LEFT JOIN slaughterhouse_animal_classifications ac
      ON ac.id = c.actual_classification_id AND ac.company_id = c.company_id
    WHERE pl.company_id = $1 AND pl.purchase_lot_id = $2
      AND st.status <> 'cancelled'
    ORDER BY pl.troop_id, pl.partial_number, c.line_number, c.id
  `, [companyId, purchaseLotId]);
  const current = new Map(result.rows.map((r) => [String(r.field_category_id), r]));
  if (current.size !== previous.length || result.rows.length !== previous.length) {
    throw new Error('DOCUMENT_COMMERCIAL_LINES_CHANGED: recuento actual distinto del aprobado');
  }

  const lines = [];
  let amountSum = 0;
  let quantitySum = 0;
  let grossSum = 0;
  let allGrossComplete = true;
  const currencies = new Set();
  for (const snap of previous) {
    const row = current.get(String(snap.field_category_id));
    if (!row || row.partial_status !== 'certified' ||
        String(row.partial_load_id) !== String(snap.partial_load_id) ||
        String(row.line_number) !== String(snap.line_number) ||
        String(row.partial_number) !== String(snap.partial_number) ||
        !almost(row.quantity, snap.quantity) ||
        row.pricing_basis !== snap.pricing_basis ||
        row.weight_source !== snap.weight_source ||
        row.currency !== snap.currency ||
        row.commercial_status !== snap.commercial_status ||
        !(row.price_per_unit == null && snap.unit_price == null ||
          almost(row.price_per_unit, snap.unit_price)) ||
        !(row.gross_weight_kg == null && snap.gross_weight_kg == null ||
          almost(row.gross_weight_kg, snap.gross_weight_kg)) ||
        !almost(Number(row.shrink_percent ?? 0), Number(snap.shrink_percent ?? 0))) {
      throw new Error(`DOCUMENT_COMMERCIAL_LINES_CHANGED: linea ${snap.field_category_id} no coincide con snapshot`);
    }
    const quantity = Number(snap.quantity);
    const gross = snap.gross_weight_kg == null ? null : Number(snap.gross_weight_kg);
    const shrink = Number(snap.shrink_percent ?? 0);
    const shrinkKg = gross == null ? null : round2(gross * shrink / 100);
    const netKg = gross == null ? null : round2(gross - gross * shrink / 100);
    const hookKg = snap.hook_weight_kg == null ? null : Number(snap.hook_weight_kg);
    const price = snap.unit_price == null ? null : Number(snap.unit_price);
    const amount = snap.amount == null ? null : Number(snap.amount);
    const basis = snap.pricing_basis;
    const billableQuantity = basis === 'hook_kg' ? hookKg :
      basis === 'live_kg' ? netKg : basis === 'per_head' ? quantity : null;
    const billableUnit = basis === 'hook_kg' ? 'kg gancho' :
      basis === 'live_kg' ? 'kg vivo neto' : basis === 'per_head' ? 'cabezas' : '';
    if (gross == null || !Number.isFinite(gross) || gross <= 0) {
      allGrossComplete = false;
    } else grossSum += gross;
    quantitySum += quantity;
    if (snap.currency) currencies.add(snap.currency);
    if (amount != null) amountSum = round2(amountSum + amount);
    lines.push({
      partial_load_id: snap.partial_load_id,
      partial_number: snap.partial_number,
      field_category_id: snap.field_category_id,
      line_number: snap.line_number,
      classification_name: row.classification_name || row.classification_code ||
        `Clasificacion #${row.actual_classification_id || 'sin identificar'}`,
      classification_code: row.classification_code || null,
      quantity, pricing_basis: basis, weight_source: snap.weight_source,
      commercial_status: snap.commercial_status,
      calculation_status: snap.calculation_status,
      gross_weight_kg: gross, shrink_percent: shrink,
      shrink_weight_kg: shrinkKg, net_weight_kg: netKg,
      hook_weight_kg: hookKg, billable_quantity: billableQuantity,
      billable_unit: billableUnit,
      unit_price: price, amount, currency: snap.currency,
    });
  }

  // Una aprobacion no puede exportarse como documento definitivo con lineas
  // pendientes, subtotal desactualizado ni monedas mixtas.
  if (preliq.status === 'approved' || preliq.status === 'reviewed') {
    if (snapshot.calculation_complete !== true ||
        Number(snapshot.pending_lines_count) !== 0 ||
        Number(snapshot.blocked_lines_count) !== 0 ||
        lines.some((l) => l.calculation_status !== 'ready' ||
          l.amount == null || !Number.isFinite(l.amount) ||
          l.unit_price == null || l.unit_price < 0 ||
          l.billable_quantity == null || l.billable_quantity <= 0) ||
        currencies.size !== 1 ||
        !almost(snapshot.base_amount, amountSum, 0.01) ||
        !almost(preliq.base_amount, amountSum, 0.01) ||
        Number(preliq.quantity) !== quantitySum) {
      throw new Error('DOCUMENT_COMMERCIAL_NOT_CLOSED: snapshot y montos no concilian');
    }
  }
  return {
    lines,
    quantity: quantitySum,
    total_amount: lines.some((l) => l.amount == null) ? null : amountSum,
    gross_weight_total_kg: allGrossComplete ? round2(grossSum) : null,
    gross_weight_complete: allGrossComplete,
    currency: currencies.size === 1 ? [...currencies][0] : null,
    calculation_complete: snapshot.calculation_complete === true,
  };
}

// Peso vivo REAL de Balanza: cada grupo se suma solo una vez.
// Nunca se obtiene de la suma de lineas (un grupo puede contener varias).
// Si existe un grupo sin pesaje, NO se publica un rendimiento parcial.
async function loadScaleGroupSummary(pool, companyId, purchaseLotId) {
  const result = await pool.query(`
    SELECT sg.id AS group_id, sg.troop_id, sg.group_number, sg.status,
           sg.plant_live_weight_kg, sg.plant_weighed_at,
           COALESCE((
             SELECT SUM(gl.quantity)
             FROM slaughterhouse_scale_group_lines gl
             WHERE gl.company_id = sg.company_id AND gl.group_id = sg.id
           ), 0) AS assigned_quantity
    FROM slaughterhouse_scale_groups sg
    JOIN slaughterhouse_troops st ON st.id = sg.troop_id
      AND st.company_id = sg.company_id
      AND st.purchase_lot_id = $2 AND st.status <> 'cancelled'
    WHERE sg.company_id = $1
    ORDER BY sg.troop_id, sg.group_number, sg.id
  `, [companyId, purchaseLotId]);
  const groups = result.rows.map((g) => {
    const weight = g.plant_live_weight_kg == null
      ? null : Number(g.plant_live_weight_kg);
    return {
      group_id: g.group_id,
      troop_id: g.troop_id,
      group_number: g.group_number,
      status: g.status,
      assigned_quantity: Number(g.assigned_quantity),
      plant_live_weight_kg:
        Number.isFinite(weight) && weight > 0 ? weight : null,
      plant_weighed_at: g.plant_weighed_at,
    };
  });
  const unweighed = groups.filter((g) => g.plant_live_weight_kg == null).length;
  const complete = groups.length > 0 && unweighed === 0;
  return {
    groups,
    has_groups: groups.length > 0,
    complete,
    unweighed_groups_count: unweighed,
    total_plant_live_weight_kg: complete
      ? Math.round((groups.reduce((acc, g) => acc + g.plant_live_weight_kg, 0)
          + Number.EPSILON) * 100) / 100
      : null,
  };
}

module.exports = {
  loadCommercialDocumentLines,
  commercialPricingLabel,
  commercialWeightSourceLabel,
  loadScaleGroupSummary,
};
