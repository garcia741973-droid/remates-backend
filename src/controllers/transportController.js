const { pool } = require('../config/db');

const crypto = require('crypto');

const admin = require('firebase-admin');

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
        share_token
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,$12,$13,$14,$15,$16,$17
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

    res.json(
      result.rows[0]
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
};