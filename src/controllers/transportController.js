const { pool } = require('../config/db');

const crypto = require('crypto');

const admin = require('firebase-admin');

const {
  analyzeTransportPayment,
} = require('../services/transportAiService');

const {
  sendUserNotification,
} = require('../services/notificationService');

const registerTruck = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const {
      plate,
      brand,
      model,
      year,
      truck_type,
      capacity_large,
      capacity_small,
      has_trailer,
      trailer_capacity,
      front_photo,
      side_photo,
      ownership_doc,
    } = req.body;

    const existingTruck = await pool.query(
    `
    SELECT id
    FROM transporter_trucks
    WHERE user_id = $1
        AND is_active = true
    LIMIT 1
    `,
    [userId]
    );

    if (existingTruck.rows.length > 0) {
    return res.status(400).json({
        error: 'Ya tienes un camión registrado',
    });
    }

    const result = await pool.query(
      `
      INSERT INTO transporter_trucks (
        user_id,
        plate,
        brand,
        model,
        year,
        truck_type,
        capacity_large,
        capacity_small,
        has_trailer,
        trailer_capacity,
        front_photo,
        side_photo,
        ownership_doc
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
      )
      RETURNING *
      `,
      [
        userId,
        plate,
        brand,
        model,
        year,
        truck_type,
        capacity_large,
        capacity_small,
        has_trailer,
        trailer_capacity,
        front_photo,
        side_photo,
        ownership_doc,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Error registrando camión',
    });
  }
};

const getMyTruck = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const result = await pool.query(
      `
      SELECT *
      FROM transporter_trucks
      WHERE user_id = $1
        AND is_active = true
      LIMIT 1
      `,
      [userId]
    );

    res.json(
      result.rows[0] || null
    );

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error obteniendo camión',
    });
  }
};

const updateMyTruck = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const {
      plate,
      brand,
      model,
      year,
      truck_type,
      capacity_large,
      capacity_small,
      has_trailer,
      trailer_capacity,
      front_photo,
      side_photo,
      ownership_doc,
    } = req.body;

    const result = await pool.query(
      `
      UPDATE transporter_trucks
      SET
        plate = $1,
        brand = $2,
        model = $3,
        year = $4,
        truck_type = $5,
        capacity_large = $6,
        capacity_small = $7,
        has_trailer = $8,
        trailer_capacity = $9,
        front_photo = COALESCE($10, front_photo),
        side_photo = COALESCE($11, side_photo),
        ownership_doc = COALESCE($12, ownership_doc)
      WHERE user_id = $13
        AND is_active = true
      RETURNING *
      `,
      [
        plate,
        brand,
        model,
        year,
        truck_type,
        capacity_large,
        capacity_small,
        has_trailer,
        trailer_capacity,
        front_photo,
        side_photo,
        ownership_doc,
        userId,
      ]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error actualizando camión',
    });
  }
};

const createGuide = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const truckRes = await pool.query(
      `
      SELECT *
      FROM transporter_trucks
      WHERE user_id = $1
        AND is_active = true
      LIMIT 1
      `,
      [userId]
    );

    if (truckRes.rows.length === 0) {
      return res.status(400).json({
        error: 'No tienes camión registrado',
      });
    }

    const truck = truckRes.rows[0];

    const {
      negotiation_id,
      origin,
      destination,
      driver_name,
      driver_ci,

      male_0_12,
      female_0_12,

      male_13_24,
      female_13_24,

      male_25_36,
      female_25_36,

      male_36_plus,
      female_36_plus,

      guide_image_url,
    } = req.body;

    const shareToken =
    crypto.randomBytes(8)
        .toString('hex');

    const result = await pool.query(
      `
      INSERT INTO transport_guides (
        truck_id,
        user_id,
        origin,
        destination,
        driver_name,
        driver_ci,
        plate,

        male_0_12,
        female_0_12,

        male_13_24,
        female_13_24,

        male_25_36,
        female_25_36,

        male_36_plus,
        female_36_plus,

        guide_image_url,
        share_token,
        negotiation_id
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
      )
      RETURNING *
      `,
      [
        truck.id,
        userId,
        origin,
        destination,
        driver_name,
        driver_ci,
        truck.plate,

        male_0_12,
        female_0_12,

        male_13_24,
        female_13_24,

        male_25_36,
        female_25_36,

        male_36_plus,
        female_36_plus,

        guide_image_url,
        shareToken,
        negotiation_id,
      ]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error creando guía',
    });
  }
};

const getMyGuides = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const result = await pool.query(
      `
      SELECT *
      FROM transport_guides
      WHERE user_id = $1
      ORDER BY id DESC
      `,
      [userId]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error obteniendo manifiestos',
    });
  }
};

const getSharedGuide = async (req, res) => {
  try {
    const { token } = req.params;

    const result = await pool.query(
      `
      SELECT *
      FROM transport_guides
      WHERE share_token = $1
      LIMIT 1
      `,
      [token]
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .send(
          '<h1>Manifiesto no encontrado</h1>'
        );
    }

    const g = result.rows[0];

    const statusMap = {
    draft: 'Pendiente',
    guide_uploaded: 'Guía cargada',
    in_trip: 'En viaje',
    delivered: 'Entregado',
    };

    const statusText =
    statusMap[g.status] || 'Pendiente';

    res.send(`
      <html>
      <head>
        <title>Manifiesto de Carga</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background: #111;
            color: #fff;
            padding: 30px;
          }

          .box {
            max-width: 700px;
            margin: auto;
            background: #1b1b1b;
            padding: 25px;
            border-radius: 12px;
            border: 1px solid #2d7d46;
          }

          h1 {
            color: #d4af37;
          }

          h2 {
            color: #2d7d46;
            margin-top: 25px;
          }

          .line {
            margin-bottom: 10px;
          }

          .status {
            padding: 8px 12px;
            background: #2d7d46;
            display: inline-block;
            border-radius: 8px;
            margin-top: 15px;
          }
        </style>
      </head>

      <body>
        <div class="box">
          <h1>Manifiesto de Carga #${g.id}</h1>

          <div class="line"><b>Placa:</b> ${g.plate}</div>
          <div class="line"><b>Conductor:</b> ${g.driver_name}</div>
          <div class="line"><b>CI:</b> ${g.driver_ci}</div>

          <div class="line"><b>Origen:</b> ${g.origin}</div>
          <div class="line"><b>Destino:</b> ${g.destination}</div>

          <h2>Machos</h2>
          <div class="line">0-12 meses: ${g.male_0_12}</div>
          <div class="line">13-24 meses: ${g.male_13_24}</div>
          <div class="line">25-36 meses: ${g.male_25_36}</div>
          <div class="line">+36 meses: ${g.male_36_plus}</div>

          <h2>Hembras</h2>
          <div class="line">0-12 meses: ${g.female_0_12}</div>
          <div class="line">13-24 meses: ${g.female_13_24}</div>
          <div class="line">25-36 meses: ${g.female_25_36}</div>
          <div class="line">+36 meses: ${g.female_36_plus}</div>

          <div class="status">
            Estado: ${statusText}
          </div>

          <div style="margin-top:20px;">
            Fecha: ${new Date(
            g.created_at
            ).toLocaleDateString()}
          </div>
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error(error);

    res
      .status(500)
      .send(
        '<h1>Error cargando manifiesto</h1>'
      );
  }
};

const createTransportRequest = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const {
      origin,
      destination,
      quantity,
      animal_type,
      travel_date,
      notes,
      contact_phone,
    } = req.body;

    const result = await pool.query(
      `
      INSERT INTO transport_requests (
        user_id,
        origin,
        destination,
        quantity,
        animal_type,
        travel_date,
        notes,
        contact_phone
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8
      )
      RETURNING *
      `,
      [
        userId,
        origin,
        destination,
        quantity,
        animal_type,
        travel_date,
        notes,
        contact_phone,
      ]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error creando solicitud',
    });
  }
};


const getOpenTransportRequests = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM transport_requests
      WHERE status = 'open'
      ORDER BY id DESC
      `
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error obteniendo solicitudes',
    });
  }
};

const createTransportNegotiation = async (req, res) => {
  try {
    const transporterId =
      req.user.user_id;

    const { request_id } = req.body;

    const requestRes =
      await pool.query(
        `
        SELECT *
        FROM transport_requests
        WHERE id = $1
        LIMIT 1
        `,
        [request_id]
      );

    if (
      requestRes.rows.length === 0
    ) {
      return res.status(404).json({
        error:
          'Solicitud no encontrada',
      });
    }

    const request =
      requestRes.rows[0];

    const truckRes =
      await pool.query(
        `
        SELECT *
        FROM transporter_trucks
        WHERE user_id = $1
          AND is_active = true
        LIMIT 1
        `,
        [transporterId]
      );

    if (
      truckRes.rows.length === 0
    ) {
      return res.status(400).json({
        error:
          'No tienes camión activo',
      });
    }

    const truck =
      truckRes.rows[0];

    const existing =
      await pool.query(
        `
        SELECT *
        FROM transport_negotiations
        WHERE request_id = $1
          AND transporter_id = $2
        LIMIT 1
        `,
        [
          request_id,
          transporterId,
        ]
      );

    if (
      existing.rows.length > 0
    ) {
      return res.json(
        existing.rows[0]
      );
    }

    const result =
      await pool.query(
        `
        INSERT INTO transport_negotiations (
          request_id,
          truck_id,
          requester_id,
          transporter_id
        )
        VALUES ($1,$2,$3,$4)
        RETURNING *
        `,
        [
          request_id,
          truck.id,
          request.user_id,
          transporterId,
        ]
      );

    const negotiation =
    result.rows[0];

    /// 🔥 PUSH AL GANADERO
    await sendUserNotification({
    userId: request.user_id,
    title: 'Nuevo transportista interesado',
    body:
        'Un camionero quiere negociar tu carga',
    data: {
        type: 'transport_negotiation',
        negotiation_id:
        negotiation.id,
        request_id:
        request.id,
    },
    });

    res.json(
    negotiation
    );

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        'Error creando negociación',
    });
  }
};

const sendTransportMessage = async (req, res) => {
  try {
    const senderId = req.user.user_id;

    const {
      negotiation_id,
      message,
    } = req.body;

    const forbiddenPatterns = [
      /\d{7,}/,
      /whatsapp/i,
      /llámame/i,
      /llamame/i,
      /telegram/i,
      /@/,
      /facebook/i,
      /instagram/i,
      /wa\.me/i,
      /t\.me/i,
      /\+591/,
    ];

    const blocked =
      forbiddenPatterns.some(
        (pattern) =>
          pattern.test(message)
      );

    if (blocked) {
      return res.status(400).json({
        error:
          'Mensaje bloqueado por compartir contacto externo',
      });
    }

    /// 1. GUARDAR SQL (auditoría)
    const result =
      await pool.query(
        `
        INSERT INTO transport_negotiation_messages (
          negotiation_id,
          sender_id,
          message
        )
        VALUES ($1,$2,$3)
        RETURNING *
        `,
        [
          negotiation_id,
          senderId,
          message,
        ]
      );

    /// 2. GUARDAR FIRESTORE (realtime)
    console.log(
    '🔥 Writing transport message to Firestore'
    );

    await admin
    .firestore()
    .collection('transport_negotiations')
    .doc(
        negotiation_id.toString()
    )
    .collection('messages')
    .add({
        sender_id: senderId,
        message,
        created_at:
        admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(
    '✅ Firestore transport message saved'
    );

    /// 🔥 BUSCAR NEGOCIACIÓN
    const negotiationRes =
    await pool.query(
        `
        SELECT *
        FROM transport_negotiations
        WHERE id = $1
        LIMIT 1
        `,
        [negotiation_id]
    );

    if (
    negotiationRes.rows.length > 0
    ) {
    const negotiation =
        negotiationRes.rows[0];

    const receiverId =
        negotiation.requester_id === senderId
        ? negotiation.transporter_id
        : negotiation.requester_id;

    await sendUserNotification({
        userId: receiverId,
        title:
        'Nuevo mensaje de transporte',
        body: message,
        data: {
        type:
            'transport_negotiation',
        negotiation_id,
        request_id:
            negotiation.request_id,
        },
    });
    }

    res.json(
      result.rows[0]
    );

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        'Error enviando mensaje',
    });
  }
};

const getTransportMessages = async (req, res) => {
  try {
    const { negotiation_id } =
      req.params;

    const result =
      await pool.query(
        `
        SELECT *
        FROM transport_negotiation_messages
        WHERE negotiation_id = $1
        ORDER BY id ASC
        `,
        [negotiation_id]
      );

    res.json(
      result.rows
    );

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        'Error obteniendo mensajes',
    });
  }
};

const getMyTransportRequests = async (req, res) => {
  try {
    const userId =
      req.user.user_id;

    const result =
      await pool.query(
        `
        SELECT *
        FROM transport_requests
        WHERE user_id = $1
        ORDER BY id DESC
        `,
        [userId]
      );

    res.json(
      result.rows
    );

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        'Error obteniendo solicitudes',
    });
  }
};

const getRequestNegotiations = async (req, res) => {
  try {
    const { request_id } =
      req.params;

    const result =
      await pool.query(
        `
        SELECT
          tn.*,
          tt.plate,
          tt.brand,
          tt.model
        FROM transport_negotiations tn
        JOIN transporter_trucks tt
          ON tn.truck_id = tt.id
        WHERE tn.request_id = $1
        ORDER BY tn.id DESC
        `,
        [request_id]
      );

    res.json(
      result.rows
    );

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        'Error obteniendo negociaciones',
    });
  }
};

const acceptTransportNegotiation = async (req, res) => {
  try {
    const userId =
      req.user.user_id;

    const {
      negotiation_id,
    } = req.body;

    /// 🔥 BUSCAR NEGOCIACIÓN
    const negotiationRes =
      await pool.query(
        `
        SELECT *
        FROM transport_negotiations
        WHERE id = $1
        LIMIT 1
        `,
        [negotiation_id]
      );

    if (
      negotiationRes.rows.length === 0
    ) {
      return res.status(404).json({
        error:
          'Negociación no encontrada',
      });
    }

    const negotiation =
      negotiationRes.rows[0];

    /// 🔒 SOLO EL DUEÑO DE LA CARGA
    if (
      negotiation.requester_id !== userId
    ) {
      return res.status(403).json({
        error:
          'No autorizado',
      });
    }

    /// 🔥 ACEPTAR ESTA
    const configRes = await pool.query(
    `
    SELECT amount
    FROM system_payment_configs
    WHERE code = 'transport_unlock'
      AND is_active = true
    LIMIT 1
    `
    );

    if (configRes.rows.length === 0) {
      return res.status(400).json({
        error: 'Configuración de pago no encontrada',
      });
    }

    const unlockFee =
      Number(configRes.rows[0].amount);

    await pool.query(
    `
    UPDATE transport_negotiations
    SET
      status = 'payment_pending',
      unlock_fee = $2
    WHERE id = $1
    `,
    [
      negotiation_id,
      unlockFee
    ]
    );

    /// 🔥 CAMBIAR REQUEST
    await pool.query(
      `
        UPDATE transport_requests
        SET status = 'payment_pending'
        WHERE id = $1
      `,
      [negotiation.request_id]
    );

    /// 🔥 CANCELAR OTRAS
    await pool.query(
      `
      UPDATE transport_negotiations
      SET status = 'cancelled'
      WHERE request_id = $1
        AND id != $2
      `,
      [
        negotiation.request_id,
        negotiation_id,
      ]
    );

    /// 🔥 NOTIFICAR CAMIONERO
    await sendUserNotification({
      userId:
        negotiation.transporter_id,
      title:
        'Trato aceptado',
      body:
        'Tu propuesta fue aceptada',
      data: {
        type:
          'transport_negotiation',
        negotiation_id,
        request_id:
          negotiation.request_id,
      },
    });

    res.json({
      success: true,
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        'Error aceptando negociación',
    });
  }
};

const {
  analyzePaymentProof,
} = require('../services/paymentAiService');

const createTransportPayment =
  async (req, res) => {
    try {
      const userId =
        req.user.user_id;

      const {
        negotiation_id,
        proof_image_url,
      } = req.body;

      const negotiationRes =
        await pool.query(
          `
          SELECT *
          FROM transport_negotiations
          WHERE id = $1
          LIMIT 1
          `,
          [negotiation_id]
        );

      if (
        negotiationRes.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            'Negociación no encontrada',
        });
      }

      const negotiation =
        negotiationRes.rows[0];

      const expectedAmount =
        Number(
          negotiation.unlock_fee
        );

      const aiResult =
        await analyzePaymentProof({
          proofImageUrl:
            proof_image_url,
          expectedAmount,
        });

      console.log(
        '🤖 AI RESULT:',
        aiResult
      );

      let validationStatus = 'rejected';

      /// SOLO SI EL MONTO COINCIDE
      if (aiResult.pago_valido) {
        if (
          aiResult.confianza >= 0.90
        ) {
          validationStatus =
            'approved';
        } else if (
          aiResult.confianza >= 0.70
        ) {
          validationStatus =
            'review';
        }
      }

      const result =
        await pool.query(
          `
          INSERT INTO payment_validations (
            module,
            reference_id,
            payer_user_id,
            expected_amount,
            proof_image_url,

            detected_amount,
            detected_bank,
            detected_reference,
            detected_sender,
            detected_date,
            detected_time,

            ai_verified,
            ai_confidence,
            ai_notes,
            status
          )
          VALUES (
            $1,$2,$3,$4,$5,
            $6,$7,$8,$9,$10,$11,
            $12,$13,$14,$15
          )
          RETURNING *
          `,
          [
            'transport',
            negotiation_id,
            userId,
            expectedAmount,
            proof_image_url,

            aiResult.monto_detectado,
            aiResult.banco,
            aiResult.referencia,
            aiResult.nombre_emisor,
            aiResult.fecha,
            aiResult.hora,

            aiResult.pago_valido,
            aiResult.confianza,
            aiResult.notas,
            validationStatus,
          ]
        );

        if (validationStatus === 'approved') {
          /// NEGOCIACIÓN PAGADA
          await pool.query(
            `
            UPDATE transport_negotiations
            SET status = 'trip_active'
            WHERE id = $1
            `,
            [negotiation_id]
          );

          const usersRes = await pool.query(
          `
          SELECT
            r.name AS requester_name,
            r.phone AS requester_phone,
            t.name AS transporter_name,
            t.phone AS transporter_phone
          FROM transport_negotiations tn
          JOIN users r
            ON tn.requester_id = r.id
          JOIN users t
            ON tn.transporter_id = t.id
          WHERE tn.id = $1
          LIMIT 1
          `,
          [negotiation_id]
          );

          const users = usersRes.rows[0];

          await admin
          .firestore()
          .collection('transport_negotiations')
          .doc(negotiation_id.toString())
          .collection('messages')
          .add({
            sender_id: 0,
            system: true,
            message:
            `✅ Pago aprobado.

            Tu viaje ha sido activado.

            Contactos liberados:

            👨‍🌾 Ganadero:
            ${users.requester_name}
            ${users.requester_phone}

            🚛 Transportista:
            ${users.transporter_name}
            ${users.transporter_phone}

            📦 Ahora ve a MIS VIAJES para gestionar:

            • Cargar guía de movimiento
            • Iniciar viaje
            • Compartir manifiesto
            • Reportar avance
            • Marcar entrega final

            💬 Este chat seguirá disponible para coordinar toda la operación hasta la entrega.`,
            created_at:
              admin.firestore.FieldValue.serverTimestamp(),
          });          

          /// REQUEST PAGADO
          await pool.query(
            `
            UPDATE transport_requests
            SET status = 'paid'
            WHERE id = $1
            `,
            [negotiation.request_id]
          );

          /// INGRESO A CAJA
          await pool.query(
          `INSERT INTO cash_movements (
            type,
            category,
            amount,
            description,
            reference_type,
            reference_id,
            proof_url,
            created_by,
            company_id
          )
          VALUES (
            'income',
            'Transporte',
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7
          )`,
          [
          expectedAmount,
          `Pago transporte negociación #${negotiation_id}`,
          'transport_payment',
          negotiation_id,
          proof_image_url,
          userId,
          1
          ]
          );


          /// PUSH AL CAMIONERO
          await sendUserNotification({
            userId: negotiation.transporter_id,
            title: 'Pago aprobado',
            body:
              'El pago fue validado correctamente. Contactos desbloqueados.',
            data: {
              type: 'transport_paid',
              negotiation_id,
            },
          });
        }

        if (validationStatus === 'review') {
          await sendUserNotification({
            userId,
            title: 'Pago en revisión',
            body:
              'El comprobante necesita revisión manual.',
            data: {
              type: 'payment_review',
            },
          });
        }

        if (validationStatus === 'rejected') {
          await sendUserNotification({
            userId,
            title: 'Pago rechazado',
            body:
              aiResult.notas ||
              'No se pudo validar el comprobante.',
            data: {
              type: 'payment_rejected',
            },
          });
        }

      res.json(
        result.rows[0]
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error creando pago',
      });
    }
  };

const createDispatch = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const {
      negotiation_id,
      photo_url,
      signature_url,
      notes,
      event_local_time,
    } = req.body;

    const negotiationRes =
      await pool.query(
        `
        SELECT *
        FROM transport_negotiations
        WHERE id = $1
        LIMIT 1
        `,
        [negotiation_id]
      );

    if (
      negotiationRes.rows.length === 0
    ) {
      return res.status(404).json({
        error: 'Negociación no encontrada',
      });
    }

    const negotiation =
      negotiationRes.rows[0];

    if (
      negotiation.transporter_id !== userId
    ) {
      return res.status(403).json({
        error: 'Solo el camionero puede despachar',
      });
    }

    const eventRes =
      await pool.query(
        `
        INSERT INTO transport_trip_events (
          negotiation_id,
          event_type,
          photo_url,
          signature_url,
          notes,
          created_by,
          event_local_time
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING *
        `,
        [
          negotiation_id,
          'dispatch',
          photo_url,
          signature_url,
          notes,
          userId,
          event_local_time,
        ]
      );

    await pool.query(
      `
      UPDATE transport_negotiations
      SET status = 'loading_completed'
      WHERE id = $1
      `,
      [negotiation_id]
    );

    res.json(
      eventRes.rows[0]
    );

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error creando despacho',
    });
  }
};

const saveTracking = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const {
      negotiation_id,
      latitude,
      longitude,
      speed,
      tracked_at,
    } = req.body;

    const negotiationRes =
      await pool.query(
        `
        SELECT *
        FROM transport_negotiations
        WHERE id = $1
        LIMIT 1
        `,
        [negotiation_id]
      );

    if (
      negotiationRes.rows.length === 0
    ) {
      return res.status(404).json({
        error: 'Negociación no encontrada',
      });
    }

    const negotiation =
      negotiationRes.rows[0];

    if (!negotiation.trip_started_at) {
      await pool.query(
        `
        UPDATE transport_negotiations
        SET
          status = 'trip_active',
          trip_started_at = NOW(),
          real_origin_lat = $1,
          real_origin_lng = $2
        WHERE id = $3
        `,
        [
          latitude,
          longitude,
          negotiation_id,
        ]
      );
    }

    if (
      negotiation.transporter_id !== userId
    ) {
      return res.status(403).json({
        error: 'Solo el camionero puede enviar ubicación',
      });
    }

    const result =
      await pool.query(
        `
        INSERT INTO transport_trip_tracking (
          negotiation_id,
          latitude,
          longitude,
          speed,
          tracked_at
        )
        VALUES ($1,$2,$3,$4,$5)
        RETURNING *
        `,
        [
          negotiation_id,
          latitude,
          longitude,
          speed || 0,
          tracked_at,
        ]
      );

    res.json(
      result.rows[0]
    );

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error guardando tracking',
    });
  }
};

const getTripTracking = async (req, res) => {
  try {
    const { negotiation_id } = req.params;

    const result = await pool.query(
      `
      SELECT *
      FROM transport_trip_tracking
      WHERE negotiation_id = $1
      ORDER BY created_at ASC
      `,
      [negotiation_id]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error obteniendo tracking',
    });
  }
};

const getMyTrips = async (req, res) => {
  try {
    const userId = req.user.user_id;

  const result = await pool.query(
    `
    SELECT DISTINCT ON (tn.id)
      tn.id,
      tn.status,
      tn.unlock_fee,
      tn.created_at,

      tr.origin,
      tr.destination,
      tr.quantity,
      tr.animal_type,
      tr.travel_date,
      tr.notes,

      tt.plate,
      tt.brand,
      tt.model,

      tg.id AS guide_id

    FROM transport_negotiations tn

    JOIN transport_requests tr
      ON tn.request_id = tr.id

    JOIN transporter_trucks tt
      ON tn.truck_id = tt.id

    LEFT JOIN transport_guides tg
      ON tg.negotiation_id = tn.id

    WHERE
      tn.transporter_id = $1
      OR tn.requester_id = $1

    ORDER BY tn.id, tg.created_at DESC
    `,
    [userId]
  );

    res.json(result.rows);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error obteniendo viajes',
    });
  }
};
  
const getTripMapData = async (
  req,
  res
) => {
  try {
    const { negotiationId } =
      req.params;

    const negotiationResult =
      await pool.query(
        `
        SELECT *
        FROM transport_negotiations
        WHERE id = $1
        `,
        [negotiationId]
      );

    if (
      negotiationResult.rows.length === 0
    ) {
      return res
        .status(404)
        .json({
          error:
            'Negociación no encontrada',
        });
    }

    const negotiation =
      negotiationResult.rows[0];

    let route = null;

    if (negotiation.route_id) {
      const routeResult =
        await pool.query(
          `
          SELECT *
          FROM transport_routes
          WHERE id = $1
          `,
          [negotiation.route_id]
        );

      if (
        routeResult.rows.length > 0
      ) {
        route = routeResult.rows[0];
      }
    }

    const trackingResult =
      await pool.query(
        `
        SELECT *
        FROM transport_trip_tracking
        WHERE negotiation_id = $1
        ORDER BY tracked_at ASC
        `,
        [negotiationId]
      );

    res.json({
      negotiation,
      route,
      tracking:
          trackingResult.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error:
          'Error obteniendo mapa del viaje',
    });
  }
};

module.exports = {
  registerTruck,
  getMyTruck,
  updateMyTruck,
  createGuide,
  getMyGuides,
  getSharedGuide,
  createTransportRequest,
  getOpenTransportRequests,
  createTransportNegotiation,
  sendTransportMessage,
  getTransportMessages,
  getMyTransportRequests,
  getRequestNegotiations,
  acceptTransportNegotiation,
  createTransportPayment,
  createDispatch,
  saveTracking,
  getTripTracking,
  getMyTrips,
  getTripMapData,   
};