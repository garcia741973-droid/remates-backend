const { pool } = require('../config/db');
const admin = require('firebase-admin');

/// 🔥 CREAR NEGOCIACIÓN
exports.createNegotiation = async (req, res) => {
  try {

    const buyer_id = req.user.user_id;

    const { lot_id } = req.body;

    /// 🔍 OBTENER LOTE
    const lotRes = await pool.query(
      `
      SELECT
        id,
        company_id,
        seller_id,
        lot_number,
        class,
        breed,
        weight,
        sale_type,
        base_price,
        quantity,
        images
      FROM lots
      WHERE id = $1
      `,
      [lot_id]
    );

    if (lotRes.rows.length === 0) {
      return res.status(404).json({
        error: 'Lote no encontrado'
      });
    }

    const lot = lotRes.rows[0];

    const seller_id = lot.seller_id;

    /// 🔥 EVITAR NEGOCIAR CONSIGO MISMO
    if (buyer_id === seller_id) {
      return res.status(400).json({
        error: 'No puedes negociar contigo mismo'
      });
    }

    /// 🔍 VER SI YA EXISTE NEGOCIACIÓN
    const existing = await pool.query(
      `
      SELECT *
      FROM negotiations
      WHERE lot_id = $1
      AND buyer_id = $2
      AND status = 'open'
      `,
      [lot_id, buyer_id]
    );

    if (existing.rows.length > 0) {

      console.log("♻️ NEGOCIACIÓN EXISTENTE");

      return res.json(existing.rows[0]);
    }

    /// 🔥 CREAR NUEVA
    const { rows } = await pool.query(
      `
      INSERT INTO negotiations (
        lot_id,
        buyer_id,
        seller_id
      )
      VALUES ($1,$2,$3)
      RETURNING *
      `,
      [lot_id, buyer_id, seller_id]
    );

    const negotiation = rows[0];

    /// 🔥 CREAR FIRESTORE DOC DESDE EL INICIO
    await admin.firestore()
      .collection('companies')
      .doc(lot.company_id.toString())
      .collection('negotiations')
      .doc(negotiation.id.toString())
      .set({

        negotiation_id: negotiation.id,

        buyer_id: buyer_id,

        seller_id: seller_id,

        company_id: lot.company_id,

        lot_id: lot.id,

        /// 🔥 SNAPSHOT LOTE
        lot: {

          id: lot.id,

          lot_number: lot.lot_number,

          class: lot.class,

          breed: lot.breed,

          weight: lot.weight,

          sale_type: lot.sale_type,

          base_price: lot.base_price,

          quantity: lot.quantity,

          images: lot.images,
        },

        participants: [
          buyer_id,
          seller_id,
        ],

        created_at:
          admin.firestore.FieldValue.serverTimestamp(),

        updated_at:
          admin.firestore.FieldValue.serverTimestamp(),

      }, { merge: true });

    console.log("🔥 NEGOCIACIÓN CREADA FIRESTORE");

    res.json(negotiation);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'Error creando negociación'
    });
  }
};


/// 🔥 ENVIAR MENSAJE
exports.sendMessage = async (req, res) => {
  try {

    const sender_id = req.user.user_id;

    const {
      negotiation_id,
      price,
      quantity,
      message
    } = req.body;

    /// 🔥 1. GUARDAR MENSAJE SQL
    const { rows } = await pool.query(
      `
      INSERT INTO negotiation_messages
      (
        negotiation_id,
        sender_id,
        price,
        quantity,
        message
      )
      VALUES ($1,$2,$3,$4,$5)
      RETURNING *
      `,
      [
        negotiation_id,
        sender_id,
        price,
        quantity,
        message || null
      ]
    );

    const newMessage = rows[0];

    /// 🔥 2. OBTENER NEGOCIACIÓN
    const negRes = await pool.query(
      `
      SELECT
        buyer_id,
        seller_id
      FROM negotiations
      WHERE id = $1
      `,
      [negotiation_id]
    );

    const negotiation = negRes.rows[0];

    if (!negotiation) {
      return res.status(404).json({
        error: 'Negociación no encontrada'
      });
    }

    /// 🔥 VALIDACIÓN EXTRA
    if (
      negotiation.buyer_id ===
      negotiation.seller_id
    ) {

      console.log(
        "💥 ERROR: negociación corrupta"
      );

      return res.status(400).json({
        error: 'Negociación inválida'
      });
    }

    console.log(
      "🧠 NEGOTIATION:",
      negotiation
    );

    console.log(
      "🧠 SENDER:",
      sender_id
    );

    /// 🔥 DEFINIR RECEPTOR
    let receiver_id;

    if (
      sender_id === negotiation.buyer_id
    ) {

      receiver_id =
          negotiation.seller_id;

    } else if (
      sender_id === negotiation.seller_id
    ) {

      receiver_id =
          negotiation.buyer_id;

    } else {

      console.log(
        "❌ ERROR: sender no pertenece"
      );

      return res.status(400).json({
        error:
          'Usuario inválido en negociación'
      });
    }

    console.log(
      "📲 RECEPTOR FINAL:",
      receiver_id
    );

    /// 🔥 OBTENER DATOS COMPLETOS DEL LOTE
    const lotDataRes = await pool.query(
      `
      SELECT
        id,
        company_id,
        lot_number,
        class,
        breed,
        weight,
        sale_type,
        base_price,
        quantity,
        images
      FROM lots
      WHERE id = (
        SELECT lot_id
        FROM negotiations
        WHERE id = $1
      )
      `,
      [negotiation_id]
    );

    const lot = lotDataRes.rows[0];

    const company_id = lot?.company_id;

    if (!company_id) {
      return res.status(400).json({
        error: 'Company no encontrada'
      });
    }

    /// 🔥 ACTUALIZAR NEGOCIACIÓN FIRESTORE
    await admin.firestore()
      .collection('companies')
      .doc(company_id.toString())
      .collection('negotiations')
      .doc(negotiation_id.toString())
      .set({

        negotiation_id: negotiation_id,

        buyer_id:
          negotiation.buyer_id,

        seller_id:
          negotiation.seller_id,

        company_id: company_id,

        lot_id: lot?.id,

        /// 🔥 SNAPSHOT LOTE
        lot: lot ? {

          id: lot.id,

          lot_number:
            lot.lot_number,

          class: lot.class,

          breed: lot.breed,

          weight: lot.weight,

          sale_type:
            lot.sale_type,

          base_price:
            lot.base_price,

          quantity:
            lot.quantity,

          images: lot.images,

        } : null,

        participants: [
          negotiation.buyer_id,
          negotiation.seller_id,
        ],

        updated_at:
          admin.firestore.FieldValue.serverTimestamp(),

      }, { merge: true });

    /// 🔥 GUARDAR MENSAJE FIRESTORE
    await admin.firestore()
      .collection('companies')
      .doc(company_id.toString())
      .collection('negotiations')
      .doc(negotiation_id.toString())
      .collection('messages')
      .doc(newMessage.id.toString())
      .set({

        id: newMessage.id,

        negotiation_id:
          negotiation_id,

        sender_id: sender_id,

        receiver_id: receiver_id,

        company_id: company_id,

        lot_id: lot?.id,

        text: message || '',

        price: price || null,

        quantity:
          quantity || null,

        message_type: 'offer',

        is_read: false,

        created_at:
          admin.firestore.FieldValue.serverTimestamp(),
      });

    console.log(
      "🔥 MENSAJE GUARDADO EN FIRESTORE"
    );

    /// 🔥 BUSCAR TOKENS DEL RECEPTOR
    const tokensRes = await pool.query(
      `
      SELECT fcm_token
      FROM devices
      WHERE user_id = $1
      `,
      [receiver_id]
    );

    const tokens = tokensRes.rows.map(
      t => t.fcm_token
    );

    console.log("📲 TOKENS:", tokens);

    /// 🔥 ENVIAR PUSH
    if (tokens.length > 0) {

      try {

        await admin.messaging()
          .sendEachForMulticast({

          tokens,

          notification: {

            title: "🐄 Nueva oferta",

            body:
              price
                ? `Bs ${price} ${
                    lot?.sale_type === 'kilo'
                      ? '/kg'
                      : '/lote'
                  }`
                : "Tienes un nuevo mensaje",
          },

          data: {

            negotiationId:
              negotiation_id.toString(),

            type: 'negotiation',
          },

          android: {

            priority: 'high',
          },

apns: {

  headers: {

    'apns-priority': '10',

    'apns-push-type': 'alert',
  },

            payload: {

              aps: {

                alert: {

                  title: "🐄 Nueva oferta",

                  body:
                    price
                      ? `Bs ${price} ${
                          lot?.sale_type === 'kilo'
                            ? '/kg'
                            : '/lote'
                        }`
                      : "Tienes un nuevo mensaje",
                },

                sound: 'default',

                badge: 1,

                contentAvailable: true,

                mutableContent: true,
              },
            },
          },
        });

        console.log(
          "✅ PUSH ENVIADO"
        );

      } catch (e) {

        console.log(
          "❌ ERROR PUSH:",
          e,
        );
      }
    }


    /// 🔥 RESPUESTA
    res.json(newMessage);

  } catch (error) {

    console.error(
      "❌ ERROR sendMessage:",
      error
    );

    res.status(500).json({
      error: 'Error enviando mensaje'
    });
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

        l.lot_number,

        l.class,

        l.breed,

        l.weight,

        l.sale_type,

        l.base_price,

        l.quantity as lot_quantity,

        l.images

      FROM negotiation_messages nm

      JOIN negotiations n
        ON n.id = nm.negotiation_id

      JOIN lots l
        ON l.id = n.lot_id

      WHERE nm.negotiation_id = $1

      ORDER BY nm.created_at ASC
      `,
      [id]
    );

    res.json(rows);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'Error obteniendo mensajes'
    });
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

    res.json({
      message: 'Negociación cerrada'
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'Error cerrando negociación'
    });
  }
};


/// 🔥 OBTENER NEGOCIACIÓN POR LOTE
exports.getOrCreateNegotiation = async (req, res) => {
  try {

    const user_id =
        req.user.user_id;

    const { lot_id } = req.body;

    /// 🔍 BUSCAR LOTE
    const lotRes = await pool.query(
      `
      SELECT seller_id
      FROM lots
      WHERE id = $1
      `,
      [lot_id]
    );

    if (lotRes.rows.length === 0) {

      return res.status(404).json({
        error: 'Lote no encontrado'
      });
    }

    const seller_id =
        lotRes.rows[0].seller_id;

    /// 🔥 BUSCAR NEGOCIACIÓN EXISTENTE
    const existing = await pool.query(
      `
      SELECT *
      FROM negotiations
      WHERE lot_id = $1
      AND buyer_id = $2
      AND status = 'open'
      `,
      [lot_id, user_id]
    );

    if (existing.rows.length > 0) {

      console.log(
        "♻️ NEGOCIACIÓN EXISTENTE"
      );

      return res.json(existing.rows[0]);
    }

    /// 🔥 VENDEDOR NO CREA
    if (user_id === seller_id) {

      return res.status(400).json({
        error:
          'El vendedor no puede crear negociación'
      });
    }

    /// 🔥 CREAR
    const { rows } = await pool.query(
      `
      INSERT INTO negotiations
      (
        lot_id,
        buyer_id,
        seller_id
      )
      VALUES ($1,$2,$3)
      RETURNING *
      `,
      [lot_id, user_id, seller_id]
    );

    res.json(rows[0]);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error:
        'Error obteniendo negociación'
    });
  }
};


/// 🔥 OBTENER MIS NEGOCIACIONES
exports.getMyNegotiations = async (req, res) => {
  try {

    const user_id =
        req.user.user_id;

    const { rows } = await pool.query(
      `
      SELECT

        n.*,

        l.lot_number,

        l.class,

        l.breed,

        l.images,

        nm.message as last_message,

        nm.price as last_price,

        nm.created_at as last_message_at

      FROM negotiations n

      JOIN lots l
        ON l.id = n.lot_id

      LEFT JOIN LATERAL (

        SELECT *

        FROM negotiation_messages

        WHERE negotiation_id = n.id

        ORDER BY created_at DESC

        LIMIT 1

      ) nm ON true

      WHERE
        n.buyer_id = $1
        OR n.seller_id = $1

      ORDER BY n.created_at DESC
      `,
      [user_id]
    );

    res.json(rows);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error:
        'Error obteniendo negociaciones'
    });
  }
};