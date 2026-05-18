const { pool } = require('../config/db');

/// 🔥 CREAR LOTE VIVO REMATE
exports.createAuctionLiveLot = async (req, res) => {

  try {

    const company_id =
        req.user.company_id;

        const {

        auction_id,

        seller_user_id,

        lot_number,

        position,

        title,

        category,

        cattle_type,

        gender,

        age,

        breed,

        quantity,

        weight,

        average_weight,

        estimated_total_weight,

        sale_type,

        department,

        province,

        municipality,

        arrival_time,

        nearby_town,

        nearby_km,

        images,

        videos,

        base_price,

        opening_price,

        reserve_price,

        increment_value,

        notes,

        } = req.body;

    /// 🔒 VALIDAR REMATE
    const auctionResult =
        await pool.query(
      `
      SELECT *
      FROM auctions
      WHERE id = $1
      AND company_id = $2
      `,
      [auction_id, company_id]
    );

    if (
      auctionResult.rows.length === 0
    ) {

      return res.status(404).json({

        error:
            'Remate no encontrado',
      });
    }

    /// 🔥 AUTO NUMERO LOTE
    let finalLotNumber = lot_number;

    if (!finalLotNumber) {

    const nextResult =
        await pool.query(
        `
        SELECT COALESCE(
        MAX(lot_number),
        0
        ) + 1 AS next_number

        FROM auction_live_lots

        WHERE auction_id = $1
        `,
        [auction_id]
    );

    finalLotNumber =
        nextResult.rows[0]
            .next_number;
    }

    /// 🔥 CREAR LOTE OPERATIVO
    const result =
        await pool.query(
      `
        INSERT INTO auction_live_lots (

        company_id,

        auction_id,

        seller_user_id,

        lot_number,

        position,

        title,

        category,

        cattle_type,

        gender,

        age,

        breed,

        quantity,

        weight,

        average_weight,

        estimated_total_weight,

        sale_type,

        department,

        province,

      municipality,

      arrival_time,

      nearby_town,

      nearby_km,

      images,

      videos,

      base_price,

        opening_price,

        current_price,

        reserve_price,

        increment_value,

        notes

        )

        VALUES (

        $1,$2,$3,$4,$5,

        $6,$7,$8,$9,$10,

        $11,$12,$13,$14,$15,

        $16,$17,$18,$19,$20,

        $21,$22,$23,$24,

        $25,$26,$27,$28,

        $29,$30
        )

      RETURNING *
      `,
      [

        company_id,

        auction_id,

        seller_user_id,

        finalLotNumber,

        position,

        title,

        category,

        cattle_type,

        gender,

        age,

        breed,

        quantity,

        weight,

        average_weight,

        estimated_total_weight,

        sale_type,

        department,

        province,

        municipality,

        arrival_time,

        nearby_town,

        nearby_km,

        images,

        videos,

        base_price,

        opening_price,

        opening_price,

        reserve_price,

        increment_value,

        notes,
      ]
    );

    res.json(result.rows[0]);

  } catch (error) {

    console.log(
      'ERROR CREATE AUCTION LIVE LOT:',
      error,
    );

    res.status(500).json({

      error:
          'Error creando lote remate',
    });
  }
};

/// 🔥 OBTENER LOTES DEL REMATE
exports.getAuctionLiveLots =
    async (req, res) => {

  try {

    const { auction_id } =
        req.params;

    const result =
        await pool.query(
      `
      SELECT *
      FROM auction_live_lots
      WHERE auction_id = $1
      ORDER BY position ASC
      `,
      [auction_id]
    );

    res.json(result.rows);

  } catch (error) {

    console.log(
      'ERROR GET AUCTION LIVE LOTS:',
      error,
    );

    res.status(500).json({

      error:
          'Error obteniendo lotes',
    });
  }
};

/// 🔥 OBTENER LOTE VIVO
exports.getAuctionLiveLotById =
    async (req, res) => {

  try {

    const { id } =
        req.params;

    const result =
        await pool.query(
      `
      SELECT *
      FROM auction_live_lots
      WHERE id = $1
      `,
      [id]
    );

    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({

        error:
            'Lote no encontrado',
      });
    }

    res.json(result.rows[0]);

  } catch (error) {

    console.log(
      'ERROR GET LIVE LOT:',
      error,
    );

    res.status(500).json({

      error:
          'Error obteniendo lote',
    });
  }
};