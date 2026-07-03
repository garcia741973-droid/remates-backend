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

const toggleTruckAvailability = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { is_available } = req.body;

    // Verificar si tiene viaje activo
    const activeTrip = await pool.query(
      `
      SELECT id
      FROM transport_negotiations
      WHERE transporter_id = $1
      AND status IN (
        'payment_pending',
        'paid',
        'loading_completed',
        'trip_active',
        'in_trip',
        'delivery_pending'
      )
      LIMIT 1
      `,
      [userId]
    );

    if (
      activeTrip.rows.length > 0 &&
      is_available === true
    ) {
      return res.status(400).json({
        error:
          'No puedes activarte mientras tienes un viaje en curso',
      });
    }

    const result = await pool.query(
      `
      UPDATE transporter_trucks
      SET is_available = $1
      WHERE user_id = $2
      RETURNING *
      `,
      [is_available, userId]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        'Error actualizando disponibilidad',
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

const createTripCashbox = async (
  req,
  res
) => {
  try {
    const transporterId =
      req.user.user_id;

    const {
      negotiation_id,
      trip_total,
      advance_received,
    } = req.body;

    const existing =
      await pool.query(
        `
        SELECT id
        FROM transport_trip_cashboxes
        WHERE negotiation_id = $1
        LIMIT 1
        `,
        [negotiation_id]
      );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        error:
          'La caja ya existe',
      });
    }

    const cashbox =
      await pool.query(
        `
        INSERT INTO transport_trip_cashboxes (
          negotiation_id,
          transporter_id,
          trip_total,
          advance_received
        )
        VALUES ($1,$2,$3,$4)
        RETURNING *
        `,
        [
          negotiation_id,
          transporterId,
          trip_total || 0,
          advance_received || 0,
        ]
      );

    if (
      Number(advance_received) > 0
    ) {
      await pool.query(
        `
        INSERT INTO transport_trip_cashbox_items (
          cashbox_id,
          type,
          category,
          amount,
          notes
        )
        VALUES ($1,$2,$3,$4,$5)
        `,
        [
          cashbox.rows[0].id,
          'income',
          'advance',
          advance_received,
          'Adelanto inicial',
        ]
      );
    }

    res.json(cashbox.rows[0]);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        'Error creando caja',
    });
  }
};

const addTripCashboxItem =
  async (req, res) => {
    try {
      const {
        cashbox_id,
        type,
        category,
        amount,
        notes,
      } = req.body;

      const cashbox =
        await pool.query(
          `
          SELECT *
          FROM transport_trip_cashboxes
          WHERE id = $1
          LIMIT 1
          `,
          [cashbox_id]
        );

      if (
        cashbox.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            'Caja no encontrada',
        });
      }

      if (
        cashbox.rows[0].is_closed
      ) {
        return res.status(400).json({
          error:
            'Caja cerrada',
        });
      }

      const result =
        await pool.query(
          `
          INSERT INTO transport_trip_cashbox_items (
            cashbox_id,
            type,
            category,
            amount,
            notes
          )
          VALUES ($1,$2,$3,$4,$5)
          RETURNING *
          `,
          [
            cashbox_id,
            type,
            category,
            amount,
            notes || null,
          ]
        );

      res.json(result.rows[0]);

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error agregando movimiento',
      });
    }
  };

const getTripCashbox =
  async (req, res) => {
    try {
      const { negotiation_id } =
        req.params;

      const cashbox =
        await pool.query(
          `
          SELECT *
          FROM transport_trip_cashboxes
          WHERE negotiation_id = $1
          LIMIT 1
          `,
          [negotiation_id]
        );

      if (
        cashbox.rows.length === 0
      ) {
        return res.json(null);
      }

      const items =
        await pool.query(
          `
          SELECT *
          FROM transport_trip_cashbox_items
          WHERE cashbox_id = $1
          ORDER BY created_at DESC
          `,
          [cashbox.rows[0].id]
        );

      const totals =
        await pool.query(
          `
          SELECT
            COALESCE(SUM(
              CASE
                WHEN type='income'
                THEN amount
              END
            ),0) AS total_income,

            COALESCE(SUM(
              CASE
                WHEN type='expense'
                THEN amount
              END
            ),0) AS total_expenses
          FROM transport_trip_cashbox_items
          WHERE cashbox_id = $1
          `,
          [cashbox.rows[0].id]
        );

      res.json({
        cashbox:
          cashbox.rows[0],
        items:
          items.rows,
        total_income:
          totals.rows[0]
              .total_income,
        total_expenses:
          totals.rows[0]
              .total_expenses,
        result:
          Number(
            totals.rows[0]
                .total_income,
          ) -
          Number(
            totals.rows[0]
                .total_expenses,
          ),
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error obteniendo caja',
      });
    }
  };  

const getMyTripCashboxes =
  async (req, res) => {
    try {
      const userId = req.user.user_id;

      const result =
        await pool.query(
          `
          SELECT
            tc.*,
            tr.origin,
            tr.destination,

            COALESCE((
              SELECT SUM(amount)
              FROM transport_trip_cashbox_items
              WHERE cashbox_id = tc.id
              AND type = 'income'
            ),0) AS total_income,

            COALESCE((
              SELECT SUM(amount)
              FROM transport_trip_cashbox_items
              WHERE cashbox_id = tc.id
              AND type = 'expense'
            ),0) AS total_expenses

          FROM transport_trip_cashboxes tc
          JOIN transport_negotiations tn
            ON tn.id = tc.negotiation_id
          JOIN transport_requests tr
            ON tr.id = tn.request_id

          WHERE tc.transporter_id = $1
          ORDER BY tc.id DESC
          `,
          [userId]
        );

      res.json(result.rows);

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error obteniendo cajas',
      });
    }
  };

const getMyTruckReviews =
  async (req, res) => {
    try {
      const userId = req.user.user_id;

      const result =
        await pool.query(
          `
          SELECT *
          FROM transport_reviews
          WHERE transporter_id = $1
          ORDER BY id DESC
          `,
          [userId]
        );

      const avg =
        await pool.query(
          `
          SELECT
            COALESCE(
              ROUND(AVG(rating),1),
              0
            ) AS avg_rating
          FROM transport_reviews
          WHERE transporter_id = $1
          `,
          [userId]
        );

      res.json({
        avg_rating:
          avg.rows[0].avg_rating,
        reviews:
          result.rows,
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error obteniendo calificaciones',
      });
    }
  };  

const closeTripCashbox =
  async (req, res) => {
    try {
      const { cashbox_id } =
        req.body;

      const result =
        await pool.query(
          `
          UPDATE transport_trip_cashboxes
          SET
            is_closed = true,
            closed_at = NOW()
          WHERE id = $1
          RETURNING *
          `,
          [cashbox_id]
        );

      res.json(result.rows[0]);

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error cerrando caja',
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

await admin
  .firestore()
  .collection('transport_negotiations')
  .doc(negotiation_id.toString())
  .collection('messages')
  .add({
    sender_id: 0,
    system: true,
    message:
`📄 Manifiesto de transporte generado.

🚛 Placa: ${truck.plate}
👤 Conductor: ${driver_name}
🪪 CI: ${driver_ci}

📍 Origen: ${origin}
📍 Destino: ${destination}

🐂 MACHOS
0-12: ${male_0_12}
13-24: ${male_13_24}
25-36: ${male_25_36}
+36: ${male_36_plus}

🐄 HEMBRAS
0-12: ${female_0_12}
13-24: ${female_13_24}
25-36: ${female_25_36}
+36: ${female_36_plus}

🔗 Ver manifiesto:
${process.env.APP_URL}/transport/shared-guide/${shareToken}`,
    guide_url:
      `${process.env.APP_URL}/transport/shared-guide/${shareToken}`,
    created_at:
      admin.firestore.FieldValue.serverTimestamp(),
  });

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
    trip_active: 'En viaje',
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

const createPublicTracking = async (req, res) => {
  try {
    const { negotiation_id } = req.params;
    const { driver_name } = req.body;

    const existing = await pool.query(
      `
      SELECT *
      FROM transport_public_tracking
      WHERE negotiation_id = $1
      AND active = true
      LIMIT 1
      `,
      [negotiation_id]
    );

    if (existing.rows.length > 0) {
      return res.json(existing.rows[0]);
    }

    const token =
      crypto.randomBytes(16).toString('hex');

    const result = await pool.query(
      `
      INSERT INTO transport_public_tracking (
        negotiation_id,
        token,
        driver_name
      )
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [
        negotiation_id,
        token,
        driver_name,
      ]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        'Error creando tracking público',
    });
  }
};

const getPublicTracking = async (req, res) => {
  try {
    const { token } = req.params;

    const trackingRes = await pool.query(
      `
      SELECT
        tpt.token,
        tn.id AS negotiation_id,
        tn.status,

        NULL AS plate,
        tpt.driver_name,
        tr.origin,
        tr.destination,

        ttt.latitude,
        ttt.longitude,
        ttt.speed,
        ttt.tracked_at

      FROM transport_public_tracking tpt

      INNER JOIN transport_negotiations tn
        ON tn.id = tpt.negotiation_id

      LEFT JOIN transport_requests tr
        ON tr.id = tn.request_id

      LEFT JOIN LATERAL (
        SELECT *
        FROM transport_trip_tracking
        WHERE negotiation_id = tn.id
        ORDER BY tracked_at DESC
        LIMIT 1
      ) ttt ON true

      WHERE tpt.token = $1
      AND tpt.active = true
      LIMIT 1
      `,
      [token]
    );

    if (trackingRes.rows.length === 0) {
      return res.status(404).json({
        error: 'Tracking no encontrado',
      });
    }

    res.json(trackingRes.rows[0]);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        'Error obteniendo tracking público',
    });
  }
};

const disablePublicTracking = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { negotiation_id } = req.body;

    const negotiationRes = await pool.query(
      `
      SELECT *
      FROM transport_negotiations
      WHERE id = $1
      LIMIT 1
      `,
      [negotiation_id]
    );

    if (negotiationRes.rows.length === 0) {
      return res.status(404).json({
        error: 'Negociación no encontrada',
      });
    }

    const negotiation = negotiationRes.rows[0];

    if (
      negotiation.requester_id !== userId &&
      negotiation.transporter_id !== userId
    ) {
      return res.status(403).json({
        error: 'No autorizado',
      });
    }

    await pool.query(
      `
      UPDATE transport_public_tracking
      SET active = false
      WHERE negotiation_id = $1
      `,
      [negotiation_id]
    );

    res.json({
      success: true,
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error desactivando tracking',
    });
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

      /// ORIGEN
      approx_pickup_source,
      approx_pickup_saved_location_id,
      approx_pickup_lat,
      approx_pickup_lng,
      approx_pickup_notes,

      /// DESTINO
      approx_dropoff_source,
      approx_dropoff_saved_location_id,
      approx_dropoff_lat,
      approx_dropoff_lng,
      approx_dropoff_notes,
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
        contact_phone,

        approx_pickup_source,
        approx_pickup_saved_location_id,
        approx_pickup_lat,
        approx_pickup_lng,
        approx_pickup_notes,

        approx_dropoff_source,
        approx_dropoff_saved_location_id,
        approx_dropoff_lat,
        approx_dropoff_lng,
        approx_dropoff_notes
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,
        $9,$10,$11,$12,$13,
        $14,$15,$16,$17,$18
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
        contact_phone || null,

        /// ORIGEN
        approx_pickup_source || null,
        approx_pickup_saved_location_id || null,
        approx_pickup_lat || null,
        approx_pickup_lng || null,
        approx_pickup_notes || null,

        /// DESTINO
        approx_dropoff_source || null,
        approx_dropoff_saved_location_id || null,
        approx_dropoff_lat || null,
        approx_dropoff_lng || null,
        approx_dropoff_notes || null,
      ]
    );

    const request = result.rows[0];

    const availableTrucks = await pool.query(
      `
      SELECT user_id
      FROM transporter_trucks
      WHERE is_available = true
        AND is_active = true
      `
    );

    for (const truck of availableTrucks.rows) {
      await sendUserNotification({
        userId: truck.user_id,
        title: 'Nueva carga disponible',
        body: `Hay una nueva solicitud de transporte disponible.`,
        data: {
          type: 'new_transport_request',
          request_id: request.id,
        },
      });
    }

    res.json(request);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error creando solicitud',
    });
  }
};


const getOpenTransportRequests = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const result = await pool.query(
      `
      SELECT
        tr.*,
        pickup.name AS approx_pickup_location_name,
        dropoff.name AS approx_dropoff_location_name
      FROM transport_requests tr
      LEFT JOIN transport_saved_locations pickup
        ON tr.approx_pickup_saved_location_id = pickup.id
      LEFT JOIN transport_saved_locations dropoff
        ON tr.approx_dropoff_saved_location_id = dropoff.id
        WHERE tr.status = 'open'
        AND tr.user_id != $1
        AND tr.id NOT IN (
          SELECT request_id
          FROM transport_request_rejections
          WHERE transporter_id = $1
        )
        AND tr.id NOT IN (
          SELECT request_id
          FROM transport_negotiations
          WHERE transporter_id = $1
          AND status IN (
            'open',
            'payment_pending',
            'paid',
            'loading_completed',
            'trip_active',
            'in_trip',
            'delivery_pending'
          )
        )
      ORDER BY tr.id DESC
      `,
      [userId]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error obteniendo solicitudes abiertas',
    });
  }
};

const createTransportNegotiation = async (req, res) => {
  try {
    const transporterId =
      req.user.user_id;

    const { request_id } = req.body;

    /// 🔥 BUSCAR SOLICITUD
    const requestRes =
      await pool.query(
        `
        SELECT *
        FROM transport_requests
        WHERE id = $1
        AND status = 'open'
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

    if (
      request.user_id === transporterId
    ) {
      return res.status(400).json({
        error:
          'No puedes negociar tu propia solicitud',
      });
    }      

    /// 🔥 BUSCAR CAMIÓN ACTIVO
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

    /// 🔥 VERIFICAR VIAJE ACTIVO
    const activeTrip =
      await pool.query(
        `
        SELECT id
        FROM transport_negotiations
        WHERE truck_id = $1
        AND status IN (
          'payment_pending',
          'paid',
          'loading_completed',
          'trip_active',
          'in_trip',
          'delivery_pending'
        )
        LIMIT 1
        `,
        [truck.id]
      );

    if (
      activeTrip.rows.length > 0
    ) {
      return res.status(400).json({
        error:
          'Este camión ya tiene un viaje activo',
      });
    }

    /// 🔥 VERIFICAR SI YA EXISTE NEGOCIACIÓN ACTIVA
    const existing =
      await pool.query(
        `
        SELECT *
        FROM transport_negotiations
        WHERE request_id = $1
          AND transporter_id = $2
          AND status IN (
            'open',
            'payment_pending',
            'paid',
            'loading_completed',
            'trip_active',
            'in_trip',
            'delivery_pending'
          )
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

    /// 🔥 CREAR NUEVA NEGOCIACIÓN
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
      photo_url,
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
          message,
          photo_url
        )
        VALUES ($1,$2,$3,$4)
        RETURNING *
        `,
        [
          negotiation_id,
          senderId,
          message,
          photo_url || null,
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
        photo_url: photo_url || null,
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

const getTransportNegotiationDetails = async (req, res) => {
  try {
    const { negotiation_id } = req.params;

    const result = await pool.query(
      `
      SELECT *
      FROM transport_negotiations
      WHERE id = $1
      LIMIT 1
      `,
      [negotiation_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Negociación no encontrada',
      });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error obteniendo negociación',
    });
  }
};

const getTransportRoutePoints = async (req, res) => {
  try {
    const { request_id } = req.params;

    const result = await pool.query(
      `
      SELECT *
      FROM transport_route_points
      WHERE request_id = $1
      ORDER BY route_phase ASC, point_order ASC
      `,
      [request_id]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error obteniendo rutas del viaje',
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
        SELECT
          tr.*,
          (
            SELECT COUNT(*)
            FROM transport_negotiations tn
            WHERE tn.request_id = tr.id
              AND tn.status = 'open'
          ) AS pending_negotiations
        FROM transport_requests tr
        WHERE tr.user_id = $1
        AND tr.status != 'cancelled'
        ORDER BY tr.id DESC
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

    const userId =
      req.user.user_id;

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

    if (
      requestRes.rows[0].user_id !== userId
    ) {
      return res.status(403).json({
        error:
          'No autorizado',
      });
    }

    const result =
      await pool.query(
        `
      SELECT
        tn.*,
        tt.plate,
        tt.brand,
        tt.model,

        COALESCE((
          SELECT ROUND(AVG(rating), 1)
          FROM transport_reviews
          WHERE transporter_id = tn.transporter_id
        ), 0) AS avg_rating,

        (
          SELECT COUNT(*)
          FROM transport_reviews
          WHERE transporter_id = tn.transporter_id
        ) AS total_reviews
        FROM transport_negotiations tn
        JOIN transporter_trucks tt
          ON tn.truck_id = tt.id
        WHERE tn.request_id = $1
        AND tn.status IN (
          'open',
          'payment_pending',
          'paid',
          'loading_completed',
          'trip_active',
          'in_trip',
          'delivery_pending',
          'delivered'
        )
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
        AND status = 'open'
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
      AND status = 'open'
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

          await pool.query(
            `
            INSERT INTO transport_payments (
              negotiation_id,
              payer_user_id,
              amount,
              proof_image_url,
              ai_verified,
              ai_notes,
              status
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            `,
            [
              negotiation_id,
              userId,
              expectedAmount,
              proof_image_url,
              true,
              aiResult.notas,
              'approved'
            ]
          );

          /// NEGOCIACIÓN PAGADA
          await pool.query(
            `
            UPDATE transport_negotiations
            SET status = 'paid'
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

            Pago aprobado correctamente.

            Contactos liberados:

            👨‍🌾 Ganadero:
            ${users.requester_name}
            ${users.requester_phone}

            🚛 Transportista:
            ${users.transporter_name}
            ${users.transporter_phone}

            📦 Ahora ve a MIS VIAJES para continuar:

            • Crear despacho
            • Confirmar carga
            • Iniciar viaje
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
      pickup_lat,
      pickup_lng,
      notes,
      signed_by,
      event_local_time,
    } = req.body;

    const localTimeFormatted =
      new Date(
        event_local_time || new Date()
      ).toLocaleString('es-BO');

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
          event_lat,
          event_lng,
          notes,
          created_by,
          event_local_time
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        RETURNING *
        `,
        [
          negotiation_id,
          'dispatch',
          photo_url,
          signature_url,
          pickup_lat,
          pickup_lng,
          notes,
          userId,
          event_local_time,
        ]
      );

    await pool.query(
      `
      UPDATE transport_negotiations
      SET status = 'delivery_pending'
      WHERE id = $1
      `,
      [negotiation_id]
    );

    await admin
      .firestore()
      .collection('transport_negotiations')
      .doc(negotiation_id.toString())
      .collection('messages')
      .add({
        sender_id: 0,
        system: true,
        message:
        `🚛 Carga despachada correctamente.

        📍 Punto de carga registrado.
        ✍️ Firma registrada por: ${signed_by}
        🕒 Hora: ${localTimeFormatted}

        📦 El ganadero debe tramitar y adjuntar la guía oficial para continuar.`,
        photo_url,
        signature_url,
        lat: pickup_lat,
        lng: pickup_lng,
        created_at:
          admin.firestore.FieldValue.serverTimestamp(),
      });

    await sendUserNotification({
      userId:
        negotiation.requester_id,
      title:
        'Carga despachada',
      body:
        'El camionero registró la carga. Revisa el informe y genera la guía oficial.',
      data: {
        type: 'transport_dispatch',
        negotiation_id,
      },
    });

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

const prepareTrip = async (req, res) => {
  try {
    const userId =
      req.user.user_id;

    const {
      negotiation_id,
    } = req.body;

    const negotiationRes =
      await pool.query(
        `
        SELECT *
        FROM transport_negotiations
        WHERE id = $1
        AND transporter_id = $2
        AND status = 'paid'
        LIMIT 1
        `,
        [
          negotiation_id,
          userId,
        ]
      );

    if (
      negotiationRes.rows.length === 0
    ) {
      return res.status(404).json({
        error:
          'Negociación no válida',
      });
    }

    await pool.query(
      `
      UPDATE transport_negotiations
      SET status = 'trip_active'
      WHERE id = $1
      `,
      [negotiation_id]
    );

    res.json({
      success: true,
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        'Error preparando viaje',
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

    /// PRIMERO VALIDAR QUE SEA EL CAMIONERO
    if (
      negotiation.transporter_id !== userId
    ) {
      return res.status(403).json({
        error:
          'Solo el camionero puede enviar ubicación',
      });
    }

    /// SI ES EL PRIMER TRACKING → ARRANCA EL VIAJE
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

    /// GUARDAR TRACKING
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

const startTrip = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const { negotiation_id } = req.body;

    const negotiationRes = await pool.query(
      `
      SELECT *
      FROM transport_negotiations
      WHERE id = $1
      LIMIT 1
      `,
      [negotiation_id]
    );

    if (negotiationRes.rows.length === 0) {
      return res.status(404).json({
        error: 'Negociación no encontrada',
      });
    }

    const negotiation = negotiationRes.rows[0];

    if (negotiation.transporter_id !== userId) {
      return res.status(403).json({
        error:
          'Solo el camionero puede iniciar viaje',
      });
    }

    await pool.query(
      `
      UPDATE transport_negotiations
      SET
        status = 'trip_active',
        trip_started_at = NOW()
      WHERE id = $1
      `,
      [negotiation_id]
    );

    res.json({
      success: true,
      message: 'Viaje iniciado correctamente',
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error iniciando viaje',
    });
  }
};

const finishTrip = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const {
      negotiation_id,
      latitude,
      longitude,
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
        error:
          'Solo el camionero puede finalizar el viaje',
      });
    }

    await pool.query(
      `
      UPDATE transport_negotiations
      SET
        status = 'delivery_pending',
        delivered_at = NOW(),
        real_destination_lat = $1,
        real_destination_lng = $2
      WHERE id = $3
      `,
      [
        latitude,
        longitude,
        negotiation_id,
      ]
    );

    res.json({
      success: true,
      message:
        'Viaje finalizado correctamente',
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        'Error finalizando viaje',
    });
  }
};

const createDeliveryReport =
  async (req, res) => {
    try {
      const userId =
        req.user.user_id;

      const {
        negotiation_id,

        male_0_12,
        female_0_12,

        male_13_24,
        female_13_24,

        male_25_36,
        female_25_36,

        male_36_plus,
        female_36_plus,

        receiver_name,
        receiver_ci,
        delivery_photo_url,
        receiver_signature_url,
        delivery_lat,
        delivery_lng,
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
          error:
            'Negociación no encontrada',
        });
      }

      const negotiation =
        negotiationRes.rows[0];

      if (negotiation.status === 'delivered') {
        return res.status(400).json({
          error: 'Este viaje ya fue entregado',
        });
      }

      if (
        negotiation.transporter_id !== userId
      ) {
        return res.status(403).json({
          error:
            'Solo el camionero puede cerrar la entrega',
        });
      }

      const result =
        await pool.query(
          `
          INSERT INTO transport_delivery_reports (
            negotiation_id,

            male_0_12,
            female_0_12,

            male_13_24,
            female_13_24,

            male_25_36,
            female_25_36,

            male_36_plus,
            female_36_plus,

            receiver_name,
            receiver_ci,
            delivery_photo_url,
            receiver_signature_url,
            delivery_lat,
            delivery_lng,
            event_local_time,
            notes
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,
            $10,$11,$12,$13,$14,$15,$16,$17
          )
          RETURNING *
          `,
            [
              negotiation_id,

              male_0_12,
              female_0_12,

              male_13_24,
              female_13_24,

              male_25_36,
              female_25_36,

              male_36_plus,
              female_36_plus,

              receiver_name,
              receiver_ci,
              delivery_photo_url,
              receiver_signature_url,
              delivery_lat,
              delivery_lng,
              event_local_time || new Date(),
              notes,
            ]
        );

      await pool.query(
        `
        UPDATE transport_negotiations
        SET status = 'delivered'
        WHERE id = $1
        `,
        [negotiation_id]
      );

      await pool.query(
        `
        UPDATE transport_public_tracking
        SET active = false
        WHERE negotiation_id = $1
        `,
        [negotiation_id]
      );      

    await admin
      .firestore()
      .collection('transport_negotiations')
      .doc(negotiation_id.toString())
      .collection('messages')
      .add({
        sender_id: 0,
        system: true,
        message:
    `✅ Entrega completada.

    👤 Recibido por: ${receiver_name}
    🪪 CI: ${receiver_ci}

    📍 Punto final registrado.

    📝 Observaciones:
    ${notes && notes.trim().isNotEmpty ? notes : 'Sin observaciones'}`,
        photo_url: delivery_photo_url,
        signature_url: receiver_signature_url,
        lat: delivery_lat,
        lng: delivery_lng,
        created_at:
          admin.firestore.FieldValue.serverTimestamp(),
      });

      await sendUserNotification({
        userId: negotiation.requester_id,
        title: 'Entrega completada',
        body: 'El camionero registró la entrega del ganado. Revisa la planilla de entrega.',
        data: {
          type: 'transport_delivery',
          negotiation_id,
        },
      });

      res.json(
        result.rows[0]
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error creando planilla de entrega',
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
    (
      (
        tn.transporter_id = $1
        AND tn.hidden_by_transporter = false
      )
      OR
      (
        tn.requester_id = $1
        AND tn.hidden_by_requester = false
      )
    )
    AND tn.status NOT IN (
      'delivered',
      'cancelled'
    )

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

const getMyIncomingTrips = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const result = await pool.query(
      `
      SELECT
        tn.id,
        tn.status,
        tn.price,
        tn.created_at,

        tr.origin,
        tr.destination,
        tr.quantity,
        tr.animal_type,

        tt.plate,
        tt.capacity,
        tt.driver_name

      FROM transport_negotiations tn
      INNER JOIN transport_requests tr
        ON tr.id = tn.request_id
      INNER JOIN transporter_trucks tt
        ON tt.user_id = tn.transporter_id

      WHERE tr.user_id = $1
        AND tn.status IN (
          'paid',
          'loading_completed',
          'trip_active',
          'delivery_pending'
        )

      ORDER BY tn.id DESC
      `,
      [userId]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error obteniendo viajes del ganadero',
    });
  }
};
  
const getMyOpenNegotiations = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const result = await pool.query(
      `
      SELECT DISTINCT ON (tn.id)
        tn.id,
        tn.status,
        tn.created_at,

        tr.origin,
        tr.destination,
        tr.quantity,
        tr.animal_type,
        tr.travel_date,
        tr.notes,

        tt.plate,
        tt.brand,
        tt.model

      FROM transport_negotiations tn

      JOIN transport_requests tr
        ON tn.request_id = tr.id

      JOIN transporter_trucks tt
        ON tn.truck_id = tt.id

      WHERE
        tn.transporter_id = $1
        AND tn.hidden_by_transporter = false
        AND tn.status IN (
          'open',
          'payment_pending'
        )

      ORDER BY tn.id DESC
      `,
      [userId]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error obteniendo negociaciones abiertas',
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

      negotiation.is_requester =
        negotiation.requester_id ===
        req.user.user_id;

        let route = null;

        const requestResult =
          await pool.query(
            `
            SELECT *
            FROM transport_requests
            WHERE id = $1
            LIMIT 1
            `,
            [negotiation.request_id]
          );

        if (
          requestResult.rows.length > 0
        ) {
          const request =
            requestResult.rows[0];

          if (
            request.approx_dropoff_saved_location_id
          ) {
            const routeResult =
              await pool.query(
                `
                SELECT *
                FROM transport_location_routes
                WHERE saved_location_id = $1
                ORDER BY id ASC
                LIMIT 1
                `,
                [
                  request.approx_dropoff_saved_location_id
                ]
              );

            if (
              routeResult.rows.length > 0
            ) {
              route = routeResult.rows[0];
            }
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

const getGuideByNegotiation =
  async (req, res) => {
    try {
      const { negotiationId } =
        req.params;

      const result =
        await pool.query(
          `
          SELECT *
          FROM transport_guides
          WHERE negotiation_id = $1
          LIMIT 1
          `,
          [negotiationId]
        );

      if (
        result.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            'Guía no encontrada',
        });
      }

      res.json(
        result.rows[0]
      );
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error obteniendo guía',
      });
    }
  };

const archiveTransportNegotiation =
  async (req, res) => {
    try {
      const userId =
        req.user.user_id;

      const {
        negotiation_id,
      } = req.body;

      const result =
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
        result.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            'Negociación no encontrada',
        });
      }

      const negotiation =
        result.rows[0];

      if (
        negotiation.requester_id === userId
      ) {
        await pool.query(
          `
          UPDATE transport_negotiations
          SET hidden_by_requester = true
          WHERE id = $1
          `,
          [negotiation_id]
        );
      }

      if (
        negotiation.transporter_id === userId
      ) {
        await pool.query(
          `
          UPDATE transport_negotiations
          SET hidden_by_transporter = true
          WHERE id = $1
          `,
          [negotiation_id]
        );
      }

      res.json({
        success: true,
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error archivando negociación',
      });
    }
  };

const getMyTripsHistory =
  async (req, res) => {
    try {
      const userId =
        req.user.user_id;

      const result =
        await pool.query(
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

            tg.id AS guide_id,
            tvr.id AS review_id,
            tvr.rating

          FROM transport_negotiations tn

          JOIN transport_requests tr
            ON tn.request_id = tr.id

          JOIN transporter_trucks tt
            ON tn.truck_id = tt.id

          LEFT JOIN transport_guides tg
            ON tg.negotiation_id = tn.id

          LEFT JOIN transport_reviews tvr
            ON tvr.negotiation_id = tn.id

            WHERE
            (
              tn.transporter_id = $1
              OR tn.requester_id = $1
            )
            AND tn.status IN (
              'delivered',
              'cancelled'
            )

          ORDER BY tn.id, tg.created_at DESC
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
          'Error obteniendo historial',
      });
    }
  };

const getRequesterTripsHistory =
  async (req, res) => {
    try {
      const userId = req.user.user_id;

      const result = await pool.query(
        `
        SELECT
          tn.id,
          tn.status,
          tn.created_at,

          tr.origin,
          tr.destination,
          tr.quantity,
          tr.animal_type,

          tt.plate,
          tt.brand,
          tt.model,

          tvr.id AS review_id,
          tvr.rating

        FROM transport_negotiations tn

        JOIN transport_requests tr
          ON tn.request_id = tr.id

        JOIN transporter_trucks tt
          ON tn.truck_id = tt.id

        LEFT JOIN transport_reviews tvr
          ON tvr.negotiation_id = tn.id

        WHERE tn.requester_id = $1
        AND tn.status = 'delivered'

        ORDER BY tn.id DESC
        `,
        [userId]
      );

      res.json(result.rows);

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error obteniendo historial del ganadero',
      });
    }
  };


const createTransportReview = async (
  req,
  res
) => {
  try {
    const userId = req.user.user_id;

    const {
      negotiation_id,
      rating,
      comment,
    } = req.body;

    const negotiationRes =
      await pool.query(
        `
        SELECT *
        FROM transport_negotiations
        WHERE id = $1
        AND status = 'delivered'
        LIMIT 1
        `,
        [negotiation_id]
      );

    if (
      negotiationRes.rows.length === 0
    ) {
      return res.status(404).json({
        error:
          'Viaje no válido',
      });
    }

    const negotiation =
      negotiationRes.rows[0];

    if (
      negotiation.requester_id !== userId
    ) {
      return res.status(403).json({
        error:
          'Solo el ganadero puede calificar',
      });
    }

    const existing =
      await pool.query(
        `
        SELECT id
        FROM transport_reviews
        WHERE negotiation_id = $1
        LIMIT 1
        `,
        [negotiation_id]
      );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        error:
          'Este viaje ya fue calificado',
      });
    }

    const result =
      await pool.query(
        `
        INSERT INTO transport_reviews (
          negotiation_id,
          requester_id,
          transporter_id,
          rating,
          comment
        )
        VALUES ($1,$2,$3,$4,$5)
        RETURNING *
        `,
        [
          negotiation_id,
          negotiation.requester_id,
          negotiation.transporter_id,
          rating,
          comment || null,
        ]
      );

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        'Error creando calificación',
    });
  }
};

const getTransportDashboard =
  async (req, res) => {
    try {
      const userId =
        req.user.user_id;

      const truckRes =
        await pool.query(
          `
          SELECT COUNT(*)::int AS total
          FROM transporter_trucks
          WHERE user_id = $1
          AND is_active = true
          `,
          [userId]
        );

      const activeTripsRes =
        await pool.query(
          `
          SELECT COUNT(*)::int AS total
          FROM transport_negotiations
          WHERE
          (
            transporter_id = $1
            OR requester_id = $1
          )
          AND status NOT IN (
            'delivered',
            'cancelled'
          )
          `,
          [userId]
        );

      const historyRes =
        await pool.query(
          `
          SELECT COUNT(*)::int AS total
          FROM transport_negotiations
          WHERE
          (
            transporter_id = $1
            OR requester_id = $1
          )
          AND status IN (
            'delivered',
            'cancelled'
          )
          `,
          [userId]
        );

      res.json({
        trucks:
          truckRes.rows[0].total,
        active_trips:
          activeTripsRes.rows[0].total,
        history:
          historyRes.rows[0].total,
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error obteniendo dashboard',
      });
    }
  };

const rejectTransportRequest =
  async (req, res) => {
    try {
      const transporterId =
        req.user.user_id;

      const { request_id } =
        req.body;

      const requestRes =
        await pool.query(
          `
          SELECT id
          FROM transport_requests
          WHERE id = $1
          AND status = 'open'
          LIMIT 1
          `,
          [request_id]
        );

      if (
        requestRes.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            'Solicitud no disponible',
        });
      }

      await pool.query(
        `
        INSERT INTO transport_request_rejections (
          request_id,
          transporter_id
        )
        VALUES ($1,$2)
        ON CONFLICT (
          request_id,
          transporter_id
        )
        DO NOTHING
        `,
        [
          request_id,
          transporterId,
        ]
      );

      res.json({
        success: true,
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error rechazando solicitud',
      });
    }
  };

const cancelTransportRequest =
  async (req, res) => {
    try {
      const userId =
        req.user.user_id;

      const { request_id } =
        req.body;

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

      if (request.user_id !== userId) {
        return res.status(403).json({
          error:
            'No autorizado',
        });
      }

      await pool.query(
        `
        UPDATE transport_requests
        SET status = 'cancelled'
        WHERE id = $1
        `,
        [request_id]
      );

      await pool.query(
        `
        UPDATE transport_negotiations
        SET status = 'cancelled'
        WHERE request_id = $1
        AND status = 'open'
        `,
        [request_id]
      );

      res.json({
        success: true,
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error cancelando solicitud',
      });
    }
  };

const createSavedLocation = async (
  req,
  res
) => {
  try {
    const userId = req.user.user_id;

    const {
      name,
      type,
      latitude,
      longitude,
      notes,
    } = req.body;

    const result = await pool.query(
      `
      INSERT INTO transport_saved_locations (
        user_id,
        name,
        type,
        latitude,
        longitude,
        notes
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [
        userId,
        name,
        type || 'custom',
        latitude,
        longitude,
        notes || null,
      ]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
          'Error guardando ubicación',
    });
  }
};

const getMySavedLocations = async (
  req,
  res
) => {
  try {
    const userId = req.user.user_id;

    const result = await pool.query(
      `
      SELECT *
      FROM transport_saved_locations
      WHERE user_id = $1
      ORDER BY name ASC
      `,
      [userId]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
          'Error cargando ubicaciones',
    });
  }
};

const deleteSavedLocation = async (
  req,
  res
) => {
  try {
    const userId = req.user.user_id;
    const { id } = req.params;

    await pool.query(
      `
      DELETE FROM transport_saved_locations
      WHERE id = $1
      AND user_id = $2
      `,
      [id, userId]
    );

    res.json({
      success: true,
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
          'Error eliminando ubicación',
    });
  }
};

const createLocationRoute = async (req, res) => {
  try {
    const {
      saved_location_id,
      name,
      route_type,
      route_points,
    } = req.body;

    const result = await pool.query(
      `
      INSERT INTO transport_location_routes (
        saved_location_id,
        name,
        route_type,
        route_points
      )
      VALUES ($1,$2,$3,$4)
      RETURNING *
      `,
      [
        saved_location_id,
        name,
        route_type,
        route_points,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error creando ruta',
    });
  }
};

const getLocationRoutes = async (req, res) => {
  try {
    const { saved_location_id } = req.params;

    const result = await pool.query(
      `
      SELECT *
      FROM transport_location_routes
      WHERE saved_location_id = $1
      ORDER BY created_at DESC
      `,
      [saved_location_id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error obteniendo rutas',
    });
  }
};

const getSharedTripMap = async (req, res) => {
  try {
    const { negotiation_id } = req.params;

    const negotiationRes =
      await pool.query(
        `
        SELECT
          real_origin_lat,
          real_origin_lng,
          destination_lat,
          destination_lng,
          status
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
        error: 'Viaje no encontrado',
      });
    }

    const trackingRes =
      await pool.query(
        `
        SELECT *
        FROM transport_trip_tracking
        WHERE negotiation_id = $1
        ORDER BY created_at ASC
        `,
        [negotiation_id]
      );

    res.json({
      negotiation:
        negotiationRes.rows[0],
      tracking:
        trackingRes.rows,
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error:
        'Error obteniendo mapa compartido',
    });
  }
};

const getRequesterTrips = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const result = await pool.query(
      `
      SELECT
        tn.id,
        tn.status,

        tr.origin,
        tr.destination,
        tr.quantity,

        tn.destination_lat,
        tn.destination_lng,

        tt.plate,

        (
          SELECT tracked_at
          FROM transport_trip_tracking
          WHERE negotiation_id = tn.id
          ORDER BY id DESC
          LIMIT 1
        ) as last_tracking,

        (
          SELECT latitude
          FROM transport_trip_tracking
          WHERE negotiation_id = tn.id
          ORDER BY id DESC
          LIMIT 1
        ) as current_lat,

        (
          SELECT longitude
          FROM transport_trip_tracking
          WHERE negotiation_id = tn.id
          ORDER BY id DESC
          LIMIT 1
        ) as current_lng

      FROM transport_negotiations tn
      LEFT JOIN transporter_trucks tt
        ON tt.user_id = tn.transporter_id
      LEFT JOIN transport_requests tr
        ON tr.id = tn.request_id
      WHERE tn.requester_id = $1
      AND tn.status IN (
        'paid',
        'loading_completed',
        'trip_active',
        'delivery_pending'
      )
      ORDER BY tn.id DESC
      `,
      [userId]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error obteniendo viajes del ganadero',
    });
  }
};



module.exports = {
  registerTruck,
  getMyTruck,
  toggleTruckAvailability,
  updateMyTruck,
  createTripCashbox,
  addTripCashboxItem,
  getTripCashbox,
  getMyTripCashboxes,
  getMyTruckReviews,  
  closeTripCashbox,
  createGuide,
  getMyGuides,
  getSharedGuide,
  createPublicTracking,
  getPublicTracking,  
  disablePublicTracking,
  createTransportRequest,
  getTransportNegotiationDetails,
  getTransportRoutePoints,
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
  getMyOpenNegotiations,
  getMyIncomingTrips,
  getTripMapData,
  startTrip,
  finishTrip,
  createDeliveryReport,
  getGuideByNegotiation, 
  archiveTransportNegotiation,
  getMyTripsHistory,
  getRequesterTripsHistory,
  getTransportDashboard, 
  rejectTransportRequest, 
  cancelTransportRequest,
  createSavedLocation,
  getMySavedLocations,
  deleteSavedLocation,
  createLocationRoute,
  getLocationRoutes,
  getSharedTripMap,
  getRequesterTrips,
  prepareTrip,
  createTransportReview,
};