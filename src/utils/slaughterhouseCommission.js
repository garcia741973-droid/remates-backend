function calculateSlaughterhouseCommission({
  commissionType,
  commissionValue,
  receivedAnimals = 0,
  sellerNetPayable = 0,
  initialWeightKg = null,
  initialWeightComplete = false,
  hookWeightKg = null,
  hookWeightComplete = false,
}) {
  const pending = (reason) => ({
    base_amount: null,
    calculation_pending: true,
    pending_reason: reason,
    weight_basis_kg: null,
  });

  if (!commissionType) {
    return {
      base_amount: 0,
      calculation_pending: false,
      pending_reason: null,
      weight_basis_kg: null,
    };
  }

  if (
    commissionValue === null ||
    commissionValue === undefined ||
    !Number.isFinite(Number(commissionValue)) ||
    Number(commissionValue) < 0
  ) {
    throw new Error('Valor de comisión inválido');
  }

  const rate = Number(commissionValue);
  let amount = 0;
  let weightBasisKg = null;

  switch (commissionType) {
    case 'fixed':
      amount = rate;
      break;

    case 'per_head':
      amount = Number(receivedAnimals) * rate;
      break;

    case 'percent':
      amount = Number(sellerNetPayable) * rate / 100;
      break;

    case 'per_kg_initial':
      if (
        !initialWeightComplete ||
        initialWeightKg === null ||
        !Number.isFinite(Number(initialWeightKg)) ||
        Number(initialWeightKg) <= 0
      ) {
        return pending('Falta completar el peso vivo inicial');
      }

      weightBasisKg = Number(initialWeightKg);
      amount = weightBasisKg * rate;
      break;

    case 'per_kg_hook':
      if (
        !hookWeightComplete ||
        hookWeightKg === null ||
        !Number.isFinite(Number(hookWeightKg)) ||
        Number(hookWeightKg) <= 0
      ) {
        return pending('Falta completar el peso gancho');
      }

      weightBasisKg = Number(hookWeightKg);
      amount = weightBasisKg * rate;
      break;

    default:
      throw new Error('Modalidad de comisión desconocida');
  }

  return {
    base_amount:
      Math.round((amount + Number.EPSILON) * 100) / 100,
    calculation_pending: false,
    pending_reason: null,
    weight_basis_kg: weightBasisKg,
  };
}

function resolveCommissionWeights({
  sourceSnapshot,
  receivedAnimals,
  slaughteredAnimals,
  incompleteAnimals,
  hookWeightKg,
}) {
  const snapshot =
    typeof sourceSnapshot === 'string'
      ? JSON.parse(sourceSnapshot)
      : sourceSnapshot;

  const details = snapshot?.details || {};

  // En compras por cabeza o gancho, el peso inicial
  // se guarda dentro de details.initial_weight.
  // En compras por kilo vivo, está en el resumen principal.
  const initial = details.initial_weight ||
    (
      snapshot?.pricing_basis === 'live_kg'
        ? {
            net_weight_kg: snapshot.net_weight_kg,
            origin_troops: details.origin_troops,
            plant_troops: details.plant_troops,
            missing_weight_troops:
              details.missing_weight_troops,
          }
        : null
    );

  const initialKg =
    initial?.net_weight_kg == null
      ? null
      : Number(initial.net_weight_kg);

  const weighedTroops =
    Number(initial?.origin_troops || 0) +
    Number(initial?.plant_troops || 0);

  const modernWeightComplete =
    weighedTroops > 0 &&
    initial?.missing_weight_troops != null &&
    Number(initial.missing_weight_troops) === 0;

  // Compatibilidad con preliquidaciones antiguas
  // que no registraban el desglose por tropas.
  const legacyWeightComplete =
    snapshot?.pricing_basis === 'live_kg' &&
    [
      'certified_origin_weighings',
      'plant_live_weight',
    ].includes(snapshot?.source_type) &&
    initial?.missing_weight_troops == null;

  const initialWeightComplete =
    Number.isFinite(initialKg) &&
    initialKg > 0 &&
    (modernWeightComplete || legacyWeightComplete);

  const hookKg =
    hookWeightKg == null
      ? null
      : Number(hookWeightKg);

  const received = Number(receivedAnimals);
  const slaughtered = Number(slaughteredAnimals);
  const incomplete = Number(incompleteAnimals);

  const hookWeightComplete =
    received > 0 &&
    slaughtered === received &&
    incomplete === 0 &&
    Number.isFinite(hookKg) &&
    hookKg > 0;

  return {
    initialWeightKg: initialWeightComplete
      ? initialKg
      : null,
    initialWeightComplete,
    hookWeightKg: hookWeightComplete
      ? hookKg
      : null,
    hookWeightComplete,
  };
}

function settleSlaughterhouseCommission({
  calculation,
  discountsTotal = 0,
  additionsTotal = 0,
  overrideAmount = null,
}) {
  const roundMoney = (value) =>
    Math.round(
      (value + Number.EPSILON) * 100
    ) / 100;

  const discounts = Number(discountsTotal);
  const additions = Number(additionsTotal);

  if (
    !Number.isFinite(discounts) ||
    !Number.isFinite(additions) ||
    discounts < 0 ||
    additions < 0
  ) {
    throw new Error(
      'Ajustes de comisión inválidos'
    );
  }

  const baseAmount =
    calculation.base_amount;

  // IMPORTE FINAL AUTORIZADO POR ADMINISTRACIÓN
  // Cero significa comisión anulada.
  // Null significa cálculo automático.
  if (
    overrideAmount !== null &&
    overrideAmount !== undefined
  ) {
    if (
      overrideAmount === '' ||
      !Number.isFinite(Number(overrideAmount)) ||
      Number(overrideAmount) < 0
    ) {
      throw new Error(
        'Importe final autorizado inválido'
      );
    }

    return {
      base_amount: baseAmount,
      discounts_total: discounts,
      additions_total: additions,
      net_payable: roundMoney(
        Number(overrideAmount)
      ),
      override_active: true,
      calculation_pending: false,
      base_calculation_pending:
        calculation.calculation_pending === true,
      pending_reason: null,
    };
  }

  // CÁLCULO AUTOMÁTICO PENDIENTE
  if (
    calculation.calculation_pending ||
    baseAmount === null
  ) {
    return {
      base_amount: baseAmount,
      discounts_total: discounts,
      additions_total: additions,
      net_payable: null,
      override_active: false,
      calculation_pending: true,
      base_calculation_pending: true,
      pending_reason:
        calculation.pending_reason,
    };
  }

  const netPayable = roundMoney(
    Number(baseAmount) -
    discounts +
    additions
  );

  // NUNCA GENERAR UNA DEUDA NEGATIVA
  if (netPayable < 0) {
    return {
      base_amount: baseAmount,
      discounts_total: discounts,
      additions_total: additions,
      net_payable: null,
      override_active: false,
      calculation_pending: true,
      base_calculation_pending: false,
      pending_reason:
        'Los descuentos superan la comisión disponible',
    };
  }

  return {
    base_amount: baseAmount,
    discounts_total: discounts,
    additions_total: additions,
    net_payable: netPayable,
    override_active: false,
    calculation_pending: false,
    base_calculation_pending: false,
    pending_reason: null,
  };
}

module.exports = {
  calculateSlaughterhouseCommission,
  resolveCommissionWeights,
  settleSlaughterhouseCommission,
};