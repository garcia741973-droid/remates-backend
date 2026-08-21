const { pool } = require('../config/db');

const {
  RoomServiceClient,
} = require('livekit-server-sdk');

const {
  startAdBreak,
} = require(
  '../services/auctionLiveAdsService'
);

exports.placeBid = async (req, res) => {exports.placeBid = async (req, res) => {

  const client =
      await pool.connect();

  try {

    const user =
        req.user;

    const {
      auction_id,
      lot_id,
      amount,
    } = req.body;


    await client.query(
      'BEGIN'
    );


    // =====================================================
    // 🔒 1. VALIDAR REMATE
    // TAMBIÉN NECESITAMOS SU company_id
    // =====================================================

    const auctionResult =
        await client.query(
      `
      SELECT

        id,
        company_id,
        status,
        current_lot_id

      FROM auctions

      WHERE id = $1
      `,
      [
        auction_id,
      ],
    );


    const auction =
        auctionResult.rows[0];


    if (!auction) {

      await client.query(
        'ROLLBACK'
      );

      return res
        .status(404)
        .json({
          error:
              'Remate no existe',
        });
    }


    if (
      auction.status !==
      'live'
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res
        .status(400)
        .json({
          error:
              'El remate no está activo',
        });
    }


    // =====================================================
    // 🔒 2. CLIENTE ONLINE:
    //
    // A) KYC GLOBAL
    // B) PERTENECE A ESTA REMATADORA
    // C) APROBADO POR ESTA REMATADORA
    // D) PUJAS NO CONGELADAS
    //
    // IMPORTANTE:
    // TOMAMOS company_id DEL REMATE,
    // NO DEL BODY.
    // =====================================================

    if (
      user.role ===
      'client'
    ) {

      const accessResult =
          await client.query(
        `
        SELECT

          u.kyc_status,

          uc.role
            AS company_role,

          uc.company_status,

          uc.bidding_enabled,

          uc.bidding_frozen_reason

        FROM users u

        JOIN user_companies uc
          ON uc.user_id = u.id
          AND uc.company_id = $2

        WHERE
          u.id = $1

        FOR SHARE OF uc
        `,
        [
          user.user_id,
          auction.company_id,
        ],
      );


      const access =
          accessResult.rows[0];


      // =============================================
      // NO ESTÁ RELACIONADO CON ESTA REMATADORA
      // =============================================

      if (!access) {

        await client.query(
          'ROLLBACK'
        );

        return res
          .status(403)
          .json({
            error:
                'No estás autorizado para pujar con esta rematadora',
          });
      }


      // =============================================
      // KYC GLOBAL
      // =============================================

      if (
        access.kyc_status !==
        'approved'
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res
          .status(403)
          .json({
            error:
                'Debes estar aprobado para pujar',
          });
      }


      // =============================================
      // DEBE SER CLIENTE EN ESTA EMPRESA
      // =============================================

      if (
        access.company_role !==
        'client'
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res
          .status(403)
          .json({
            error:
                'No tienes autorización como cliente para pujar',
          });
      }


      // =============================================
      // APROBACIÓN ESPECÍFICA REMATADORA
      // =============================================

      if (
        access.company_status !==
        'approved'
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res
          .status(403)
          .json({
            error:
                'No estás habilitado por esta rematadora para pujar',
          });
      }


      // =============================================
      // 🔴 PUJA CONGELADA
      // =============================================

      if (
        access.bidding_enabled ===
        false
      ) {

        await client.query(
          'ROLLBACK'
        );


        return res
          .status(403)
          .json({

            error:
                'Tu autorización para pujar fue suspendida por esta rematadora',

            code:
                'BIDDING_FROZEN',

            bidding_frozen:
                true,

            reason:
                access
                    .bidding_frozen_reason ??
                null,
          });
      }
    }


    // =====================================================
    // 🔒 3. BLOQUEAR LOTE
    // DEBE PERTENECER AL MISMO REMATE
    // =====================================================

    const lotResult =
        await client.query(
      `
      SELECT *

      FROM auction_live_lots

      WHERE
        id = $1
        AND auction_id = $2

      FOR UPDATE
      `,
      [
        lot_id,
        auction_id,
      ],
    );


    const lot =
        lotResult.rows[0];


    if (!lot) {

      await client.query(
        'ROLLBACK'
      );

      return res
        .status(404)
        .json({
          error:
              'Lote no existe en este remate',
        });
    }


    // =====================================================
    // 🔒 4. VALIDAR QUE SEA EL LOTE ACTUAL
    // =====================================================

    if (
      Number(
        auction.current_lot_id
      ) !==
      Number(
        lot_id
      )
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res
        .status(400)
        .json({
          error:
              'Este lote no está activo en el remate',
        });
    }


    // =====================================================
    // 🔒 5. VALIDAR ESTADO DEL LOTE
    // =====================================================

    if (
      lot.status !==
      'live'
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res
        .status(400)
        .json({
          error:
              'El lote no está activo',
        });
    }


    // =====================================================
    // 🔒 6. VALIDAR MONTO
    // =====================================================

    const bidAmount =
        Number(
          amount
        );


    if (
      !Number.isFinite(
        bidAmount
      )
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res
        .status(400)
        .json({
          error:
              'Monto de puja inválido',
        });
    }


    if (
      bidAmount <=
      Number(
        lot.current_price
      )
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res
        .status(400)
        .json({
          error:
              'La puja debe ser mayor al precio actual',
        });
    }


    // =====================================================
    // 🔥 HOOK FUTURO
    // DEPÓSITO / LÍMITE DE CRÉDITO
    // =====================================================

    // const deposit = ...


    // =====================================================
    // 💰 7. INSERTAR PUJA ONLINE
    // =====================================================

    await client.query(
      `
      INSERT INTO bids (

        auction_id,
        lot_id,
        user_id,
        amount,
        bid_source

      )

      VALUES (
        $1,$2,$3,$4,$5
      )
      `,
      [
        auction_id,
        lot_id,
        user.user_id,
        bidAmount,
        'online',
      ],
    );


    // =====================================================
    // 🔄 8. ACTUALIZAR PRECIO
    // =====================================================

    await client.query(
      `
      UPDATE auction_live_lots

      SET current_price = $1

      WHERE id = $2
      `,
      [
        bidAmount,
        lot_id,
      ],
    );


    await client.query(
      'COMMIT'
    );


    // =====================================================
    // ⚡ SOCKET
    // FUERA DE TRANSACCIÓN
    // =====================================================

    const io =
        req.app.get('io');


    io.to(
      `auction_${auction_id}`
    ).emit(
      'newBid',
      {
        lot_id,
        amount:
            bidAmount,
        user_id:
            user.user_id,
        created_at:
            new Date(),
      },
    );


    return res.json({

      success: true,

      message:
          'Puja aceptada',

      amount:
          bidAmount,
    });


  } catch (error) {

    try {

      await client.query(
        'ROLLBACK'
      );

    } catch (_) {}


    console.error(
      'ERROR BID:',
      error,
    );


    return res
      .status(500)
      .json({
        error:
            'Error al pujar',
      });


  } finally {

    client.release();
  }
};

exports.placeFloorBid = async (
  req,
  res,
) => {

  const client =
      await pool.connect();

  try {

    const user = req.user;

    const {

      auction_id,

      lot_id,

      amount,

    } = req.body;

    /// 🔒 SOLO OPERADOR/ADMIN
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

    await client.query('BEGIN');

    /// 🔒 VALIDAR REMATE
    const auctionResult =
        await client.query(

      `
      SELECT *
      FROM auctions
      WHERE id = $1
      `,
      [auction_id]
    );

    const auction =
        auctionResult.rows[0];

    if (

      !auction ||

      auction.status !== 'live'
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(400).json({

        error:
          'El remate no está activo',
      });
    }

    /// 🔒 LOCK LOTE
    const lotResult =
        await client.query(

      `
      SELECT *
      FROM auction_live_lots
      WHERE id = $1
      FOR UPDATE
      `,
      [lot_id]
    );

    const lot =
        lotResult.rows[0];

    if (!lot) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(404).json({

        error:
          'Lote no existe',
      });
    }

    /// 🔒 VALIDAR LOTE ACTIVO
    if (

      auction.current_lot_id !==
      lot_id
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(400).json({

        error:
          'Este lote no está activo',
      });
    }

    /// 🔒 VALIDAR STATUS
    if (

      lot.status !== 'live'
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(400).json({

        error:
          'El lote no está activo',
      });
    }

    /// 🔒 VALIDAR MONTO
    if (

      Number(amount) <=
      Number(lot.current_price)
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(400).json({

        error:
          'La puja debe ser mayor',
      });
    }

    /// 💰 INSERT BID FLOOR
    await client.query(

      `
      INSERT INTO bids (

        auction_id,

        lot_id,

        user_id,

        amount,

        bid_source,

        operator_user_id,

        bidder_label

      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7
      )
      `,
      [

        auction_id,

        lot_id,

        null,

        amount,

        'floor',

        user.user_id,

        'SALA',
      ]
    );

    /// 🔄 UPDATE PRECIO
    await client.query(

      `
      UPDATE auction_live_lots
      SET current_price = $1
      WHERE id = $2
      `,
      [
        amount,
        lot_id,
      ]
    );

    await client.query(
      'COMMIT'
    );

    /// ⚡ SOCKET
    const io =
        req.app.get('io');

    io.to(
      `auction_${auction_id}`
    ).emit(

      'newBid',

      {

        lot_id,

        amount,

        user_id: null,

        bid_source: 'floor',

        bidder_label: 'SALA',

        created_at:
            new Date(),
      }
    );

    res.json({

      success: true,

      message:
        'Puja sala registrada',

      amount,
    });

  } catch (error) {

    await client.query(
      'ROLLBACK'
    );

    console.error(
      'ERROR FLOOR BID:',
      error
    );

    res.status(500).json({

      error:
        'Error registrando puja sala',
    });

  } finally {

    client.release();
  }
};

exports.hammerLot = async (
  req,
  res,
) => {

  const client =
      await pool.connect();

  try {

    const user = req.user;

    const {

      auction_id,

      lot_id,

      sold = true,

    } = req.body;

    /// 🔒 SOLO ADMIN / OPERADOR
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

    await client.query('BEGIN');

    /// 🔥 LOCK LOTE
    const lotResult =
        await client.query(

      `
      SELECT *
      FROM auction_live_lots
      WHERE id = $1
      FOR UPDATE
      `,
      [lot_id]
    );

    const lot =
        lotResult.rows[0];

    if (!lot) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(404).json({

        error:
          'Lote no existe',
      });
    }

    /// 🔒 SOLO LOTES LIVE
    if (

      lot.status !== 'live'
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(400).json({

        error:
          'El lote no está activo',
      });
    }

    /// 🔥 ÚLTIMA PUJA
    const bidResult =
        await client.query(

      `
      SELECT *
      FROM bids
      WHERE lot_id = $1
      AND status = 'active'
      ORDER BY id DESC
      LIMIT 1
      `,
      [lot_id]
    );

    const lastBid =
        bidResult.rows[0];

    /// 🔥 DATOS CIERRE
    let winnerUserId = null;

    let finalPrice =
        lot.current_price;

    if (lastBid) {

      finalPrice =
          lastBid.amount;

      /// 🔥 SOLO ONLINE
      if (

        lastBid.bid_source ===
        'online'
      ) {

        winnerUserId =
            lastBid.user_id;
      }
    }

    /// 🔥 STATUS FINAL
    const finalStatus =

        sold

            ? 'sold'

            : 'passed';

    /// 🔥 UPDATE LOTE
    await client.query(

      `
      UPDATE auction_live_lots
      SET

        status = $1,

        final_price = $2,

        winner_user_id = $3,

        closed_at = NOW(),

        sold_at = CASE
          WHEN $1::varchar = 'sold'
          THEN NOW()
          ELSE sold_at
        END,

        passed_at = CASE
          WHEN $1::varchar = 'passed'
          THEN NOW()
          ELSE passed_at
        END

      WHERE id = $4
      `,
      [

        finalStatus,

        finalPrice,

        winnerUserId,

        lot_id,
      ]
    );

    /// 🔥 CREAR REGISTRO VENTA ONLINE
    if (

      sold &&

      winnerUserId != null
    ) {

      let totalAmount =
          finalPrice;

      /// 🔥 SI ES POR KILO
      if (
        lot.sale_type === 'kilo'
      ) {

        totalAmount =

            Number(finalPrice) *

            Number(lot.weight || 0);
      }

      /// 🔥 SI ES POR BULTO
      else {

        totalAmount =

            Number(finalPrice) *

            Number(lot.quantity || 0);
      }

      await client.query(

        `
        INSERT INTO auction_sales (

          auction_id,

          lot_id,

          buyer_user_id,

          final_price,

          sale_type,

          sale_source,

          total_amount,

          certificate_generated

        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8
        )
        `,
        [

          auction_id,

          lot_id,

          winnerUserId,

          finalPrice,

          lot.sale_type,

          lastBid?.bid_source ||
              'online',

          totalAmount,

          false,
        ]
      );
    }

    /// 🔥 SIN LOTE ACTIVO
    await client.query(

      `
      UPDATE auctions
      SET current_lot_id = NULL
      WHERE id = $1
      `,
      [auction_id]
    );

    /// 🔥 VER SI QUEDAN LOTES EN COLA
    const queuedResult =
        await client.query(

      `
      SELECT id
      FROM auction_live_lots
      WHERE

        auction_id = $1

        AND status = 'queued'

      LIMIT 1
      `,
      [auction_id]
    );

    const hasMoreLots =
        queuedResult.rows.length > 0;

    const auctionClosed =
        !hasMoreLots;

    /// 🔥 SI NO QUEDAN MÁS LOTES
    /// CERRAR REMATE EN BASE DE DATOS
    if (!hasMoreLots) {

      await client.query(

        `
        UPDATE auctions
        SET

          status = 'closed',

          ended_at = NOW(),

          current_lot_id = NULL

        WHERE id = $1
        `,
        [auction_id]
      );
    }

    /// 🔥 CONFIRMAR TRANSACCIÓN
    await client.query(
      'COMMIT'
    );

    /// 🔥 SOCKETS
    const io =
        req.app.get('io');

    /// 🔥 LOTE CERRADO
    io.to(
      `auction_${auction_id}`
    ).emit(

      'lotHammered',

      {

        lot_id,

        status:
            finalStatus,

        final_price:
            finalPrice,

        winner_user_id:
            winnerUserId,
      }
    );

    /// 🔥 REMATE SIN LOTE ACTIVO
    io.to(
      `auction_${auction_id}`
    ).emit(

      'lotChanged',

      {

        previous_lot_id:
            lot_id,

        current_lot_id:
            null,
      }
    );

    /// 📢 INICIAR PUBLICIDAD
    /// SOLO SI QUEDAN LOTES
    if (!auctionClosed) {

      await startAdBreak(
        auction_id,
        io,
      );
    }

    /// 🔥 SI AUTO CERRÓ EL REMATE
    if (auctionClosed) {

      /// 🔥 AVISAR A TODOS LOS CLIENTES
      io.to(
        `auction_${auction_id}`
      ).emit(

        'auctionClosed',

        {
          auction_id,
        }
      );

      /// 🔥 DESTRUIR ROOM DE LIVEKIT
      try {

        const roomService =
            new RoomServiceClient(

          process.env.LIVEKIT_URL,

          process.env.LIVEKIT_API_KEY,

          process.env.LIVEKIT_API_SECRET,
        );

        await roomService.deleteRoom(
          `auction_${auction_id}`
        );

        console.log(
          `🔥 LIVEKIT ROOM CERRADA AUTOMÁTICAMENTE auction_${auction_id}`
        );

      } catch (livekitError) {

        console.log(
          '⚠️ LIVEKIT DELETE ROOM ERROR:',
          livekitError.message,
        );
      }
    }

    res.json({

      success: true,

      status:
          finalStatus,

      final_price:
          finalPrice,

      winner_user_id:
          winnerUserId,

      next_lot_id:
          null,

      auction_closed:
          auctionClosed,
    });

  } catch (error) {

    try {

      await client.query(
        'ROLLBACK'
      );

    } catch (_) {}

    console.error(
      'ERROR HAMMER:',
      error
    );

    res.status(500).json({

      error:
          'Error cerrando lote',
    });

  } finally {

    client.release();
  }
};

exports.getLatestBids = async (
  req,
  res,
) => {

  try {

    const {
      lotId,
    } = req.params;

    const result =
        await pool.query(

      `
      SELECT
        id,
        amount,
        bid_source,
        user_id,
        bidder_label,
        created_at
      FROM bids
      WHERE lot_id = $1
      AND status = 'active'
      ORDER BY id DESC
      LIMIT 3
      `,
      [lotId]
    );

    res.json(
      result.rows,
    );

  } catch (error) {

    console.error(
      'LATEST BIDS ERROR:',
      error,
    );

    res.status(500).json({

      error:
        'Error cargando últimas pujas',
    });
  }
};

/// 🔥 AJUSTAR PRECIO DE SALIDA
/// SOLO SI TODAVÍA NO EXISTEN PUJAS
exports.adjustFloorPrice = async (
  req,
  res,
) => {

  const client =
      await pool.connect();

  try {

    const user =
        req.user;

    const {
      auction_id,
      lot_id,
      amount,
    } = req.body;

    /// 🔒 SOLO OPERADOR / ADMIN
    if (
      user.role !== 'operator_sala' &&
      user.role !== 'admin'
    ) {

      return res.status(403).json({
        error: 'No autorizado',
      });
    }

    const newAmount =
        Number(amount);

    if (
      !Number.isFinite(newAmount) ||
      newAmount <= 0
    ) {

      return res.status(400).json({
        error: 'Monto inválido',
      });
    }

    await client.query(
      'BEGIN'
    );

    /// 🔥 VALIDAR REMATE
    const auctionResult =
        await client.query(

      `
      SELECT
        id,
        status,
        current_lot_id
      FROM auctions
      WHERE id = $1
      `,
      [auction_id]
    );

    const auction =
        auctionResult.rows[0];

    if (
      !auction ||
      auction.status !== 'live'
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(400).json({
        error:
          'El remate no está activo',
      });
    }

    if (
      auction.current_lot_id !==
      lot_id
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(400).json({
        error:
          'Este lote no está activo',
      });
    }

    /// 🔒 LOCK LOTE
    const lotResult =
        await client.query(

      `
      SELECT *
      FROM auction_live_lots
      WHERE id = $1
      FOR UPDATE
      `,
      [lot_id]
    );

    const lot =
        lotResult.rows[0];

    if (
      !lot ||
      lot.status !== 'live'
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(400).json({
        error:
          'El lote no está activo',
      });
    }

    /// 🔥 VERIFICAR QUE NO EXISTAN
    /// PUJAS ACTIVAS
    const bidsResult =
        await client.query(

      `
      SELECT id
      FROM bids
      WHERE lot_id = $1
      AND status = 'active'
      LIMIT 1
      `,
      [lot_id]
    );

    if (
      bidsResult.rows.length > 0
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(400).json({

        error:
          'El precio inicial solo puede modificarse antes de recibir pujas',
      });
    }

    /// 🔥 NUEVO PRECIO REAL DE SALIDA
    await client.query(

      `
      UPDATE auction_live_lots
      SET

        opening_price = $1,
        current_price = $1

      WHERE id = $2
      `,
      [
        newAmount,
        lot_id,
      ]
    );

    await client.query(
      'COMMIT'
    );

    /// ⚡ SOCKET
    const io =
        req.app.get('io');

    io.to(
      `auction_${auction_id}`
    ).emit(

      'floorPriceAdjusted',

      {
        lot_id,
        amount:
          newAmount,

        operator_user_id:
          user.user_id,
      }
    );

    res.json({

      success: true,

      amount:
        newAmount,
    });

  } catch (error) {

    try {
      await client.query(
        'ROLLBACK'
      );
    } catch (_) {}

    console.error(
      'ADJUST FLOOR PRICE ERROR:',
      error,
    );

    res.status(500).json({

      error:
        'Error ajustando precio de salida',
    });

  } finally {

    client.release();
  }
};

/// 🔥 RETIRAR ÚLTIMA PUJA DE SALA
exports.rollbackFloorBid = async (
  req,
  res,
) => {

  const client =
      await pool.connect();

  try {

    const user =
        req.user;

    const {
      auction_id,
      lot_id,
    } = req.body;

    /// 🔒 SOLO OPERADOR / ADMIN
    if (
      user.role !== 'operator_sala' &&
      user.role !== 'admin'
    ) {

      return res.status(403).json({
        error: 'No autorizado',
      });
    }

    await client.query(
      'BEGIN'
    );

    /// 🔥 VALIDAR REMATE
    const auctionResult =
        await client.query(

      `
      SELECT
        id,
        status,
        current_lot_id
      FROM auctions
      WHERE id = $1
      `,
      [auction_id]
    );

    const auction =
        auctionResult.rows[0];

    if (
      !auction ||
      auction.status !== 'live'
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(400).json({
        error:
          'El remate no está activo',
      });
    }

    if (
      auction.current_lot_id !==
      lot_id
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(400).json({
        error:
          'Este lote no está activo',
      });
    }

    /// 🔒 LOCK LOTE
    const lotResult =
        await client.query(

      `
      SELECT *
      FROM auction_live_lots
      WHERE id = $1
      FOR UPDATE
      `,
      [lot_id]
    );

    const lot =
        lotResult.rows[0];

    if (
      !lot ||
      lot.status !== 'live'
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(400).json({
        error:
          'El lote no está activo',
      });
    }

    /// 🔥 ÚLTIMA PUJA ACTIVA REAL
    const lastBidResult =
        await client.query(

      `
      SELECT *
      FROM bids
      WHERE lot_id = $1
      AND status = 'active'
      ORDER BY id DESC
      LIMIT 1
      `,
      [lot_id]
    );

    const lastBid =
        lastBidResult.rows[0];

    if (!lastBid) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(400).json({
        error:
          'No existen pujas para retirar',
      });
    }

    /// 🔒 SOLO SE PUEDE RETIRAR
    /// SI LA ÚLTIMA ES DE SALA
    if (
      lastBid.bid_source !==
      'floor'
    ) {

      await client.query(
        'ROLLBACK'
      );

      return res.status(400).json({

        error:
          'La última puja es online y no puede retirarse desde sala',
      });
    }

    /// 🔥 MARCAR COMO ANULADA
    await client.query(

      `
      UPDATE bids
      SET

        status = 'cancelled',

        cancelled_at = NOW(),

        cancelled_by_user_id = $1

      WHERE id = $2
      `,
      [
        user.user_id,
        lastBid.id,
      ]
    );

    /// 🔥 BUSCAR PUJA ACTIVA ANTERIOR
    const previousBidResult =
        await client.query(

      `
      SELECT *
      FROM bids
      WHERE lot_id = $1
      AND status = 'active'
      ORDER BY id DESC
      LIMIT 1
      `,
      [lot_id]
    );

    const previousBid =
        previousBidResult.rows[0];

    /// 🔥 SI NO EXISTE PUJA ANTERIOR,
    /// VOLVER AL PRECIO DE SALIDA
    const restoredPrice =
        previousBid
            ? Number(
                previousBid.amount
              )
            : Number(
                lot.opening_price
              );

    /// 🔥 RESTAURAR PRECIO REAL
    await client.query(

      `
      UPDATE auction_live_lots
      SET current_price = $1
      WHERE id = $2
      `,
      [
        restoredPrice,
        lot_id,
      ]
    );

    await client.query(
      'COMMIT'
    );

    /// ⚡ SOCKET
    const io =
        req.app.get('io');

    io.to(
      `auction_${auction_id}`
    ).emit(

      'floorBidRolledBack',

      {
        lot_id,

        cancelled_bid_id:
          lastBid.id,

        cancelled_amount:
          Number(
            lastBid.amount
          ),

        amount:
          restoredPrice,

        previous_bid:
          previousBid || null,

        operator_user_id:
          user.user_id,
      }
    );

    res.json({

      success: true,

      cancelled_bid_id:
        lastBid.id,

      cancelled_amount:
        Number(
          lastBid.amount
        ),

      amount:
        restoredPrice,

      previous_bid:
        previousBid || null,
    });

  } catch (error) {

    try {

      await client.query(
        'ROLLBACK'
      );

    } catch (_) {}

    console.error(
      'ROLLBACK FLOOR BID ERROR:',
      error,
    );

    res.status(500).json({

      error:
        'Error retirando puja de sala',
    });

  } finally {

    client.release();
  }
};