function calculateLotMatchScore(filters, lot) {

  let score = 0;

  let reasons = [];

  /// 🧠 RAZA → NO NEGOCIABLE
  if (
    filters.breed &&
    filters.breed.toLowerCase() !==
      lot.breed?.toLowerCase()
  ) {
    return {
      matched: false,
      score: 0,
      reasons: ['Raza distinta'],
    };
  }

  score += 40;

  reasons.push('Raza exacta');

  /// 🧠 CLASE → NO NEGOCIABLE
  if (
    filters.class &&
    filters.class.toLowerCase() !==
      lot.class?.toLowerCase()
  ) {
    return {
      matched: false,
      score: 0,
      reasons: ['Clase distinta'],
    };
  }

  score += 40;

  reasons.push('Clase exacta');

  /// 📍 DEPARTAMENTO
  if (
    filters.department &&
    lot.department
  ) {

    if (
      filters.department.toLowerCase() ===
      lot.department.toLowerCase()
    ) {

      score += 10;

      reasons.push('Mismo departamento');

    } else if (
      filters.flexibility?.allow_other_departments
    ) {

      score += 5;

      reasons.push('Departamento alternativo');
    }
  }

  /// 💰 PRECIO
  const lotPrice =
    Number(lot.current_price || lot.base_price || 0);

  const maxPrice =
    Number(filters.price_max || 0);

  if (maxPrice > 0) {

    const flexPercent =
      Number(
        filters.flexibility?.price_percent || 0
      );

    const maxFlexiblePrice =
      maxPrice +
      (maxPrice * flexPercent / 100);

    if (lotPrice <= maxPrice) {

      score += 5;

      reasons.push('Precio ideal');

    } else if (
      lotPrice <= maxFlexiblePrice
    ) {

      score += 3;

      reasons.push('Precio flexible');
    }
  }

  /// 🐂 CANTIDAD
  const lotQuantity =
    Number(lot.quantity || 0);

  const minQuantity =
    Number(filters.quantity_min || 0);

  const idealQuantity =
    Number(filters.quantity_ideal || 0);

  if (idealQuantity > 0) {

    if (lotQuantity >= idealQuantity) {

      score += 5;

      reasons.push('Cantidad ideal');

    } else if (
      lotQuantity >= minQuantity
    ) {

      score += 3;

      reasons.push('Cantidad aceptable');
    }
  }

  /// 🏷️ TIPO DE VENTA
  if (
    filters.sale_types &&
    Array.isArray(filters.sale_types)
  ) {

    if (
      filters.sale_types.includes(
        lot.sale_type
      )
    ) {

      score += 5;

      reasons.push('Tipo de venta compatible');
    }
  }

  return {
    matched: score >= 70,
    score,
    reasons,
  };
}

module.exports = {
  calculateLotMatchScore,
};