const { pool } = require('../config/db');

// 🔥 obtener empresa del usuario logueado
exports.getMyCompany = async (req, res) => {
  try {
    const company_id = req.user.company_id;

    const { rows } = await pool.query(
      `
      SELECT 
        id,
        name,
        logo_url,
        primary_color,
        secondary_color,
        background_color
      FROM companies
      WHERE id = $1
      `,
      [company_id]
    );

    res.json(rows[0]);

  } catch (error) {
    console.error('ERROR COMPANY:', error);
    res.status(500).json({ error: 'Error obteniendo empresa' });
  }
};