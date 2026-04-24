const { pool } = require('../config/db');

const admin = require('firebase-admin');

/// 🔥 CREAR NEGOCIACIÓN
exports.createNegotiation = async (req, res) => {
  try {
    const buyer_id = req.user.user_id;
    const { lot_id } = req.body;

    /// 🔍 OBTENER LOTE
    const lotRes = await pool.query(
      `SELECT seller_id FROM lots WHERE id = $1`,
      [lot_id]
    );

    if (lotRes.rows.length === 0) {
      return res.status(404).json({ error: 'Lote no encontrado' });
    }

    const seller_id = lotRes.rows[0].seller_id;

    /// 🔍 VER SI YA EXISTE NEGOCIACIÓN
    const existing = await pool.query(
      `
      SELECT * FROM negotiations
      WHERE lot_id = $1 AND buyer_id = $2 AND status = 'open'
      `,
      [lot_id, buyer_id]
    );

    if (existing.rows.length > 0) {
      return res.json(existing.rows[0]);
    }

    /// 🔥 CREAR NUEVA
    const { rows } = await pool.query(
      `
      INSERT INTO negotiations (lot_id, buyer_id, seller_id)
      VALUES ($1,$2,$3)
      RETURNING *
      `,
      [lot_id, buyer_id, seller_id]
    );

    res.json(rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creando negociación' });
  }
};


/// 🔥 ENVIAR MENSAJE (OFERTA / CONTRAOFERTA)
exports.sendMessage = async (req, res) => {
  try {
    const sender_id = req.user.user_id;

    const {
      negotiation_id,
      price,
      quantity,
      message
    } = req.body;

    /// 🔥 1. GUARDAR MENSAJE
    const { rows } = await pool.query(
      `
      INSERT INTO negotiation_messages
      (negotiation_id, sender_id, price, quantity, message)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
      `,
      [negotiation_id, sender_id, price, quantity, message || null]
    );

    const newMessage = rows[0];

    /// 🔥 2. OBTENER NEGOCIACIÓN
    const negRes = await pool.query(
      `SELECT buyer_id, seller_id FROM negotiations WHERE id = $1`,
      [negotiation_id]
    );

    const negotiation = negRes.rows[0];

    /// 🔥 3. DEFINIR RECEPTOR
    const receiver_id =
      sender_id === negotiation.buyer_id
        ? negotiation.seller_id
        : negotiation.buyer_id;

    /// 🔥 4. OBTENER TOKEN
    const userRes = await pool.query(
      `SELECT fcm_token FROM users WHERE id = $1`,
      [receiver_id]
    );

    const fcm_token = userRes.rows[0]?.fcm_token;

    console.log("📲 RECEPTOR:", receiver_id);
    console.log("📲 TOKEN:", fcm_token);

    /// 🔥 5. ENVIAR NOTIFICACIÓN
    if (fcm_token) {
      await admin.messaging().send({
        token: fcm_token,

        notification: {
          title: "Nueva oferta 💰",
          body: message || "Tienes una nueva propuesta",
        },

        data: {
          type: "negotiation",
          negotiationId: negotiation_id.toString(),
        },

        android: {
          priority: "high",
        },

        apns: {
          payload: {
            aps: {
              sound: "default",
            },
          },
        },
      });

      console.log("🔥 NOTIFICACIÓN ENVIADA");
    } else {
      console.log("⚠️ Usuario sin token");
    }

    /// 🔥 6. RESPUESTA
    res.json(newMessage);

  } catch (error) {
    console.error("❌ ERROR sendMessage:", error);
    res.status(500).json({ error: 'Error enviando mensaje' });
  }
};


/// 🔥 OBTENER MENSAJES
exports.getMessages = async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `
      SELECT 
        nm.*,

        l.id as lot_id,
        l.class,
        l.breed,
        l.weight,
        l.sale_type,
        l.base_price,
        l.quantity as lot_quantity,
        l.images

      FROM negotiation_messages nm

      JOIN negotiations n ON n.id = nm.negotiation_id
      JOIN lots l ON l.id = n.lot_id

      WHERE nm.negotiation_id = $1
      ORDER BY nm.created_at ASC
      `,
      [id]
    );

    res.json(rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo mensajes' });
  }
};


/// 🔥 CERRAR NEGOCIACIÓN
exports.closeNegotiation = async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      `
      UPDATE negotiations
      SET status = 'agreed'
      WHERE id = $1
      `,
      [id]
    );

    res.json({ message: 'Negociación cerrada' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error cerrando negociación' });
  }
};