const { pool } = require('../config/db');

exports.createAuction = async (req, res) => {
  try {
    const company_id = req.user.company_id;

    const { name, scheduled_at } = req.body;

    const { rows } = await pool.query(
      `
      INSERT INTO auctions (company_id, name, scheduled_at)
      VALUES ($1,$2,$3)
      RETURNING *
      `,
      [company_id, name, scheduled_at]
    );

    res.json(rows[0]);

  } catch (error) {
    console.error('ERROR CREATE AUCTION:', error);
    res.status(500).json({ error: 'Error creando remate' });
  }
};

exports.setCurrentLot = async (req, res) => {
  try {
    const { auction_id, lot_id } = req.body;

    // 🔥 validar que el lote pertenece al remate
    const check = await pool.query(
      `
      SELECT * FROM auction_lots
      WHERE auction_id = $1 AND lot_id = $2
      `,
      [auction_id, lot_id]
    );

    if (check.rows.length === 0) {
      return res.status(400).json({ error: 'Lote no pertenece a este remate' });
    }

    // 🔄 actualizar lote activo
    await pool.query(
      `
      UPDATE auctions
      SET current_lot_id = $1
      WHERE id = $2
      `,
      [lot_id, auction_id]
    );

    // ⚡ emitir a todos
    const io = req.app.get('io');

    io.to(`auction_${auction_id}`).emit('currentLotChanged', {
      auction_id,
      lot_id
    });

    res.json({ message: 'Lote activado correctamente' });

  } catch (error) {
    console.error('ERROR SET CURRENT LOT:', error);
    res.status(500).json({ error: 'Error actualizando lote actual' });
  }
};

