const { pool } =
  require('../config/db');


/// =====================================================
/// CONFIGURACIÓN
/// =====================================================

const MAX_RESULTS = 3;

const MAX_COMBINATIONS_PER_TOTAL = 3;


/// =====================================================
/// NORMALIZAR TEXTO
/// =====================================================

function cleanText(value) {

  if (value == null) {
    return '';
  }

  return value
    .toString()
    .trim();
}


/// =====================================================
/// CLASIFICAR RESULTADO
/// =====================================================

function classifyCombination(
  total,
  target,
) {

  const difference =
    total - target;

  if (difference === 0) {

    return {
      code: 'exact',
      label: 'Completo exacto',
      color: 'green',
    };
  }


  /// 🔥 EXCESO PEQUEÑO
  ///
  /// Hasta aproximadamente 5%
  /// del objetivo, mínimo 1 animal.
  const smallExcess =
    Math.max(
      1,
      Math.ceil(
        target * 0.05,
      ),
    );

  if (
    difference > 0 &&
    difference <= smallExcess
  ) {

    return {
      code: 'small_excess',
      label:
        'Completo con pequeño exceso',
      color: 'green',
    };
  }


  /// 🔥 CASI COMPLETO
  ///
  /// Faltante de hasta aproximadamente
  /// 10%, mínimo 2 animales.
  const nearMissing =
    Math.max(
      2,
      Math.ceil(
        target * 0.10,
      ),
    );

  if (
    difference < 0 &&
    Math.abs(difference) <=
        nearMissing
  ) {

    return {
      code: 'almost_complete',
      label: 'Casi completo',
      color: 'yellow',
    };
  }


  if (difference > 0) {

    return {
      code: 'excess',
      label: 'Exceso importante',
      color: 'orange',
    };
  }


  return {
    code: 'insufficient',
    label: 'Capacidad parcial',
    color: 'yellow',
  };
}


/// =====================================================
/// PRIORIDAD DEL RESULTADO
/// =====================================================

function statusPriority(code) {

  switch (code) {

    case 'exact':
      return 0;

    case 'small_excess':
      return 1;

    case 'almost_complete':
      return 2;

    case 'excess':
      return 3;

    case 'insufficient':
    default:
      return 4;
  }
}


/// =====================================================
/// FIRMA ÚNICA DE COMBINACIÓN
/// =====================================================

function combinationKey(
  combination,
) {

  return combination
    .map(
      (lot) =>
        Number(lot.id),
    )
    .sort(
      (a, b) =>
        a - b,
    )
    .join('-');
}


/// =====================================================
/// GUARDAR COMBINACIÓN EN DP
/// =====================================================

function addCombination(
  map,
  total,
  combination,
) {

  const current =
    map.get(total) ?? [];

  const key =
    combinationKey(
      combination,
    );

  const exists =
    current.some(
      (item) =>
        combinationKey(item) ===
        key,
    );

  if (exists) {
    return;
  }

  current.push(
    combination,
  );

  /// 🔥 Preferimos combinaciones
  /// con menos lotes cuando dan
  /// exactamente el mismo total.
  current.sort(
    (a, b) => {

      if (
        a.length !==
        b.length
      ) {

        return (
          a.length -
          b.length
        );
      }

      const aLots =
        a
          .map(
            (lot) =>
              Number(
                lot.lot_number,
              ),
          )
          .sort(
            (x, y) =>
              x - y,
          )
          .join('-');

      const bLots =
        b
          .map(
            (lot) =>
              Number(
                lot.lot_number,
              ),
          )
          .sort(
            (x, y) =>
              x - y,
          )
          .join('-');

      return aLots.localeCompare(
        bLots,
      );
    },
  );

  if (
    current.length >
    MAX_COMBINATIONS_PER_TOTAL
  ) {

    current.length =
      MAX_COMBINATIONS_PER_TOTAL;
  }

  map.set(
    total,
    current,
  );
}


/// =====================================================
/// MOTOR DE COMBINACIONES
///
/// Cada lote es indivisible.
/// Nunca mezcla remates.
/// Nunca mezcla cattle_type.
/// =====================================================

function buildBestCombinations(
  lots,
  requiredQuantity,
) {

  if (
    !Array.isArray(lots) ||
    lots.length === 0
  ) {

    return [];
  }


  const target =
    Number(
      requiredQuantity,
    );


  const maxLotQuantity =
    Math.max(
      ...lots.map(
        (lot) =>
          Number(
            lot.quantity,
          ) || 0,
      ),
    );


  /// 🔥 No necesitamos explorar
  /// cantidades infinitas.
  ///
  /// Pero permitimos suficiente margen
  /// para encontrar una alternativa
  /// aunque el lote disponible sea
  /// mayor al objetivo.
  const maxSearchTotal =
    target +
    Math.max(
      target,
      maxLotQuantity,
    );


  /// total animales =>
  /// [combinación 1, combinación 2...]
  const dp =
    new Map();

  dp.set(
    0,
    [[]],
  );


  for (
    const lot
    of lots
  ) {

    const quantity =
      Number(
        lot.quantity,
      );

    if (
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {

      continue;
    }


    /// 🔥 Snapshot:
    /// evita usar el mismo lote
    /// más de una vez.
    const snapshot =
      Array.from(
        dp.entries(),
      );


    for (
      const [
        currentTotal,
        combinations,
      ]
      of snapshot
    ) {

      const newTotal =
        currentTotal +
        quantity;

      if (
        newTotal >
        maxSearchTotal
      ) {

        continue;
      }


      for (
        const combination
        of combinations
      ) {

        const next =
          [
            ...combination,
            lot,
          ];

        addCombination(
          dp,
          newTotal,
          next,
        );
      }
    }
  }


  /// ===================================================
  /// CONVERTIR TODAS LAS OPCIONES
  /// ===================================================

  const candidates =
    [];

  for (
    const [
      total,
      combinations,
    ]
    of dp.entries()
  ) {

    if (total === 0) {
      continue;
    }


    for (
      const combination
      of combinations
    ) {

      const status =
        classifyCombination(
          total,
          target,
        );

      candidates.push({

        total_quantity:
          total,

        difference:
          total - target,

        missing_quantity:
          Math.max(
            0,
            target - total,
          ),

        excess_quantity:
          Math.max(
            0,
            total - target,
          ),

        status,

        lots:
          combination
            .slice()
            .sort(
              (a, b) =>
                Number(
                  a.lot_number,
                ) -
                Number(
                  b.lot_number,
                ),
            ),
      });
    }
  }


  /// ===================================================
  /// ORDENAR MEJORES OPCIONES
  /// ===================================================

  candidates.sort(
    (a, b) => {

      const priorityA =
        statusPriority(
          a.status.code,
        );

      const priorityB =
        statusPriority(
          b.status.code,
        );

      if (
        priorityA !==
        priorityB
      ) {

        return (
          priorityA -
          priorityB
        );
      }


      const distanceA =
        Math.abs(
          a.difference,
        );

      const distanceB =
        Math.abs(
          b.difference,
        );

      if (
        distanceA !==
        distanceB
      ) {

        return (
          distanceA -
          distanceB
        );
      }


      /// 🔥 Si dos opciones son
      /// igual de buenas, preferimos
      /// la que requiere menos lotes.
      if (
        a.lots.length !==
        b.lots.length
      ) {

        return (
          a.lots.length -
          b.lots.length
        );
      }


      return (
        a.total_quantity -
        b.total_quantity
      );
    },
  );


  /// ===================================================
  /// QUITAR COMBINACIONES DUPLICADAS
  /// ===================================================

  const finalResults =
    [];

  const seen =
    new Set();


  for (
    const result
    of candidates
  ) {

    const key =
      combinationKey(
        result.lots,
      );

    if (
      seen.has(key)
    ) {

      continue;
    }

    seen.add(key);

    finalResults.push(
      result,
    );

    if (
      finalResults.length >=
      MAX_RESULTS
    ) {

      break;
    }
  }


  return finalResults;
}


/// =====================================================
/// TIPOS DE ANIMAL DISPONIBLES
/// EN UN REMATE ESPECÍFICO
///
/// GET
/// /auction-load-builder/types/:auctionId
/// =====================================================

async function getAuctionCattleTypes(
  req,
  res,
) {

  try {

    const auctionId =
      Number(
        req.params.auctionId,
      );

    if (
      !Number.isInteger(
        auctionId,
      ) ||
      auctionId <= 0
    ) {

      return res
        .status(400)
        .json({
          error:
            'auction_id inválido',
        });
    }


    /// 🔥 Confirmar que el remate existe
    const auctionResult =
      await pool.query(
        `
        SELECT
          id,
          company_id,
          name,
          status,
          scheduled_at
        FROM auctions
        WHERE id = $1
        LIMIT 1
        `,
        [
          auctionId,
        ],
      );


    if (
      auctionResult.rows.length === 0
    ) {

      return res
        .status(404)
        .json({
          error:
            'Remate no encontrado',
        });
    }


    /// 🔥 SOLO TIPOS REALMENTE
    /// DISPONIBLES EN ESTE REMATE
    const result =
      await pool.query(
        `
        SELECT
          MIN(TRIM(cattle_type))
            AS cattle_type,
          SUM(quantity)::integer
            AS available_quantity,
          COUNT(*)::integer
            AS lot_count
        FROM auction_live_lots
        WHERE auction_id = $1
          AND status IN (
            'queued',
            'live'
          )
          AND cattle_type IS NOT NULL
          AND TRIM(cattle_type) <> ''
          AND quantity IS NOT NULL
          AND quantity > 0
        GROUP BY
          LOWER(
            TRIM(cattle_type)
          )
        ORDER BY
          MIN(TRIM(cattle_type))
        `,
        [
          auctionId,
        ],
      );


    return res.json({
      success: true,

      auction:
        auctionResult.rows[0],

      types:
        result.rows,
    });


  } catch (e) {

    console.error(
      '❌ GET AUCTION CATTLE TYPES ERROR =>',
      e,
    );

    return res
      .status(500)
      .json({
        error:
          'Error obteniendo tipos de ganado',
      });
  }
}


/// =====================================================
/// ARMAR CAPACIDAD DE CAMIÓN
///
/// POST
/// /auction-load-builder/search
///
/// body:
/// {
///   auction_id: 28,
///   cattle_type: "Novillos",
///   required_quantity: 35
/// }
/// =====================================================

async function searchTruckCapacity(
  req,
  res,
) {

  try {

    const auctionId =
      Number(
        req.body.auction_id,
      );

    const cattleType =
      cleanText(
        req.body.cattle_type,
      );

    const requiredQuantity =
      Number(
        req.body.required_quantity,
      );


    /// =================================================
    /// VALIDACIONES
    /// =================================================

    if (
      !Number.isInteger(
        auctionId,
      ) ||
      auctionId <= 0
    ) {

      return res
        .status(400)
        .json({
          error:
            'auction_id inválido',
        });
    }


    if (
      cattleType.length === 0
    ) {

      return res
        .status(400)
        .json({
          error:
            'Debe seleccionar un tipo de animal',
        });
    }


    if (
      !Number.isInteger(
        requiredQuantity,
      ) ||
      requiredQuantity <= 0
    ) {

      return res
        .status(400)
        .json({
          error:
            'La cantidad requerida debe ser mayor a 0',
        });
    }


    /// =================================================
    /// REMATE
    ///
    /// Este es el candado principal:
    /// JAMÁS buscamos fuera de auction_id.
    /// =================================================

    const auctionResult =
      await pool.query(
        `
        SELECT
          id,
          company_id,
          name,
          status,
          scheduled_at
        FROM auctions
        WHERE id = $1
        LIMIT 1
        `,
        [
          auctionId,
        ],
      );


    if (
      auctionResult.rows.length === 0
    ) {

      return res
        .status(404)
        .json({
          error:
            'Remate no encontrado',
        });
    }


    const auction =
      auctionResult.rows[0];


    /// =================================================
    /// LOTES COMPATIBLES
    ///
    /// MISMO REMATE
    /// MISMO TIPO
    /// SOLO DISPONIBLES
    /// =================================================

    const lotsResult =
      await pool.query(
        `
        SELECT
          id,
          company_id,
          auction_id,
          lot_number,
          position,
          title,
          category,
          cattle_type,
          gender,
          age,
          breed,
          quantity,
          estimated_total_weight,
          sale_type,
          base_price,
          opening_price,
          reserve_price,
          increment_value,
          department,
          province,
          municipality,
          nearby_town,
          nearby_km,
          images,
          status
        FROM auction_live_lots
        WHERE auction_id = $1
          AND company_id = $2
          AND LOWER(
                TRIM(cattle_type)
              ) =
              LOWER(
                TRIM($3)
              )
          AND status IN (
            'queued',
            'live'
          )
          AND quantity IS NOT NULL
          AND quantity > 0
        ORDER BY
          lot_number ASC
        `,
        [
          auctionId,
          auction.company_id,
          cattleType,
        ],
      );


    const lots =
      lotsResult.rows;


    const availableQuantity =
      lots.reduce(
        (
          total,
          lot,
        ) =>
          total +
          Number(
            lot.quantity,
          ),
        0,
      );


    if (
      lots.length === 0
    ) {

      return res.json({
        success: true,

        auction,

        cattle_type:
          cattleType,

        required_quantity:
          requiredQuantity,

        available_quantity:
          0,

        compatible_lot_count:
          0,

        results:
          [],
      });
    }


    /// =================================================
    /// MOTOR
    /// =================================================

    const results =
      buildBestCombinations(
        lots,
        requiredQuantity,
      );


    return res.json({
      success: true,

      auction,

      cattle_type:
        cattleType,

      required_quantity:
        requiredQuantity,

      available_quantity:
        availableQuantity,

      compatible_lot_count:
        lots.length,

      results,
    });


  } catch (e) {

    console.error(
      '❌ SEARCH TRUCK CAPACITY ERROR =>',
      e,
    );

    return res
      .status(500)
      .json({
        error:
          'Error calculando capacidad de camión',
      });
  }
}

/// =====================================================
/// REMATES DISPONIBLES PARA COMPLETAR CAMIÓN
/// DE UNA EMPRESA
///
/// GET
/// /auction-load-builder/public/auctions/:companyId
///
/// 🔒 IMPORTANTE:
/// Cada resultado conserva su propio auction_id.
/// Nunca agrupamos animales entre remates.
/// =====================================================

async function getCompanyLoadBuilderAuctions(
  req,
  res,
) {

  try {

    const companyId =
      Number(
        req.params.companyId,
      );


    if (
      !Number.isInteger(
        companyId,
      ) ||
      companyId <= 0
    ) {

      return res
        .status(400)
        .json({
          error:
            'company_id inválido',
        });
    }


    const result =
      await pool.query(
        `
        SELECT

          a.id
            AS auction_id,

          a.company_id,

          a.name
            AS auction_name,

          a.status,

          a.scheduled_at,

          COUNT(l.id)::integer
            AS lot_count,

          COALESCE(
            SUM(l.quantity),
            0
          )::integer
            AS animal_count

        FROM auctions a

        JOIN auction_live_lots l
          ON l.auction_id = a.id
          AND l.company_id = a.company_id

        WHERE
          a.company_id = $1

          AND a.status != 'closed'

          AND l.status IN (
            'queued',
            'live'
          )

          AND l.quantity IS NOT NULL

          AND l.quantity > 0

        GROUP BY
          a.id,
          a.company_id,
          a.name,
          a.status,
          a.scheduled_at

        ORDER BY

          CASE
            WHEN a.status = 'live'
            THEN 0
            ELSE 1
          END,

          a.scheduled_at ASC
            NULLS LAST,

          a.id ASC
        `,
        [
          companyId,
        ],
      );


    return res.json({
      success: true,

      company_id:
        companyId,

      auctions:
        result.rows,
    });


  } catch (e) {

    console.error(
      '❌ GET LOAD BUILDER AUCTIONS ERROR =>',
      e,
    );


    return res
      .status(500)
      .json({
        error:
          'Error obteniendo remates disponibles',
      });
  }
}

module.exports = {
  getCompanyLoadBuilderAuctions,
  getAuctionCattleTypes,
  searchTruckCapacity,
};