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
        `SELECT kyc_status FROM user_companies
        WHERE user_id = $1 AND company_id = $2`,
        [user.user_id, user.company_id]
      );

      const kyc = kycResult.rows[0];

      if (!kyc || kyc.kyc_status !== 'approved') {
        await client.query('ROLLBACK');
        return res.status(403).json({
          error: 'Debes estar aprobado en esta empresa para pujar'
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
      `SELECT * FROM lots WHERE id = $1 FOR UPDATE`,
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
    if (lot.status === 'sold') {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'El lote ya está cerrado'
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
      INSERT INTO bids (auction_id, lot_id, user_id, amount)
      VALUES ($1,$2,$3,$4)
      `,
      [auction_id, lot_id, user.user_id, amount]
    );

    // 🔄 7. UPDATE PRECIO
    await client.query(
      `
      UPDATE lots
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