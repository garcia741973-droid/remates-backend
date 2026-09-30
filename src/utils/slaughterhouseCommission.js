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

module.exports = {
  calculateSlaughterhouseCommission,
};