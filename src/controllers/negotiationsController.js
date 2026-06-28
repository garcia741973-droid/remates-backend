const { pool } = require('../config/db');
const admin = require('firebase-admin');

const {
  sendAdminNotification,
} = require('../services/notificationService');

const {
  createOperationEvent,
} = require('../services/operationEventsService');

const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

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
        status,
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

    /// 🔥 BLOQUEAR LOTES VENDIDOS
    if (lot.status === 'sold') {

      return res.status(400).json({
        error: 'Este lote ya fue vendido'
      });
    }    

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
      message
    } = req.body;

    /// 🔥 FILTRO ANTI FUGA DE CONTACTOS
    if (message) {

      const text =
        message.toLowerCase();

      /// 📞 teléfonos
      const phoneRegex =
        /(\+?\d[\d\s\-]{6,})/;

      /// 📧 correos
      const emailRegex =
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

      /// 🔗 links
      const linkRegex =
        /(https?:\/\/|www\.)/i;

      /// 🚫 palabras bloqueadas
      const blockedWords = [

        'whatsapp',
        'wsp',
        'wasap',
        'llamame',
        'llámame',
        'telegram',
        'facebook',
        'instagram',
        'correo',
        'gmail',
        'hotmail',
        'contactame',
        'contáctame',
        'escribime',
        'escríbeme',
        'celular',
        'numero',
        'número',
      ];

      const hasBlockedWord =
        blockedWords.some(
          word => text.includes(word)
        );

      if (
        phoneRegex.test(message) ||
        emailRegex.test(message) ||
        linkRegex.test(message) ||
        hasBlockedWord
      ) {

        return res.status(400).json({

          error:
            'Por seguridad y para proteger la negociación dentro de Plaza Ganadera, no está permitido compartir contactos directos antes del cierre.',
        });
      }
    }

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
        null,
        null,
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

        price: null,

        quantity: null,

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

        const notificationTitle =
          "🐄 Nueva oferta";

        const notificationBody =
          message
            ? message.length > 60
                ? `${message.substring(0, 60)}...`
                : message
            : "Tienes un nuevo mensaje";

        const response =
          await admin.messaging()
            .sendEachForMulticast({

          tokens: tokens,

          notification: {

            title: notificationTitle,

            body: notificationBody,
          },

          data: {

            negotiationId:
              negotiation_id.toString(),

            type: 'negotiation',
          },

          android: {

            priority: 'high',

            notification: {

              sound: 'default',
            },
          },

          apns: {

            headers: {

              'apns-priority': '10',

              'apns-push-type': 'alert',
            },

            payload: {

              aps: {

                sound: 'default',

                badge: 1,
              },
            },
          },
        });

        console.log(
          "✅ PUSH ENVIADO"
        );

        console.log(
          "📲 PUSH RESPONSE:",
          JSON.stringify(response, null, 2)
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

        ,

        n.status as negotiation_status,

        buyer.full_name as buyer_name,
        buyer.phone as buyer_phone,

        seller.full_name as seller_name,
        seller.phone as seller_phone        

      FROM negotiation_messages nm

      JOIN negotiations n
        ON n.id = nm.negotiation_id

      JOIN lots l
        ON l.id = n.lot_id

      JOIN users buyer
        ON buyer.id = n.buyer_id

      JOIN users seller
        ON seller.id = n.seller_id        

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


/// 🔥 CERRAR NEGOCIACIÓN → PAGO PENDIENTE
exports.closeNegotiation = async (req, res) => {
  try {

    const user_id = req.user.user_id;

    const { id } = req.params;

    const { final_price } = req.body;

    /// 🔥 OBTENER NEGOCIACIÓN
    const negRes = await pool.query(
      `
      SELECT
        n.*,
        l.lot_number
      FROM negotiations n
      JOIN lots l
        ON l.id = n.lot_id
      WHERE n.id = $1
      `,
      [id]
    );

    if (negRes.rows.length === 0) {
      return res.status(404).json({
        error: 'Negociación no encontrada'
      });
    }

    const negotiation = negRes.rows[0];

    /// 🔥 SOLO VENDEDOR PUEDE CERRAR
    if (user_id !== negotiation.seller_id) {
      return res.status(403).json({
        error: 'Solo el vendedor puede cerrar la venta'
      });
    }

    /// 🔥 VALIDAR STATUS
    if (negotiation.status !== 'open') {
      return res.status(400).json({
        error: 'La negociación ya fue procesada'
      });
    }

    /// 🔥 VALIDAR PRECIO FINAL
    if (
      !final_price ||
      isNaN(final_price) ||
      Number(final_price) <= 0
    ) {
      return res.status(400).json({
        error: 'Debes ingresar un precio final válido'
      });
    }    

    /// 🔥 OBTENER QR ACTIVO
    const qrRes = await pool.query(
      `
      SELECT *
      FROM payment_qrs
      WHERE is_active = true
      ORDER BY id DESC
      LIMIT 1
      `
    );

    if (qrRes.rows.length === 0) {
      return res.status(400).json({
        error: 'No existe QR activo'
      });
    }

    const qr = qrRes.rows[0];

    /// 🔥 CAMBIAR ESTADO
    await pool.query(
      `
      UPDATE negotiations
      SET status = 'payment_pending'
      final_price: final_price,
      WHERE id = $1
      `,
      [id]
    );

    res.json({

      success: true,

      negotiation_id: negotiation.id,

      lot_number: negotiation.lot_number,

      amount: qr.amount,

      qr_image_url: qr.qr_image_url,

      status: 'payment_pending',
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'Error cerrando negociación'
    });
  }
};


/// 🔥 SUBIR COMPROBANTE Y DESBLOQUEAR CONTACTOS
exports.uploadPaymentProof = async (req, res) => {
  try {

    const seller_id = req.user.user_id;

    const { id } = req.params;

    const { final_price } = req.body;

    /// 🔥 VALIDAR ARCHIVO
    if (!req.file) {
      return res.status(400).json({
        error: 'Debes subir un comprobante'
      });
    }

    /// 🔥 OBTENER NEGOCIACIÓN
    const negRes = await pool.query(
      `
      SELECT *
      FROM negotiations
      WHERE id = $1
      `,
      [id]
    );

    if (negRes.rows.length === 0) {
      return res.status(404).json({
        error: 'Negociación no encontrada'
      });
    }

    const negotiation = negRes.rows[0];

    /// 🔥 VALIDAR VENDEDOR
    if (negotiation.seller_id !== seller_id) {
      return res.status(403).json({
        error: 'No autorizado'
      });
    }

    /// 🔥 SUBIR CLOUDINARY
    const uploadFromBuffer = (buffer) => {

      return new Promise((resolve, reject) => {

        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'negotiation_payments',
          },
          (error, result) => {

            if (result) resolve(result);

            else reject(error);
          }
        );

        streamifier.createReadStream(buffer)
          .pipe(stream);
      });
    };

    const result = await uploadFromBuffer(req.file.buffer);

    const proof_url = result.secure_url;

    /// 🔥 OBTENER QR ACTIVO
    const qrRes = await pool.query(
      `
      SELECT *
      FROM payment_qrs
      WHERE is_active = true
      ORDER BY id DESC
      LIMIT 1
      `
    );

    if (qrRes.rows.length === 0) {

      return res.status(400).json({
        error: 'No existe QR activo'
      });
    }

    const qr = qrRes.rows[0];

    /// 🔥 CREAR PAYMENT
    await pool.query(
      `
      INSERT INTO negotiation_payments
      (
        negotiation_id,
        lot_id,
        seller_id,
        buyer_id,
        amount,
        proof_url,
        status,
        unlocked_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
      `,
      [
        negotiation.id,
        negotiation.lot_id,
        negotiation.seller_id,
        negotiation.buyer_id,
        qr.amount,
        proof_url,
        'uploaded'
      ]
    );

      /// 🔥 OBTENER COMPANY
      const lotCompanyRes =
          await pool.query(

              `
              SELECT company_id
              FROM lots
              WHERE id = $1
              `,
              [negotiation.lot_id]
          );

          const cash_company_id =
              lotCompanyRes.rows[0]
                  ?.company_id;

          /// 🔥 REGISTRAR INGRESO EN CAJA
          await pool.query(

              `
              INSERT INTO cash_movements
              (
                  company_id,
                  type,
                  category,
                  amount,
                  description,
                  reference_type,
                  reference_id,
                  proof_url,
                  created_by
              )

              VALUES
              (
                  $1,
                  'income',
                  'negotiaciones',
                  $2,
                  $3,
                  'negotiation_payment',
                  $4,
                  $5,
                  $6
              )
              `,
              [

                  cash_company_id,

                  qr.amount,

                  `Pago desbloqueo negociación #${negotiation.id}`,

                  negotiation.id,

                  proof_url,

                  seller_id,
              ],
          );

    /// 🔥 DESBLOQUEAR NEGOCIACIÓN GANADORA
    await pool.query(
      `
      UPDATE negotiations
      SET

        status = 'contacts_unlocked',

        contacts_unlocked_at = NOW(),

        review_available_at =
          NOW() + INTERVAL '24 hours',

        closed_at = NOW()

      WHERE id = $1
      `,
      [id]
    );

    /// 🔥 OBTENER PRECIO FINAL NEGOCIADO
    const negotiatedPrice =
      final_price || null;


    /// 🔥 MARCAR LOTE VENDIDO
    await pool.query(
      `
      UPDATE lots
      SET
        status = 'sold',
        winner_user_id = $1,
        sold_at = NOW(),
        final_price = $2
      WHERE id = $3
      `,
      [
        negotiation.buyer_id,
        negotiatedPrice,
        negotiation.lot_id,
      ]
    );

    /// 🔥 LIMPIAR DESTACADO / PREMIUM
    await pool.query(
      `
      UPDATE lots
      SET

        promoted_until = NULL,

        promotion_priority = 0

      WHERE id = $1
      `,
      [negotiation.lot_id]
    );

    /// 🔥 CERRAR OTRAS NEGOCIACIONES
    await pool.query(
      `
      UPDATE negotiations
      SET status = 'closed_other_buyer'
      WHERE lot_id = $1
      AND id != $2
      AND status = 'open'
      `,
      [
        negotiation.lot_id,
        negotiation.id
      ]
    );

    /// 🔥 EVENTO OPERATIVO
    await createOperationEvent({

      type: 'negotiation_closed',

      title:
          '🤝 Negociación cerrada',

      message:
          `El lote ${negotiation.lot_id} fue vendido exitosamente`,

      priority: 'high',

      data: {

        negotiation_id:
            negotiation.id,

        lot_id:
            negotiation.lot_id,

        seller_id:
            negotiation.seller_id,

        buyer_id:
            negotiation.buyer_id,
      },
    });

    /// 🔥 PUSH SUPER ADMIN
    await sendAdminNotification({

      title:
          '🤝 Negociación cerrada',

      body:
          `Lote ${negotiation.lot_id} vendido exitosamente`,

      data: {

        type:
            'negotiation_closed',

        negotiation_id:
            negotiation.id.toString(),

        lot_id:
            negotiation.lot_id.toString(),
      },
    });    

    /// 🔥 DESACTIVAR PROMOCIONES DEL LOTE VENDIDO
    await pool.query(
      `
      UPDATE promotion_requests
      SET

        status = 'completed',

        is_visible = false,

        ends_at = NOW()

      WHERE entity_type = 'lot'
      AND entity_id = $1
      AND is_visible = true
      `,
      [negotiation.lot_id]
    );

    /// 🔥 PUSH COMPRADOR
    const tokensRes = await pool.query(
      `
      SELECT fcm_token
      FROM devices
      WHERE user_id = $1
      `,
      [negotiation.buyer_id]
    );

    const tokens = tokensRes.rows.map(
      t => t.fcm_token
    );

    if (tokens.length > 0) {

      try {

        await admin.messaging()
          .sendEachForMulticast({

          tokens,

          notification: {

            title: '🎉 Venta confirmada',

            body: 'El vendedor desbloqueó los datos de contacto',
          },

          data: {

            negotiationId:
              negotiation.id.toString(),

            type: 'contacts_unlocked',
          },
        });

      } catch (e) {

        console.log(e);
      }
    }

    /// 🔥 FIRESTORE UPDATE
    const lotRes = await pool.query(
      `
      SELECT company_id
      FROM lots
      WHERE id = $1
      `,
      [negotiation.lot_id]
    );

    const company_id =
      lotRes.rows[0]?.company_id;

    if (company_id) {

      await admin.firestore()
        .collection('companies')
        .doc(company_id.toString())
        .collection('negotiations')
        .doc(negotiation.id.toString())
        .set({

          status: 'contacts_unlocked',

          contacts_unlocked_at:
            admin.firestore.FieldValue.serverTimestamp(),

        }, { merge: true });
    }

        /// 🔥 PUSH SUPER ADMIN
        try {

          console.log(
            '🔥 ENVIANDO ALERTA PAYMENT ADMIN'
          );

          await sendAdminNotification({

            title:
              '💰 Nuevo comprobante negociación',

            body:
              `Negociación #${negotiation.id} subió comprobante`,

            data: {

              type: 'negotiation_payment',

              negotiation_id:
                negotiation.id.toString(),

              lot_id:
                negotiation.lot_id.toString(),
            },
          });

        } catch (e) {

          console.log(
            '❌ ERROR PUSH NEGOTIATION PAYMENT',
            e,
          );
        }

    res.json({

      success: true,

      status: 'contacts_unlocked',

      proof_url,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error:
        'Error subiendo comprobante'
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
    SELECT
      seller_id,
      status
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

    const lot =
        lotRes.rows[0];

    const seller_id =
        lot.seller_id;

    /// 🔥 BLOQUEAR LOTES VENDIDOS
    if (lot.status === 'sold') {

      return res.status(400).json({
        error:
          'Este lote ya fue vendido'
      });
    }

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

      ORDER BY

      CASE
        WHEN n.status = 'open' THEN 0
        WHEN n.status = 'payment_pending' THEN 1
        WHEN n.status = 'contacts_unlocked' THEN 2
        ELSE 3
      END,

      n.created_at DESC
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