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