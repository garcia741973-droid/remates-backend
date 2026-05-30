const { pool } = require('../config/db');

const {
  processLotAlerts,
} = require('../services/processLotAlerts');

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

    const createdLot =
        result.rows[0];
    
    /// 🔥 NORMALIZAR PARA ALERTAS
    const alertLot = {

      ...createdLot,

      class:
          createdLot.cattle_type,

      source:
          'auction',
    };

    await processLotAlerts(
      alertLot
    );    

    /// 🔥 SOCKET MINI PLAZA
    const io =
        req.app.get('io');

    io.emit(
      'miniPlazaUpdated'
    );

    res.json(createdLot);

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

/// 🔥 NÚMEROS DISPONIBLES
exports.getAvailableLotNumbers =
    async (req, res) => {

  try {

    const { auction_id } =
        req.params;

    /// 🔥 LOTES YA USADOS
    const usedResult =
        await pool.query(
      `
      SELECT lot_number
      FROM auction_live_lots
      WHERE auction_id = $1
      `,
      [auction_id]
    );

    const usedNumbers =
        usedResult.rows.map(
      (e) => e.lot_number,
    );

    /// 🔥 GENERAR 1 → 500
    const available = [];

    for (
      let i = 1;
      i <= 500;
      i++
    ) {

      if (
        !usedNumbers.includes(i)
      ) {

        available.push(i);
      }
    }

    res.json(available);

  } catch (error) {

    console.log(
      'ERROR AVAILABLE LOT NUMBERS:',
      error,
    );

    res.status(500).json({

      error:
          'Error obteniendo números',
    });
  }
};

/// 🔥 REORDENAR LOTES
exports.reorderAuctionLiveLots =
  async (req, res) => {

  try {

    const { lots } = req.body;

    for (const lot of lots) {

      await pool.query(`
        UPDATE auction_live_lots
        SET display_order = $1
        WHERE id = $2
      `, [
        lot.display_order,
        lot.id,
      ]);
    }

    /// 🔥 SOCKET MINI PLAZA
    const io =
        req.app.get('io');

    io.emit(
      'miniPlazaUpdated'
    );

    res.json({
      success: true,
    });

  } catch (e) {

    console.log(e);

    res.status(500).json({
      error:
        'Error reordering lots',
    });
  }
};

/// 🔥 ACTUALIZAR LOTE
exports.updateAuctionLiveLot =
  async (req, res) => {

  try {

    const { id } =
        req.params;

    const {

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

    const result =
        await pool.query(
      `
      UPDATE auction_live_lots
      SET

        lot_number = $1,

        position = $2,

        title = $3,

        category = $4,

        cattle_type = $5,

        gender = $6,

        age = $7,

        breed = $8,

        quantity = $9,

        weight = $10,

        average_weight = $11,

        estimated_total_weight = $12,

        sale_type = $13,

        department = $14,

        province = $15,

        municipality = $16,

        arrival_time = $17,

        nearby_town = $18,

        nearby_km = $19,

        images = $20,

        videos = $21,

        base_price = $22,

        opening_price = $23,

        reserve_price = $24,

        increment_value = $25,

        notes = $26

      WHERE id = $27

      RETURNING *
      `,
      [

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

        id,
      ]
    );

    /// 🔥 SOCKET MINI PLAZA
    const io =
        req.app.get('io');

    io.emit(
      'miniPlazaUpdated'
    );

    res.json(
      result.rows[0],
    );

  } catch (e) {

    console.log(
      'UPDATE LOT ERROR:',
      e,
    );

    res.status(500).json({

      error:
          'Error actualizando lote',
    });
  }
};

/// 🔥 ELIMINAR LOTE
exports.deleteAuctionLiveLot =
  async (req, res) => {

  try {

    const { id } =
        req.params;

    await pool.query(
      `
      DELETE FROM auction_live_lots
      WHERE id = $1
      `,
      [id]
    );

    /// 🔥 SOCKET MINI PLAZA
    const io =
        req.app.get('io');

    io.emit(
      'miniPlazaUpdated'
    );

    res.json({
      success: true,
    });

  } catch (e) {

    console.log(
      'DELETE LOT ERROR:',
      e,
    );

    res.status(500).json({

      error:
          'Error eliminando lote',
    });
  }
};

/// 🔥 ABRIR LOTE EN VIVO
exports.openLiveLot =
  async (req, res) => {

  try {

    const user = req.user;

    const {

      auction_id,

      lot_id,

    } = req.body;

    /// 🔒 SOLO OPERADOR / ADMIN
    if (

      user.role !==
        'operator_sala' &&

      user.role !== 'admin'
    ) {

      return res.status(403).json({

        error:
          'No autorizado',
      });
    }

    /// 🔥 VALIDAR LOTE
    const lotResult =
        await pool.query(
      `
      SELECT *
      FROM auction_live_lots
      WHERE id = $1
      `,
      [lot_id]
    );

    const lot =
        lotResult.rows[0];

    if (!lot) {

      return res.status(404).json({

        error:
          'Lote no encontrado',
      });
    }

    /// 🔥 MARCAR LIVE
    await pool.query(
      `
      UPDATE auction_live_lots
      SET

        status = 'live',

        started_at = NOW()

      WHERE id = $1
      `,
      [lot_id]
    );

    /// 🔥 ACTIVAR EN REMATE
    await pool.query(
      `
      UPDATE auctions
      SET current_lot_id = $1
      WHERE id = $2
      `,
      [
        lot_id,
        auction_id,
      ]
    );

    /// 🔥 SOCKET
    const io =
        req.app.get('io');

    io.to(
      `auction_${auction_id}`
    ).emit(

      'lotChanged',

      {

        current_lot_id:
            lot_id,
      }
    );

    /// 🔥 MINI PLAZA REFRESH
    io.emit(
      'miniPlazaUpdated'
    );    


    res.json({

      success: true,

      lot_id,
    });

  } catch (e) {

    console.log(
      'OPEN LIVE LOT ERROR:',
      e,
    );

    res.status(500).json({

      error:
        'Error abriendo lote',
    });
  }
};

/// 🔥 VOLVER LOTE A COLA
exports.returnLotToQueue =
  async (req, res) => {

  try {

    const user = req.user;

    const {

      auction_id,

      lot_id,

    } = req.body;

    /// 🔒 SOLO OPERADOR / ADMIN
    if (

      user.role !==
        'operator_sala' &&

      user.role !== 'admin'
    ) {

      return res.status(403).json({

        error:
          'No autorizado',
      });
    }

    /// 🔥 VALIDAR LOTE
    const lotResult =
        await pool.query(
      `
      SELECT *
      FROM auction_live_lots
      WHERE id = $1
      `,
      [lot_id]
    );

    const lot =
        lotResult.rows[0];

    if (!lot) {

      return res.status(404).json({

        error:
          'Lote no encontrado',
      });
    }

    /// 🔒 SOLO LIVE
    if (
      lot.status !== 'live'
    ) {

      return res.status(400).json({

        error:
          'Solo lotes live pueden volver a cola',
      });
    }

    /// 🔥 VOLVER A COLA
    await pool.query(
      `
      UPDATE auction_live_lots
      SET

        status = 'queued'

      WHERE id = $1
      `,
      [lot_id]
    );

    /// 🔥 LIMPIAR LOTE ACTUAL
    await pool.query(
      `
      UPDATE auctions
      SET current_lot_id = NULL
      WHERE id = $1
      `,
      [auction_id]
    );

    /// 🔥 SOCKET
    const io =
        req.app.get('io');

    io.to(
      `auction_${auction_id}`
    ).emit(

      'lotChanged',

      {

        current_lot_id:
            null,
      }
    );

    /// 🔥 MINI PLAZA REFRESH
    io.emit(
      'miniPlazaUpdated'
    );    

    res.json({

      success: true,
    });

  } catch (e) {

    console.log(
      'RETURN LOT ERROR:',
      e,
    );

    res.status(500).json({

      error:
        'Error retornando lote',
    });
  }
};

/// 🔥 RESULTADOS REMATE
exports.getAuctionResults =
  async (req, res) => {

  try {

    const { auction_id } =
        req.params;

    const result =
        await pool.query(

      `
      SELECT

        l.id,

        l.lot_number,

        l.title,

        l.quantity,

        l.weight,

        l.sale_type,

        l.status,

        l.final_price,

        l.closed_at,

        l.sold_at,

        l.passed_at,

        l.winner_user_id,

        u.full_name AS winner_name,

        b.bid_source,

        b.bidder_label,

        s.id AS sale_id,

        s.certificate_generated,

        s.certificate_url

      FROM auction_live_lots l

      LEFT JOIN users u
      ON u.id = l.winner_user_id

      LEFT JOIN auction_sales s
      ON s.lot_id = l.id

      LEFT JOIN bids b
      ON b.id = (

        SELECT id
        FROM bids
        WHERE lot_id = l.id
        ORDER BY id DESC
        LIMIT 1
      )

      WHERE l.auction_id = $1

      AND l.status IN (
        'sold',
        'passed'
      )

      ORDER BY l.closed_at ASC
      `,
      [auction_id]
    );

    res.json(
      result.rows,
    );

  } catch (e) {

    console.log(
      'GET RESULTS ERROR:',
      e,
    );

    res.status(500).json({

      error:
        'Error obteniendo resultados',
    });
  }
};

/// 🔥 MINI PLAZA LOTES ACTIVOS
exports.getMiniPlazaLots =
  async (req, res) => {

  try {

    const { company_id } =
        req.params;

    const result =
        await pool.query(

      `
      SELECT

        l.id,

        l.company_id,

        l.auction_id,

        l.lot_number,

        l.title,

        l.breed,

        l.quantity,

        l.weight,

        l.average_weight,

        l.current_price,

        l.sale_type,

        l.status,

        l.images,

        l.videos,

        l.category,

        l.cattle_type,

        l.gender,

        l.age,

        l.department,

        l.province,

        l.municipality,

        l.display_order,

        a.name AS auction_name

      FROM auction_live_lots l

      JOIN auctions a
      ON a.id = l.auction_id

      WHERE

        l.company_id = $1

        AND l.status IN (
          'queued',
          'live'
        )

        AND a.status != 'closed'

      ORDER BY

        CASE
          WHEN l.status = 'live'
          THEN 0
          ELSE 1
        END,

        l.display_order ASC,

        l.created_at DESC

      LIMIT 30
      `,
      [company_id]
    );

    res.json(
      result.rows,
    );

  } catch (e) {

    console.log(
      'MINI PLAZA LOTS ERROR:',
      e,
    );

    res.status(500).json({

      error:
        'Error obteniendo lotes Mini Plaza',
    });
  }
};