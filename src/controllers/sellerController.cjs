const { pool } = require("../config/db");

/// 🟢 SOLICITAR SER VENDEDOR
exports.requestSeller = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `UPDATE users 
       SET seller_status = 'pending' 
       WHERE id = $1
       RETURNING id, seller_status`,
      [userId]
    );

    res.json({
      message: "Solicitud enviada",
      user: result.rows[0],
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al solicitar vendedor" });
  }
};