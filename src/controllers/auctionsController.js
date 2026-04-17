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

