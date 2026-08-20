const { pool } = require('../config/db');

const {
  sendPushNotification,
} = require('../services/notificationService');

const {
  processLotAlerts,
} = require('../services/processLotAlerts');

const {
  stopAdBreak,
} = require(
  '../services/auctionLiveAdsService'
);

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
      SELECT

        l.*,

        c.name AS company_name,

        a.name AS auction_name

      FROM auction_live_lots l

      JOIN companies c
        ON c.id = l.company_id

      JOIN auctions a
        ON a.id = l.auction_id

      WHERE l.id = $1
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

    const company_id =
        req.user.company_id;

    for (const lot of lots) {

      await pool.query(`
        UPDATE auction_live_lots
        SET display_order = $1
        WHERE id = $2
        AND company_id = $3
      `, [
        lot.display_order,
        lot.id,
        company_id,
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

  const client =
      await pool.connect();

  try {

    const { id } =
        req.params;

    const company_id =
        req.user.company_id;

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

    await client.query(
      'BEGIN'
    );

    /// 🔥 OBTENER PESO REAL EXISTENTE
    const currentResult =
        await client.query(
      `
      SELECT
        id,
        weight
      FROM auction_live_lots
      WHERE id = $1
      AND company_id = $2
      FOR UPDATE
      `,
      [
        id,
        company_id,
      ]
    );

    if (
      currentResult.rows.length === 0
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(404).json({

        error:
          'Lote no encontrado',
      });
    }

    const currentLot =
        currentResult.rows[0];

    /// 🔥 PROMEDIO SIEMPRE DERIVADO
    const finalQuantity =
        Number(quantity);

    const realWeight =
        Number(
          currentLot.weight
        );

    let averageWeight =
        null;

    if (
      Number.isFinite(realWeight) &&
      realWeight > 0 &&
      Number.isFinite(finalQuantity) &&
      finalQuantity > 0
    ) {

      averageWeight =
          Number(
            (
              realWeight /
              finalQuantity
            ).toFixed(2)
          );
    }

    const result =
        await client.query(
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

        average_weight = $10,

        estimated_total_weight = $11,

        sale_type = $12,

        department = $13,

        province = $14,

        municipality = $15,

        arrival_time = $16,

        nearby_town = $17,

        nearby_km = $18,

        images = $19,

        videos = $20,

        base_price = $21,

        opening_price = $22,

        reserve_price = $23,

        increment_value = $24,

        notes = $25

      WHERE id = $26

      AND company_id = $27

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

        averageWeight,

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

        company_id,
      ]
    );

    await client.query(
      'COMMIT'
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

    try {

      await client.query(
        'ROLLBACK'
      );

    } catch (_) {}

    console.log(
      'UPDATE LOT ERROR:',
      e,
    );

    res.status(500).json({

      error:
        'Error actualizando lote',
    });

  } finally {

    client.release();
  }
};

/// 🔥 ELIMINAR LOTE
exports.deleteAuctionLiveLot =
  async (req, res) => {

  try {

    const { id } =
        req.params;

    const company_id =
        req.user.company_id;

    const result =
        await pool.query(
      `
      DELETE FROM auction_live_lots
      WHERE id = $1
      AND company_id = $2
      RETURNING id
      `,
      [
        id,
        company_id,
      ]
    );

    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({

        error:
          'Lote no encontrado',
      });
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

    /// 🛑 DETENER PUBLICIDAD
    /// AL ABRIR NUEVO LOTE
    await stopAdBreak(
      auction_id,
      io,
      'new_lot',
    );

    /// 🔥 AVISAR CAMBIO DE LOTE
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

    /// 🔔 AVISAR WATCHERS
    const watchersResult =
        await pool.query(
      `
      SELECT user_id
      FROM auction_lot_watchers
      WHERE lot_id = $1
      AND status = 'active'
      AND notified_at IS NULL
      `,
      [lot_id]
    );

    const userIds =
        watchersResult.rows.map(
      w => w.user_id
    );

    console.log(
      '🔔 WATCHERS:',
      userIds
    );

    if (userIds.length > 0) {

      await sendPushNotification({

        userIds,

        title:
          '🔔 Tu lote ya está en remate',

        body:
          `Lote #${lot.lot_number} - ${lot.title}`,

        data: {

          type:
            'auction_live_reminder',

          lot_id:
            String(lot_id),

          auction_id:
            String(auction_id),
        },
      });

      await pool.query(
        `
        UPDATE auction_lot_watchers
        SET notified_at = NOW()
        WHERE lot_id = $1
        AND notified_at IS NULL
        `,
        [lot_id]
      );

      console.log(
        '✅ WATCHERS NOTIFICADOS'
      );
    }    

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
      AND status = 'active'
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

/// ⚖️ ACTUALIZAR PESO REAL DE BALANZA
exports.updateLotWeight =
  async (req, res) => {

  const client =
      await pool.connect();

  try {

    const user =
        req.user;

    const { id } =
        req.params;

    const {
      weight,
    } = req.body;

    /// 🔒 SOLO ADMIN / BALANZA
    if (
      user.role !== 'admin' &&
      user.role !== 'operator_balanza'
    ) {

      return res.status(403).json({

        error:
          'No autorizado para cargar peso',
      });
    }

    /// 🔒 VALIDAR PESO
    const finalWeight =
        Number(weight);

    if (
      !Number.isFinite(finalWeight) ||
      finalWeight <= 0
    ) {

      return res.status(400).json({

        error:
          'Peso inválido',
      });
    }

    await client.query(
      'BEGIN'
    );

    /// 🔥 BUSCAR LOTE
    /// MISMA EMPRESA + LOCK
    const lotResult =
        await client.query(

      `
      SELECT

        id,

        company_id,

        auction_id,

        lot_number,

        quantity,

        weight,

        average_weight,

        status

      FROM auction_live_lots

      WHERE id = $1

      AND company_id = $2

      FOR UPDATE
      `,
      [
        id,
        user.company_id,
      ]
    );

    const lot =
        lotResult.rows[0];

    if (!lot) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(404).json({

        error:
          'Lote no encontrado',
      });
    }

    /// 🔒 NO MODIFICAR LOTES
    /// YA FINALIZADOS
    if (
      lot.status === 'sold' ||
      lot.status === 'passed' ||
      lot.status === 'cancelled'
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(400).json({

        error:
          'El lote ya fue cerrado',
      });
    }

    /// 🔥 CALCULAR PESO PROMEDIO
    const quantity =
        Number(lot.quantity);

    let averageWeight =
        null;

    if (
      Number.isFinite(quantity) &&
      quantity > 0
    ) {

      averageWeight =
          Number(
            (
              finalWeight /
              quantity
            ).toFixed(2)
          );
    }

    /// ⚖️ ACTUALIZAR SOLO
    /// DATOS DE BALANZA
    const updateResult =
        await client.query(

      `
      UPDATE auction_live_lots
      SET

        weight = $1,

        average_weight = $2,

        weighed_at = NOW(),

        weighed_by_user_id = $3

      WHERE id = $4

      AND company_id = $5

      RETURNING *
      `,
      [

        finalWeight,

        averageWeight,

        user.user_id,

        id,

        user.company_id,
      ]
    );

    await client.query(
      'COMMIT'
    );

    const updatedLot =
        updateResult.rows[0];

    /// ⚡ SOCKET
    const io =
        req.app.get('io');

    /// 🔥 AVISAR AL REMATE
    io.to(
      `auction_${lot.auction_id}`
    ).emit(

      'lotWeightUpdated',

      {

        lot_id:
          lot.id,

        lot_number:
          lot.lot_number,

        weight:
          finalWeight,

        average_weight:
          averageWeight,

        quantity:
          lot.quantity,

        weighed_at:
          updatedLot.weighed_at,
      }
    );

    /// 🔥 ACTUALIZAR MINI PLAZA
    io.emit(
      'miniPlazaUpdated'
    );

    res.json({

      success: true,

      lot_id:
        lot.id,

      lot_number:
        lot.lot_number,

      quantity:
        lot.quantity,

      weight:
        finalWeight,

      average_weight:
        averageWeight,

      weighed_at:
        updatedLot.weighed_at,

      warning:
        averageWeight == null
            ? 'Peso guardado, pero falta cantidad de animales para calcular promedio'
            : null,
    });

  } catch (error) {

    try {

      await client.query(
        'ROLLBACK'
      );

    } catch (_) {}

    console.log(
      'UPDATE LOT WEIGHT ERROR:',
      error,
    );

    res.status(500).json({

      error:
        'Error actualizando peso del lote',
    });

  } finally {

    client.release();
  }
};

/// 📷 ACTUALIZAR FOTOS DEL LOTE
exports.updateLotImages =
  async (req, res) => {

  const client =
      await pool.connect();

  try {

    const user =
        req.user;

    const { id } =
        req.params;

    const {
      images,
    } = req.body;

    /// 🔒 SOLO ADMIN / FOTOS
    if (
      user.role !== 'admin' &&
      user.role !== 'operator_fotos'
    ) {

      return res.status(403).json({

        error:
          'No autorizado para cargar fotos',
      });
    }

    /// 🔒 VALIDAR ARRAY
    if (
      !Array.isArray(images)
    ) {

      return res.status(400).json({

        error:
          'Formato de imágenes inválido',
      });
    }

    /// 🔥 NORMALIZAR
    const cleanImages =
        images
            .map(
              (value) =>
                  value
                      ?.toString()
                      .trim()
            )
            .filter(
              (value) =>
                  value &&
                  value.length > 0
            );

    await client.query(
      'BEGIN'
    );

    /// 🔥 BUSCAR LOTE
    /// DE LA MISMA EMPRESA
    const lotResult =
        await client.query(

      `
      SELECT

        id,

        company_id,

        auction_id,

        lot_number,

        status,

        images

      FROM auction_live_lots

      WHERE id = $1

      AND company_id = $2

      FOR UPDATE
      `,
      [
        id,
        user.company_id,
      ]
    );

    const lot =
        lotResult.rows[0];

    if (!lot) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(404).json({

        error:
          'Lote no encontrado',
      });
    }

    /// 🔒 NO MODIFICAR
    /// LOTES YA CERRADOS
    if (
      lot.status === 'sold' ||
      lot.status === 'passed' ||
      lot.status === 'cancelled'
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(400).json({

        error:
          'El lote ya fue cerrado',
      });
    }

    /// 📷 ACTUALIZAR SOLO FOTOS
    const updateResult =
        await client.query(

      `
      UPDATE auction_live_lots
      SET

        images = $1,

        photos_updated_at = NOW(),

        photos_updated_by_user_id = $2

      WHERE id = $3

      AND company_id = $4

      RETURNING *
      `,
      [
        cleanImages,

        user.user_id,

        id,

        user.company_id,
      ]
    );

    await client.query(
      'COMMIT'
    );

    const updatedLot =
        updateResult.rows[0];

    /// ⚡ SOCKET
    const io =
        req.app.get('io');

    io.to(
      `auction_${lot.auction_id}`
    ).emit(

      'lotImagesUpdated',

      {
        lot_id:
          lot.id,

        lot_number:
          lot.lot_number,

        images:
          updatedLot.images,

        photos_updated_at:
          updatedLot
              .photos_updated_at,
      }
    );

    /// 🔥 MINI PLAZA
    io.emit(
      'miniPlazaUpdated'
    );

    res.json({

      success: true,

      lot_id:
        lot.id,

      lot_number:
        lot.lot_number,

      images:
        updatedLot.images,

      photos_updated_at:
        updatedLot
            .photos_updated_at,
    });

  } catch (error) {

    try {

      await client.query(
        'ROLLBACK'
      );

    } catch (_) {}

    console.log(
      'UPDATE LOT IMAGES ERROR:',
      error,
    );

    res.status(500).json({

      error:
        'Error actualizando fotos del lote',
    });

  } finally {

    client.release();
  }
};