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

/// 🔴 APROBAR VENDEDOR (SUPER ADMIN)
exports.approveSeller = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { userId } = req.params;

    /// 🔐 validar que sea super admin
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: "No autorizado" });
    }

    const result = await pool.query(
      `UPDATE users 
       SET seller_status = 'approved' 
       WHERE id = $1
       RETURNING id, seller_status`,
      [userId]
    );

    res.json({
      message: "Vendedor aprobado",
      user: result.rows[0],
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al aprobar vendedor" });
  }
};


/// 🔵 OBTENER VENDEDORES PENDIENTES
exports.getPendingSellers = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: "No autorizado" });
    }

    const result = await pool.query(
      `
      SELECT id, name, email, phone, created_at
      FROM users
      WHERE seller_status = 'pending'
      ORDER BY created_at DESC
      `
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo vendedores" });
  }
};


/// 🟢 APROBAR VENDEDOR
exports.approveSeller = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: "No autorizado" });
    }

    const { id } = req.params;

    await pool.query(
      `
      UPDATE users
      SET seller_status = 'approved'
      WHERE id = $1
      `,
      [id]
    );

    res.json({ message: "Vendedor aprobado" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error aprobando vendedor" });
  }
};