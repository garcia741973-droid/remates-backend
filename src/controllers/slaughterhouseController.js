const { pool } = require('../config/db');


// =====================================================
// 🔐 VALIDAR OPERADOR DE FRIGORÍFICO
// =====================================================

const getAuthenticatedSlaughterhouseOperator =
  async (req) => {

    const userId =
      Number(req.user?.user_id);

    const companyId =
      Number(req.user?.company_id);

    const role =
      req.user?.role;


    if (
      !userId ||
      !companyId ||
      role !== 'slaughterhouse_operator'
    ) {

      return null;
    }


    const result =
      await pool.query(
        `
        SELECT

          uc.user_id,

          uc.company_id,

          uc.role,

          uc.company_status,

            c.name AS company_name,

            c.company_type,

            c.plant_lat,

            c.plant_lng,

            c.is_active

        FROM user_companies uc

        JOIN companies c
          ON c.id = uc.company_id

        WHERE
          uc.user_id = $1
          AND uc.company_id = $2
          AND uc.role = 'slaughterhouse_operator'
          AND uc.company_status = 'approved'
          AND c.company_type = 'slaughterhouse'
          AND c.is_active = true

        LIMIT 1
        `,
        [
          userId,
          companyId,
        ],
      );


    if (
      result.rows.length === 0
    ) {

      return null;
    }


    return result.rows[0];
  };


// =====================================================
// 🚛 CAMIONES DEL FRIGORÍFICO
//
// SOLO LECTURA.
//
// Devuelve todos los viajes activos contratados
// por la empresa del operador autenticado.
// =====================================================

exports.getSlaughterhouseTrucks =
  async (req, res) => {

    try {

      const operator =
        await getAuthenticatedSlaughterhouseOperator(
          req,
        );


      if (!operator) {

        return res.status(403).json({
          error:
            'No autorizado para operaciones de frigorífico',
        });
      }


      const companyId =
        Number(
          operator.company_id,
        );


      const result =
        await pool.query(
          `
          SELECT

            tn.id
              AS negotiation_id,

            tn.status,

            tn.trip_started_at,

            tr.id
              AS request_id,

            tr.user_id
              AS request_created_by,

            tr.requester_company_id,

            tr.origin,

            tr.destination,

            tr.quantity,

            tr.animal_type,

            tr.travel_date,

            tr.notes
              AS request_notes,

            tt.id
              AS truck_id,

            tt.plate,

            tt.brand,

            tt.model,

            tt.year,

            tt.truck_type,

            tt.capacity_large,

            tt.capacity_small,

            tt.has_trailer,

            tn.transporter_id,

            transporter.name
              AS transporter_name,

            transporter.full_name
              AS transporter_full_name,

            transporter.phone
              AS transporter_phone,

            last_tracking.latitude
              AS last_latitude,

            last_tracking.longitude
              AS last_longitude,

            last_tracking.speed
              AS last_speed,

            last_tracking.tracked_at
              AS last_tracked_at

          FROM transport_negotiations tn

          JOIN transport_requests tr
            ON tr.id = tn.request_id

          JOIN transporter_trucks tt
            ON tt.id = tn.truck_id

          JOIN users transporter
            ON transporter.id =
              tn.transporter_id

          LEFT JOIN LATERAL (

            SELECT

              ttt.latitude,

              ttt.longitude,

              ttt.speed,

              ttt.tracked_at

            FROM transport_trip_tracking ttt

            WHERE
              ttt.negotiation_id =
                tn.id

            ORDER BY
              ttt.tracked_at DESC

            LIMIT 1

          ) last_tracking
            ON true

          WHERE

            tr.requester_company_id = $1

            AND tn.status IN (

              'paid',

              'loading_completed',

              'trip_active',

              'in_trip',

              'delivery_pending'

            )

          ORDER BY

            CASE tn.status

              WHEN 'trip_active'
                THEN 1

              WHEN 'in_trip'
                THEN 2

              WHEN 'delivery_pending'
                THEN 3

              WHEN 'loading_completed'
                THEN 4

              WHEN 'paid'
                THEN 5

              ELSE 6

            END,

            tn.id DESC
          `,
          [
            companyId,
          ],
        );


      return res.json({

        company: {

        id:
            companyId,

        name:
            operator.company_name,

        plant_lat:
            operator.plant_lat,

        plant_lng:
            operator.plant_lng,

        },

        trucks:
          result.rows,

      });


    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE TRUCKS ERROR:',
        error,
      );


      return res.status(500).json({
        error:
          'Error obteniendo camiones del frigorífico',
      });
    }
  };

// =====================================================
// 🐄 RECIBIR GANADO EN FRIGORÍFICO
//
// POST /slaughterhouse/receptions
//
// Convierte un transporte contratado por el frigorífico
// en un lote recibido de planta.
//
// NO modifica el estado de Plaza Transporte.
// =====================================================

// =====================================================
// 🐄 CAMIONES DISPONIBLES PARA RECEPCIÓN
//
// GET /slaughterhouse/reception-candidates
//
// - Solo camiones contratados por el frigorífico.
// - Incluye datos de la guía.
// - Informa si el viaje ya llegó.
// - Excluye camiones ya recepcionados.
// =====================================================

exports.getSlaughterhouseReceptionCandidates =
  async (req, res) => {

    try {

      const operator =
        await getAuthenticatedSlaughterhouseOperator(
          req,
        );


      if (!operator) {

        return res.status(403).json({
          error:
            'No autorizado para operaciones de frigorífico',
        });
      }


      const companyId =
        Number(
          operator.company_id,
        );


      const result =
        await pool.query(
          `
          SELECT

            tn.id
              AS negotiation_id,

            tn.status,

            tn.trip_started_at,

            tn.delivered_at,

            tr.id
              AS request_id,

            tr.origin,

            tr.destination,

            tr.animal_type,

            tr.quantity
              AS request_quantity,

            tt.id
              AS truck_id,

            tt.plate,

            tt.brand,

            tt.model,

            tn.transporter_id,

            transporter.name
              AS transporter_name,

            transporter.full_name
              AS transporter_full_name,

            tg.id
              AS guide_id,

            tg.guide_image_url,

            COALESCE(
              tg.male_0_12,
              0
            )::int
              AS male_0_12,

            COALESCE(
              tg.female_0_12,
              0
            )::int
              AS female_0_12,

            COALESCE(
              tg.male_13_24,
              0
            )::int
              AS male_13_24,

            COALESCE(
              tg.female_13_24,
              0
            )::int
              AS female_13_24,

            COALESCE(
              tg.male_25_36,
              0
            )::int
              AS male_25_36,

            COALESCE(
              tg.female_25_36,
              0
            )::int
              AS female_25_36,

            COALESCE(
              tg.male_36_plus,
              0
            )::int
              AS male_36_plus,

            COALESCE(
              tg.female_36_plus,
              0
            )::int
              AS female_36_plus,

            (
              COALESCE(
                tg.male_0_12,
                0
              )
              +
              COALESCE(
                tg.female_0_12,
                0
              )
              +
              COALESCE(
                tg.male_13_24,
                0
              )
              +
              COALESCE(
                tg.female_13_24,
                0
              )
              +
              COALESCE(
                tg.male_25_36,
                0
              )
              +
              COALESCE(
                tg.female_25_36,
                0
              )
              +
              COALESCE(
                tg.male_36_plus,
                0
              )
              +
              COALESCE(
                tg.female_36_plus,
                0
              )
            )::int
              AS guide_quantity,

            CASE
              WHEN tn.delivered_at
                IS NULL
              THEN false

              WHEN tg.id
                IS NULL
              THEN false

              ELSE true
            END
              AS can_receive,

            CASE
              WHEN tn.delivered_at
                IS NULL
              THEN
                'El camión todavía no finalizó la ruta'

              WHEN tg.id
                IS NULL
              THEN
                'El transporte no tiene guía registrada'

              ELSE NULL
            END
              AS blocked_reason

          FROM transport_negotiations tn

          JOIN transport_requests tr
            ON tr.id =
              tn.request_id

          JOIN transporter_trucks tt
            ON tt.id =
              tn.truck_id

          JOIN users transporter
            ON transporter.id =
              tn.transporter_id

          LEFT JOIN LATERAL (

            SELECT
              tg2.*

            FROM transport_guides tg2

            WHERE
              tg2.negotiation_id =
                tn.id

            ORDER BY
              tg2.id DESC

            LIMIT 1

          ) tg
            ON true

          LEFT JOIN
            slaughterhouse_reception_trucks srt
            ON srt.transport_negotiation_id =
              tn.id

          WHERE

            tr.requester_company_id =
              $1

            AND srt.id
              IS NULL

            AND tn.status IN (

              'paid',

              'loading_completed',

              'trip_active',

              'in_trip',

              'delivery_pending',

              'delivered'

            )

          ORDER BY

            CASE

              WHEN tn.delivered_at
                IS NOT NULL
                AND tg.id
                  IS NOT NULL
              THEN 1

              WHEN tn.delivered_at
                IS NOT NULL
              THEN 2

              ELSE 3

            END,

            tn.id DESC
          `,
          [
            companyId,
          ],
        );


      return res.json({

        company: {

          id:
            companyId,

          name:
            operator.company_name,

        },

        trucks:
          result.rows,

      });


    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE RECEPTION CANDIDATES ERROR:',
        error,
      );


      return res.status(500).json({
        error:
          'Error obteniendo transportes para recepción',
      });
    }
  };

exports.createSlaughterhouseReception =
  async (req, res) => {

    try {

      const operator =
        await getAuthenticatedSlaughterhouseOperator(
          req,
        );


      if (!operator) {

        return res.status(403).json({
          error:
            'No autorizado para operaciones de frigorífico',
        });
      }


      const companyId =
        Number(
          operator.company_id,
        );

      const userId =
        Number(
          operator.user_id,
        );


      const negotiationId =
        Number(
          req.body.negotiation_id,
        );

      const receivedQuantity =
        Number(
          req.body.received_quantity,
        );

      const liveWeight =
        Number(
          req.body.live_weight,
        );

      const receptionNotes =
        req.body.reception_notes
          ?.toString()
          .trim() || null;


      // =================================================
      // VALIDACIONES
      // =================================================

      if (
        !Number.isInteger(
          negotiationId
        ) ||
        negotiationId <= 0
      ) {

        return res.status(400).json({
          error:
            'Negociación inválida',
        });
      }


      if (
        !Number.isInteger(
          receivedQuantity
        ) ||
        receivedQuantity <= 0
      ) {

        return res.status(400).json({
          error:
            'La cantidad recibida debe ser mayor a cero',
        });
      }


      if (
        !Number.isFinite(
          liveWeight
        ) ||
        liveWeight <= 0
      ) {

        return res.status(400).json({
          error:
            'El peso vivo debe ser mayor a cero',
        });
      }


      // =================================================
      // VERIFICAR SI YA FUE RECIBIDO
      // =================================================

      const existing =
        await pool.query(
          `
          SELECT
            id,
            company_id,
            transport_negotiation_id,
            received_at,
            status

          FROM slaughterhouse_lots

          WHERE
            company_id = $1
            AND transport_negotiation_id = $2

          LIMIT 1
          `,
          [
            companyId,
            negotiationId,
          ],
        );


      if (
        existing.rows.length > 0
      ) {

        return res.status(409).json({
          error:
            'Este transporte ya fue recibido',
          lot:
            existing.rows[0],
        });
      }


      // =================================================
      // CREAR LOTE DESDE TRANSPORTE
      // =================================================

      const result =
        await pool.query(
          `
          INSERT INTO slaughterhouse_lots (

            company_id,

            source_type,

            transport_negotiation_id,

            transport_request_id,

            truck_id,

            transporter_id,

            animal_type,

            expected_quantity,

            received_quantity,

            live_weight,

            origin_snapshot,

            plate_snapshot,

            reception_notes,

            received_by,

            received_at,

            status

          )

          SELECT

            $1,

            'transport',

            tn.id,

            tr.id,

            tt.id,

            tn.transporter_id,

            tr.animal_type,

            tr.quantity,

            $3,

            $4,

            tr.origin,

            tt.plate,

            $5,

            $6,

            NOW(),

            'received'

          FROM transport_negotiations tn

          JOIN transport_requests tr
            ON tr.id = tn.request_id

          JOIN transporter_trucks tt
            ON tt.id = tn.truck_id

          WHERE

            tn.id = $2

            AND tr.requester_company_id = $1

            AND tn.status IN (

              'paid',

              'loading_completed',

              'trip_active',

              'in_trip',

              'delivery_pending'

            )

          RETURNING *
          `,
          [
            companyId,
            negotiationId,
            receivedQuantity,
            liveWeight,
            receptionNotes,
            userId,
          ],
        );


      if (
        result.rows.length === 0
      ) {

        return res.status(404).json({
          error:
            'No se encontró un transporte válido de este frigorífico',
        });
      }


      return res.status(201).json({

        message:
          'Ganado recibido correctamente',

        lot:
          result.rows[0],

      });


    } catch (error) {

      console.error(
        'CREATE SLAUGHTERHOUSE RECEPTION ERROR:',
        error,
      );


      if (
        error.code === '23505'
      ) {

        return res.status(409).json({
          error:
            'Este transporte ya fue recibido',
        });
      }


      return res.status(500).json({
        error:
          'Error registrando recepción de ganado',
      });
    }
  };  