const { pool } = require('../config/db');

// 🔥 AGREGAR LOTE A REMATE
exports.addLotToAuction = async (req, res) => {
  try {
    const company_id = req.user.company_id;
    const { auction_id, lot_id, position } = req.body;

    // validar lote pertenece a la empresa
    const lotCheck = await pool.query(
      'SELECT * FROM lots WHERE id = $1 AND company_id = $2',
      [lot_id, company_id]
    );

    if (lotCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Lote no pertenece a la empresa' });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO auction_lots (auction_id, lot_id, position)
      VALUES ($1,$2,$3)
      RETURNING *
      `,
      [auction_id, lot_id, position]
    );

    res.json(rows[0]);

  } catch (error) {
    console.error('ERROR ADD LOT:', error);
    res.status(500).json({ error: 'Error asignando lote' });
  }
};

// 🔥 OBTENER LOTES DE UN REMATE (ordenados)
exports.getAuctionLots = async (req, res) => {
  try {
    const { auction_id } = req.params;

    const { rows } = await pool.query(
      `
      SELECT al.*, l.*
      FROM auction_lots al
      JOIN lots l ON l.id = al.lot_id
      WHERE al.auction_id = $1
      ORDER BY al.position ASC
      `,
      [auction_id]
    );

    res.json(rows);

  } catch (error) {
    console.error('ERROR GET AUCTION LOTS:', error);
    res.status(500).json({ error: 'Error obteniendo lotes del remate' });
  }
};