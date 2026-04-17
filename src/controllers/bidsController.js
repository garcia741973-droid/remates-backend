const { pool } = require('../config/db');

exports.placeBid = async (req, res) => {
  try {
    const user = req.user;
    const { auction_id, lot_id, amount } = req.body;

    // 🔒 VALIDACIÓN KYC (BIEN UBICADA)
    if (user.kyc_status !== 'approved') {
      return res.status(403).json({ error: 'Debes completar verificación para pujar' });
    }

    if (lot.status === 'sold') {
    return res.status(400).json({ error: 'El lote ya está cerrado' });
    }

    // 🔍 obtener lote
    const lotResult = await pool.query(
      'SELECT * FROM lots WHERE id = $1',
      [lot_id]
    );

    const lot = lotResult.rows[0];

    if (!lot) {
      return res.status(404).json({ error: 'Lote no existe' });
    }

    // 🔒 validar monto
    if (Number(amount) <= Number(lot.current_price)) {
      return res.status(400).json({ error: 'La puja debe ser mayor al precio actual' });
    }

    // 💰 guardar puja
    await pool.query(
      `
      INSERT INTO bids (auction_id, lot_id, user_id, amount)
      VALUES ($1,$2,$3,$4)
      `,
      [auction_id, lot_id, user.user_id, amount]
    );

    // 🔄 actualizar precio
    await pool.query(
      `
      UPDATE lots
      SET current_price = $1
      WHERE id = $2
      `,
      [amount, lot_id]
    );

    // ⚡ TIEMPO REAL
    const io = req.app.get('io');

    io.to(`auction_${auction_id}`).emit('newBid', {
      lot_id,
      amount,
      user_id: user.user_id
    });

    res.json({ message: 'Puja aceptada', amount });

  } catch (error) {
    console.error('ERROR BID:', error);
    res.status(500).json({ error: 'Error al pujar' });
  }
};