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

// 🔥 CERRAR LOTE (VENDIDO)
exports.closeLot = async (req, res) => {
  try {
    const { auction_id, lot_id } = req.body;

    // 🔍 obtener última puja
    const bidResult = await pool.query(
      `
      SELECT * FROM bids
      WHERE lot_id = $1
      ORDER BY amount DESC
      LIMIT 1
      `,
      [lot_id]
    );

    const highestBid = bidResult.rows[0];

    let winner_user_id = null;
    let final_price = null;

    if (highestBid) {
      winner_user_id = highestBid.user_id;
      final_price = highestBid.amount;
    }

    // 🔄 actualizar lote
    await pool.query(
      `
      UPDATE lots
      SET status = 'sold',
          winner_user_id = $1,
          final_price = $2
      WHERE id = $3
      `,
      [winner_user_id, final_price, lot_id]
    );

    // ⚡ emitir a todos
    const io = req.app.get('io');

    io.to(`auction_${auction_id}`).emit('lotClosed', {
      lot_id,
      winner_user_id,
      final_price
    });

    res.json({
      message: 'Lote cerrado',
      winner_user_id,
      final_price
    });

  } catch (error) {
    console.error('ERROR CLOSE LOT:', error);
    res.status(500).json({ error: 'Error cerrando lote' });
  }
};

