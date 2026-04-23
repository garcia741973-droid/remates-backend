const { pool } = require('../config/db');

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

    const { rows } = await pool.query(
      `
      INSERT INTO negotiation_messages
      (negotiation_id, sender_id, price, quantity, message)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
      `,
      [negotiation_id, sender_id, price, quantity, message || null]
    );

    res.json(rows[0]);

  } catch (error) {
    console.error(error);
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