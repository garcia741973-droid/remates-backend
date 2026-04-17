const { pool } = require('../config/db');

// 🔥 SUBIR PUJA MANUAL (SALA)
exports.raiseBidManual = async (req, res) => {
  try {
    const { auction_id, lot_id, amount } = req.body;

    // actualizar precio directamente
    await pool.query(
      `
      UPDATE lots
      SET current_price = $1
      WHERE id = $2
      `,
      [amount, lot_id]
    );

    // emitir a todos
    const io = req.app.get('io');

    io.to(`auction_${auction_id}`).emit('newBid', {
      lot_id,
      amount,
      source: 'sala'
    });

    res.json({ message: 'Puja actualizada (sala)', amount });

  } catch (error) {
    console.error('ERROR MANUAL BID:', error);
    res.status(500).json({ error: 'Error en puja manual' });
  }
};

// 🔥 BAJAR PUJA (ERROR HUMANO)
exports.lowerBidManual = async (req, res) => {
  try {
    const { auction_id, lot_id, amount } = req.body;

    await pool.query(
      `
      UPDATE lots
      SET current_price = $1
      WHERE id = $2
      `,
      [amount, lot_id]
    );

    const io = req.app.get('io');

    io.to(`auction_${auction_id}`).emit('bidCorrection', {
      lot_id,
      amount
    });

    res.json({ message: 'Puja corregida', amount });

  } catch (error) {
    console.error('ERROR LOWER BID:', error);
    res.status(500).json({ error: 'Error bajando puja' });
  }
};

