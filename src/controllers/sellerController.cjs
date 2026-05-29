const { pool } = require("../config/db");

const {
  sendAdminNotification,
} = require('../services/notificationService');

/// 🟢 SOLICITAR SER VENDEDOR
exports.requestSeller = async (req, res) => {
  try {

    const userId = req.user.user_id;

    /// 🔥 VALIDAR KYC
    const userRes = await pool.query(
      `
      SELECT
        kyc_status
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

    if (
      userRes.rows.length === 0
    ) {
      return res.status(404).json({
        error: "Usuario no encontrado"
      });
    }

    if (
      userRes.rows[0].kyc_status !== 'approved'
    ) {
      return res.status(403).json({
        error:
          "Debes completar tu verificación KYC para solicitar ser vendedor"
      });
    }

    await pool.query(
      `
      UPDATE users
      SET seller_status = 'pending'
      WHERE id = $1
      `,
      [userId]
    );

    await sendAdminNotification({

      title:
          '🐄 Nuevo vendedor pendiente',

      body:
          `Usuario ${userId} solicitó autorización para vender ganado`,

      data: {

          type: 'seller_request',

          user_id:
              userId.toString(),
      },
    });    

    res.json({
      message: "Solicitud enviada"
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error:
        "Error al solicitar vendedor"
    });
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
      SELECT 
        u.id,
        u.name,
        u.email,
        u.phone,
        u.kyc_status,
        u.created_at,

        k.full_name,
        k.document_number,
        k.document_type,
        k.city,
        k.country,
        k.address,
        k.client_type

      FROM users u
      LEFT JOIN user_kyc k ON k.user_id = u.id

      WHERE u.seller_status = 'pending'
      ORDER BY u.created_at DESC
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

/// 🔥 PERFIL PÚBLICO VENDEDOR
exports.getSellerProfile = async (req, res) => {
  try {

    const { id } = req.params;

    /// 🔥 SELLER
    const sellerRes = await pool.query(
      `
      SELECT

        id,
        full_name,
        seller_rating_avg,
        seller_rating_count,
        successful_sales_count

      FROM users

      WHERE id = $1
      `,
      [id]
    );

    if (sellerRes.rows.length === 0) {

      return res.status(404).json({
        error: 'Vendedor no encontrado'
      });
    }

    const seller =
      sellerRes.rows[0];

    /// 🔥 LOTES ACTIVOS
    const lotsRes = await pool.query(
      `
      SELECT

        id,
        lot_number,
        class,
        breed,
        weight,
        sale_type,
        base_price,
        images,
        town,
        distance_km

      FROM lots

      WHERE seller_id = $1
      AND status != 'sold'

      ORDER BY created_at DESC

      LIMIT 10
      `,
      [id]
    );

    /// 🔥 REVIEWS
    const reviewsRes = await pool.query(
      `
      SELECT

        sr.rating,
        sr.comment,
        sr.created_at,

        u.full_name as buyer_name,

        l.class,
        l.breed,
        l.lot_number

      FROM seller_reviews sr

      JOIN users u
        ON u.id = sr.buyer_id

      JOIN lots l
        ON l.id = sr.lot_id

      WHERE sr.seller_id = $1

      ORDER BY sr.created_at DESC

      LIMIT 20
      `,
      [id]
    );

    res.json({

      seller,

      lots: lotsRes.rows,

      reviews: reviewsRes.rows,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'Error obteniendo perfil vendedor'
    });
  }
};