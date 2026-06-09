const { pool } = require('../config/db');

exports.placeBid = async (req, res) => {
  const client = await pool.connect();

  try {
    const user = req.user;
    const { auction_id, lot_id, amount } = req.body;

    await client.query('BEGIN');

    // 🔒 1. VALIDACIÓN KYC POR EMPRESA
    if (user.role === 'client') {

      const kycResult = await client.query(

        `
        SELECT kyc_status
        FROM users
        WHERE id = $1
        `,
        [user.user_id]
      );

      const kyc = kycResult.rows[0];

      if (

        !kyc ||

        kyc.kyc_status !== 'approved'
      ) {

        await client.query('ROLLBACK');

        return res.status(403).json({

          error:
            'Debes estar aprobado para pujar',
        });
      }
    }

    // 🔒 2. VALIDAR REMATE ACTIVO
    const auctionResult = await client.query(
      `SELECT status FROM auctions WHERE id = $1`,
      [auction_id]
    );

    const auction = auctionResult.rows[0];

    if (!auction || auction.status !== 'live') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'El remate no está activo'
      });
    }

    // 🔒 3. BLOQUEAR LOTE (ANTI RACE CONDITION)
    const lotResult = await client.query(
      `SELECT *
        FROM auction_live_lots
        WHERE id = $1
        FOR UPDATE`,
      [lot_id]
    );

    const lot = lotResult.rows[0];

    if (!lot) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Lote no existe' });
    }

    // 🔥 NUEVO: VALIDAR LOTE ACTIVO
    const auctionLotResult = await client.query(
    `SELECT current_lot_id FROM auctions WHERE id = $1`,
    [auction_id]
    );

    const currentLotId = auctionLotResult.rows[0]?.current_lot_id;

    if (currentLotId !== lot_id) {
    await client.query('ROLLBACK');
    return res.status(400).json({
        error: 'Este lote no está activo en el remate'
    });
    }    

    // 🔒 4. VALIDAR ESTADO LOTE
    if (lot.status !== 'live') {

      await client.query('ROLLBACK');

      return res.status(400).json({

        error: 'El lote no está activo',
      });
    }

    // 🔒 5. VALIDAR MONTO (YA CON LOCK)
    if (Number(amount) <= Number(lot.current_price)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'La puja debe ser mayor al precio actual'
      });
    }

    // 🔥 (HOOK FUTURO) DEPÓSITO
    // const deposit = ...

    // 💰 6. INSERT BID
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

          amount,

          'online',
        ]
    );

    // 🔄 7. UPDATE PRECIO
    await client.query(
      `
      UPDATE auction_live_lots
      SET current_price = $1
      WHERE id = $2
      `,
      [amount, lot_id]
    );

    await client.query('COMMIT');

    // ⚡ SOCKET (FUERA DE TRANSACCIÓN)
    const io = req.app.get('io');

    io.to(`auction_${auction_id}`).emit('newBid', {
      lot_id,
      amount,
      user_id: user.user_id,
      created_at: new Date()
    });

    res.json({ message: 'Puja aceptada', amount });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('ERROR BID:', error);
    res.status(500).json({ error: 'Error al pujar' });
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

            lastBid?.bid_source || 'online',

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

    res.json({

      success: true,

      status:
          finalStatus,

      final_price:
          finalPrice,

      winner_user_id:
          winnerUserId,

      next_lot_id: null,
    });

    } catch (error) {

      await client.query(
        'ROLLBACK'
      );

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