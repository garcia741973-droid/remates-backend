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

    // 🔥 EVITAR NEGOCIAR CONSIGO MISMO
    if (buyer_id === seller_id) {
      return res.status(400).json({
        error: 'No puedes negociar contigo mismo'
      });
    }    

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

    if (!negotiation) {
      return res.status(404).json({ error: 'Negociación no encontrada' });
    }

    /// 🔥 VALIDACIÓN EXTRA (ANTI BUG)
    if (negotiation.buyer_id === negotiation.seller_id) {
      console.log("💥 ERROR: negociación corrupta");
      return res.status(400).json({ error: 'Negociación inválida' });
    }

    console.log("🧠 NEGOTIATION:", negotiation);
    console.log("🧠 SENDER:", sender_id);

    /// 🔥 3. DEFINIR RECEPTOR
    let receiver_id;

    if (sender_id === negotiation.buyer_id) {
      receiver_id = negotiation.seller_id;
    } else if (sender_id === negotiation.seller_id) {
      receiver_id = negotiation.buyer_id;
    } else {
      console.log("❌ ERROR: sender no pertenece a la negociación");
      return res.status(400).json({ error: 'Usuario inválido en negociación' });
    }

    console.log("📲 RECEPTOR FINAL:", receiver_id);

    /// 🔥 4. OBTENER TOKENS (MULTI DISPOSITIVO)
    const tokensRes = await pool.query(
      `
      SELECT fcm_token 
      FROM devices 
      WHERE user_id = $1 AND fcm_token IS NOT NULL
      `,
      [receiver_id]
    );

    const tokens = tokensRes.rows.map(r => r.fcm_token);

    console.log("📲 RECEPTOR:", receiver_id);
    console.log("📲 TOKENS:", tokens);

    /// 🔥 5. ENVIAR NOTIFICACIÓN
    if (tokens.length > 0) {
      await admin.messaging().sendEachForMulticast({
        tokens,

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
          notification: {
            channelId: "default",
            sound: "default",
          },
        },

        apns: {
          payload: {
            aps: {
              sound: "default",
            },
          },
        },
      });

      console.log("🔥 NOTIFICACIONES ENVIADAS");
    } else {
      console.log("⚠️ Usuario sin tokens");
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


/// 🔥 OBTENER NEGOCIACIÓN POR LOTE (PARA ENTRAR)
exports.getOrCreateNegotiation = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { lot_id } = req.body;

    // 🔍 buscar lote
    const lotRes = await pool.query(
      `SELECT seller_id FROM lots WHERE id = $1`,
      [lot_id]
    );

    if (lotRes.rows.length === 0) {
      return res.status(404).json({ error: 'Lote no encontrado' });
    }

    const seller_id = lotRes.rows[0].seller_id;

    // 🔥 buscar negociación existente SOLO por buyer (FIX)
    const existing = await pool.query(
      `
      SELECT * FROM negotiations
      WHERE lot_id = $1 
      AND buyer_id = $2
      AND status = 'open'
      `,
      [lot_id, user_id]
    );

    if (existing.rows.length > 0) {
      console.log("♻️ NEGOCIACIÓN EXISTENTE");
      return res.json(existing.rows[0]);
    }

    // 🔥 si es vendedor, NO crear
    if (user_id === seller_id) {
      return res.status(400).json({
        error: 'El vendedor no puede crear negociación, solo responder'
      });
    }

    // 🔥 crear si es comprador
    const { rows } = await pool.query(
      `
      INSERT INTO negotiations (lot_id, buyer_id, seller_id)
      VALUES ($1,$2,$3)
      RETURNING *
      `,
      [lot_id, user_id, seller_id]
    );

    res.json(rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo negociación' });
  }
};

/// 🔥 OBTENER MIS NEGOCIACIONES
exports.getMyNegotiations = async (req, res) => {
  try {
    const user_id = req.user.user_id;

    const { rows } = await pool.query(`
      SELECT 
        n.*,
        l.lot_number,
        l.class,
        l.breed,
        l.images
      FROM negotiations n
      JOIN lots l ON l.id = n.lot_id
      WHERE n.buyer_id = $1 OR n.seller_id = $1
      ORDER BY n.created_at DESC
    `, [user_id]);

    res.json(rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo negociaciones' });
  }
};