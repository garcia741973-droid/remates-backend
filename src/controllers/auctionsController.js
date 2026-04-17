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

    await pool.query(
      `
      UPDATE auctions
      SET current_lot_id = $1
      WHERE id = $2
      `,
      [lot_id, auction_id]
    );

    // 🔥 emitir a todos los usuarios
    const io = req.app.get('io');

    io.to(`auction_${auction_id}`).emit('currentLotChanged', {
      auction_id,
      lot_id
    });

    res.json({ message: 'Lote actual actualizado' });

  } catch (error) {
    console.error('ERROR SET CURRENT LOT:', error);
    res.status(500).json({ error: 'Error actualizando lote actual' });
  }
};

