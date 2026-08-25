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

// =====================================================
// 📋 RECEPCIONES ABIERTAS DEL FRIGORÍFICO
//
// GET /slaughterhouse/receptions/open
// =====================================================

exports.getOpenSlaughterhouseReceptions =
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

            sr.id,

            sr.reception_number,

            sr.plant_lot_number,

            sr.status,

            sr.opened_at,

            COUNT(
              srt.id
            )::int
              AS trucks_count,

            COALESCE(
              SUM(
                srt.guide_quantity
              ),
              0
            )::int
              AS guide_quantity_total,

            COALESCE(
              SUM(
                srt.received_quantity
              ),
              0
            )::int
              AS received_quantity_total

          FROM slaughterhouse_receptions sr

          LEFT JOIN
            slaughterhouse_reception_trucks srt
            ON srt.reception_id =
              sr.id

          WHERE

            sr.company_id = $1

            AND sr.status =
              'open'

          GROUP BY

            sr.id,

            sr.reception_number,

            sr.plant_lot_number,

            sr.status,

            sr.opened_at

          ORDER BY

            sr.opened_at DESC,

            sr.id DESC
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

        receptions:
          result.rows,

      });


    } catch (error) {

      console.error(
        'GET OPEN SLAUGHTERHOUSE RECEPTIONS ERROR:',
        error,
      );


      return res.status(500).json({
        error:
          'Error obteniendo recepciones abiertas',
      });

    }
  };

exports.createSlaughterhouseReception =
  async (req, res) => {

    const client =
      await pool.connect();

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

      const existingReceptionId =
        req.body.reception_id == null
          ? null
          : Number(
              req.body.reception_id,
            );

      const plantLotNumber =
        req.body.plant_lot_number
          ?.toString()
          .trim() || null;

      const receivedQuantity =
        Number(
          req.body.received_quantity,
        );

      const liveWeightKg =
        req.body.live_weight_kg == null ||
        req.body.live_weight_kg === ''
          ? null
          : Number(
              req.body.live_weight_kg,
            );

      const receptionNotes =
        req.body.reception_notes
          ?.toString()
          .trim() || null;


      // =================================================
      // VALIDACIONES BÁSICAS
      // =================================================

      if (
        !Number.isInteger(
          negotiationId,
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
          receivedQuantity,
        ) ||
        receivedQuantity < 0
      ) {

        return res.status(400).json({
          error:
            'Cantidad recibida inválida',
        });
      }


      if (
        liveWeightKg != null &&
        (
          !Number.isFinite(
            liveWeightKg,
          ) ||
          liveWeightKg <= 0
        )
      ) {

        return res.status(400).json({
          error:
            'Peso vivo inválido',
        });
      }


      if (
        existingReceptionId != null &&
        (
          !Number.isInteger(
            existingReceptionId,
          ) ||
          existingReceptionId <= 0
        )
      ) {

        return res.status(400).json({
          error:
            'Recepción inválida',
        });
      }


      await client.query(
        'BEGIN',
      );


      // =================================================
      // TRANSPORTE + ÚLTIMA GUÍA
      // =================================================

      const transportResult =
        await client.query(
          `
          SELECT

            tn.id
              AS negotiation_id,

            tn.status,

            tn.delivered_at,

            tn.transporter_id,

            tr.id
              AS request_id,

            tr.requester_company_id,

            tr.origin,

            tr.destination,

            tr.animal_type,

            tr.quantity
              AS request_quantity,

            tt.id
              AS truck_id,

            tt.plate,

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
              AS female_36_plus

          FROM transport_negotiations tn

          JOIN transport_requests tr
            ON tr.id =
              tn.request_id

          JOIN transporter_trucks tt
            ON tt.id =
              tn.truck_id

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

          WHERE

            tn.id = $1

            AND tr.requester_company_id =
              $2

          LIMIT 1

          FOR UPDATE OF tn
          `,
          [
            negotiationId,
            companyId,
          ],
        );


      if (
        transportResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK',
        );

        return res.status(404).json({
          error:
            'Transporte no encontrado para este frigorífico',
        });
      }


      const transport =
        transportResult.rows[0];


      // =================================================
      // EL CAMIÓN DEBE HABER FINALIZADO SU RUTA
      // =================================================

      if (
        transport.delivered_at == null
      ) {

        await client.query(
          'ROLLBACK',
        );

        return res.status(409).json({
          error:
            'El camión todavía no finalizó la ruta',
        });
      }


      // =================================================
      // DEBE EXISTIR GUÍA
      // =================================================

      if (
        transport.guide_id == null
      ) {

        await client.query(
          'ROLLBACK',
        );

        return res.status(409).json({
          error:
            'El transporte no tiene guía registrada',
        });
      }


      const guideQuantity =
        Number(
          transport.male_0_12,
        ) +
        Number(
          transport.female_0_12,
        ) +
        Number(
          transport.male_13_24,
        ) +
        Number(
          transport.female_13_24,
        ) +
        Number(
          transport.male_25_36,
        ) +
        Number(
          transport.female_25_36,
        ) +
        Number(
          transport.male_36_plus,
        ) +
        Number(
          transport.female_36_plus,
        );


      // =================================================
      // SI HAY DIFERENCIA, EXIGIR OBSERVACIÓN
      // =================================================

      if (
        receivedQuantity !==
          guideQuantity &&
        !receptionNotes
      ) {

        await client.query(
          'ROLLBACK',
        );

        return res.status(400).json({
          error:
            'Existe diferencia entre la guía y lo recibido. Debes registrar una observación.',
          guide_quantity:
            guideQuantity,
          received_quantity:
            receivedQuantity,
        });
      }


      // =================================================
      // EVITAR DOBLE RECEPCIÓN DEL MISMO CAMIÓN
      // =================================================

      const alreadyReceived =
        await client.query(
          `
          SELECT
            id,
            reception_id,
            received_at

          FROM slaughterhouse_reception_trucks

          WHERE
            transport_negotiation_id =
              $1

          LIMIT 1
          `,
          [
            negotiationId,
          ],
        );


      if (
        alreadyReceived.rows.length >
          0
      ) {

        await client.query(
          'ROLLBACK',
        );

        return res.status(409).json({
          error:
            'Este transporte ya fue recepcionado',
          reception:
            alreadyReceived.rows[0],
        });
      }


      // =================================================
      // RECEPCIÓN CABECERA
      // =================================================

      let reception;


      if (
        existingReceptionId != null
      ) {

        const receptionResult =
          await client.query(
            `
            SELECT *

            FROM slaughterhouse_receptions

            WHERE
              id = $1
              AND company_id = $2
              AND status = 'open'

            LIMIT 1

            FOR UPDATE
            `,
            [
              existingReceptionId,
              companyId,
            ],
          );


        if (
          receptionResult.rows.length ===
            0
        ) {

          await client.query(
            'ROLLBACK',
          );

          return res.status(404).json({
            error:
              'La recepción seleccionada no existe o ya está cerrada',
          });
        }


        reception =
          receptionResult.rows[0];

      } else {

        const receptionResult =
          await client.query(
            `
            INSERT INTO slaughterhouse_receptions (

              company_id,

              plant_lot_number,

              status,

              created_by,

              opened_at

            )

            VALUES (

              $1,

              $2,

              'open',

              $3,

              NOW()

            )

            RETURNING *
            `,
            [
              companyId,
              plantLotNumber,
              userId,
            ],
          );


        reception =
          receptionResult.rows[0];
      }


      // =================================================
      // AGREGAR CAMIÓN A LA RECEPCIÓN
      // =================================================

      const truckResult =
        await client.query(
          `
          INSERT INTO slaughterhouse_reception_trucks (

            reception_id,

            transport_negotiation_id,

            transport_request_id,

            transport_guide_id,

            truck_id,

            transporter_id,

            plate_snapshot,

            animal_type_snapshot,

            origin_snapshot,

            destination_snapshot,

            guide_quantity,

            received_quantity,

            male_0_12,

            female_0_12,

            male_13_24,

            female_13_24,

            male_25_36,

            female_25_36,

            male_36_plus,

            female_36_plus,

            guide_image_url,

            live_weight_kg,

            transport_delivered_at,

            received_at,

            received_by,

            reception_notes

          )

          VALUES (

            $1,$2,$3,$4,$5,$6,

            $7,$8,$9,$10,

            $11,$12,

            $13,$14,$15,$16,

            $17,$18,$19,$20,

            $21,$22,$23,

            NOW(),

            $24,$25

          )

          RETURNING *
          `,
          [
            reception.id,

            transport.negotiation_id,

            transport.request_id,

            transport.guide_id,

            transport.truck_id,

            transport.transporter_id,

            transport.plate,

            transport.animal_type,

            transport.origin,

            transport.destination,

            guideQuantity,

            receivedQuantity,

            transport.male_0_12,

            transport.female_0_12,

            transport.male_13_24,

            transport.female_13_24,

            transport.male_25_36,

            transport.female_25_36,

            transport.male_36_plus,

            transport.female_36_plus,

            transport.guide_image_url,

            liveWeightKg,

            transport.delivered_at,

            userId,

            receptionNotes,
          ],
        );


      // =================================================
      // ACTUALIZAR CABECERA
      // =================================================

      await client.query(
        `
        UPDATE slaughterhouse_receptions

        SET
          updated_at = NOW()

        WHERE
          id = $1
        `,
        [
          reception.id,
        ],
      );


      await client.query(
        'COMMIT',
      );


      return res.status(201).json({

        message:
          'Ganado recepcionado correctamente',

        reception: {

          id:
            reception.id,

          reception_number:
            reception.reception_number,

          plant_lot_number:
            reception.plant_lot_number,

          status:
            reception.status,

        },

        truck:
          truckResult.rows[0],

      });


    } catch (error) {

      await client.query(
        'ROLLBACK',
      );


      console.error(
        'CREATE SLAUGHTERHOUSE RECEPTION ERROR:',
        error,
      );


      if (
        error.code === '23505'
      ) {

        return res.status(409).json({
          error:
            'Este transporte ya fue recepcionado',
        });
      }


      return res.status(500).json({
        error:
          'Error registrando recepción de ganado',
      });

    } finally {

      client.release();

    }
  };

// =====================================================
// 🏭 INICIAR FAENA
//
// POST /slaughterhouse/receptions/:id/start-slaughter
//
// - Solo operador del frigorífico propietario.
// - La recepción debe estar OPEN.
// - Debe tener al menos un camión recepcionado.
// - Cierra automáticamente la recepción.
// - Inicia la faena.
// =====================================================

exports.startSlaughterhouseSlaughter =
  async (req, res) => {

    const client =
      await pool.connect();

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

      const receptionId =
        Number(
          req.params.id,
        );


      if (
        !Number.isInteger(
          receptionId,
        ) ||
        receptionId <= 0
      ) {

        return res.status(400).json({
          error:
            'Recepción inválida',
        });
      }


      await client.query(
        'BEGIN',
      );


      // =================================================
      // BLOQUEAR Y VALIDAR RECEPCIÓN
      // =================================================

      const receptionResult =
        await client.query(
          `
          SELECT *

          FROM slaughterhouse_receptions

          WHERE
            id = $1
            AND company_id = $2

          LIMIT 1

          FOR UPDATE
          `,
          [
            receptionId,
            companyId,
          ],
        );


      if (
        receptionResult.rows.length ===
          0
      ) {

        await client.query(
          'ROLLBACK',
        );

        return res.status(404).json({
          error:
            'Recepción no encontrada',
        });
      }


      const reception =
        receptionResult.rows[0];


      if (
        reception.status !==
          'open'
      ) {

        await client.query(
          'ROLLBACK',
        );

        return res.status(409).json({
          error:
            `La recepción no puede iniciar faena porque está en estado ${reception.status}`,
        });
      }


      // =================================================
      // RESUMEN DE GANADO RECEPCIONADO
      // =================================================

      const summaryResult =
        await client.query(
          `
          SELECT

            COUNT(*)::int
              AS trucks_count,

            COALESCE(
              SUM(
                guide_quantity
              ),
              0
            )::int
              AS guide_quantity_total,

            COALESCE(
              SUM(
                received_quantity
              ),
              0
            )::int
              AS received_quantity_total,

            COALESCE(
              SUM(
                live_weight_kg
              ),
              0
            )::numeric
              AS live_weight_total_kg

          FROM slaughterhouse_reception_trucks

          WHERE
            reception_id = $1
          `,
          [
            receptionId,
          ],
        );


      const summary =
        summaryResult.rows[0];


      if (
        Number(
          summary.trucks_count,
        ) <= 0
      ) {

        await client.query(
          'ROLLBACK',
        );

        return res.status(409).json({
          error:
            'La recepción no tiene camiones recepcionados',
        });
      }


      if (
        Number(
          summary.received_quantity_total,
        ) <= 0
      ) {

        await client.query(
          'ROLLBACK',
        );

        return res.status(409).json({
          error:
            'La recepción no tiene animales recibidos',
        });
      }


      // =================================================
      // CERRAR RECEPCIÓN + INICIAR FAENA
      // =================================================

      const updatedResult =
        await client.query(
          `
          UPDATE slaughterhouse_receptions

          SET

            status =
              'in_slaughter',

            closed_at =
              NOW(),

            slaughter_started_at =
              NOW(),

            updated_at =
              NOW()

          WHERE
            id = $1

          RETURNING *
          `,
          [
            receptionId,
          ],
        );


      await client.query(
        'COMMIT',
      );


      return res.json({

        message:
          'Faena iniciada correctamente',

        reception:
          updatedResult.rows[0],

        summary: {

          trucks_count:
            Number(
              summary.trucks_count,
            ),

          guide_quantity_total:
            Number(
              summary.guide_quantity_total,
            ),

          received_quantity_total:
            Number(
              summary.received_quantity_total,
            ),

          live_weight_total_kg:
            Number(
              summary.live_weight_total_kg,
            ),

        },

      });


    } catch (error) {

      await client.query(
        'ROLLBACK',
      );


      console.error(
        'START SLAUGHTERHOUSE SLAUGHTER ERROR:',
        error,
      );


      return res.status(500).json({
        error:
          'Error iniciando faena',
      });

    } finally {

      client.release();

    }
  };

// =====================================================
// 🏭 RECEPCIONES PARA FAENA
//
// GET /slaughterhouse/slaughter
// =====================================================

exports.getSlaughterhouseSlaughterReceptions =
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

            sr.id,

            sr.reception_number,

            sr.plant_lot_number,

            sr.status,

            sr.opened_at,

            sr.closed_at,

            sr.slaughter_started_at,

            COALESCE(
              trucks.trucks_count,
              0
            )::int
              AS trucks_count,

            COALESCE(
              trucks.received_quantity_total,
              0
            )::int
              AS received_quantity_total,

            COALESCE(
              trucks.live_weight_total_kg,
              0
            )::numeric
              AS live_weight_total_kg,

            COALESCE(
              carcasses.carcasses_count,
              0
            )::int
              AS carcasses_count,

            COALESCE(
              carcasses.hook_weight_total_kg,
              0
            )::numeric
              AS hook_weight_total_kg

          FROM slaughterhouse_receptions sr

          LEFT JOIN LATERAL (

            SELECT

              COUNT(*)::int
                AS trucks_count,

              COALESCE(
                SUM(
                  srt.received_quantity
                ),
                0
              )::int
                AS received_quantity_total,

              COALESCE(
                SUM(
                  srt.live_weight_kg
                ),
                0
              )::numeric
                AS live_weight_total_kg

            FROM slaughterhouse_reception_trucks srt

            WHERE
              srt.reception_id =
                sr.id

          ) trucks
            ON true

          LEFT JOIN LATERAL (

            SELECT

              COUNT(*)::int
                AS carcasses_count,

              COALESCE(
                SUM(
                  sc.hook_weight_kg
                ),
                0
              )::numeric
                AS hook_weight_total_kg

            FROM slaughterhouse_carcasses sc

            WHERE
              sc.reception_id =
                sr.id

          ) carcasses
            ON true

          WHERE

            sr.company_id = $1

            AND sr.status IN (
              'open',
              'in_slaughter'
            )

          ORDER BY

            CASE
              WHEN sr.status =
                'in_slaughter'
              THEN 1
              ELSE 2
            END,

            sr.opened_at ASC
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

        receptions:
          result.rows,
      });
    } catch (error) {
      console.error(
        'GET SLAUGHTERHOUSE SLAUGHTER RECEPTIONS ERROR:',
        error,
      );

      return res.status(500).json({
        error:
          'Error obteniendo recepciones para faena',
      });
    }
  };

// =====================================================
// 🏭 REGISTRAR PESO DE CARCASA
//
// POST /slaughterhouse/slaughter/:id/carcasses
//
// Body:
// {
//   "hook_weight_kg": 285.4,
//   "plant_carcass_number": null,
//   "notes": null
// }
//
// - Solo frigorífico propietario.
// - Recepción debe estar IN_SLAUGHTER.
// - Número de carcasa automático.
// - No permite superar animales recibidos.
// =====================================================

exports.createSlaughterhouseCarcass =
  async (req, res) => {

    const client =
      await pool.connect();

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

      const receptionId =
        Number(
          req.params.id,
        );

      const hookWeightKg =
        Number(
          req.body.hook_weight_kg,
        );

      const plantCarcassNumber =
        req.body.plant_carcass_number
          ?.toString()
          .trim() || null;

      const notes =
        req.body.notes
          ?.toString()
          .trim() || null;


      // =================================================
      // VALIDACIONES
      // =================================================

      if (
        !Number.isInteger(
          receptionId,
        ) ||
        receptionId <= 0
      ) {

        return res.status(400).json({
          error:
            'Recepción inválida',
        });
      }


      if (
        !Number.isFinite(
          hookWeightKg,
        ) ||
        hookWeightKg <= 0
      ) {

        return res.status(400).json({
          error:
            'Peso de carcasa inválido',
        });
      }


      await client.query(
        'BEGIN',
      );


      // =================================================
      // BLOQUEAR RECEPCIÓN
      // =================================================

      const receptionResult =
        await client.query(
          `
          SELECT
            id,
            company_id,
            reception_number,
            plant_lot_number,
            status,
            slaughter_started_at

          FROM slaughterhouse_receptions

          WHERE
            id = $1
            AND company_id = $2

          LIMIT 1

          FOR UPDATE
          `,
          [
            receptionId,
            companyId,
          ],
        );


      if (
        receptionResult.rows.length ===
          0
      ) {

        await client.query(
          'ROLLBACK',
        );

        return res.status(404).json({
          error:
            'Recepción no encontrada',
        });
      }


      const reception =
        receptionResult.rows[0];


      if (
        reception.status !==
          'in_slaughter'
      ) {

        await client.query(
          'ROLLBACK',
        );

        return res.status(409).json({
          error:
            'La recepción debe estar en faena para registrar carcasas',
        });
      }


      // =================================================
      // TOTAL DE ANIMALES RECIBIDOS
      // =================================================

      const receivedResult =
        await client.query(
          `
          SELECT

            COALESCE(
              SUM(
                received_quantity
              ),
              0
            )::int
              AS received_quantity_total,

            COALESCE(
              SUM(
                live_weight_kg
              ),
              0
            )::numeric
              AS live_weight_total_kg

          FROM slaughterhouse_reception_trucks

          WHERE
            reception_id = $1
          `,
          [
            receptionId,
          ],
        );


      const receivedQuantity =
        Number(
          receivedResult.rows[0]
            .received_quantity_total,
        );

      const liveWeightTotalKg =
        Number(
          receivedResult.rows[0]
            .live_weight_total_kg,
        );


      if (
        receivedQuantity <= 0
      ) {

        await client.query(
          'ROLLBACK',
        );

        return res.status(409).json({
          error:
            'La recepción no tiene animales recibidos',
        });
      }


      // =================================================
      // CARCASAS YA REGISTRADAS
      // =================================================

      const carcassSummaryResult =
        await client.query(
          `
          SELECT

            COUNT(*)::int
              AS carcasses_count,

            COALESCE(
              MAX(
                sequence_number
              ),
              0
            )::int
              AS last_sequence,

            COALESCE(
              SUM(
                hook_weight_kg
              ),
              0
            )::numeric
              AS hook_weight_total_kg

          FROM slaughterhouse_carcasses

          WHERE
            reception_id = $1
          `,
          [
            receptionId,
          ],
        );


      const currentCount =
        Number(
          carcassSummaryResult.rows[0]
            .carcasses_count,
        );

      const lastSequence =
        Number(
          carcassSummaryResult.rows[0]
            .last_sequence,
        );

      const previousHookWeight =
        Number(
          carcassSummaryResult.rows[0]
            .hook_weight_total_kg,
        );


      // =================================================
      // NO SUPERAR ANIMALES RECIBIDOS
      // =================================================

      if (
        currentCount >=
          receivedQuantity
      ) {

        await client.query(
          'ROLLBACK',
        );

        return res.status(409).json({
          error:
            'Ya se registró una carcasa por cada animal recibido',
          received_quantity:
            receivedQuantity,
          carcasses_count:
            currentCount,
        });
      }


      const nextSequence =
        lastSequence + 1;


      // =================================================
      // GUARDAR CARCASA
      // =================================================

      const carcassResult =
        await client.query(
          `
          INSERT INTO slaughterhouse_carcasses (

            reception_id,

            sequence_number,

            plant_carcass_number,

            hook_weight_kg,

            notes,

            recorded_by,

            recorded_at

          )

          VALUES (

            $1,

            $2,

            $3,

            $4,

            $5,

            $6,

            NOW()

          )

          RETURNING *
          `,
          [
            receptionId,
            nextSequence,
            plantCarcassNumber,
            hookWeightKg,
            notes,
            userId,
          ],
        );


      const carcass =
        carcassResult.rows[0];


      // =================================================
      // RESUMEN ACTUALIZADO
      // =================================================

      const newCount =
        currentCount + 1;

      const newHookWeightTotal =
        previousHookWeight +
        hookWeightKg;

      const averageHookWeight =
        newCount > 0
          ? newHookWeightTotal /
            newCount
          : 0;

      const carcassYield =
        liveWeightTotalKg > 0
          ? (
              newHookWeightTotal /
              liveWeightTotalKg
            ) *
            100
          : null;


      await client.query(
        'COMMIT',
      );


      return res.status(201).json({

        message:
          'Peso de carcasa registrado',

        carcass,

        summary: {

          received_quantity_total:
            receivedQuantity,

          carcasses_count:
            newCount,

          remaining:
            receivedQuantity -
            newCount,

          live_weight_total_kg:
            liveWeightTotalKg,

          hook_weight_total_kg:
            Number(
              newHookWeightTotal
                .toFixed(
                  2,
                ),
            ),

          average_hook_weight_kg:
            Number(
              averageHookWeight
                .toFixed(
                  2,
                ),
            ),

          carcass_yield_percent:
            carcassYield == null
              ? null
              : Number(
                  carcassYield
                    .toFixed(
                      2,
                    ),
                ),

          complete:
            newCount ===
            receivedQuantity,

        },

      });


    } catch (error) {

      await client.query(
        'ROLLBACK',
      );


      console.error(
        'CREATE SLAUGHTERHOUSE CARCASS ERROR:',
        error,
      );


      if (
        error.code === '23505'
      ) {

        return res.status(409).json({
          error:
            'Conflicto registrando número de carcasa. Intenta nuevamente.',
        });
      }


      return res.status(500).json({
        error:
          'Error registrando peso de carcasa',
      });

    } finally {

      client.release();

    }
  };

// =====================================================
// 🏭 CORREGIR ÚLTIMA CARCASA
//
// PUT /slaughterhouse/slaughter/:id/carcasses/last
//
// Solo permite corregir la última carcasa registrada.
// =====================================================

exports.updateLastSlaughterhouseCarcass =
  async (req, res) => {

    const client =
      await pool.connect();

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

      const receptionId =
        Number(
          req.params.id,
        );

      const hookWeightKg =
        Number(
          req.body.hook_weight_kg,
        );

      if (
        !Number.isInteger(
          receptionId,
        ) ||
        receptionId <= 0
      ) {
        return res.status(400).json({
          error:
            'Recepción inválida',
        });
      }

      if (
        !Number.isFinite(
          hookWeightKg,
        ) ||
        hookWeightKg <= 0
      ) {
        return res.status(400).json({
          error:
            'Peso de carcasa inválido',
        });
      }

      await client.query(
        'BEGIN',
      );

      // =================================================
      // VALIDAR RECEPCIÓN
      // =================================================

      const receptionResult =
        await client.query(
          `
          SELECT
            id,
            status

          FROM slaughterhouse_receptions

          WHERE
            id = $1
            AND company_id = $2

          LIMIT 1

          FOR UPDATE
          `,
          [
            receptionId,
            companyId,
          ],
        );

      if (
        receptionResult.rows.length ===
          0
      ) {
        await client.query(
          'ROLLBACK',
        );

        return res.status(404).json({
          error:
            'Recepción no encontrada',
        });
      }

      if (
        receptionResult.rows[0]
          .status !==
        'in_slaughter'
      ) {
        await client.query(
          'ROLLBACK',
        );

        return res.status(409).json({
          error:
            'La recepción no está actualmente en faena',
        });
      }

      // =================================================
      // ÚLTIMA CARCASA
      // =================================================

      const lastResult =
        await client.query(
          `
          SELECT *

          FROM slaughterhouse_carcasses

          WHERE
            reception_id = $1

          ORDER BY
            sequence_number DESC

          LIMIT 1

          FOR UPDATE
          `,
          [
            receptionId,
          ],
        );

      if (
        lastResult.rows.length ===
          0
      ) {
        await client.query(
          'ROLLBACK',
        );

        return res.status(404).json({
          error:
            'Todavía no existen carcasas registradas',
        });
      }

      const carcassId =
        Number(
          lastResult.rows[0].id,
        );

      const updatedResult =
        await client.query(
          `
          UPDATE slaughterhouse_carcasses

          SET
            hook_weight_kg = $1,
            recorded_by = $2,
            recorded_at = NOW(),
            updated_at = NOW()

          WHERE
            id = $3

          RETURNING *
          `,
          [
            hookWeightKg,
            userId,
            carcassId,
          ],
        );

      // =================================================
      // RESUMEN ACTUALIZADO
      // =================================================

      const summaryResult =
        await client.query(
          `
          SELECT

            COUNT(*)::int
              AS carcasses_count,

            COALESCE(
              SUM(
                hook_weight_kg
              ),
              0
            )::numeric
              AS hook_weight_total_kg,

            COALESCE(
              AVG(
                hook_weight_kg
              ),
              0
            )::numeric
              AS average_hook_weight_kg

          FROM slaughterhouse_carcasses

          WHERE
            reception_id = $1
          `,
          [
            receptionId,
          ],
        );

      await client.query(
        'COMMIT',
      );

      const summary =
        summaryResult.rows[0];

      return res.json({

        message:
          'Última carcasa corregida',

        carcass:
          updatedResult.rows[0],

        summary: {

          carcasses_count:
            Number(
              summary.carcasses_count,
            ),

          hook_weight_total_kg:
            Number(
              Number(
                summary.hook_weight_total_kg,
              ).toFixed(
                2,
              ),
            ),

          average_hook_weight_kg:
            Number(
              Number(
                summary.average_hook_weight_kg,
              ).toFixed(
                2,
              ),
            ),

        },

      });

    } catch (error) {

      await client.query(
        'ROLLBACK',
      );

      console.error(
        'UPDATE LAST SLAUGHTERHOUSE CARCASS ERROR:',
        error,
      );

      return res.status(500).json({
        error:
          'Error corrigiendo última carcasa',
      });

    } finally {

      client.release();

    }
  };

// =====================================================
// 🏭 FINALIZAR FAENA
//
// POST /slaughterhouse/slaughter/:id/finish
//
// Body:
// {
//   "notes": null
// }
//
// - Recepción debe estar IN_SLAUGHTER.
// - Calcula resumen definitivo.
// - Si cantidad de carcasas difiere de animales
//   recibidos, exige observación.
// - Cambia recepción a COMPLETED.
// =====================================================

exports.finishSlaughterhouseSlaughter =
  async (req, res) => {

    const client =
      await pool.connect();

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

      const receptionId =
        Number(
          req.params.id,
        );

      const notes =
        req.body.notes
          ?.toString()
          .trim() || null;


      if (
        !Number.isInteger(
          receptionId,
        ) ||
        receptionId <= 0
      ) {
        return res.status(400).json({
          error:
            'Recepción inválida',
        });
      }


      await client.query(
        'BEGIN',
      );


      // =================================================
      // RECEPCIÓN
      // =================================================

      const receptionResult =
        await client.query(
          `
          SELECT
            id,
            reception_number,
            plant_lot_number,
            status

          FROM slaughterhouse_receptions

          WHERE
            id = $1
            AND company_id = $2

          LIMIT 1

          FOR UPDATE
          `,
          [
            receptionId,
            companyId,
          ],
        );


      if (
        receptionResult.rows.length ===
          0
      ) {
        await client.query(
          'ROLLBACK',
        );

        return res.status(404).json({
          error:
            'Recepción no encontrada',
        });
      }


      const reception =
        receptionResult.rows[0];


      if (
        reception.status !==
          'in_slaughter'
      ) {
        await client.query(
          'ROLLBACK',
        );

        return res.status(409).json({
          error:
            'La recepción no está actualmente en faena',
        });
      }


      // =================================================
      // RESUMEN RECEPCIÓN
      // =================================================

      const receivedResult =
        await client.query(
          `
          SELECT

            COUNT(*)::int
              AS trucks_count,

            COALESCE(
              SUM(
                guide_quantity
              ),
              0
            )::int
              AS guide_quantity_total,

            COALESCE(
              SUM(
                received_quantity
              ),
              0
            )::int
              AS received_quantity_total,

            COALESCE(
              SUM(
                live_weight_kg
              ),
              0
            )::numeric
              AS live_weight_total_kg

          FROM slaughterhouse_reception_trucks

          WHERE
            reception_id = $1
          `,
          [
            receptionId,
          ],
        );


      // =================================================
      // RESUMEN CARCASAS
      // =================================================

      const carcassResult =
        await client.query(
          `
          SELECT

            COUNT(*)::int
              AS carcasses_count,

            COALESCE(
              SUM(
                hook_weight_kg
              ),
              0
            )::numeric
              AS hook_weight_total_kg,

            COALESCE(
              AVG(
                hook_weight_kg
              ),
              0
            )::numeric
              AS average_hook_weight_kg,

            COALESCE(
              MIN(
                hook_weight_kg
              ),
              0
            )::numeric
              AS min_hook_weight_kg,

            COALESCE(
              MAX(
                hook_weight_kg
              ),
              0
            )::numeric
              AS max_hook_weight_kg

          FROM slaughterhouse_carcasses

          WHERE
            reception_id = $1
          `,
          [
            receptionId,
          ],
        );


      const received =
        receivedResult.rows[0];

      const carcasses =
        carcassResult.rows[0];


      const receivedQuantity =
        Number(
          received.received_quantity_total,
        );

      const carcassesCount =
        Number(
          carcasses.carcasses_count,
        );

      const liveWeight =
        Number(
          received.live_weight_total_kg,
        );

      const hookWeight =
        Number(
          carcasses.hook_weight_total_kg,
        );


      if (
        carcassesCount <= 0
      ) {
        await client.query(
          'ROLLBACK',
        );

        return res.status(409).json({
          error:
            'No existen carcasas registradas',
        });
      }


      // =================================================
      // DIFERENCIA RECEPCIÓN VS FAENA
      // =================================================

      if (
        carcassesCount !==
          receivedQuantity &&
        !notes
      ) {
        await client.query(
          'ROLLBACK',
        );

        return res.status(400).json({
          error:
            'La cantidad de carcasas no coincide con los animales recibidos. Debes registrar una observación.',
          received_quantity:
            receivedQuantity,
          carcasses_count:
            carcassesCount,
        });
      }


      const yieldPercent =
        liveWeight > 0
          ? (
              hookWeight /
              liveWeight
            ) *
            100
          : null;


      // =================================================
      // FINALIZAR
      // =================================================

      const updatedResult =
        await client.query(
          `
          UPDATE slaughterhouse_receptions

          SET
            status =
              'completed',

            completed_at =
              NOW(),

            notes =
              COALESCE(
                $2,
                notes
              ),

            updated_at =
              NOW()

          WHERE
            id = $1

          RETURNING *
          `,
          [
            receptionId,
            notes,
          ],
        );


      await client.query(
        'COMMIT',
      );


      return res.json({

        message:
          'Faena finalizada correctamente',

        reception:
          updatedResult.rows[0],

        summary: {

          trucks_count:
            Number(
              received.trucks_count,
            ),

          guide_quantity_total:
            Number(
              received.guide_quantity_total,
            ),

          received_quantity_total:
            receivedQuantity,

          carcasses_count:
            carcassesCount,

          difference:
            carcassesCount -
            receivedQuantity,

          live_weight_total_kg:
            Number(
              liveWeight.toFixed(
                2,
              ),
            ),

          hook_weight_total_kg:
            Number(
              hookWeight.toFixed(
                2,
              ),
            ),

          average_hook_weight_kg:
            Number(
              Number(
                carcasses.average_hook_weight_kg,
              ).toFixed(
                2,
              ),
            ),

          min_hook_weight_kg:
            Number(
              Number(
                carcasses.min_hook_weight_kg,
              ).toFixed(
                2,
              ),
            ),

          max_hook_weight_kg:
            Number(
              Number(
                carcasses.max_hook_weight_kg,
              ).toFixed(
                2,
              ),
            ),

          carcass_yield_percent:
            yieldPercent == null
              ? null
              : Number(
                  yieldPercent
                    .toFixed(
                      2,
                    ),
                ),

        },

      });


    } catch (error) {

      await client.query(
        'ROLLBACK',
      );

      console.error(
        'FINISH SLAUGHTERHOUSE SLAUGHTER ERROR:',
        error,
      );

      return res.status(500).json({
        error:
          'Error finalizando faena',
      });

    } finally {

      client.release();

    }
  };

  // =====================================================
// 📄 CATÁLOGO DE CAMPOS PARA EXPORTACIÓN CSV
//
// GET /slaughterhouse/export/catalog
//
// Devuelve únicamente campos permitidos.
// Flutter/Web nunca envían nombres SQL arbitrarios.
// =====================================================

exports.getSlaughterhouseExportCatalog =
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


      return res.json({

        datasets: {

          // =============================================
          // 🐄 CARCASAS
          // Una fila por carcasa
          // =============================================

          carcasses: {

            label:
              'Detalle de carcasas',

            description:
              'Una fila por carcasa registrada.',

            fields: [

              {
                field:
                  'reception_number',
                label:
                  'N.º recepción PG',
                default_header:
                  'RECEPCION',
                type:
                  'text',
              },

              {
                field:
                  'plant_lot_number',
                label:
                  'N.º lote planta',
                default_header:
                  'LOTE',
                type:
                  'text',
              },

              {
                field:
                  'sequence_number',
                label:
                  'N.º correlativo carcasa',
                default_header:
                  'CORRELATIVO',
                type:
                  'integer',
              },

              {
                field:
                  'plant_carcass_number',
                label:
                  'N.º carcasa planta',
                default_header:
                  'CARCAZA',
                type:
                  'text',
              },

              {
                field:
                  'hook_weight_kg',
                label:
                  'Peso gancho',
                default_header:
                  'PESO_GANCHO',
                type:
                  'decimal',
              },

              {
                field:
                  'recorded_at',
                label:
                  'Fecha/hora pesaje',
                default_header:
                  'FECHA_PESAJE',
                type:
                  'datetime',
              },

              {
                field:
                  'recorded_by',
                label:
                  'ID operador',
                default_header:
                  'OPERADOR',
                type:
                  'integer',
              },

            ],

          },


          // =============================================
          // 🚛 CAMIONES / RECEPCIÓN
          // Una fila por camión
          // =============================================

          trucks: {

            label:
              'Camiones y recepción',

            description:
              'Una fila por camión perteneciente a la recepción.',

            fields: [

              {
                field:
                  'reception_number',
                label:
                  'N.º recepción PG',
                default_header:
                  'RECEPCION',
                type:
                  'text',
              },

              {
                field:
                  'plant_lot_number',
                label:
                  'N.º lote planta',
                default_header:
                  'LOTE',
                type:
                  'text',
              },

              {
                field:
                  'plate_snapshot',
                label:
                  'Placa',
                default_header:
                  'PLACA',
                type:
                  'text',
              },

              {
                field:
                  'animal_type_snapshot',
                label:
                  'Tipo de ganado',
                default_header:
                  'TIPO_ANIMAL',
                type:
                  'text',
              },

              {
                field:
                  'transport_guide_id',
                label:
                  'ID guía',
                default_header:
                  'GUIA',
                type:
                  'integer',
              },

              {
                field:
                  'guide_quantity',
                label:
                  'Cantidad según guía',
                default_header:
                  'CANTIDAD_GUIA',
                type:
                  'integer',
              },

              {
                field:
                  'received_quantity',
                label:
                  'Cantidad recibida',
                default_header:
                  'CANTIDAD_RECIBIDA',
                type:
                  'integer',
              },

              {
                field:
                  'quantity_difference',
                label:
                  'Diferencia recepción',
                default_header:
                  'DIFERENCIA',
                type:
                  'integer',
              },

              {
                field:
                  'live_weight_kg',
                label:
                  'Peso vivo',
                default_header:
                  'PESO_VIVO',
                type:
                  'decimal',
              },

              {
                field:
                  'origin_snapshot',
                label:
                  'Origen',
                default_header:
                  'ORIGEN',
                type:
                  'text',
              },

              {
                field:
                  'destination_snapshot',
                label:
                  'Destino',
                default_header:
                  'DESTINO',
                type:
                  'text',
              },

              {
                field:
                  'transport_delivered_at',
                label:
                  'Fecha/hora llegada',
                default_header:
                  'LLEGADA',
                type:
                  'datetime',
              },

              {
                field:
                  'received_at',
                label:
                  'Fecha/hora recepción',
                default_header:
                  'RECEPCION_FECHA',
                type:
                  'datetime',
              },

              {
                field:
                  'reception_notes',
                label:
                  'Observaciones recepción',
                default_header:
                  'OBSERVACIONES',
                type:
                  'text',
              },

            ],

          },


          // =============================================
          // 📊 RESUMEN DEL LOTE
          // Una fila por recepción
          // =============================================

          summary: {

            label:
              'Resumen de lote',

            description:
              'Una fila por recepción o lote de planta.',

            fields: [

              {
                field:
                  'reception_number',
                label:
                  'N.º recepción PG',
                default_header:
                  'RECEPCION',
                type:
                  'text',
              },

              {
                field:
                  'plant_lot_number',
                label:
                  'N.º lote planta',
                default_header:
                  'LOTE',
                type:
                  'text',
              },

              {
                field:
                  'status',
                label:
                  'Estado',
                default_header:
                  'ESTADO',
                type:
                  'text',
              },

              {
                field:
                  'trucks_count',
                label:
                  'Cantidad de camiones',
                default_header:
                  'CAMIONES',
                type:
                  'integer',
              },

              {
                field:
                  'guide_quantity_total',
                label:
                  'Animales según guía',
                default_header:
                  'ANIMALES_GUIA',
                type:
                  'integer',
              },

              {
                field:
                  'received_quantity_total',
                label:
                  'Animales recibidos',
                default_header:
                  'ANIMALES_RECIBIDOS',
                type:
                  'integer',
              },

              {
                field:
                  'live_weight_total_kg',
                label:
                  'Peso vivo total',
                default_header:
                  'PESO_VIVO',
                type:
                  'decimal',
              },

              {
                field:
                  'carcasses_count',
                label:
                  'Cantidad de carcasas',
                default_header:
                  'CARCASAS',
                type:
                  'integer',
              },

              {
                field:
                  'hook_weight_total_kg',
                label:
                  'Peso gancho total',
                default_header:
                  'PESO_GANCHO',
                type:
                  'decimal',
              },

              {
                field:
                  'average_hook_weight_kg',
                label:
                  'Peso promedio carcasa',
                default_header:
                  'PROMEDIO_CARCASA',
                type:
                  'decimal',
              },

              {
                field:
                  'min_hook_weight_kg',
                label:
                  'Menor peso carcasa',
                default_header:
                  'PESO_MINIMO',
                type:
                  'decimal',
              },

              {
                field:
                  'max_hook_weight_kg',
                label:
                  'Mayor peso carcasa',
                default_header:
                  'PESO_MAXIMO',
                type:
                  'decimal',
              },

              {
                field:
                  'carcass_yield_percent',
                label:
                  'Rendimiento carcasa',
                default_header:
                  'RENDIMIENTO',
                type:
                  'decimal',
              },

              {
                field:
                  'opened_at',
                label:
                  'Inicio recepción',
                default_header:
                  'INICIO_RECEPCION',
                type:
                  'datetime',
              },

              {
                field:
                  'closed_at',
                label:
                  'Cierre recepción',
                default_header:
                  'CIERRE_RECEPCION',
                type:
                  'datetime',
              },

              {
                field:
                  'slaughter_started_at',
                label:
                  'Inicio faena',
                default_header:
                  'INICIO_FAENA',
                type:
                  'datetime',
              },

              {
                field:
                  'completed_at',
                label:
                  'Fin faena',
                default_header:
                  'FIN_FAENA',
                type:
                  'datetime',
              },

            ],

          },

        },


        options: {

          delimiters: [
            {
              value: ',',
              label: 'Coma (,)',
            },
            {
              value: ';',
              label: 'Punto y coma (;)',
            },
            {
              value: '\\t',
              label: 'Tabulación',
            },
          ],

          decimal_separators: [
            '.',
            ',',
          ],

          date_formats: [
            'DD/MM/YYYY',
            'YYYY-MM-DD',
            'DD-MM-YYYY',
            'DD/MM/YYYY HH:mm',
            'YYYY-MM-DD HH:mm:ss',
          ],

          encodings: [
            {
              value: 'utf8',
              label: 'UTF-8',
            },
            {
              value: 'utf8-bom',
              label: 'UTF-8 con BOM / Excel',
            },
          ],

        },

      });


    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE EXPORT CATALOG ERROR:',
        error,
      );


      return res.status(500).json({
        error:
          'Error obteniendo configuración de exportación',
      });

    }
  };

// =====================================================
// 📄 CAMPOS PERMITIDOS PARA PERFILES CSV
// =====================================================

const slaughterhouseExportAllowedFields = {

  carcasses: new Set([
    'reception_number',
    'plant_lot_number',
    'sequence_number',
    'plant_carcass_number',
    'hook_weight_kg',
    'recorded_at',
    'recorded_by',
  ]),

  trucks: new Set([
    'reception_number',
    'plant_lot_number',
    'plate_snapshot',
    'animal_type_snapshot',
    'transport_guide_id',
    'guide_quantity',
    'received_quantity',
    'quantity_difference',
    'live_weight_kg',
    'origin_snapshot',
    'destination_snapshot',
    'transport_delivered_at',
    'received_at',
    'reception_notes',
  ]),

  summary: new Set([
    'reception_number',
    'plant_lot_number',
    'status',
    'trucks_count',
    'guide_quantity_total',
    'received_quantity_total',
    'live_weight_total_kg',
    'carcasses_count',
    'hook_weight_total_kg',
    'average_hook_weight_kg',
    'min_hook_weight_kg',
    'max_hook_weight_kg',
    'carcass_yield_percent',
    'opened_at',
    'closed_at',
    'slaughter_started_at',
    'completed_at',
  ]),

};


// =====================================================
// 📄 VALIDAR CONFIGURACIÓN DE COLUMNAS
// =====================================================

function validateExportColumns(
  datasetType,
  columnsConfig,
) {

  const allowed =
    slaughterhouseExportAllowedFields[
      datasetType
    ];


  if (!allowed) {

    return {
      valid: false,
      error:
        'Tipo de exportación inválido',
    };
  }


  if (
    !Array.isArray(
      columnsConfig,
    ) ||
    columnsConfig.length === 0
  ) {

    return {
      valid: false,
      error:
        'Debes seleccionar al menos una columna',
    };
  }


  const usedFields =
    new Set();


  const normalized =
    [];


  for (
    const column
    of columnsConfig
  ) {

    if (
      !column ||
      typeof column !==
        'object'
    ) {

      return {
        valid: false,
        error:
          'Configuración de columna inválida',
      };
    }


    const field =
      column.field
        ?.toString()
        .trim();


    const header =
      column.header
        ?.toString()
        .trim();


    if (
      !field ||
      !allowed.has(
        field,
      )
    ) {

      return {
        valid: false,
        error:
          `Campo no permitido: ${field || 'vacío'}`,
      };
    }


    if (
      usedFields.has(
        field,
      )
    ) {

      return {
        valid: false,
        error:
          `Campo duplicado: ${field}`,
      };
    }


    if (
      !header
    ) {

      return {
        valid: false,
        error:
          `La columna ${field} debe tener encabezado`,
      };
    }


    if (
      header.length > 150
    ) {

      return {
        valid: false,
        error:
          `Encabezado demasiado largo: ${header}`,
      };
    }


    usedFields.add(
      field,
    );


    normalized.push({
      field,
      header,
    });
  }


  return {
    valid: true,
    columns:
      normalized,
  };
}


// =====================================================
// 📄 LISTAR PERFILES CSV
//
// GET /slaughterhouse/export/profiles
// =====================================================

exports.getSlaughterhouseExportProfiles =
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

            id,

            company_id,

            name,

            dataset_type,

            columns_config,

            delimiter,

            decimal_separator,

            date_format,

            include_header,

            encoding,

            is_active,

            created_by,

            created_at,

            updated_at

          FROM slaughterhouse_export_profiles
          WHERE
            company_id = $1
            AND is_active = true
          ORDER BY
            name ASC,
            id ASC
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

        profiles:
          result.rows,

      });


    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE EXPORT PROFILES ERROR:',
        error,
      );


      return res.status(500).json({
        error:
          'Error obteniendo perfiles de exportación',
      });

    }
  };


// =====================================================
// 📄 CREAR PERFIL CSV
//
// POST /slaughterhouse/export/profiles
//
// {
//   "name": "Sistema FRIGOSI",
//   "dataset_type": "carcasses",
//   "columns_config": [
//     {
//       "field": "plant_lot_number",
//       "header": "LOTE"
//     },
//     {
//       "field": "hook_weight_kg",
//       "header": "PESO"
//     }
//   ],
//   "delimiter": ";",
//   "decimal_separator": ",",
//   "date_format": "DD/MM/YYYY",
//   "include_header": true,
//   "encoding": "utf8-bom"
// }
// =====================================================

exports.createSlaughterhouseExportProfile =
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


      const name =
        req.body.name
          ?.toString()
          .trim();


      const datasetType =
        req.body.dataset_type
          ?.toString()
          .trim();


      const columnsConfig =
        req.body.columns_config;


      let delimiter =
        req.body.delimiter
          ?.toString();


      const decimalSeparator =
        req.body.decimal_separator
          ?.toString() ??
        '.';


      const dateFormat =
        req.body.date_format
          ?.toString()
          .trim() ??
        'DD/MM/YYYY';


      const includeHeader =
        req.body.include_header ==
          null
          ? true
          : req.body.include_header ===
            true;


      const encoding =
        req.body.encoding
          ?.toString()
          .trim() ??
        'utf8-bom';


      // =================================================
      // NOMBRE
      // =================================================

      if (
        !name ||
        name.length > 150
      ) {

        return res.status(400).json({
          error:
            'Nombre de perfil inválido',
        });
      }


      // =================================================
      // DATASET
      // =================================================

      if (
        ![
          'carcasses',
          'trucks',
          'summary',
        ].includes(
          datasetType,
        )
      ) {

        return res.status(400).json({
          error:
            'Tipo de exportación inválido',
        });
      }


      // =================================================
      // COLUMNAS
      // =================================================

      const columnsValidation =
        validateExportColumns(
          datasetType,
          columnsConfig,
        );


      if (
        !columnsValidation.valid
      ) {

        return res.status(400).json({
          error:
            columnsValidation.error,
        });
      }


      // =================================================
      // SEPARADOR
      // =================================================

      if (
        delimiter === '\\t'
      ) {
        delimiter = '\t';
      }


      if (
        ![
          ',',
          ';',
          '\t',
        ].includes(
          delimiter,
        )
      ) {

        return res.status(400).json({
          error:
            'Separador CSV inválido',
        });
      }


      // =================================================
      // DECIMALES
      // =================================================

      if (
        ![
          '.',
          ',',
        ].includes(
          decimalSeparator,
        )
      ) {

        return res.status(400).json({
          error:
            'Separador decimal inválido',
        });
      }


      // =================================================
      // FECHA
      // =================================================

      const allowedDateFormats = [
        'DD/MM/YYYY',
        'YYYY-MM-DD',
        'DD-MM-YYYY',
        'DD/MM/YYYY HH:mm',
        'YYYY-MM-DD HH:mm:ss',
      ];


      if (
        !allowedDateFormats.includes(
          dateFormat,
        )
      ) {

        return res.status(400).json({
          error:
            'Formato de fecha inválido',
        });
      }


      // =================================================
      // ENCODING
      // =================================================

      if (
        ![
          'utf8',
          'utf8-bom',
        ].includes(
          encoding,
        )
      ) {

        return res.status(400).json({
          error:
            'Codificación inválida',
        });
      }


      // =================================================
      // EVITAR NOMBRE DUPLICADO
      // =================================================

      const existing =
        await pool.query(
          `
          SELECT id

          FROM slaughterhouse_export_profiles

          WHERE
            company_id = $1

            AND LOWER(name) =
              LOWER($2)

          LIMIT 1
          `,
          [
            companyId,
            name,
          ],
        );


      if (
        existing.rows.length > 0
      ) {

        return res.status(409).json({
          error:
            'Ya existe un perfil con ese nombre',
        });
      }


      // =================================================
      // GUARDAR
      // =================================================

      const result =
        await pool.query(
          `
          INSERT INTO slaughterhouse_export_profiles (

            company_id,

            name,

            dataset_type,

            columns_config,

            delimiter,

            decimal_separator,

            date_format,

            include_header,

            encoding,

            is_active,

            created_by

          )

          VALUES (

            $1,

            $2,

            $3,

            $4::jsonb,

            $5,

            $6,

            $7,

            $8,

            $9,

            true,

            $10

          )

          RETURNING *
          `,
          [
            companyId,

            name,

            datasetType,

            JSON.stringify(
              columnsValidation.columns,
            ),

            delimiter,

            decimalSeparator,

            dateFormat,

            includeHeader,

            encoding,

            userId,
          ],
        );


      return res.status(201).json({

        message:
          'Perfil de exportación creado',

        profile:
          result.rows[0],

      });


    } catch (error) {

      console.error(
        'CREATE SLAUGHTERHOUSE EXPORT PROFILE ERROR:',
        error,
      );


      return res.status(500).json({
        error:
          'Error creando perfil de exportación',
      });

    }
  };
  
// =====================================================
// 📄 ACTUALIZAR PERFIL CSV
//
// PUT /slaughterhouse/export/profiles/:id
// =====================================================

exports.updateSlaughterhouseExportProfile =
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

      const profileId =
        Number(
          req.params.id,
        );


      if (
        !Number.isInteger(
          profileId,
        ) ||
        profileId <= 0
      ) {

        return res.status(400).json({
          error:
            'Perfil inválido',
        });
      }


      // =================================================
      // PERFIL ACTUAL
      // =================================================

      const currentResult =
        await pool.query(
          `
          SELECT *

          FROM slaughterhouse_export_profiles

          WHERE
            id = $1
            AND company_id = $2

          LIMIT 1
          `,
          [
            profileId,
            companyId,
          ],
        );


      if (
        currentResult.rows.length ===
          0
      ) {

        return res.status(404).json({
          error:
            'Perfil de exportación no encontrado',
        });
      }


      const current =
        currentResult.rows[0];


      // =================================================
      // VALORES NUEVOS
      // =================================================

      const name =
        req.body.name == null
          ? current.name
          : req.body.name
              .toString()
              .trim();


      const datasetType =
        req.body.dataset_type ==
          null
          ? current.dataset_type
          : req.body.dataset_type
              .toString()
              .trim();


      const columnsConfig =
        req.body.columns_config ==
          null
          ? current.columns_config
          : req.body.columns_config;


      let delimiter =
        req.body.delimiter ==
          null
          ? current.delimiter
          : req.body.delimiter
              .toString();


      const decimalSeparator =
        req.body.decimal_separator ==
          null
          ? current.decimal_separator
          : req.body.decimal_separator
              .toString();


      const dateFormat =
        req.body.date_format ==
          null
          ? current.date_format
          : req.body.date_format
              .toString()
              .trim();


      const includeHeader =
        req.body.include_header ==
          null
          ? current.include_header
          : req.body.include_header ===
            true;


      const encoding =
        req.body.encoding ==
          null
          ? current.encoding
          : req.body.encoding
              .toString()
              .trim();


      const isActive =
        req.body.is_active ==
          null
          ? current.is_active
          : req.body.is_active ===
            true;


      // =================================================
      // VALIDACIONES
      // =================================================

      if (
        !name ||
        name.length > 150
      ) {

        return res.status(400).json({
          error:
            'Nombre de perfil inválido',
        });
      }


      if (
        ![
          'carcasses',
          'trucks',
          'summary',
        ].includes(
          datasetType,
        )
      ) {

        return res.status(400).json({
          error:
            'Tipo de exportación inválido',
        });
      }


      const columnsValidation =
        validateExportColumns(
          datasetType,
          columnsConfig,
        );


      if (
        !columnsValidation.valid
      ) {

        return res.status(400).json({
          error:
            columnsValidation.error,
        });
      }


      if (
        delimiter === '\\t'
      ) {
        delimiter = '\t';
      }


      if (
        ![
          ',',
          ';',
          '\t',
        ].includes(
          delimiter,
        )
      ) {

        return res.status(400).json({
          error:
            'Separador CSV inválido',
        });
      }


      if (
        ![
          '.',
          ',',
        ].includes(
          decimalSeparator,
        )
      ) {

        return res.status(400).json({
          error:
            'Separador decimal inválido',
        });
      }


      const allowedDateFormats = [
        'DD/MM/YYYY',
        'YYYY-MM-DD',
        'DD-MM-YYYY',
        'DD/MM/YYYY HH:mm',
        'YYYY-MM-DD HH:mm:ss',
      ];


      if (
        !allowedDateFormats.includes(
          dateFormat,
        )
      ) {

        return res.status(400).json({
          error:
            'Formato de fecha inválido',
        });
      }


      if (
        ![
          'utf8',
          'utf8-bom',
        ].includes(
          encoding,
        )
      ) {

        return res.status(400).json({
          error:
            'Codificación inválida',
        });
      }


      // =================================================
      // NOMBRE DUPLICADO
      // =================================================

      const duplicate =
        await pool.query(
          `
          SELECT id

          FROM slaughterhouse_export_profiles

          WHERE
            company_id = $1

            AND LOWER(name) =
              LOWER($2)

            AND id <> $3

          LIMIT 1
          `,
          [
            companyId,
            name,
            profileId,
          ],
        );


      if (
        duplicate.rows.length > 0
      ) {

        return res.status(409).json({
          error:
            'Ya existe otro perfil con ese nombre',
        });
      }


      // =================================================
      // ACTUALIZAR
      // =================================================

      const result =
        await pool.query(
          `
          UPDATE slaughterhouse_export_profiles

          SET

            name = $1,

            dataset_type = $2,

            columns_config =
              $3::jsonb,

            delimiter = $4,

            decimal_separator = $5,

            date_format = $6,

            include_header = $7,

            encoding = $8,

            is_active = $9,

            updated_at =
              NOW()

          WHERE
            id = $10
            AND company_id = $11

          RETURNING *
          `,
          [
            name,

            datasetType,

            JSON.stringify(
              columnsValidation.columns,
            ),

            delimiter,

            decimalSeparator,

            dateFormat,

            includeHeader,

            encoding,

            isActive,

            profileId,

            companyId,
          ],
        );


      return res.json({

        message:
          'Perfil de exportación actualizado',

        profile:
          result.rows[0],

      });


    } catch (error) {

      console.error(
        'UPDATE SLAUGHTERHOUSE EXPORT PROFILE ERROR:',
        error,
      );


      return res.status(500).json({
        error:
          'Error actualizando perfil de exportación',
      });

    }
  };


// =====================================================
// 📄 DESACTIVAR PERFIL CSV
//
// DELETE /slaughterhouse/export/profiles/:id
//
// No elimina físicamente.
// is_active = false
// =====================================================

exports.deleteSlaughterhouseExportProfile =
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

      const profileId =
        Number(
          req.params.id,
        );


      if (
        !Number.isInteger(
          profileId,
        ) ||
        profileId <= 0
      ) {

        return res.status(400).json({
          error:
            'Perfil inválido',
        });
      }


      const result =
        await pool.query(
          `
          UPDATE slaughterhouse_export_profiles

          SET
            is_active = false,
            updated_at = NOW()

          WHERE
            id = $1
            AND company_id = $2

          RETURNING *
          `,
          [
            profileId,
            companyId,
          ],
        );


      if (
        result.rows.length === 0
      ) {

        return res.status(404).json({
          error:
            'Perfil de exportación no encontrado',
        });
      }


      return res.json({

        message:
          'Perfil de exportación desactivado',

        profile:
          result.rows[0],

      });


    } catch (error) {

      console.error(
        'DELETE SLAUGHTERHOUSE EXPORT PROFILE ERROR:',
        error,
      );


      return res.status(500).json({
        error:
          'Error desactivando perfil de exportación',
      });

    }
  };
  
// =====================================================
// 📄 HELPERS GENERADOR CSV
// =====================================================

const slaughterhouseExportDateFields =
  new Set([
    'recorded_at',
    'transport_delivered_at',
    'received_at',
    'opened_at',
    'closed_at',
    'slaughter_started_at',
    'completed_at',
  ]);


const slaughterhouseExportDecimalFields =
  new Set([
    'hook_weight_kg',
    'live_weight_kg',
    'live_weight_total_kg',
    'hook_weight_total_kg',
    'average_hook_weight_kg',
    'min_hook_weight_kg',
    'max_hook_weight_kg',
    'carcass_yield_percent',
  ]);


// =====================================================
// 🕒 FORMATEAR FECHA CSV
//
// Actualmente:
// America/La_Paz
//
// Luego podremos mover timezone a companies.
// =====================================================

function formatSlaughterhouseCsvDate(
  value,
  format,
) {

  if (!value) {
    return '';
  }


  const date =
    value instanceof Date
      ? value
      : new Date(
          value,
        );


  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value.toString();
  }


  const formatter =
    new Intl.DateTimeFormat(
      'en-GB',
      {
        timeZone:
          'America/La_Paz',

        year:
          'numeric',

        month:
          '2-digit',

        day:
          '2-digit',

        hour:
          '2-digit',

        minute:
          '2-digit',

        second:
          '2-digit',

        hourCycle:
          'h23',
      },
    );


  const parts = {};


  for (
    const part
    of formatter.formatToParts(
      date,
    )
  ) {

    if (
      part.type !==
        'literal'
    ) {

      parts[
        part.type
      ] =
        part.value;
    }
  }


  const day =
    parts.day;

  const month =
    parts.month;

  const year =
    parts.year;

  const hour =
    parts.hour;

  const minute =
    parts.minute;

  const second =
    parts.second;


  switch (
    format
  ) {

    case 'YYYY-MM-DD':

      return (
        `${year}-${month}-${day}`
      );


    case 'DD-MM-YYYY':

      return (
        `${day}-${month}-${year}`
      );


    case 'DD/MM/YYYY HH:mm':

      return (
        `${day}/${month}/${year} ` +
        `${hour}:${minute}`
      );


    case 'YYYY-MM-DD HH:mm:ss':

      return (
        `${year}-${month}-${day} ` +
        `${hour}:${minute}:${second}`
      );


    case 'DD/MM/YYYY':

    default:

      return (
        `${day}/${month}/${year}`
      );
  }
}


// =====================================================
// 📄 FORMATEAR VALOR CSV
// =====================================================

function formatSlaughterhouseCsvValue(
  field,
  value,
  profile,
) {

  if (
    value === null ||
    value === undefined
  ) {

    return '';
  }


  // ===============================================
  // FECHAS
  // ===============================================

  if (
    slaughterhouseExportDateFields
      .has(
        field,
      )
  ) {

    return formatSlaughterhouseCsvDate(
      value,
      profile.date_format,
    );
  }


  // ===============================================
  // DECIMALES
  // ===============================================

  if (
    slaughterhouseExportDecimalFields
      .has(
        field,
      )
  ) {

    const number =
      Number(
        value,
      );


    if (
      !Number.isFinite(
        number,
      )
    ) {

      return '';
    }


    let formatted =
      number.toFixed(
        2,
      );


    if (
      profile.decimal_separator ===
        ','
    ) {

      formatted =
        formatted.replace(
          '.',
          ',',
        );
    }


    return formatted;
  }


  return value.toString();
}


// =====================================================
// 📄 ESCAPAR CAMPO CSV
// =====================================================

function escapeSlaughterhouseCsvValue(
  value,
  delimiter,
) {

  const text =
    value == null
      ? ''
      : value.toString();


  const escaped =
    text.replace(
      /"/g,
      '""',
    );


  const needsQuotes =
    escaped.includes(
      delimiter,
    ) ||
    escaped.includes(
      '"',
    ) ||
    escaped.includes(
      '\n',
    ) ||
    escaped.includes(
      '\r',
    );


  if (
    needsQuotes
  ) {

    return `"${escaped}"`;
  }


  return escaped;
}


// =====================================================
// 📄 GENERAR CSV DE UNA RECEPCIÓN
//
// GET
// /slaughterhouse/receptions/:id/export/:profileId
//
// El perfil define:
//
// - dataset
// - columnas
// - orden
// - encabezados
// - delimitador
// - decimal
// - formato fecha
// - BOM
// =====================================================

exports.exportSlaughterhouseReceptionCsv =
  async (req, res) => {

    try {

      // =================================================
      // OPERADOR / EMPRESA
      // =================================================

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


      const receptionId =
        Number(
          req.params.id,
        );


      const profileId =
        Number(
          req.params.profileId,
        );


      if (
        !Number.isInteger(
          receptionId,
        ) ||
        receptionId <= 0
      ) {

        return res.status(400).json({
          error:
            'Recepción inválida',
        });
      }


      if (
        !Number.isInteger(
          profileId,
        ) ||
        profileId <= 0
      ) {

        return res.status(400).json({
          error:
            'Perfil de exportación inválido',
        });
      }


      // =================================================
      // RECEPCIÓN
      // =================================================

      const receptionResult =
        await pool.query(
          `
          SELECT

            id,

            company_id,

            reception_number,

            plant_lot_number,

            status

          FROM slaughterhouse_receptions

          WHERE
            id = $1
            AND company_id = $2

          LIMIT 1
          `,
          [
            receptionId,
            companyId,
          ],
        );


      if (
        receptionResult.rows.length ===
          0
      ) {

        return res.status(404).json({
          error:
            'Recepción no encontrada',
        });
      }


      const reception =
        receptionResult.rows[0];


      // =================================================
      // PERFIL
      // =================================================

      const profileResult =
        await pool.query(
          `
          SELECT *

          FROM slaughterhouse_export_profiles

          WHERE
            id = $1
            AND company_id = $2
            AND is_active = true

          LIMIT 1
          `,
          [
            profileId,
            companyId,
          ],
        );


      if (
        profileResult.rows.length ===
          0
      ) {

        return res.status(404).json({
          error:
            'Perfil de exportación no encontrado o inactivo',
        });
      }


      const profile =
        profileResult.rows[0];


      // =================================================
      // VALIDAR NUEVAMENTE COLUMNAS GUARDADAS
      // =================================================

      const columnsValidation =
        validateExportColumns(
          profile.dataset_type,
          profile.columns_config,
        );


      if (
        !columnsValidation.valid
      ) {

        return res.status(500).json({
          error:
            'El perfil de exportación tiene una configuración inválida',
        });
      }


      const columns =
        columnsValidation.columns;


      // =================================================
      // OBTENER DATASET
      // =================================================

      let dataResult;


      // =================================================
      // 🐄 CARCASAS
      // Una fila por carcasa
      // =================================================

      if (
        profile.dataset_type ===
          'carcasses'
      ) {

        dataResult =
          await pool.query(
            `
            SELECT

              sr.reception_number,

              sr.plant_lot_number,

              sc.sequence_number,

              sc.plant_carcass_number,

              sc.hook_weight_kg,

              sc.recorded_at,

              sc.recorded_by

            FROM slaughterhouse_receptions sr

            JOIN slaughterhouse_carcasses sc
              ON sc.reception_id =
                sr.id

            WHERE
              sr.id = $1
              AND sr.company_id = $2

            ORDER BY
              sc.sequence_number ASC,
              sc.id ASC
            `,
            [
              receptionId,
              companyId,
            ],
          );

      }


      // =================================================
      // 🚛 CAMIONES
      // Una fila por camión
      // =================================================

      else if (
        profile.dataset_type ===
          'trucks'
      ) {

        dataResult =
          await pool.query(
            `
            SELECT

              sr.reception_number,

              sr.plant_lot_number,

              srt.plate_snapshot,

              srt.animal_type_snapshot,

              srt.transport_guide_id,

              srt.guide_quantity,

              srt.received_quantity,

              (
                srt.received_quantity
                -
                srt.guide_quantity
              )::int
                AS quantity_difference,

              srt.live_weight_kg,

              srt.origin_snapshot,

              srt.destination_snapshot,

              srt.transport_delivered_at,

              srt.received_at,

              srt.reception_notes

            FROM slaughterhouse_receptions sr

            JOIN slaughterhouse_reception_trucks srt
              ON srt.reception_id =
                sr.id

            WHERE
              sr.id = $1
              AND sr.company_id = $2

            ORDER BY
              srt.received_at ASC,
              srt.id ASC
            `,
            [
              receptionId,
              companyId,
            ],
          );

      }


      // =================================================
      // 📊 RESUMEN
      // Una fila por recepción
      // =================================================

      else if (
        profile.dataset_type ===
          'summary'
      ) {

        dataResult =
          await pool.query(
            `
            SELECT

              sr.reception_number,

              sr.plant_lot_number,

              sr.status,

              COALESCE(
                trucks.trucks_count,
                0
              )::int
                AS trucks_count,

              COALESCE(
                trucks.guide_quantity_total,
                0
              )::int
                AS guide_quantity_total,

              COALESCE(
                trucks.received_quantity_total,
                0
              )::int
                AS received_quantity_total,

              COALESCE(
                trucks.live_weight_total_kg,
                0
              )::numeric
                AS live_weight_total_kg,

              COALESCE(
                carcasses.carcasses_count,
                0
              )::int
                AS carcasses_count,

              COALESCE(
                carcasses.hook_weight_total_kg,
                0
              )::numeric
                AS hook_weight_total_kg,

              COALESCE(
                carcasses.average_hook_weight_kg,
                0
              )::numeric
                AS average_hook_weight_kg,

              COALESCE(
                carcasses.min_hook_weight_kg,
                0
              )::numeric
                AS min_hook_weight_kg,

              COALESCE(
                carcasses.max_hook_weight_kg,
                0
              )::numeric
                AS max_hook_weight_kg,

              CASE

                WHEN
                  COALESCE(
                    trucks.live_weight_total_kg,
                    0
                  ) > 0

                THEN
                  ROUND(
                    (
                      COALESCE(
                        carcasses.hook_weight_total_kg,
                        0
                      )
                      /
                      NULLIF(
                        trucks.live_weight_total_kg,
                        0
                      )
                    ) * 100,
                    2
                  )

                ELSE NULL

              END
                AS carcass_yield_percent,

              sr.opened_at,

              sr.closed_at,

              sr.slaughter_started_at,

              sr.completed_at

            FROM slaughterhouse_receptions sr


            LEFT JOIN LATERAL (

              SELECT

                COUNT(*)::int
                  AS trucks_count,

                COALESCE(
                  SUM(
                    srt.guide_quantity
                  ),
                  0
                )::int
                  AS guide_quantity_total,

                COALESCE(
                  SUM(
                    srt.received_quantity
                  ),
                  0
                )::int
                  AS received_quantity_total,

                COALESCE(
                  SUM(
                    srt.live_weight_kg
                  ),
                  0
                )::numeric
                  AS live_weight_total_kg

              FROM slaughterhouse_reception_trucks srt

              WHERE
                srt.reception_id =
                  sr.id

            ) trucks
              ON true


            LEFT JOIN LATERAL (

              SELECT

                COUNT(*)::int
                  AS carcasses_count,

                COALESCE(
                  SUM(
                    sc.hook_weight_kg
                  ),
                  0
                )::numeric
                  AS hook_weight_total_kg,

                COALESCE(
                  AVG(
                    sc.hook_weight_kg
                  ),
                  0
                )::numeric
                  AS average_hook_weight_kg,

                COALESCE(
                  MIN(
                    sc.hook_weight_kg
                  ),
                  0
                )::numeric
                  AS min_hook_weight_kg,

                COALESCE(
                  MAX(
                    sc.hook_weight_kg
                  ),
                  0
                )::numeric
                  AS max_hook_weight_kg

              FROM slaughterhouse_carcasses sc

              WHERE
                sc.reception_id =
                  sr.id

            ) carcasses
              ON true


            WHERE
              sr.id = $1
              AND sr.company_id = $2

            LIMIT 1
            `,
            [
              receptionId,
              companyId,
            ],
          );

      }


      else {

        return res.status(400).json({
          error:
            'Tipo de exportación inválido',
        });
      }


      // =================================================
      // CONSTRUIR CSV
      // =================================================

      const delimiter =
        profile.delimiter;


      const lines =
        [];


      // =================================================
      // ENCABEZADOS
      // =================================================

      if (
        profile.include_header
      ) {

        const headerLine =
          columns
            .map(
              (
                column,
              ) =>
                escapeSlaughterhouseCsvValue(
                  column.header,
                  delimiter,
                ),
            )
            .join(
              delimiter,
            );


        lines.push(
          headerLine,
        );
      }


      // =================================================
      // FILAS
      // =================================================

      for (
        const row
        of dataResult.rows
      ) {

        const csvRow =
          columns
            .map(
              (
                column,
              ) => {

                const formatted =
                  formatSlaughterhouseCsvValue(
                    column.field,
                    row[
                      column.field
                    ],
                    profile,
                  );


                return escapeSlaughterhouseCsvValue(
                  formatted,
                  delimiter,
                );
              },
            )
            .join(
              delimiter,
            );


        lines.push(
          csvRow,
        );
      }


      // CRLF:
      // mayor compatibilidad con Excel / Windows
      let csv =
        lines.join(
          '\r\n',
        );


      if (
        lines.length > 0
      ) {

        csv +=
          '\r\n';
      }


      // =================================================
      // UTF-8 BOM
      // =================================================

      if (
        profile.encoding ===
          'utf8-bom'
      ) {

        csv =
          '\uFEFF' +
          csv;
      }


      // =================================================
      // NOMBRE ARCHIVO
      // =================================================

      const safeReception =
        reception.reception_number
          .toString()
          .replace(
            /[^a-zA-Z0-9_-]+/g,
            '_',
          );


      const safeProfile =
        profile.name
          .toString()
          .trim()
          .replace(
            /[^a-zA-Z0-9_-]+/g,
            '_',
          );


      const filename =
        `${safeReception}_${safeProfile}.csv`;


      // =================================================
      // RESPUESTA
      // =================================================

      res.setHeader(
        'Content-Type',
        'text/csv; charset=utf-8',
      );


      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );


      res.setHeader(
        'Cache-Control',
        'no-store',
      );


      return res
        .status(
          200,
        )
        .send(
          csv,
        );


    } catch (error) {

      console.error(
        'EXPORT SLAUGHTERHOUSE RECEPTION CSV ERROR:',
        error,
      );


      return res.status(500).json({
        error:
          'Error generando archivo CSV',
      });

    }
  };

// =====================================================
// 📦 EXPORTAR VARIAS RECEPCIONES EN UN SOLO CSV
//
// POST /slaughterhouse/receptions/export/:profileId
//
// BODY:
// {
//   "reception_ids": [1, 2, 3]
// }
// =====================================================

exports.exportSlaughterhouseReceptionsCsv =
  async (req, res) => {
    try {
      // =================================================
      // OPERADOR / EMPRESA
      // =================================================

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

      const profileId =
        Number(
          req.params.profileId,
        );

      // =================================================
      // VALIDAR PERFIL
      // =================================================

      if (
        !Number.isInteger(
          profileId,
        ) ||
        profileId <= 0
      ) {
        return res.status(400).json({
          error:
            'Perfil de exportación inválido',
        });
      }

      // =================================================
      // RECEPCIONES
      // =================================================

      const rawReceptionIds =
        req.body?.reception_ids;

      if (
        !Array.isArray(
          rawReceptionIds,
        ) ||
        rawReceptionIds.length === 0
      ) {
        return res.status(400).json({
          error:
            'Debe seleccionar al menos una recepción',
        });
      }

      // Evita duplicados y valores inválidos.
      const receptionIds =
        [
          ...new Set(
            rawReceptionIds
              .map(
                (value) =>
                  Number(value),
              )
              .filter(
                (value) =>
                  Number.isInteger(
                    value,
                  ) &&
                  value > 0,
              ),
          ),
        ];

      if (
        receptionIds.length === 0
      ) {
        return res.status(400).json({
          error:
            'Las recepciones seleccionadas son inválidas',
        });
      }

      // Protección ante exportaciones
      // excesivamente grandes por error.
      if (
        receptionIds.length > 500
      ) {
        return res.status(400).json({
          error:
            'No se pueden exportar más de 500 recepciones a la vez',
        });
      }

      // =================================================
      // VALIDAR RECEPCIONES
      //
      // Todas deben:
      // - pertenecer al frigorífico
      // - existir
      // - estar finalizadas/canceladas
      // =================================================

      const receptionsResult =
        await pool.query(
          `
          SELECT
            id,
            company_id,
            reception_number,
            plant_lot_number,
            status,
            completed_at
          FROM slaughterhouse_receptions
          WHERE
            company_id = $1
            AND id =
              ANY(
                $2::int[]
              )
            AND status IN (
              'completed',
              'cancelled'
            )
          ORDER BY
            array_position(
              $2::int[],
              id
            )
          `,
          [
            companyId,
            receptionIds,
          ],
        );

      if (
        receptionsResult.rows.length !==
        receptionIds.length
      ) {
        return res.status(404).json({
          error:
            'Una o más recepciones no existen, no pertenecen al frigorífico o todavía no están finalizadas',
        });
      }

      // =================================================
      // PERFIL
      // =================================================

      const profileResult =
        await pool.query(
          `
          SELECT *
          FROM slaughterhouse_export_profiles
          WHERE
            id = $1
            AND company_id = $2
            AND is_active = true
          LIMIT 1
          `,
          [
            profileId,
            companyId,
          ],
        );

      if (
        profileResult.rows.length ===
        0
      ) {
        return res.status(404).json({
          error:
            'Perfil de exportación no encontrado o inactivo',
        });
      }

      const profile =
        profileResult.rows[0];

      // =================================================
      // VALIDAR COLUMNAS
      // =================================================

      const columnsValidation =
        validateExportColumns(
          profile.dataset_type,
          profile.columns_config,
        );

      if (
        !columnsValidation.valid
      ) {
        return res.status(500).json({
          error:
            'El perfil de exportación tiene una configuración inválida',
        });
      }

      const columns =
        columnsValidation.columns;

      // =================================================
      // DATASET
      // =================================================

      let dataResult;

      // =================================================
      // 🐄 CARCASAS
      // Una fila por carcasa
      // =================================================

      if (
        profile.dataset_type ===
        'carcasses'
      ) {
        dataResult =
          await pool.query(
            `
            SELECT
              sr.reception_number,
              sr.plant_lot_number,
              sc.sequence_number,
              sc.plant_carcass_number,
              sc.hook_weight_kg,
              sc.recorded_at,
              sc.recorded_by
            FROM slaughterhouse_receptions sr

            JOIN slaughterhouse_carcasses sc
              ON sc.reception_id =
                sr.id

            WHERE
              sr.company_id = $1
              AND sr.id =
                ANY(
                  $2::int[]
                )

            ORDER BY
              array_position(
                $2::int[],
                sr.id
              ),
              sc.sequence_number ASC,
              sc.id ASC
            `,
            [
              companyId,
              receptionIds,
            ],
          );
      }

      // =================================================
      // 🚛 CAMIONES
      // Una fila por camión
      // =================================================

      else if (
        profile.dataset_type ===
        'trucks'
      ) {
        dataResult =
          await pool.query(
            `
            SELECT
              sr.reception_number,
              sr.plant_lot_number,
              srt.plate_snapshot,
              srt.animal_type_snapshot,
              srt.transport_guide_id,
              srt.guide_quantity,
              srt.received_quantity,
              (
                srt.received_quantity
                -
                srt.guide_quantity
              )::int
                AS quantity_difference,
              srt.live_weight_kg,
              srt.origin_snapshot,
              srt.destination_snapshot,
              srt.transport_delivered_at,
              srt.received_at,
              srt.reception_notes

            FROM slaughterhouse_receptions sr

            JOIN slaughterhouse_reception_trucks srt
              ON srt.reception_id =
                sr.id

            WHERE
              sr.company_id = $1
              AND sr.id =
                ANY(
                  $2::int[]
                )

            ORDER BY
              array_position(
                $2::int[],
                sr.id
              ),
              srt.received_at ASC,
              srt.id ASC
            `,
            [
              companyId,
              receptionIds,
            ],
          );
      }

      // =================================================
      // 📊 RESUMEN
      // Una fila por recepción
      // =================================================

      else if (
        profile.dataset_type ===
        'summary'
      ) {
        dataResult =
          await pool.query(
            `
            SELECT
              sr.reception_number,
              sr.plant_lot_number,
              sr.status,

              COALESCE(
                trucks.trucks_count,
                0
              )::int
                AS trucks_count,

              COALESCE(
                trucks.guide_quantity_total,
                0
              )::int
                AS guide_quantity_total,

              COALESCE(
                trucks.received_quantity_total,
                0
              )::int
                AS received_quantity_total,

              COALESCE(
                trucks.live_weight_total_kg,
                0
              )::numeric
                AS live_weight_total_kg,

              COALESCE(
                carcasses.carcasses_count,
                0
              )::int
                AS carcasses_count,

              COALESCE(
                carcasses.hook_weight_total_kg,
                0
              )::numeric
                AS hook_weight_total_kg,

              COALESCE(
                carcasses.average_hook_weight_kg,
                0
              )::numeric
                AS average_hook_weight_kg,

              COALESCE(
                carcasses.min_hook_weight_kg,
                0
              )::numeric
                AS min_hook_weight_kg,

              COALESCE(
                carcasses.max_hook_weight_kg,
                0
              )::numeric
                AS max_hook_weight_kg,

              CASE
                WHEN
                  COALESCE(
                    trucks.live_weight_total_kg,
                    0
                  ) > 0
                THEN
                  ROUND(
                    (
                      COALESCE(
                        carcasses.hook_weight_total_kg,
                        0
                      )
                      /
                      NULLIF(
                        trucks.live_weight_total_kg,
                        0
                      )
                    ) * 100,
                    2
                  )
                ELSE NULL
              END
                AS carcass_yield_percent,

              sr.opened_at,
              sr.closed_at,
              sr.slaughter_started_at,
              sr.completed_at

            FROM slaughterhouse_receptions sr

            LEFT JOIN LATERAL (
              SELECT
                COUNT(*)::int
                  AS trucks_count,

                COALESCE(
                  SUM(
                    srt.guide_quantity
                  ),
                  0
                )::int
                  AS guide_quantity_total,

                COALESCE(
                  SUM(
                    srt.received_quantity
                  ),
                  0
                )::int
                  AS received_quantity_total,

                COALESCE(
                  SUM(
                    srt.live_weight_kg
                  ),
                  0
                )::numeric
                  AS live_weight_total_kg

              FROM slaughterhouse_reception_trucks srt

              WHERE
                srt.reception_id =
                  sr.id
            ) trucks
              ON true

            LEFT JOIN LATERAL (
              SELECT
                COUNT(*)::int
                  AS carcasses_count,

                COALESCE(
                  SUM(
                    sc.hook_weight_kg
                  ),
                  0
                )::numeric
                  AS hook_weight_total_kg,

                COALESCE(
                  AVG(
                    sc.hook_weight_kg
                  ),
                  0
                )::numeric
                  AS average_hook_weight_kg,

                COALESCE(
                  MIN(
                    sc.hook_weight_kg
                  ),
                  0
                )::numeric
                  AS min_hook_weight_kg,

                COALESCE(
                  MAX(
                    sc.hook_weight_kg
                  ),
                  0
                )::numeric
                  AS max_hook_weight_kg

              FROM slaughterhouse_carcasses sc

              WHERE
                sc.reception_id =
                  sr.id
            ) carcasses
              ON true

            WHERE
              sr.company_id = $1
              AND sr.id =
                ANY(
                  $2::int[]
                )

            ORDER BY
              array_position(
                $2::int[],
                sr.id
              )
            `,
            [
              companyId,
              receptionIds,
            ],
          );
      }

      else {
        return res.status(400).json({
          error:
            'Tipo de exportación inválido',
        });
      }

      // =================================================
      // CONSTRUIR CSV
      // =================================================

      const delimiter =
        profile.delimiter;

      const lines =
        [];

      // =================================================
      // ENCABEZADOS
      // =================================================

      if (
        profile.include_header
      ) {
        const headerLine =
          columns
            .map(
              (
                column,
              ) =>
                escapeSlaughterhouseCsvValue(
                  column.header,
                  delimiter,
                ),
            )
            .join(
              delimiter,
            );

        lines.push(
          headerLine,
        );
      }

      // =================================================
      // FILAS
      // =================================================

      for (
        const row
        of dataResult.rows
      ) {
        const csvRow =
          columns
            .map(
              (
                column,
              ) => {
                const formatted =
                  formatSlaughterhouseCsvValue(
                    column.field,
                    row[
                      column.field
                    ],
                    profile,
                  );

                return escapeSlaughterhouseCsvValue(
                  formatted,
                  delimiter,
                );
              },
            )
            .join(
              delimiter,
            );

        lines.push(
          csvRow,
        );
      }

      // =================================================
      // CRLF
      // =================================================

      let csv =
        lines.join(
          '\r\n',
        );

      if (
        lines.length > 0
      ) {
        csv +=
          '\r\n';
      }

      // =================================================
      // UTF-8 BOM
      // =================================================

      if (
        profile.encoding ===
        'utf8-bom'
      ) {
        csv =
          '\uFEFF' +
          csv;
      }

      // =================================================
      // NOMBRE ARCHIVO
      // =================================================

      const safeProfile =
        profile.name
          .toString()
          .trim()
          .replace(
            /[^a-zA-Z0-9_-]+/g,
            '_',
          );

      const safeCompany =
        (
          operator.company_name ||
          'FRIGORIFICO'
        )
          .toString()
          .trim()
          .replace(
            /[^a-zA-Z0-9_-]+/g,
            '_',
          );

      const filename =
        `${safeCompany}_${receptionIds.length}_RECEPCIONES_${safeProfile}.csv`;

      // =================================================
      // RESPUESTA
      // =================================================

      res.setHeader(
        'Content-Type',
        'text/csv; charset=utf-8',
      );

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );

      res.setHeader(
        'Cache-Control',
        'no-store',
      );

      return res
        .status(
          200,
        )
        .send(
          csv,
        );
    } catch (error) {
      console.error(
        'EXPORT MULTIPLE SLAUGHTERHOUSE RECEPTIONS CSV ERROR:',
        error,
      );

      return res.status(500).json({
        error:
          'Error generando archivo CSV múltiple',
      });
    }
  };

// =====================================================
// 📋 HISTORIAL DE RECEPCIONES / FAENAS
//
// GET /slaughterhouse/receptions/history
//
// Devuelve recepciones finalizadas de la empresa,
// con resumen listo para historial y exportación.
// =====================================================

exports.getSlaughterhouseReceptionHistory =
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

            sr.id,

            sr.reception_number,

            sr.plant_lot_number,

            sr.status,

            sr.opened_at,

            sr.closed_at,

            sr.slaughter_started_at,

            sr.completed_at,

            sr.notes,


            COALESCE(
              trucks.trucks_count,
              0
            )::int
              AS trucks_count,

            COALESCE(
              trucks.guide_quantity_total,
              0
            )::int
              AS guide_quantity_total,

            COALESCE(
              trucks.received_quantity_total,
              0
            )::int
              AS received_quantity_total,

            COALESCE(
              trucks.live_weight_total_kg,
              0
            )::numeric
              AS live_weight_total_kg,


            COALESCE(
              carcasses.carcasses_count,
              0
            )::int
              AS carcasses_count,

            COALESCE(
              carcasses.hook_weight_total_kg,
              0
            )::numeric
              AS hook_weight_total_kg,

            COALESCE(
              carcasses.average_hook_weight_kg,
              0
            )::numeric
              AS average_hook_weight_kg,

            COALESCE(
              carcasses.min_hook_weight_kg,
              0
            )::numeric
              AS min_hook_weight_kg,

            COALESCE(
              carcasses.max_hook_weight_kg,
              0
            )::numeric
              AS max_hook_weight_kg,


            CASE

              WHEN
                COALESCE(
                  trucks.live_weight_total_kg,
                  0
                ) > 0

              THEN
                ROUND(
                  (
                    COALESCE(
                      carcasses.hook_weight_total_kg,
                      0
                    )
                    /
                    NULLIF(
                      trucks.live_weight_total_kg,
                      0
                    )
                  ) * 100,
                  2
                )

              ELSE NULL

            END
              AS carcass_yield_percent


          FROM slaughterhouse_receptions sr


          LEFT JOIN LATERAL (

            SELECT

              COUNT(*)::int
                AS trucks_count,

              COALESCE(
                SUM(
                  srt.guide_quantity
                ),
                0
              )::int
                AS guide_quantity_total,

              COALESCE(
                SUM(
                  srt.received_quantity
                ),
                0
              )::int
                AS received_quantity_total,

              COALESCE(
                SUM(
                  srt.live_weight_kg
                ),
                0
              )::numeric
                AS live_weight_total_kg

            FROM slaughterhouse_reception_trucks srt

            WHERE
              srt.reception_id =
                sr.id

          ) trucks
            ON true


          LEFT JOIN LATERAL (

            SELECT

              COUNT(*)::int
                AS carcasses_count,

              COALESCE(
                SUM(
                  sc.hook_weight_kg
                ),
                0
              )::numeric
                AS hook_weight_total_kg,

              COALESCE(
                AVG(
                  sc.hook_weight_kg
                ),
                0
              )::numeric
                AS average_hook_weight_kg,

              COALESCE(
                MIN(
                  sc.hook_weight_kg
                ),
                0
              )::numeric
                AS min_hook_weight_kg,

              COALESCE(
                MAX(
                  sc.hook_weight_kg
                ),
                0
              )::numeric
                AS max_hook_weight_kg

            FROM slaughterhouse_carcasses sc

            WHERE
              sc.reception_id =
                sr.id

          ) carcasses
            ON true


          WHERE

            sr.company_id = $1

            AND sr.status IN (
              'completed',
              'cancelled'
            )


          ORDER BY

            sr.completed_at DESC NULLS LAST,

            sr.id DESC
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

        receptions:
          result.rows,

      });


    } catch (error) {

      console.error(
        'GET SLAUGHTERHOUSE RECEPTION HISTORY ERROR:',
        error,
      );


      return res.status(500).json({
        error:
          'Error obteniendo historial de faenas',
      });

    }
  };