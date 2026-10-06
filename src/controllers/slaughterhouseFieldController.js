const { pool } = require('../config/db');

const admin =
  require('firebase-admin');

const {
  sendUserNotification,
  sendSlaughterhouseOperatorNotification,
} = require('../services/notificationService');

// =====================================================
// 📱 HOJAS ASIGNADAS AL CAPTADOR AUTENTICADO
//
// GET /slaughterhouse/field/capture-sheets
//
// Requiere:
// - JWT normal Plaza Ganadera
// - company_id en el token
// - slaughterhouse_people.user_id = usuario autenticado
// - rol captador activo
// =====================================================

exports.getAssignedCaptureSheets =
  async (req, res) => {

    try {

      const userId =
        Number(
          req.user?.user_id ??
          req.user?.id
        );


      const companyId =
        Number(
          req.user?.company_id
        );


      if (
        !Number.isInteger(userId) ||
        userId <= 0
      ) {
        return res.status(401).json({
          error:
            'Usuario autenticado inválido',
        });
      }


      if (
        !Number.isInteger(companyId) ||
        companyId <= 0
      ) {
        return res.status(400).json({
          error:
            'Contexto de empresa inválido',
        });
      }


      // =================================================
      // IDENTIFICAR PERSONA CAPTADOR
      // =================================================

      const captadorResult =
        await pool.query(
          `
            SELECT
              sp.id,
              sp.full_name,
              sp.phone,
              sp.email

            FROM slaughterhouse_people sp

            JOIN slaughterhouse_person_roles spr
              ON spr.person_id = sp.id
              AND spr.role = 'captador'
              AND spr.is_active = true

            WHERE
              sp.company_id = $1
              AND sp.user_id = $2
              AND sp.is_active = true

            LIMIT 1
          `,
          [
            companyId,
            userId,
          ],
        );


      if (
        captadorResult.rows.length === 0
      ) {
        return res.status(403).json({
          error:
            'El usuario no está habilitado como captador/comprador en este frigorífico',
        });
      }


      const captador =
        captadorResult.rows[0];


      // =================================================
      // HOJAS ASIGNADAS
      // =================================================

      const sheetsResult =
        await pool.query(
          `
            SELECT
              scs.id,
              scs.capture_number,
              scs.seller_person_id,
              scs.captador_person_id,
              scs.planned_date,
              scs.status,
              scs.notes,
              scs.created_at,
              scs.updated_at,

              seller.full_name
                AS seller_name,

              seller.phone
                AS seller_phone,

              seller.email
                AS seller_email,

              COALESCE(
                lot_summary.lot_count,
                0
              )::int
                AS lot_count,

              COALESCE(
                lot_summary.total_expected_quantity,
                0
              )::int
                AS total_expected_quantity,

              COALESCE(
                lot_summary.total_dispatched_quantity,
                0
              )::int
                AS total_dispatched_quantity,

              COALESCE(
                lot_summary.total_received_quantity,
                0
              )::int
                AS total_received_quantity

            FROM slaughterhouse_capture_sheets scs

            JOIN slaughterhouse_people seller
              ON seller.id =
                scs.seller_person_id
              AND seller.company_id =
                scs.company_id

            LEFT JOIN LATERAL (
              SELECT
                COUNT(spl.id)::int
                  AS lot_count,

                COALESCE(
                  SUM(
                    spl.expected_quantity
                  ),
                  0
                )::int
                  AS total_expected_quantity,

                COALESCE(
                  SUM(
                    troop_summary.dispatched_quantity
                  ),
                  0
                )::int
                  AS total_dispatched_quantity,

                COALESCE(
                  SUM(
                    troop_summary.received_quantity
                  ),
                  0
                )::int
                  AS total_received_quantity

              FROM slaughterhouse_purchase_lots spl

              LEFT JOIN LATERAL (
                SELECT
                  COALESCE(
                    SUM(
                      st.dispatched_quantity
                    ),
                    0
                  )::int
                    AS dispatched_quantity,

                  COALESCE(
                    SUM(
                      st.received_quantity
                    ),
                    0
                  )::int
                    AS received_quantity

                FROM slaughterhouse_troops st

                WHERE
                  st.purchase_lot_id =
                    spl.id
                  AND st.company_id =
                    spl.company_id
                  AND st.status <>
                    'cancelled'
              ) troop_summary
                ON true

              WHERE
                spl.capture_sheet_id =
                  scs.id
                AND spl.company_id =
                  scs.company_id
                AND spl.captador_person_id =
                  $2
            ) lot_summary
              ON true

            WHERE
              scs.company_id = $1

              AND scs.status IN (
                'draft',
                'open',
                'field_certified'
              )

              AND EXISTS (
                SELECT 1

                FROM slaughterhouse_purchase_lots spl_assigned

                WHERE
                  spl_assigned.company_id =
                    scs.company_id

                  AND spl_assigned.capture_sheet_id =
                    scs.id

                  AND spl_assigned.captador_person_id =
                    $2

                  AND (
                    -- Todavía no tiene ninguna tropa/camión:
                    -- debe seguir visible para el Captador.
                    NOT EXISTS (
                      SELECT 1
                      FROM slaughterhouse_troops st_any
                      WHERE
                        st_any.company_id =
                          spl_assigned.company_id
                        AND st_any.purchase_lot_id =
                          spl_assigned.id
                        AND st_any.status <> 'cancelled'
                    )

                    OR

                    -- Tiene tropas, pero al menos una aún
                    -- no terminó su certificación de campo.
                    EXISTS (
                      SELECT 1
                      FROM slaughterhouse_troops st_pending
                      WHERE
                        st_pending.company_id =
                          spl_assigned.company_id
                        AND st_pending.purchase_lot_id =
                          spl_assigned.id
                        AND st_pending.status <> 'cancelled'
                        AND COALESCE(
                          st_pending.field_capture_status,
                          'pending'
                        ) <> 'certified'
                    )
                  )
              )

            ORDER BY
              scs.planned_date ASC NULLS LAST,
              scs.id ASC
          `,
          [
            companyId,
            captador.id,
          ],
        );


      return res.json({
        success: true,

        captador: {
          person_id:
            Number(captador.id),

          user_id:
            userId,

          name:
            captador.full_name,

          phone:
            captador.phone,

          email:
            captador.email,
        },

        count:
          sheetsResult.rows.length,

        capture_sheets:
          sheetsResult.rows,
      });

    } catch (error) {

      console.error(
        'GET FIELD CAPTURE SHEETS ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo hojas asignadas al captador',
      });

    }

  };

// =====================================================
// 📋 DETALLE HOJA ASIGNADA AL CAPTADOR
//
// GET /slaughterhouse/field/capture-sheets/:id
// =====================================================

exports.getAssignedCaptureSheetById =
  async (req, res) => {

    try {

      const userId =
        Number(
          req.user?.user_id ??
          req.user?.id
        );

      const companyId =
        Number(
          req.user?.company_id
        );

      const captureSheetId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(userId) ||
        userId <= 0
      ) {
        return res.status(401).json({
          error:
            'Usuario autenticado inválido',
        });
      }


      if (
        !Number.isInteger(companyId) ||
        companyId <= 0
      ) {
        return res.status(400).json({
          error:
            'Contexto de empresa inválido',
        });
      }


      if (
        !Number.isInteger(captureSheetId) ||
        captureSheetId <= 0
      ) {
        return res.status(400).json({
          error:
            'Hoja de captación inválida',
        });
      }


      // =================================================
      // CAPTADOR AUTENTICADO
      // =================================================

      const captadorResult =
        await pool.query(
          `
            SELECT
              sp.id,
              sp.full_name

            FROM slaughterhouse_people sp

            JOIN slaughterhouse_person_roles spr
              ON spr.person_id = sp.id
              AND spr.role = 'captador'
              AND spr.is_active = true

            WHERE
              sp.company_id = $1
              AND sp.user_id = $2
              AND sp.is_active = true

            LIMIT 1
          `,
          [
            companyId,
            userId,
          ],
        );


      if (
        captadorResult.rows.length === 0
      ) {
        return res.status(403).json({
          error:
            'El usuario no está habilitado como captador/comprador en este frigorífico',
        });
      }


      const captador =
        captadorResult.rows[0];


      // =================================================
      // CABECERA DE LA HOJA
      // =================================================

      const sheetResult =
        await pool.query(
          `
            SELECT
              scs.id,
              scs.company_id,
              scs.capture_number,
              scs.seller_person_id,
              scs.captador_person_id,
              scs.planned_date,
              scs.status,
              scs.notes,
              scs.created_at,
              scs.updated_at,

              seller.full_name
                AS seller_name,

              seller.phone
                AS seller_phone,

              seller.email
                AS seller_email

            FROM slaughterhouse_capture_sheets scs

            JOIN slaughterhouse_people seller
              ON seller.id =
                scs.seller_person_id
              AND seller.company_id =
                scs.company_id

            WHERE
              scs.id = $1
              AND scs.company_id = $2

              AND scs.status IN (
                'draft',
                'open',
                'field_certified'
              )

              AND EXISTS (
                SELECT 1

                FROM slaughterhouse_purchase_lots spl_assigned

                WHERE
                  spl_assigned.company_id =
                    scs.company_id

                  AND spl_assigned.capture_sheet_id =
                    scs.id

                  AND spl_assigned.captador_person_id =
                    $3
              )

            LIMIT 1
          `,
          [
            captureSheetId,
            companyId,
            captador.id,
          ],
        );


      if (
        sheetResult.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            'Hoja de captación no encontrada o no asignada a este captador',
        });
      }


      const captureSheet =
        sheetResult.rows[0];


      // =================================================
      // LOTES DE LA HOJA
      // =================================================

      const lotsResult =
        await pool.query(
          `
            SELECT
              spl.id,
              spl.lot_number,
              spl.external_order_number,
              spl.capture_sheet_id,
              spl.seller_person_id,
              spl.estate_id,
              se.name
                AS estate_name,

              spl.captador_person_id,
              spl.captador_assignment_version,
              spl.captador_assigned_at,
              spl.commissioner_person_id,

              spl.classification_id,
              sac.generated_code
                AS classification_code,
              sac.display_name
                AS classification_name,

              spl.purchase_type,
              spl.pricing_basis,
              spl.weight_source,
              spl.expected_quantity,
              spl.price_per_unit,
              spl.currency,
              spl.shrink_percent,
              spl.planned_date,
              spl.status,
              spl.notes,
              spl.captador_notes,
              spl.captador_notes_updated_at,
              spl.captador_notes_updated_by,

              transport_request_summary.transport_request_id,
              transport_request_summary.transport_request_status,

              COALESCE(
                troop_summary.confirmed_truck_count,
                0
              )::int
                AS confirmed_truck_count,

              COALESCE(
                troop_summary.troop_count,
                0
              )::int
                AS troop_count,

              COALESCE(
                troop_summary.dispatched_quantity,
                0
              )::int
                AS dispatched_quantity,

              COALESCE(
                troop_summary.received_quantity,
                0
              )::int
                AS received_quantity,

              COALESCE(
                troop_summary.troops,
                '[]'::jsonb
              )
                AS troops

            FROM slaughterhouse_purchase_lots spl

            LEFT JOIN slaughterhouse_estates se
              ON se.id = spl.estate_id
              AND se.company_id =
                spl.company_id

            LEFT JOIN slaughterhouse_animal_classifications sac
              ON sac.id =
                spl.classification_id
              AND sac.company_id =
                spl.company_id

            LEFT JOIN LATERAL (
              SELECT
                COUNT(st.id)::int
                  AS troop_count,

                COUNT(st.id) FILTER (
                  WHERE
                    st.transport_negotiation_id IS NOT NULL
                    AND st.status IN (
                      'transport_assigned',
                      'dispatched',
                      'in_transit',
                      'received',
                      'in_slaughter',
                      'completed'
                    )
                )::int
                  AS confirmed_truck_count,

                COALESCE(
                  SUM(
                    st.dispatched_quantity
                  ),
                  0
                )::int
                  AS dispatched_quantity,

                COALESCE(
                  SUM(
                    st.received_quantity
                  ),
                  0
                )::int
                  AS received_quantity,

                COALESCE(
                  jsonb_agg(
                    jsonb_build_object(
                      'id',
                        st.id,

                      'troop_number',
                        st.troop_number,

                      'transport_request_id',
                        st.transport_request_id,

                      'transport_negotiation_id',
                        st.transport_negotiation_id,

                      'truck_id',
                        st.truck_id,

                      'transporter_user_id',
                        st.transporter_user_id,

                      'plate',
                        tt.plate,

                      'brand',
                        tt.brand,

                      'model',
                        tt.model,

                      'expected_quantity',
                        st.expected_quantity,

                      'status',
                        st.status,

                      'field_sync_id',
                        st.field_sync_id,

                      'field_capture_status',
                        st.field_capture_status,

                      'field_captured_quantity',
                        st.field_captured_quantity,

                      'field_captured_at',
                        st.field_captured_at,

                      'field_authorization_id',
                        st.field_authorization_id
                    )
                    ORDER BY st.id ASC
                  )
                    FILTER (
                      WHERE st.id IS NOT NULL
                    ),
                  '[]'::jsonb
                )
                  AS troops

              FROM slaughterhouse_troops st

              LEFT JOIN transporter_trucks tt
                ON tt.id =
                  st.truck_id

              WHERE
                st.purchase_lot_id =
                  spl.id
                AND st.company_id =
                  spl.company_id
                AND st.status <>
                  'cancelled'
            ) troop_summary
              ON true

            LEFT JOIN LATERAL (
              SELECT
                tr.id
                  AS transport_request_id,

                tr.status
                  AS transport_request_status

              FROM transport_requests tr

              WHERE
                tr.purchase_lot_id =
                  spl.id

                AND tr.requester_company_id =
                  spl.company_id

              ORDER BY
                tr.id DESC

              LIMIT 1
            ) transport_request_summary
              ON true

            WHERE
              spl.company_id = $1
              AND spl.capture_sheet_id = $2
              AND spl.seller_person_id = $3
              AND spl.captador_person_id = $4

            ORDER BY
              spl.id ASC
          `,
          [
            companyId,
            captureSheetId,
            captureSheet.seller_person_id,
            captador.id,
          ],
        );


      const totalExpectedQuantity =
        lotsResult.rows.reduce(
          (
            total,
            lot,
          ) =>
            total +
            Number(
              lot.expected_quantity || 0
            ),
          0,
        );


      return res.json({
        success: true,

        captador: {
          person_id:
            Number(captador.id),

          user_id:
            userId,

          name:
            captador.full_name,
        },

        capture_sheet:
          captureSheet,

        summary: {
          lot_count:
            lotsResult.rows.length,

          total_expected_quantity:
            totalExpectedQuantity,
        },

        lots:
          lotsResult.rows,
      });

    } catch (error) {

      console.error(
        'GET FIELD CAPTURE SHEET DETAIL ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error obteniendo detalle de hoja de captación',
      });

    }

  };

// =====================================================
// 🚛 CAMIONES APROBADOS DE LA RED DEL FRIGORÍFICO
//
// GET /slaughterhouse/field/transport/trucks
//
// Solo para Captador autenticado.
// Devuelve únicamente:
// - transportista aprobado por la empresa
// - persona activa
// - relación camión/transportista activa
// - camión empresa activo
// - camión Plaza Transporte activo
// =====================================================

exports.getFieldApprovedTransportTrucks =
  async (req, res) => {

    try {

      const userId =
        Number(
          req.user?.user_id ??
          req.user?.id
        );

      const companyId =
        Number(
          req.user?.company_id
        );


      if (
        !Number.isInteger(userId) ||
        userId <= 0
      ) {
        return res.status(401).json({
          error:
            'Usuario autenticado inválido',
        });
      }


      if (
        !Number.isInteger(companyId) ||
        companyId <= 0
      ) {
        return res.status(400).json({
          error:
            'Contexto de empresa inválido',
        });
      }


      // =================================================
      // VALIDAR USUARIO HABILITADO PARA VER CAMIONES
      //
      // Puede ser:
      // - Captador activo
      // - Admin web
      // - Operations web
      // =================================================

      const captadorResult =
        await pool.query(
          `
            SELECT
              sp.id,
              sp.full_name

            FROM slaughterhouse_people sp

            JOIN slaughterhouse_person_roles spr
              ON spr.person_id = sp.id
              AND spr.role = 'captador'
              AND spr.is_active = true

            WHERE
              sp.company_id = $1
              AND sp.user_id = $2
              AND sp.is_active = true

            LIMIT 1
          `,
          [
            companyId,
            userId,
          ],
        );


      const webOperatorRoleResult =
        await pool.query(
          `
            SELECT DISTINCT
              sr.code

            FROM user_companies uc

            JOIN companies c
              ON c.id = uc.company_id
              AND c.company_type = 'slaughterhouse'
              AND c.is_active = true

            JOIN slaughterhouse_user_roles sur
              ON sur.user_id = uc.user_id
              AND sur.company_id = uc.company_id

            JOIN slaughterhouse_roles sr
              ON sr.id = sur.role_id
              AND sr.company_id = sur.company_id
              AND sr.is_active = true

            WHERE
              uc.user_id = $1
              AND uc.company_id = $2
              AND uc.role = 'slaughterhouse_operator'
              AND uc.company_status = 'approved'

              AND sr.code IN (
                'admin',
                'operations'
              )
          `,
          [
            userId,
            companyId,
          ],
        );


      const isCaptador =
        captadorResult.rows.length > 0;

      const canViewAsWebOperator =
        webOperatorRoleResult.rows.length > 0;


      if (
        !isCaptador &&
        !canViewAsWebOperator
      ) {

        return res.status(403).json({
          error:
            'El usuario no está habilitado para consultar camiones de este frigorífico',
        });
      }


      // =================================================
      // CAMIONES APROBADOS DE LA RED PRIVADA
      // =================================================

      const trucksResult =
        await pool.query(
          `
            SELECT

              sct.id
                AS company_transporter_id,

              sct.is_preferred,

              sp.id
                AS transporter_person_id,

              sp.user_id
                AS transporter_user_id,

              sp.full_name
                AS transporter_name,

              sp.phone
                AS transporter_phone,

              sp.document_type
                AS transporter_document_type,

              sp.document_number
                AS transporter_document_number,


              sctt.id
                AS company_transporter_truck_id,

              sctt.is_primary,


              sctr.id
                AS company_truck_id,

              sctr.transporter_truck_id,


              -- ================================================
              -- DATOS DEL CAMIÓN FRIGOSI
              -- ================================================

              sctr.plate,

              sctr.brand,

              sctr.model,

              sctr.year,

              sctr.truck_type,


              -- ================================================
              -- VÍNCULO CON PLAZA TRANSPORTE
              --
              -- Puede ser NULL.
              -- El camión NO desaparece de la lista FRIGOSI.
              -- ================================================

              tt.id
                AS truck_id,

              tt.capacity_large,

              tt.capacity_small,

              tt.has_trailer,

              tt.trailer_capacity,

              tt.is_verified,

              tt.is_available,


            CASE
              WHEN
                sp.user_id IS NOT NULL
                AND sctr.transporter_truck_id IS NOT NULL
                AND tt.id IS NOT NULL
                AND tt.is_active = true
              THEN true
              ELSE false
            END
              AS has_plaza_transport,


            CASE
              WHEN EXISTS (

                SELECT 1

                FROM transport_negotiations tn_busy

                WHERE
                  tn_busy.truck_id = tt.id

                  AND tn_busy.cancelled = false

                  AND tn_busy.status IN (
                    'paid',
                    'trip_active',
                    'delivery_pending'
                  )

              )
              THEN true
              ELSE false
            END
              AS is_busy,


            (
              SELECT
                tn_busy.status

              FROM transport_negotiations tn_busy

              WHERE
                tn_busy.truck_id = tt.id

                AND tn_busy.cancelled = false

                AND tn_busy.status IN (
                  'paid',
                  'trip_active',
                  'delivery_pending'
                )

              ORDER BY
                tn_busy.id DESC

              LIMIT 1
            )
              AS active_trip_status


            FROM slaughterhouse_company_transporters sct


            JOIN slaughterhouse_people sp
              ON sp.id =
                sct.person_id
              AND sp.company_id =
                sct.company_id
              AND sp.is_active = true


            JOIN slaughterhouse_company_transporter_trucks sctt
              ON sctt.company_transporter_id =
                sct.id
              AND sctt.is_active = true


            JOIN slaughterhouse_company_trucks sctr
              ON sctr.id =
                sctt.company_truck_id
              AND sctr.company_id =
                sct.company_id
              AND sctr.is_active = true


            LEFT JOIN transporter_trucks tt
              ON tt.id =
                sctr.transporter_truck_id
              AND tt.user_id =
                sp.user_id
              AND tt.is_active = true


            WHERE
              sct.company_id = $1
              AND sct.status =
                'approved'


            ORDER BY
              sct.is_preferred DESC,
              sctt.is_primary DESC,
              sp.full_name ASC,
              sctr.plate ASC
          `,
          [
            companyId,
          ],
        );


      return res.json({

        success: true,

        count:
          trucksResult.rows.length,

        trucks:
          trucksResult.rows,

      });


    } catch (error) {

      console.error(
        'GET FIELD APPROVED TRANSPORT TRUCKS ERROR:',
        error
      );

      return res.status(500).json({
        error:
          'Error obteniendo los camiones habilitados del frigorífico',
      });

    }

  };

// =====================================================
// 🚛 ASIGNAR TRANSPORTE DIRECTAMENTE DESDE CAPTADOR
//
// POST
// /slaughterhouse/field/purchase-lots/:id/assign-transport
//
// Body:
// {
//   "truck_id": 1,
//   "expected_quantity": 5,
//   "trip_price": 1800
// }
//
// REGLAS:
// - Solo Captador activo.
// - El lote debe pertenecer al Captador autenticado.
// - El lote ya debe estar preparado para campo.
// - El camión debe pertenecer a la red privada FRIGOSI.
// - El camión debe estar vinculado a Plaza Transporte.
// - Si existe solicitud open para el lote, se reutiliza.
// - Si no existe, se crea.
// - NO existe etapa de propuesta.
// - NO existe aceptación posterior.
// - La negociación nace directamente en paid.
// - Cada asignación crea una tropa.
// - La solicitud permanece open para permitir más camiones.
// - NO crea chat.
// =====================================================

exports.assignFieldPurchaseLotTransport =
  async (req, res) => {

    const client =
      await pool.connect();

    try {

      const userId =
        Number(
          req.user?.user_id ??
          req.user?.id
        );

      const companyId =
        Number(
          req.user?.company_id
        );

      const purchaseLotId =
        Number(
          req.params.id
        );

      const truckId =
        Number(
          req.body.truck_id
        );

      const finalTripPrice =
        Number(
          req.body.trip_price
        );

      const expectedQuantity =
        Number(
          req.body.expected_quantity
        );


      // =================================================
      // VALIDACIONES BÁSICAS
      // =================================================

      if (
        !Number.isInteger(userId) ||
        userId <= 0
      ) {
        return res.status(401).json({
          error:
            'Usuario autenticado inválido',
        });
      }


      if (
        !Number.isInteger(companyId) ||
        companyId <= 0
      ) {
        return res.status(400).json({
          error:
            'Contexto de empresa inválido',
        });
      }


      if (
        !Number.isInteger(purchaseLotId) ||
        purchaseLotId <= 0
      ) {
        return res.status(400).json({
          error:
            'ID de lote inválido',
        });
      }


      if (
        !Number.isInteger(truckId) ||
        truckId <= 0
      ) {
        return res.status(400).json({
          error:
            'truck_id inválido',
        });
      }


      if (
        !Number.isInteger(expectedQuantity) ||
        expectedQuantity <= 0
      ) {
        return res.status(400).json({
          error:
            'expected_quantity debe ser un entero mayor a 0',
        });
      }


      if (
        !Number.isFinite(finalTripPrice) ||
        finalTripPrice <= 0
      ) {
        return res.status(400).json({
          error:
            'Debe indicar un precio válido para el viaje',
        });
      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // IDENTIFICAR ACTOR QUE ASIGNA TRANSPORTE
      //
      // Puede ser:
      //
      // 1. Captador activo de la empresa.
      //
      // 2. Usuario web del frigorífico con rol interno:
      //    - admin
      //    - operations
      //
      // El actor NO reemplaza al captador asignado al lote.
      // =================================================

      const captadorResult =
        await client.query(
          `
            SELECT
              sp.id,
              sp.full_name,
              sp.phone,
              sp.email

            FROM slaughterhouse_people sp

            JOIN slaughterhouse_person_roles spr
              ON spr.person_id = sp.id
              AND spr.role = 'captador'
              AND spr.is_active = true

            WHERE
              sp.company_id = $1
              AND sp.user_id = $2
              AND sp.is_active = true

            LIMIT 1

            FOR UPDATE OF sp
          `,
          [
            companyId,
            userId,
          ],
        );


      const webOperatorRoleResult =
        await client.query(
          `
            SELECT DISTINCT
              sr.code

            FROM user_companies uc

            JOIN companies c
              ON c.id = uc.company_id
              AND c.company_type = 'slaughterhouse'
              AND c.is_active = true

            JOIN slaughterhouse_user_roles sur
              ON sur.user_id = uc.user_id
              AND sur.company_id = uc.company_id

            JOIN slaughterhouse_roles sr
              ON sr.id = sur.role_id
              AND sr.company_id = sur.company_id
              AND sr.is_active = true

            WHERE
              uc.user_id = $1
              AND uc.company_id = $2
              AND uc.role = 'slaughterhouse_operator'
              AND uc.company_status = 'approved'

              AND sr.code IN (
                'admin',
                'operations'
              )
          `,
          [
            userId,
            companyId,
          ],
        );


      const captador =
        captadorResult.rows.length > 0
          ? captadorResult.rows[0]
          : null;


      const canAssignAsWebOperator =
        webOperatorRoleResult.rows.length > 0;

      const assignmentActorLabel =
        captador !== null
          ? 'captador'
          : 'operador';

      if (
        captador == null &&
        !canAssignAsWebOperator
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(403).json({
          error:
            'El usuario no está habilitado para asignar transporte en este frigorífico',
        });
      }


      // =================================================
      // LOTE + CONTEXTO LOGÍSTICO
      // =================================================

      const lotResult =
        await client.query(
          `
            SELECT

              spl.id,
              spl.lot_number,
              spl.external_order_number,
              spl.status,
              spl.expected_quantity,
              spl.planned_date,
              spl.capture_sheet_id,
              spl.captador_person_id,

              lot_captador.full_name
                AS captador_name,

              lot_captador.phone
                AS captador_phone,

              seller.id
                AS seller_person_id,

              seller.full_name
                AS seller_name,

              seller.phone
                AS seller_phone,

              estate.id
                AS estate_id,

              estate.name
                AS estate_name,

              estate.location_text
                AS estate_location,

              estate.lat
                AS estate_lat,

              estate.lng
                AS estate_lng,

              classification.generated_code
                AS classification_code,

              classification.display_name
                AS classification_name,

              company.name
                AS company_name,

              company.plant_lat,
              company.plant_lng

            FROM slaughterhouse_purchase_lots spl

            JOIN slaughterhouse_people seller
              ON seller.id =
                spl.seller_person_id
              AND seller.company_id =
                spl.company_id

            LEFT JOIN slaughterhouse_people lot_captador
              ON lot_captador.id =
                spl.captador_person_id
              AND lot_captador.company_id =
                spl.company_id
              AND lot_captador.is_active = true

            LEFT JOIN slaughterhouse_estates estate
              ON estate.id =
                spl.estate_id
              AND estate.company_id =
                spl.company_id

            LEFT JOIN slaughterhouse_animal_classifications classification
              ON classification.id =
                spl.classification_id
              AND classification.company_id =
                spl.company_id

            JOIN companies company
              ON company.id =
                spl.company_id

            WHERE
              spl.id = $1
              AND spl.company_id = $2

            FOR UPDATE OF spl
          `,
          [
            purchaseLotId,
            companyId,
          ],
        );


      if (
        lotResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error:
            'Lote de compra no encontrado',
        });
      }


      const lot =
        lotResult.rows[0];


      // =================================================
      // AUTORIZACIÓN SOBRE EL LOTE
      //
      // Captador:
      // - solo puede asignar transporte a sus propios lotes.
      //
      // Admin / Operations:
      // - puede asignar transporte a cualquier lote
      //   perteneciente a su mismo frigorífico.
      //
      // NO modificamos captador_person_id.
      // =================================================

      if (
        !canAssignAsWebOperator &&
        (
          captador == null ||
          Number(lot.captador_person_id) !==
            Number(captador.id)
        )
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(403).json({
          error:
            'Este lote no está asignado al captador autenticado',
        });
      }


      // =================================================
      // DEBE ESTAR PREPARADO PARA CAMPO
      // =================================================

      if (
        !lot.capture_sheet_id
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'El lote todavía no fue preparado para recojo por el operador',
        });
      }


      if (
        ![
          'open',
          'in_transport',
        ].includes(
          lot.status
        )
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            `El lote está en estado ${lot.status} y no permite asignar transporte`,
        });
      }


      if (
        !lot.estate_id
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(400).json({
          error:
            'El lote debe tener una estancia de origen antes de asignar transporte',
        });
      }


      // =================================================
      // VALIDAR CAMIÓN DE RED PRIVADA FRIGOSI
      //
      // El truck_id recibido es transporter_trucks.id,
      // NO slaughterhouse_company_trucks.id.
      // =================================================

      const truckResult =
        await client.query(
          `
            SELECT

              tt.id
                AS truck_id,

              tt.user_id
                AS transporter_user_id,

              tt.plate,

              tt.brand,

              tt.model,

              tt.is_active,
              tt.is_available,

              sp.id
                AS transporter_person_id,

              COALESCE(
                NULLIF(
                  TRIM(
                    sp.full_name
                  ),
                  ''
                ),
                NULLIF(
                  TRIM(
                    transporter_user.full_name
                  ),
                  ''
                ),
                NULLIF(
                  TRIM(
                    transporter_user.name
                  ),
                  ''
                ),
                transporter_user.email
              )
                AS transporter_name,

              sct.id
                AS company_transporter_id,

              sctr.id
                AS company_truck_id

            FROM slaughterhouse_company_transporters sct

            JOIN slaughterhouse_people sp
              ON sp.id =
                sct.person_id
              AND sp.company_id =
                sct.company_id
              AND sp.is_active = true

            LEFT JOIN users transporter_user
              ON transporter_user.id =
                sp.user_id

            JOIN slaughterhouse_company_transporter_trucks sctt
              ON sctt.company_transporter_id =
                sct.id
              AND sctt.is_active = true

            JOIN slaughterhouse_company_trucks sctr
              ON sctr.id =
                sctt.company_truck_id
              AND sctr.company_id =
                sct.company_id
              AND sctr.is_active = true

            JOIN transporter_trucks tt
              ON tt.id =
                sctr.transporter_truck_id
              AND tt.user_id =
                sp.user_id
              AND tt.is_active = true

            WHERE
              sct.company_id = $1

              AND sct.status =
                'approved'

              AND tt.id = $2

            LIMIT 1

            FOR UPDATE OF tt
          `,
          [
            companyId,
            truckId,
          ],
        );


      if (
        truckResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'El camión no pertenece a la red privada FRIGOSI o todavía no está vinculado a Plaza Transporte',
        });
      }


      const truck =
        truckResult.rows[0];

      // =================================================
      // PROTEGER CONTRA CAMIÓN CON VIAJE ACTIVO
      //
      // Un camión se considera ocupado mientras tenga
      // una negociación:
      // - paid
      // - trip_active
      // - delivery_pending
      //
      // Las negociaciones open NO bloquean porque todavía
      // no representan un viaje confirmado.
      // =================================================

      const activeTripResult =
        await client.query(
          `
            SELECT
              tn.id
                AS negotiation_id,

              tn.request_id,

              tn.status
                AS negotiation_status,

              tn.trip_price,

              tr.purchase_lot_id,

              st.id
                AS troop_id,

              st.status
                AS troop_status

            FROM transport_negotiations tn

            JOIN transport_requests tr
              ON tr.id =
                tn.request_id

            LEFT JOIN slaughterhouse_troops st
              ON st.transport_negotiation_id =
                tn.id

            WHERE
              tn.truck_id = $1

              AND tn.cancelled = false

              AND tn.status IN (
                'paid',
                'trip_active',
                'delivery_pending'
              )

            ORDER BY
              tn.id DESC

            LIMIT 1

            FOR UPDATE OF tn
          `,
          [
            truck.truck_id,
          ],
        );


      if (
        activeTripResult.rows.length > 0
      ) {

        const activeTrip =
          activeTripResult.rows[0];


        await client.query(
          'ROLLBACK'
        );


        return res.status(409).json({
          error:
            'Este camión ya tiene un viaje activo y no puede ser asignado a otro lote',

          code:
            'truck_busy',

          active_trip: {
            negotiation_id:
              activeTrip.negotiation_id,

            request_id:
              activeTrip.request_id,

            purchase_lot_id:
              activeTrip.purchase_lot_id,

            troop_id:
              activeTrip.troop_id,

            negotiation_status:
              activeTrip.negotiation_status,

            troop_status:
              activeTrip.troop_status,
          },
        });
      }

      // =================================================
      // BUSCAR ÚLTIMA SOLICITUD DEL LOTE
      //
      // Si la última solicitud fue cerrada por el Captador,
      // NO se debe crear otra automáticamente.
      // =================================================

      const latestRequestResult =
        await client.query(
          `
            SELECT *

            FROM transport_requests

            WHERE
              purchase_lot_id = $1
              AND requester_company_id = $2

            ORDER BY id DESC

            LIMIT 1

            FOR UPDATE
          `,
          [
            purchaseLotId,
            companyId,
          ],
        );


      let transportRequest;


      if (
        latestRequestResult.rows.length > 0 &&
        latestRequestResult.rows[0].status === 'closed'
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'La solicitud de camiones de este lote ya fue cerrada',
          code:
            'transport_request_closed',
          request_id:
            latestRequestResult.rows[0].id,
        });
      }


      if (
        latestRequestResult.rows.length > 0 &&
        latestRequestResult.rows[0].status === 'open'
      ) {

        transportRequest =
          latestRequestResult.rows[0];

      } else {

        // ===============================================
        // CREAR SOLICITUD AUTOMÁTICA DEL LOTE
        // ===============================================

        const quantity =
          Number(
            lot.expected_quantity
          );


        if (
          !Number.isInteger(quantity) ||
          quantity <= 0
        ) {

          await client.query(
            'ROLLBACK'
          );

          return res.status(400).json({
            error:
              'El lote debe tener una cantidad contratada mayor a 0',
          });
        }


        const origin =
          [
            lot.estate_name,
            lot.estate_location,
          ]
            .filter(Boolean)
            .join(' - ');


        if (!origin) {

          await client.query(
            'ROLLBACK'
          );

          return res.status(400).json({
            error:
              'La estancia debe tener un nombre o ubicación válida',
          });
        }


        const destination =
          lot.company_name;


        if (!destination) {

          await client.query(
            'ROLLBACK'
          );

          return res.status(400).json({
            error:
              'El frigorífico no tiene un nombre válido como destino',
          });
        }


        const pickupLat =
          lot.estate_lat === null ||
          lot.estate_lat === undefined
            ? null
            : Number(
                lot.estate_lat
              );


        const pickupLng =
          lot.estate_lng === null ||
          lot.estate_lng === undefined
            ? null
            : Number(
                lot.estate_lng
              );


        const dropoffLat =
          lot.plant_lat === null ||
          lot.plant_lat === undefined
            ? null
            : Number(
                lot.plant_lat
              );


        const dropoffLng =
          lot.plant_lng === null ||
          lot.plant_lng === undefined
            ? null
            : Number(
                lot.plant_lng
              );


        const animalType =
          lot.classification_name ||
          lot.classification_code ||
          'Ganado bovino';


        const transportNotes =
          [
            'Frigosi - Transporte asignado directamente',

            `Lote: ${lot.lot_number}`,

            lot.external_order_number
              ? `Orden externa: ${lot.external_order_number}`
              : null,

            `Cantidad contratada de referencia: ${quantity}`,

            lot.seller_name
              ? `Vendedor: ${lot.seller_name}`
              : null,

            lot.estate_name
              ? `Hacienda: ${lot.estate_name}`
              : null,

            lot.captador_name
              ? `Captador: ${lot.captador_name}`
              : null,
          ]
            .filter(Boolean)
            .join('\n');


        const requestResult =
          await client.query(
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

                status,

                origin_lat,
                origin_lng,

                destination_lat,
                destination_lng,

                approx_pickup_lat,
                approx_pickup_lng,

                approx_pickup_notes,
                approx_pickup_source,

                approx_dropoff_lat,
                approx_dropoff_lng,

                approx_dropoff_notes,
                approx_dropoff_source,

                requester_company_id,

                visibility_scope,

                purchase_lot_id

              )

              VALUES (

                $1,

                $2,
                $3,

                $4,
                $5,

                $6,

                $7,
                $8,

                'open',

                $9,
                $10,

                $11,
                $12,

                $9,
                $10,

                $13,
                'slaughterhouse',

                $11,
                $12,

                $14,
                'slaughterhouse',

                $15,

                'company_network',

                $16

              )

              RETURNING *
            `,
            [
              userId,

              origin,
              destination,

              quantity,
              animalType,

              lot.planned_date,

              transportNotes,
              lot.seller_phone,

              pickupLat,
              pickupLng,

              dropoffLat,
              dropoffLng,

              lot.estate_location ||
                origin,

              destination,

              companyId,

              purchaseLotId,
            ],
          );


        transportRequest =
          requestResult.rows[0];
      }


      // =================================================
      // PROTEGER CONTRA DOBLE ASIGNACIÓN DEL MISMO CAMIÓN
      // =================================================

      const duplicateNegotiationResult =
        await client.query(
          `
            SELECT
              id,
              status,
              cancelled

            FROM transport_negotiations

            WHERE
              request_id = $1
              AND truck_id = $2
              AND cancelled = false

            LIMIT 1
          `,
          [
            transportRequest.id,
            truck.truck_id,
          ],
        );


      if (
        duplicateNegotiationResult.rows.length > 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'Este camión ya está asignado a este lote',
          negotiation_id:
            duplicateNegotiationResult.rows[0].id,
        });
      }


      // =================================================
      // CUENTA CORPORATIVA
      // =================================================

      const corporateAccountResult =
        await client.query(
          `
            SELECT
              id,
              company_id,
              billing_mode,
              monthly_fee,
              per_operation_fee,
              billing_day,
              status

            FROM transport_corporate_accounts

            WHERE
              company_id = $1
              AND status = 'active'

            LIMIT 1

            FOR UPDATE
          `,
          [
            companyId,
          ],
        );


      if (
        corporateAccountResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'El frigorífico no tiene una cuenta corporativa de transporte activa',
        });
      }


      const corporateAccount =
        corporateAccountResult.rows[0];


      const usageAmount =
        corporateAccount.billing_mode ===
          'monthly_flat'
          ? 0
          : Number(
              corporateAccount
                .per_operation_fee || 0
            );


      // =================================================
      // CREAR NEGOCIACIÓN DIRECTAMENTE COMO PAID
      //
      // No hubo propuesta dentro de la app.
      // El precio ya fue acordado externamente.
      // =================================================

      const negotiationResult =
        await client.query(
          `
            INSERT INTO transport_negotiations (

              request_id,
              truck_id,
              requester_id,
              transporter_id,

              status,
              trip_price,
              unlock_fee,

              cancelled

            )

            VALUES (

              $1,
              $2,
              $3,
              $4,

              'paid',
              $5,
              NULL,

              false

            )

            RETURNING *
          `,
          [
            transportRequest.id,
            truck.truck_id,
            userId,
            truck.transporter_user_id,
            finalTripPrice,
          ],
        );


      const negotiation =
        negotiationResult.rows[0];


      // =================================================
      // REUTILIZAR TROPA PENDIENTE SI EXISTE
      //
      // Mantiene compatibilidad con el flujo Operador.
      // =================================================

      const pendingTroopResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_troops

            WHERE
              company_id = $1
              AND purchase_lot_id = $2
              AND transport_request_id = $3
              AND status = 'transport_requested'
              AND transport_negotiation_id IS NULL

            ORDER BY id ASC

            LIMIT 1

            FOR UPDATE
          `,
          [
            companyId,
            purchaseLotId,
            transportRequest.id,
          ],
        );


      let troop;


      if (
        pendingTroopResult.rows.length > 0
      ) {

        const pendingTroop =
          pendingTroopResult.rows[0];


        const updatedTroopResult =
          await client.query(
            `
              UPDATE slaughterhouse_troops

              SET
                transport_negotiation_id = $1,
                truck_id = $2,
                transporter_user_id = $3,

                expected_quantity =
                  COALESCE(
                    expected_quantity,
                    $4
                  ),

                status =
                  'transport_assigned',

                notes =
                  concat_ws(
                    ' | ',
                    NULLIF(
                      notes,
                      ''
                    ),
                    $5
                  ),

                updated_at =
                  NOW()

              WHERE
                id = $6
                AND company_id = $7

              RETURNING *
            `,
            [
              negotiation.id,
              truck.truck_id,
              truck.transporter_user_id,
              expectedQuantity,

              `Camión asignado directamente por ${assignmentActorLabel} desde solicitud #${transportRequest.id}`,

              pendingTroop.id,
              companyId,
            ],
          );


        troop =
          updatedTroopResult.rows[0];

      } else {

        // ===============================================
        // CREAR TROPA FÍSICA PARA ESTE CAMIÓN
        // ===============================================

        const createdTroopResult =
          await client.query(
            `
              INSERT INTO slaughterhouse_troops (

                company_id,
                purchase_lot_id,

                troop_number,

                transport_request_id,
                transport_negotiation_id,

                truck_id,
                transporter_user_id,

                expected_quantity,

                status,
                notes,

                created_by

              )

              VALUES (

                $1,
                $2,

                NULL,

                $3,
                $4,

                $5,
                $6,

                $7,

                'transport_assigned',
                $8,

                $9

              )

              RETURNING *
            `,
            [
              companyId,
              purchaseLotId,

              transportRequest.id,
              negotiation.id,

              truck.truck_id,
              truck.transporter_user_id,

              expectedQuantity,

              `Camión asignado directamente por ${assignmentActorLabel} desde solicitud #${transportRequest.id}`,

              userId,
            ],
          );


        troop =
          createdTroopResult.rows[0];
      }


      // =================================================
      // LOTE PASA A IN_TRANSPORT
      // =================================================

      await client.query(
        `
          UPDATE slaughterhouse_purchase_lots

          SET
            status =
              'in_transport',

            updated_at =
              NOW()

          WHERE
            id = $1
            AND company_id = $2
            AND status = 'open'
        `,
        [
          purchaseLotId,
          companyId,
        ],
      );


      // =================================================
      // USO CORPORATIVO
      // =================================================

      const usageResult =
        await client.query(
          `
            INSERT INTO transport_corporate_usage (

              corporate_account_id,

              request_id,
              negotiation_id,
              troop_id,

              service_date,

              charge_type,
              amount,

              description,

              status

            )

            VALUES (

              $1,

              $2,
              $3,
              $4,

              CURRENT_DATE,

              'transport_operation',
              $5,

              $6,

              'unbilled'

            )

            RETURNING *
          `,
          [
            corporateAccount.id,

            transportRequest.id,
            negotiation.id,
            troop.id,

            usageAmount,

            `Uso Plaza Transporte - asignación directa Captador - solicitud #${transportRequest.id} - negociación #${negotiation.id}`,
          ],
        );


      const corporateUsage =
        usageResult.rows[0];


      // =================================================
      // AUDITORÍA
      // =================================================

      await client.query(
        `
          INSERT INTO slaughterhouse_audit_log (

            company_id,
            user_id,

            entity_type,
            entity_id,

            action,

            new_data

          )

          VALUES (

            $1,
            $2,

            'troop',
            $3,

            'field_direct_transport_assignment',

            $4::jsonb

          )
        `,
        [
          companyId,
          userId,

          String(
            troop.id
          ),

          JSON.stringify({

            purchase_lot_id:
              purchaseLotId,

            capture_sheet_id:
              lot.capture_sheet_id,

            captador_person_id:
              lot.captador_person_id,

            transport_request_id:
              transportRequest.id,

            negotiation_id:
              negotiation.id,

            troop_id:
              troop.id,

            truck_id:
              truck.truck_id,

            company_truck_id:
              truck.company_truck_id,

            transporter_user_id:
              truck.transporter_user_id,

            transporter_name:
              truck.transporter_name,

            plate:
              truck.plate,

            expected_quantity:
              expectedQuantity,

            trip_price:
              finalTripPrice,

            corporate_usage_id:
              corporateUsage.id,

            corporate_usage_amount:
              usageAmount,

          }),
        ],
      );


      await client.query(
        'COMMIT'
      );

      // =====================================================
      // 💬 MENSAJE INFORMATIVO AL CAMIONERO
      //
      // NO es una propuesta.
      // NO requiere aceptar/rechazar.
      // Solo deja trazabilidad dentro del chat del viaje.
      // =====================================================

      const assignmentMessage =
        `✅ FRIGOSI te asignó un transporte.\n\n` +
        `Lote: ${lot.lot_number}\n` +
        `Animales previstos: ${expectedQuantity}\n` +
        `Precio acordado: Bs ${finalTripPrice.toFixed(2)}\n\n` +
        `Ingresa a Mis viajes → Preparar viaje.`;


      // =====================================================
      // MENSAJE SQL
      // =====================================================

      try {

        await pool.query(
          `
            INSERT INTO transport_negotiation_messages (
              negotiation_id,
              sender_id,
              message,
              photo_url
            )

            VALUES (
              $1,
              $2,
              $3,
              NULL
            )
          `,
          [
            negotiation.id,
            userId,
            assignmentMessage,
          ],
        );


        console.log(
          '✅ FIELD DIRECT TRANSPORT SQL MESSAGE SAVED =>',
          negotiation.id,
        );


      } catch (messageSqlError) {

        console.error(
          '❌ FIELD DIRECT TRANSPORT SQL MESSAGE ERROR:',
          messageSqlError,
        );

      }


      // =====================================================
      // MENSAJE FIRESTORE
      // =====================================================

      try {

        await admin
          .firestore()
          .collection(
            'transport_negotiations'
          )
          .doc(
            negotiation.id.toString()
          )
          .collection(
            'messages'
          )
          .add({

            sender_id:
              0,

            system:
              true,

            message:
              assignmentMessage,

            created_at:
              admin
                .firestore
                .FieldValue
                .serverTimestamp(),

          });


        console.log(
          '✅ FIELD DIRECT TRANSPORT FIRESTORE MESSAGE SAVED =>',
          negotiation.id,
        );


      } catch (firestoreError) {

        console.error(
          '❌ FIELD DIRECT TRANSPORT FIRESTORE MESSAGE ERROR:',
          firestoreError,
        );

      }

      // =====================================================
      // 🔔 NOTIFICAR AL CAMIONERO
      //
      // Fuera de la transacción:
      // si falla la notificación, NO se deshace la asignación.
      //
      // No hubo propuesta ni aceptación dentro de la app.
      // Es solamente un aviso informativo de viaje asignado.
      // =====================================================

      try {

        await sendUserNotification({

          userId:
            truck.transporter_user_id,

          title:
            'FRIGOSI te asignó un transporte',

          body:
            `Lote ${lot.lot_number} · ` +
            `${expectedQuantity} animales. ` +
            'Ingresa a Mis viajes → Preparar viaje.',

          data: {

            type:
              'transport_paid',

            negotiation_id:
              negotiation.id,

            request_id:
              transportRequest.id,

            purchase_lot_id:
              purchaseLotId,

            troop_id:
              troop.id,

          },

        });


        console.log(
          '✅ FIELD DIRECT TRANSPORTER NOTIFIED =>',
          truck.transporter_user_id,
        );


      } catch (notificationError) {

        console.error(
          '❌ FIELD DIRECT TRANSPORTER NOTIFICATION ERROR:',
          notificationError,
        );

      }

      // =====================================================
      // 🔔 NOTIFICAR A OPERACIONES / ADMIN
      //
      // Guarda en user_notifications + intenta FCM.
      // La web consulta esta bandeja cada 10 segundos.
      // =====================================================

      try {

        await sendSlaughterhouseOperatorNotification({

          companyId,

          permissionCode:
            'notifications.field_qr_pending',

          eventCode:
            'field_qr_pending',

          title:
            'Transporte asignado',

          body:
            `Lote ${lot.lot_number} · ` +
            `Camión ${truck.plate}. ` +
            'Falta generar el QR de campo.',

          data: {

            type:
              'slaughterhouse_field_qr_pending',

            purchase_lot_id:
              purchaseLotId,

            capture_sheet_id:
              lot.capture_sheet_id,

            request_id:
              transportRequest.id,

            negotiation_id:
              negotiation.id,

            troop_id:
              troop.id,

            truck_id:
              truck.truck_id,

          },

          eventKey:
            `field_qr_pending:${purchaseLotId}:${troop.id}`,

        });


        console.log(
          '✅ FIELD QR PENDING NOTIFICATION CREATED =>',
          {
            purchase_lot_id:
              purchaseLotId,

            troop_id:
              troop.id,
          },
        );


      } catch (
        operatorNotificationError
      ) {

        console.error(
          '❌ FIELD QR PENDING NOTIFICATION ERROR:',
          operatorNotificationError,
        );

      }

      console.log(
        '✅ FIELD DIRECT TRANSPORT ASSIGNMENT =>',
        {
          purchase_lot_id:
            purchaseLotId,

          transport_request_id:
            transportRequest.id,

          negotiation_id:
            negotiation.id,

          troop_id:
            troop.id,

          truck_id:
            truck.truck_id,

          plate:
            truck.plate,

          expected_quantity:
            expectedQuantity,

          trip_price:
            finalTripPrice,
        }
      );


      return res.status(201).json({

        success: true,

        message:
          'Camión asignado correctamente al lote',

        purchase_lot_id:
          purchaseLotId,

        transport_request: {
          id:
            transportRequest.id,

          status:
            transportRequest.status,
        },

        negotiation,

        troop,

        corporate_usage:
          corporateUsage,

      });


    } catch (error) {

      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (_) {}


      console.error(
        'FIELD DIRECT TRANSPORT ASSIGNMENT ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error asignando el camión al lote',
      });


    } finally {

      client.release();

    }

  };

// =====================================================
// 🔒 CERRAR SOLICITUD DE CAMIONES DESDE CAPTADOR
//
// POST
// /slaughterhouse/field/purchase-lots/:id/close-transport-request
//
// REGLAS:
// - Solo Captador activo.
// - El lote debe pertenecer al Captador autenticado.
// - Debe existir una solicitud open.
// - Debe existir al menos un camión ya asignado.
// - NO cancela camiones confirmados.
// - NO modifica tropas asignadas.
// - Cancela únicamente propuestas todavía open.
// =====================================================

exports.closeFieldPurchaseLotTransportRequest =
  async (req, res) => {

    const client =
      await pool.connect();

    try {

      const userId =
        Number(
          req.user?.user_id ??
          req.user?.id
        );

      const companyId =
        Number(
          req.user?.company_id
        );

      const purchaseLotId =
        Number(
          req.params.id
        );


      if (
        !Number.isInteger(userId) ||
        userId <= 0
      ) {
        return res.status(401).json({
          error:
            'Usuario autenticado inválido',
        });
      }


      if (
        !Number.isInteger(companyId) ||
        companyId <= 0
      ) {
        return res.status(400).json({
          error:
            'Contexto de empresa inválido',
        });
      }


      if (
        !Number.isInteger(purchaseLotId) ||
        purchaseLotId <= 0
      ) {
        return res.status(400).json({
          error:
            'ID de lote inválido',
        });
      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // IDENTIFICAR CAPTADOR
      // =================================================

      const captadorResult =
        await client.query(
          `
            SELECT
              sp.id,
              sp.full_name

            FROM slaughterhouse_people sp

            JOIN slaughterhouse_person_roles spr
              ON spr.person_id = sp.id
              AND spr.role = 'captador'
              AND spr.is_active = true

            WHERE
              sp.company_id = $1
              AND sp.user_id = $2
              AND sp.is_active = true

            LIMIT 1

            FOR UPDATE OF sp
          `,
          [
            companyId,
            userId,
          ],
        );


      if (
        captadorResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(403).json({
          error:
            'El usuario no está habilitado como captador/comprador en este frigorífico',
        });
      }


      const captador =
        captadorResult.rows[0];


      // =================================================
      // VALIDAR QUE EL LOTE PERTENECE AL CAPTADOR
      // =================================================

      const lotResult =
        await client.query(
          `
            SELECT
              id,
              lot_number,
              status,
              capture_sheet_id,
              captador_person_id

            FROM slaughterhouse_purchase_lots

            WHERE
              id = $1
              AND company_id = $2
              AND captador_person_id = $3

            FOR UPDATE
          `,
          [
            purchaseLotId,
            companyId,
            captador.id,
          ],
        );


      if (
        lotResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error:
            'El lote no existe o no está asignado a este captador',
        });
      }


      const lot =
        lotResult.rows[0];


      // =================================================
      // BUSCAR SOLICITUD ABIERTA
      // =================================================

      const requestResult =
        await client.query(
          `
            SELECT *

            FROM transport_requests

            WHERE
              purchase_lot_id = $1
              AND requester_company_id = $2
              AND status = 'open'

            ORDER BY id DESC

            LIMIT 1

            FOR UPDATE
          `,
          [
            purchaseLotId,
            companyId,
          ],
        );


      if (
        requestResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'Este lote no tiene una solicitud de camiones abierta',
          code:
            'no_open_transport_request',
        });
      }


      const transportRequest =
        requestResult.rows[0];


      // =================================================
      // DEBE HABER AL MENOS UN CAMIÓN ASIGNADO
      // =================================================

      const confirmedResult =
        await client.query(
          `
            SELECT
              COUNT(*)::int AS total

            FROM slaughterhouse_troops

            WHERE
              company_id = $1
              AND purchase_lot_id = $2
              AND transport_request_id = $3
              AND transport_negotiation_id IS NOT NULL
              AND status IN (
                'transport_assigned',
                'dispatched',
                'in_transit',
                'received',
                'in_slaughter',
                'completed'
              )
          `,
          [
            companyId,
            purchaseLotId,
            transportRequest.id,
          ],
        );


      const confirmedTrucks =
        Number(
          confirmedResult.rows[0]
            ?.total || 0
        );


      if (
        confirmedTrucks <= 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'Todavía no existe ningún camión asignado para este lote',
          code:
            'no_confirmed_trucks',
        });
      }


      // =================================================
      // CERRAR SOLICITUD
      // =================================================

      const closedRequestResult =
        await client.query(
          `
            UPDATE transport_requests

            SET
              status = 'closed'

            WHERE
              id = $1
              AND status = 'open'

            RETURNING *
          `,
          [
            transportRequest.id,
          ],
        );


      // =================================================
      // CANCELAR TROPAS PENDIENTES SIN CAMIÓN
      // =================================================

      const cancelledPendingTroopsResult =
        await client.query(
          `
            UPDATE slaughterhouse_troops

            SET
              status = 'cancelled',
              notes =
                concat_ws(
                  ' | ',
                  NULLIF(
                    notes,
                    ''
                  ),
                  'Solicitud de transporte cerrada sin camión asignado'
                ),
              updated_at = NOW()

            WHERE
              company_id = $1
              AND purchase_lot_id = $2
              AND transport_request_id = $3
              AND status = 'transport_requested'
              AND transport_negotiation_id IS NULL

            RETURNING id
          `,
          [
            companyId,
            purchaseLotId,
            transportRequest.id,
          ],
        );


      // =================================================
      // CANCELAR SOLO PROPUESTAS OPEN
      // =================================================

      const cancelledNegotiationsResult =
        await client.query(
          `
            UPDATE transport_negotiations

            SET
              status = 'cancelled',
              cancelled = true,
              cancelled_by = $2

            WHERE
              request_id = $1
              AND status = 'open'

            RETURNING id
          `,
          [
            transportRequest.id,
            userId,
          ],
        );


      // =================================================
      // AUDITORÍA
      // =================================================

      await client.query(
        `
          INSERT INTO slaughterhouse_audit_log (
            company_id,
            user_id,
            entity_type,
            entity_id,
            action,
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'transport_request',
            $3,
            'field_close_transport_request',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            transportRequest.id
          ),
          JSON.stringify(
            transportRequest
          ),
          JSON.stringify({
            ...closedRequestResult.rows[0],

            confirmed_trucks:
              confirmedTrucks,

            cancelled_pending_troops:
              cancelledPendingTroopsResult
                .rows
                .map(
                  row => row.id
                ),

            cancelled_open_negotiations:
              cancelledNegotiationsResult
                .rows
                .map(
                  row => row.id
                ),
          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        message:
          'Solicitud de camiones cerrada correctamente',

        purchase_lot_id:
          purchaseLotId,

        lot_number:
          lot.lot_number,

        request:
          closedRequestResult.rows[0],

        confirmed_trucks:
          confirmedTrucks,
      });


    } catch (error) {

      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (_) {}


      console.error(
        'CLOSE FIELD TRANSPORT REQUEST ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error cerrando la solicitud de camiones',
      });


    } finally {

      client.release();

    }

  };

// =====================================================
// 📤 SINCRONIZAR CAPTURA DE CAMPO DE UN LOTE / CAMIÓN
//
// POST
// /slaughterhouse/field/capture-sheets/:captureSheetId/lots/:purchaseLotId/sync-capture
//
// Esta etapa:
// - NO certifica.
// - NO despacha.
// - NO modifica expected_quantity.
// - Guarda la cantidad realmente capturada en campo.
// - Requiere troop_id.
// - Trabaja sobre una tropa ya creada por Transporte.
// - NO crea tropas desde Campo.
// - Es idempotente por tropa/camión.
// =====================================================
exports.syncFieldLotCapture =
  async (req, res) => {

    const client =
      await pool.connect();

    try {

      const userId =
        Number(
          req.user?.user_id ??
          req.user?.id
        );

      const companyId =
        Number(
          req.user?.company_id
        );

      const captureSheetId =
        Number(
          req.params.captureSheetId
        );

      const purchaseLotId =
        Number(
          req.params.purchaseLotId
        );

      const troopId =
        Number(
          req.body?.troop_id
        );


      const captadorAssignmentVersion =
        Number(
          req.body
            ?.captador_assignment_version
        );


      const captureStatus =
        req.body?.status
          ?.toString()
          .trim();

      const quantityRaw =
        req.body?.quantity;

      const quantity =
        quantityRaw !== undefined &&
        quantityRaw !== null &&
        quantityRaw !== ''
          ? Number(quantityRaw)
          : null;

      // =================================================
      // VALIDACIONES BÁSICAS
      // =================================================

      if (
        !Number.isInteger(userId) ||
        userId <= 0
      ) {
        return res.status(401).json({
          error:
            'Usuario autenticado inválido',
        });
      }

      if (
        !Number.isInteger(companyId) ||
        companyId <= 0
      ) {
        return res.status(400).json({
          error:
            'Contexto de empresa inválido',
        });
      }

      if (
        !Number.isInteger(
          captureSheetId
        ) ||
        captureSheetId <= 0
      ) {
        return res.status(400).json({
          error:
            'captureSheetId inválido',
        });
      }

      if (
        !Number.isInteger(
          purchaseLotId
        ) ||
        purchaseLotId <= 0
      ) {
        return res.status(400).json({
          error:
            'purchaseLotId inválido',
        });
      }

      if (
        !Number.isInteger(
          troopId
        ) ||
        troopId <= 0
      ) {
        return res.status(400).json({
          error:
            'troop_id inválido',
        });
      }

      if (
        !Number.isInteger(
          captadorAssignmentVersion
        ) ||
        captadorAssignmentVersion <= 0
      ) {
        return res.status(400).json({
          error:
            'captador_assignment_version inválido',
        });
      }

      if (
        ![
          'in_progress',
          'captured',
        ].includes(captureStatus)
      ) {
        return res.status(400).json({
          error:
            'status debe ser in_progress o captured',
        });
      }

      if (
        !Number.isInteger(quantity) ||
        quantity < 0
      ) {
        return res.status(400).json({
          error:
            'quantity debe ser un entero mayor o igual a 0',
        });
      }

      if (
        captureStatus === 'captured' &&
        quantity <= 0
      ) {
        return res.status(400).json({
          error:
            'Una carga finalizada debe tener al menos un animal',
        });
      }

      await client.query(
        'BEGIN'
      );

      // =================================================
      // IDENTIFICAR CAPTADOR AUTENTICADO
      // =================================================

      const captadorResult =
        await client.query(
          `
            SELECT
              sp.id,
              sp.full_name
            FROM slaughterhouse_people sp

            JOIN slaughterhouse_person_roles spr
              ON spr.person_id = sp.id
              AND spr.role = 'captador'
              AND spr.is_active = true

            WHERE
              sp.company_id = $1
              AND sp.user_id = $2
              AND sp.is_active = true

            LIMIT 1
          `,
          [
            companyId,
            userId,
          ],
        );

      if (
        captadorResult.rows.length === 0
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(403).json({
          error:
            'El usuario no está habilitado como captador/comprador en este frigorífico',
        });
      }

      const captador =
        captadorResult.rows[0];

      // =================================================
      // VALIDAR HOJA + LOTE + ASIGNACIÓN
      //
      // Bloqueamos el lote para mantener consistente
      // la sincronización ante reintentos concurrentes.
      // =================================================

      const lotResult =
        await client.query(
          `
            SELECT
              spl.id,
              spl.lot_number,
              spl.capture_sheet_id,
              spl.expected_quantity,
              spl.pricing_basis,
              spl.weight_source,
              spl.captador_person_id,
              spl.captador_assignment_version,
              spl.captador_assigned_at,
              spl.status
                AS lot_status,

              scs.status
                AS capture_sheet_status

            FROM slaughterhouse_purchase_lots spl

            JOIN slaughterhouse_capture_sheets scs
              ON scs.id =
                spl.capture_sheet_id
              AND scs.company_id =
                spl.company_id

            WHERE
              spl.id = $1
              AND spl.company_id = $2
              AND scs.id = $3

            FOR UPDATE OF spl
          `,
            [
              purchaseLotId,
              companyId,
              captureSheetId,
            ],
        );

      if (
        lotResult.rows.length === 0
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error:
            'Lote no encontrado o no asignado a este captador',
        });
      }

      const lot =
        lotResult.rows[0];

      // =================================================
      // AUTORIDAD DE ASIGNACIÓN DEL CAPTADOR
      //
      // El servidor manda.
      // Si el lote fue reasignado o la versión local quedó
      // vieja, no se acepta ningún trabajo pendiente.
      // =================================================

      const currentCaptadorPersonId =
        lot.captador_person_id !== null
          ? Number(
              lot.captador_person_id
            )
          : null;


      const currentAssignmentVersion =
        Number(
          lot.captador_assignment_version ||
          1
        );


      if (
        currentCaptadorPersonId !==
          Number(captador.id) ||
        currentAssignmentVersion !==
          captadorAssignmentVersion
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'assignment_revoked',

          message:
            'La asignación de este lote cambió. Los datos locales pendientes ya no son válidos.',

          purchase_lot_id:
            purchaseLotId,

          current_assignment_version:
            currentAssignmentVersion,
        });
      }

      if (
        ![
          'open',
          'in_transport',
        ].includes(
          lot.lot_status
        )
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            `El lote no admite captura de campo en estado ${lot.lot_status}`,
        });
      }

      // =================================================
      // PESAJE EN ORIGEN
      //
      // Si weight_source = origin, la captura debe
      // sincronizar también los pesos individuales,
      // independientemente de la modalidad comercial.
      //
      // live_kg:
      // el peso también determina el valor económico.
      //
      // hook_kg / per_head:
      // el peso queda como información física/productiva.
      // =================================================

      if (

        lot.weight_source ===
          'origin'

      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({

          error:
            'Este lote requiere sincronización de pesos individuales en origen',

        });

      }

      // =================================================
      // IDENTIDAD ESTABLE DE CAMPO POR TROPA
      //
      // La tropa YA debe existir porque fue creada
      // al aceptar la negociación de transporte.
      //
      // Campo NO crea tropas.
      // =================================================

      const fieldSyncId =
        `field:${companyId}:lot:${purchaseLotId}:troop:${troopId}`;

      // =================================================
      // OBTENER ÚNICAMENTE LA TROPA INDICADA
      // =================================================

      const existingTroopResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_troops

            WHERE
              id = $1
              AND company_id = $2
              AND purchase_lot_id = $3
              AND status <> 'cancelled'

            FOR UPDATE
          `,
          [
            troopId,
            companyId,
            purchaseLotId,
          ],
        );

      if (
        existingTroopResult.rows.length ===
        0
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error:
            'La tropa indicada no existe o no pertenece a este lote',
        });
      }

      const existingTroop =
        existingTroopResult.rows[0];

      const oldData =
        existingTroop;

      // =================================================
      // UNA TROPA CERTIFICADA YA ES INMUTABLE
      // =================================================

      if (
        existingTroop
          .field_capture_status ===
        'certified'
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'La captura de esta tropa ya fue certificada y no puede modificarse',
        });
      }

      // =================================================
      // NO MODIFICAR UNA TROPA QUE YA AVANZÓ
      // =================================================

      if (
        [
          'dispatched',
          'in_transit',
          'received',
          'in_slaughter',
          'completed',
        ].includes(
          existingTroop.status
        )
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            `La tropa ya se encuentra en estado ${existingTroop.status}`,
        });
      }

      // =================================================
      // ACTUALIZAR SOLAMENTE ESTA TROPA
      //
      // expected_quantity NO se modifica.
      // field_captured_quantity es la realidad de campo.
      // =================================================

      const updateResult =
        await client.query(
          `
            UPDATE slaughterhouse_troops

            SET
              field_sync_id = $1,

              field_capture_status =
                $2::varchar,

              field_captured_quantity =
                $3,

              field_captured_at =
                CASE
                  WHEN
                    $2::varchar =
                    'captured'
                  THEN
                    COALESCE(
                      field_captured_at,
                      NOW()
                    )
                  ELSE NULL
                END,

              updated_at =
                NOW()

            WHERE
              id = $4
              AND company_id = $5
              AND purchase_lot_id = $6
              AND status <> 'cancelled'
              AND COALESCE(
                field_capture_status,
                ''
              ) <> 'certified'

            RETURNING *
          `,
          [
            fieldSyncId,
            captureStatus,
            quantity,
            troopId,
            companyId,
            purchaseLotId,
          ],
        );

      if (
        updateResult.rows.length ===
        0
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'La tropa cambió de estado durante la sincronización',
        });
      }

      const troop =
        updateResult.rows[0];

      // Se conserva por compatibilidad con
      // clientes que ya leen esta propiedad.
      const created =
        false;

      // =================================================
      // AUDITORÍA
      // =================================================

      await client.query(
        `
          INSERT INTO slaughterhouse_audit_log (
            company_id,
            user_id,
            entity_type,
            entity_id,
            action,
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'troop',
            $3,
            'field_capture_sync',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(troop.id),
          oldData
            ? JSON.stringify(oldData)
            : null,
          JSON.stringify(troop),
        ],
      );

      await client.query(
        'COMMIT'
      );

      return res.json({
        success: true,
        created,
        capture_sheet_id:
          captureSheetId,
        purchase_lot_id:
          purchaseLotId,
        lot_number:
          lot.lot_number,
        // Cantidad comercial contratada
        // para el lote completo.
        expected_quantity:
          lot.expected_quantity,

        contracted_quantity:
          lot.expected_quantity,

        // Cantidad orientativa asignada
        // específicamente a este camión.
        troop_expected_quantity:
          troop.expected_quantity,

        troop_id:
          troop.id,

        // Cantidad realmente cargada.
        field_captured_quantity:
          troop.field_captured_quantity,
        field_capture_status:
          troop.field_capture_status,
        troop,
      });

    } catch (error) {

      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (_) {}

      console.error(
        'SYNC FIELD LOT CAPTURE ERROR:',
        error
      );

      return res.status(500).json({
        error:
          'Error sincronizando captura de campo',
      });

    } finally {

      client.release();

    }

  };

// =====================================================
// 📝 OBSERVACIÓN DEL CAPTADOR SOBRE EL LOTE
//
// PATCH
// /slaughterhouse/field/
// capture-sheets/:captureSheetId/
// lots/:purchaseLotId/captador-notes
//
// - La observación es opcional.
// - Pertenece al lote, no a una tropa concreta.
// - Solo puede modificarla el captador actualmente
//   asignado al lote.
// - Respeta captador_assignment_version.
// - No modifica precio ni datos comerciales.
// =====================================================

exports.updateFieldCaptadorNotes =
  async (req, res) => {

    const client =
      await pool.connect();

    try {

      const userId =
        Number(
          req.user?.user_id ??
          req.user?.id
        );

      const companyId =
        Number(
          req.user?.company_id
        );

      const captureSheetId =
        Number(
          req.params.captureSheetId
        );

      const purchaseLotId =
        Number(
          req.params.purchaseLotId
        );

      const captadorAssignmentVersion =
        Number(
          req.body
            ?.captador_assignment_version
        );

      const rawNotes =
        req.body?.captador_notes;

      const captadorNotes =
        rawNotes === undefined ||
        rawNotes === null
          ? null
          : rawNotes
              .toString()
              .trim() || null;


      // =================================================
      // VALIDACIONES BÁSICAS
      // =================================================

      if (
        !Number.isInteger(userId) ||
        userId <= 0
      ) {
        return res.status(401).json({
          error:
            'Usuario autenticado inválido',
        });
      }

      if (
        !Number.isInteger(companyId) ||
        companyId <= 0
      ) {
        return res.status(400).json({
          error:
            'Contexto de empresa inválido',
        });
      }

      if (
        !Number.isInteger(
          captureSheetId
        ) ||
        captureSheetId <= 0
      ) {
        return res.status(400).json({
          error:
            'captureSheetId inválido',
        });
      }

      if (
        !Number.isInteger(
          purchaseLotId
        ) ||
        purchaseLotId <= 0
      ) {
        return res.status(400).json({
          error:
            'purchaseLotId inválido',
        });
      }

      if (
        !Number.isInteger(
          captadorAssignmentVersion
        ) ||
        captadorAssignmentVersion <= 0
      ) {
        return res.status(400).json({
          error:
            'captador_assignment_version inválido',
        });
      }

      if (
        captadorNotes !== null &&
        captadorNotes.length > 4000
      ) {
        return res.status(400).json({
          error:
            'La observación no puede superar 4000 caracteres',
        });
      }


      await client.query(
        'BEGIN'
      );


      // =================================================
      // IDENTIFICAR CAPTADOR AUTENTICADO
      // =================================================

      const captadorResult =
        await client.query(
          `
            SELECT
              sp.id,
              sp.full_name

            FROM slaughterhouse_people sp

            JOIN slaughterhouse_person_roles spr
              ON spr.person_id = sp.id
              AND spr.role = 'captador'
              AND spr.is_active = true

            WHERE
              sp.company_id = $1
              AND sp.user_id = $2
              AND sp.is_active = true

            LIMIT 1
          `,
          [
            companyId,
            userId,
          ],
        );


      if (
        captadorResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(403).json({
          error:
            'El usuario no está habilitado como captador/comprador en este frigorífico',
        });
      }


      const captador =
        captadorResult.rows[0];


      // =================================================
      // BLOQUEAR Y VALIDAR LOTE + HOJA
      // =================================================

      const lotResult =
        await client.query(
          `
            SELECT
              spl.id,
              spl.lot_number,
              spl.capture_sheet_id,
              spl.captador_person_id,
              spl.captador_assignment_version,
              spl.captador_notes,
              spl.captador_notes_updated_at,
              spl.captador_notes_updated_by,
              spl.status,

              scs.status
                AS capture_sheet_status

            FROM slaughterhouse_purchase_lots spl

            JOIN slaughterhouse_capture_sheets scs
              ON scs.id =
                spl.capture_sheet_id
              AND scs.company_id =
                spl.company_id

            WHERE
              spl.id = $1
              AND spl.company_id = $2
              AND scs.id = $3

            FOR UPDATE OF spl
          `,
          [
            purchaseLotId,
            companyId,
            captureSheetId,
          ],
        );


      if (
        lotResult.rows.length === 0
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error:
            'Lote no encontrado o no pertenece a esta hoja de captación',
        });
      }


      const previous =
        lotResult.rows[0];


      // =================================================
      // AUTORIDAD DE ASIGNACIÓN
      // =================================================

      const currentCaptadorPersonId =
        previous.captador_person_id !== null
          ? Number(
              previous.captador_person_id
            )
          : null;

      const currentAssignmentVersion =
        Number(
          previous.captador_assignment_version ||
          1
        );


      if (
        currentCaptadorPersonId !==
          Number(captador.id) ||
        currentAssignmentVersion !==
          captadorAssignmentVersion
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'assignment_revoked',

          message:
            'La asignación de este lote cambió. Ya no puedes modificar sus observaciones.',

          purchase_lot_id:
            purchaseLotId,

          current_assignment_version:
            currentAssignmentVersion,
        });
      }


      // =================================================
      // ACTUALIZAR OBSERVACIÓN
      // =================================================

      const updateResult =
        await client.query(
          `
            UPDATE slaughterhouse_purchase_lots

            SET
              captador_notes = $1,
              captador_notes_updated_at = NOW(),
              captador_notes_updated_by = $2,
              updated_at = NOW()

            WHERE
              id = $3
              AND company_id = $4

            RETURNING
              id,
              lot_number,
              captador_person_id,
              captador_assignment_version,
              captador_notes,
              captador_notes_updated_at,
              captador_notes_updated_by
          `,
          [
            captadorNotes,
            userId,
            purchaseLotId,
            companyId,
          ],
        );


      const updatedLot =
        updateResult.rows[0];


      // =================================================
      // AUDITORÍA
      // =================================================

      await client.query(
        `
          INSERT INTO slaughterhouse_audit_log (
            company_id,
            user_id,
            entity_type,
            entity_id,
            action,
            old_data,
            new_data
          )

          VALUES (
            $1,
            $2,
            'purchase_lot',
            $3,
            'captador_notes_update',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(purchaseLotId),
          JSON.stringify({
            captador_notes:
              previous.captador_notes,
            captador_notes_updated_at:
              previous.captador_notes_updated_at,
            captador_notes_updated_by:
              previous.captador_notes_updated_by,
          }),
          JSON.stringify({
            captador_notes:
              updatedLot.captador_notes,
            captador_notes_updated_at:
              updatedLot.captador_notes_updated_at,
            captador_notes_updated_by:
              updatedLot.captador_notes_updated_by,
          }),
        ],
      );


      await client.query(
        'COMMIT'
      );


      return res.json({
        success: true,

        purchase_lot_id:
          purchaseLotId,

        lot_number:
          updatedLot.lot_number,

        captador_notes:
          updatedLot.captador_notes,

        captador_notes_updated_at:
          updatedLot
            .captador_notes_updated_at,

        captador_notes_updated_by:
          updatedLot
            .captador_notes_updated_by,
      });

    } catch (error) {

      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (_) {}

      console.error(
        'UPDATE FIELD CAPTADOR NOTES ERROR:',
        error
      );

      return res.status(500).json({
        error:
          'Error guardando observación del captador',
      });

    } finally {

      client.release();

    }

  };

// =====================================================
// ⚖️ SINCRONIZAR PESAJE DE CAMPO / PESO EN ORIGEN
//
// POST
// /slaughterhouse/field/capture-sheets/:captureSheetId/
// lots/:purchaseLotId/sync-weighing
//
// Reglas:
// - Solo captador asignado.
// - Solo weight_source = origin.
// - Requiere troop_id.
// - La tropa YA debe existir desde Transporte.
// - Campo NO crea tropas.
// - Cada tropa tiene su propio weighing draft.
// - Reemplaza items dentro de la misma transacción.
// - Backend recalcula todos los totales.
// - NO certifica.
// - NO despacha.
// =====================================================
exports.syncFieldLiveWeighing =
  async (req, res) => {

    const client =
      await pool.connect();

    try {

      const userId =
        Number(
          req.user?.user_id ??
          req.user?.id
        );

      const companyId =
        Number(
          req.user?.company_id
        );

      const captureSheetId =
        Number(
          req.params.captureSheetId
        );

      const purchaseLotId =
        Number(
          req.params.purchaseLotId
        );

      const troopId =
        Number(
          req.body?.troop_id
        );


      const captadorAssignmentVersion =
        Number(
          req.body
            ?.captador_assignment_version
        );


      const weightMode =
        req.body?.weight_mode
          ?.toString()
          .trim() ||
        'individual';

      const items =
        Array.isArray(req.body?.items)
          ? req.body.items
          : [];

      const requestedQuantity =
        Number(
          req.body?.quantity
        );

      const requestedGrossWeightKg =
        Number(
          req.body?.gross_weight_kg
        );

      // =================================================
      // VALIDACIONES BÁSICAS
      // =================================================

      if (
        !Number.isInteger(userId) ||
        userId <= 0
      ) {
        return res.status(401).json({
          error:
            'Usuario autenticado inválido',
        });
      }

      if (
        !Number.isInteger(companyId) ||
        companyId <= 0
      ) {
        return res.status(400).json({
          error:
            'Contexto de empresa inválido',
        });
      }

      if (
        !Number.isInteger(captureSheetId) ||
        captureSheetId <= 0
      ) {
        return res.status(400).json({
          error:
            'captureSheetId inválido',
        });
      }

      if (
        !Number.isInteger(purchaseLotId) ||
        purchaseLotId <= 0
      ) {
        return res.status(400).json({
          error:
            'purchaseLotId inválido',
        });
      }

      if (
        !Number.isInteger(
          troopId
        ) ||
        troopId <= 0
      ) {
        return res.status(400).json({
          error:
            'troop_id inválido',
        });
      }

      if (
        !Number.isInteger(
          captadorAssignmentVersion
        ) ||
        captadorAssignmentVersion <= 0
      ) {
        return res.status(400).json({
          error:
            'captador_assignment_version inválido',
        });
      }

      if (
        ![
          'individual',
          'troop_total',
        ].includes(
          weightMode
        )
      ) {
        return res.status(400).json({
          error:
            'weight_mode inválido. Use individual o troop_total',
        });
      }

      // =================================================
      // NORMALIZAR PESAJE
      //
      // individual:
      // - cada animal tiene su propio item
      //
      // troop_total:
      // - se recibe cantidad total de animales
      // - se recibe peso total de la tropa
      // - NO se crean pesos individuales ficticios
      // =================================================

      const normalizedItems = [];

      if (
        weightMode ===
        'individual'
      ) {

        if (items.length === 0) {
          return res.status(400).json({
            error:
              'Debe registrar al menos un peso individual',
          });
        }

        for (
          let index = 0;
          index < items.length;
          index++
        ) {

          const weightKg =
            Number(
              items[index]
                ?.weight_kg
            );

          if (
            !Number.isFinite(weightKg) ||
            weightKg <= 0
          ) {
            return res.status(400).json({
              error:
                `Peso inválido en el animal ${index + 1}`,
            });
          }

          const notes =
            items[index]
              ?.notes
              ?.toString()
              .trim() ||
            null;

          normalizedItems.push({
            sequence_number:
              index + 1,

            weight_kg:
              Number(
                weightKg.toFixed(3)
              ),

            notes,
          });
        }

      } else {

        if (
          !Number.isInteger(
            requestedQuantity
          ) ||
          requestedQuantity <= 0
        ) {
          return res.status(400).json({
            error:
              'La cantidad de animales de la tropa es inválida',
          });
        }

        if (
          !Number.isFinite(
            requestedGrossWeightKg
          ) ||
          requestedGrossWeightKg <= 0
        ) {
          return res.status(400).json({
            error:
              'El peso total de la tropa es inválido',
          });
        }
      }

      await client.query(
        'BEGIN'
      );

      // =================================================
      // CAPTADOR AUTENTICADO
      // =================================================

      const captadorResult =
        await client.query(
          `
            SELECT
              sp.id,
              sp.full_name

            FROM slaughterhouse_people sp

            JOIN slaughterhouse_person_roles spr
              ON spr.person_id = sp.id
              AND spr.role = 'captador'
              AND spr.is_active = true

            WHERE
              sp.company_id = $1
              AND sp.user_id = $2
              AND sp.is_active = true

            LIMIT 1
          `,
          [
            companyId,
            userId,
          ],
        );

      if (
        captadorResult.rows.length === 0
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(403).json({
          error:
            'El usuario no está habilitado como captador/comprador en este frigorífico',
        });
      }

      const captador =
        captadorResult.rows[0];

      // =================================================
      // VALIDAR Y BLOQUEAR LOTE
      // =================================================

      const lotResult =
        await client.query(
          `
            SELECT
              spl.id,
              spl.lot_number,
              spl.capture_sheet_id,
              spl.seller_person_id,
              spl.captador_person_id,
              spl.captador_assignment_version,
              spl.captador_assigned_at,
              spl.classification_id,
              spl.expected_quantity,
              spl.pricing_basis,
              spl.weight_source,
              spl.shrink_percent,
              spl.price_per_unit,
              spl.currency,
              spl.status
                AS lot_status,

              scs.status
                AS capture_sheet_status

            FROM slaughterhouse_purchase_lots spl

            JOIN slaughterhouse_capture_sheets scs
              ON scs.id =
                spl.capture_sheet_id
              AND scs.company_id =
                spl.company_id

            WHERE
              spl.id = $1
              AND spl.company_id = $2
              AND scs.id = $3

            FOR UPDATE OF spl
          `,
            [
              purchaseLotId,
              companyId,
              captureSheetId,
            ],
        );

      if (
        lotResult.rows.length === 0
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error:
            'Lote no encontrado o no asignado a este captador',
        });
      }

      const lot =
        lotResult.rows[0];

      // =================================================
      // AUTORIDAD DE ASIGNACIÓN DEL CAPTADOR
      //
      // El servidor manda.
      // Una reasignación invalida cualquier pesaje
      // pendiente guardado con una versión anterior.
      // =================================================

      const currentCaptadorPersonId =
        lot.captador_person_id !== null
          ? Number(
              lot.captador_person_id
            )
          : null;


      const currentAssignmentVersion =
        Number(
          lot.captador_assignment_version ||
          1
        );


      if (
        currentCaptadorPersonId !==
          Number(captador.id) ||
        currentAssignmentVersion !==
          captadorAssignmentVersion
      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'assignment_revoked',

          message:
            'La asignación de este lote cambió. Los datos locales pendientes ya no son válidos.',

          purchase_lot_id:
            purchaseLotId,

          current_assignment_version:
            currentAssignmentVersion,
        });
      }

      if (
        ![
          'open',
          'in_transport',
        ].includes(
          lot.lot_status
        )
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            `El lote no admite captura de campo en estado ${lot.lot_status}`,
        });
      }

      // =================================================
      // ESTE ENDPOINT ES PARA PESAJE FÍSICO EN ORIGEN
      //
      // La modalidad comercial puede ser:
      // - live_kg
      // - hook_kg
      // - per_head
      //
      // Lo que determina si corresponde pesar aquí
      // es weight_source = origin.
      // =================================================

      if (

        lot.weight_source !==
          'origin'

      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({

          error:
            'Este lote no corresponde a pesaje en origen',

        });

      }

      // =================================================
      // CALCULAR TODO EN BACKEND
      // =================================================

      const quantity =
        weightMode ===
        'individual'
          ? normalizedItems.length
          : requestedQuantity;

      const grossWeightKg =
        weightMode ===
        'individual'
          ? normalizedItems.reduce(
              (
                total,
                item
              ) =>
                total +
                Number(
                  item.weight_kg
                ),
              0
            )
          : requestedGrossWeightKg;

      const roundedGrossWeightKg =
        Number(
          grossWeightKg.toFixed(
            3
          )
        );

      const averageWeightKg =
        quantity > 0
          ? Number(
              (
                roundedGrossWeightKg /
                quantity
              ).toFixed(3)
            )
          : null;

      const shrinkPercent =
        Number(
          lot.shrink_percent ||
          0
        );

      if (
        !Number.isFinite(
          shrinkPercent
        ) ||
        shrinkPercent < 0 ||
        shrinkPercent > 100
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(400).json({
          error:
            'La merma del lote es inválida',
        });
      }

      const shrinkWeightKg =
        Number(
          (
            roundedGrossWeightKg *
            shrinkPercent /
            100
          ).toFixed(3)
        );

      const netWeightKg =
        Number(
          (
            roundedGrossWeightKg -
            shrinkWeightKg
          ).toFixed(3)
        );

      // =================================================
      // VALORIZACIÓN ECONÓMICA
      //
      // El pesaje físico en origen puede existir para
      // cualquier modalidad de compra.
      //
      // SOLO live_kg utiliza este peso para calcular
      // el importe contractual.
      //
      // hook_kg:
      // se liquidará posteriormente con peso gancho.
      //
      // per_head:
      // se liquidará posteriormente por cantidad.
      // =================================================

      const pricePerKg =
        lot.pricing_basis ===
          'live_kg' &&
        lot.price_per_unit !== null &&
        lot.price_per_unit !== undefined
          ? Number(
              lot.price_per_unit
            )
          : null;

      if (

        pricePerKg !== null &&

        (
          !Number.isFinite(
            pricePerKg
          ) ||

          pricePerKg < 0
        )

      ) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(400).json({

          error:
            'El precio por kg del lote es inválido',

        });

      }

      const totalAmount =
        lot.pricing_basis ===
            'live_kg' &&
        pricePerKg !== null
          ? Number(
              (
                netWeightKg *
                pricePerKg
              ).toFixed(2)
            )
          : null;

      // =================================================
      // IDENTIDAD ESTABLE DE CAMPO POR TROPA
      // =================================================

      const troopFieldSyncId =
        `field:${companyId}:lot:${purchaseLotId}:troop:${troopId}`;

      const weighingFieldSyncId =
        `${troopFieldSyncId}:weighing`;

      // =================================================
      // OBTENER TROPA EXISTENTE
      //
      // La tropa nació previamente desde Transporte.
      // Campo solamente registra lo realmente cargado.
      // =================================================

      const existingTroopResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_troops

            WHERE
              id = $1
              AND company_id = $2
              AND purchase_lot_id = $3
              AND status <> 'cancelled'

            FOR UPDATE
          `,
          [
            troopId,
            companyId,
            purchaseLotId,
          ],
        );

      if (
        existingTroopResult.rows.length ===
        0
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(404).json({
          error:
            'La tropa indicada no existe o no pertenece a este lote',
        });
      }

      const existingTroop =
        existingTroopResult.rows[0];

      // =================================================
      // TROPA YA CERTIFICADA = INMUTABLE
      // =================================================

      if (
        existingTroop
          .field_capture_status ===
        'certified'
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'La captura de esta tropa ya fue certificada y no puede modificarse',
        });
      }

      // =================================================
      // NO MODIFICAR TROPA QUE YA AVANZÓ
      // =================================================

      if (
        [
          'in_transit',
          'received',
          'in_slaughter',
          'completed',
        ].includes(
          existingTroop.status
        )
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            `La tropa ya se encuentra en estado ${existingTroop.status}`,
        });
      }

      // =================================================
      // ACTUALIZAR REALIDAD DE CAMPO
      //
      // expected_quantity NO se toca.
      // quantity se deriva de los animales pesados.
      // =================================================

      const updateTroopResult =
        await client.query(
          `
            UPDATE slaughterhouse_troops

            SET
              field_sync_id = $1,

              field_capture_status =
                'captured',

              field_captured_quantity =
                $2,

              field_captured_at =
                COALESCE(
                  field_captured_at,
                  NOW()
                ),

              updated_at =
                NOW()

            WHERE
              id = $3
              AND company_id = $4
              AND purchase_lot_id = $5
              AND status <> 'cancelled'
              AND COALESCE(
                field_capture_status,
                ''
              ) <> 'certified'

            RETURNING *
          `,
          [
            troopFieldSyncId,
            quantity,
            troopId,
            companyId,
            purchaseLotId,
          ],
        );

      if (
        updateTroopResult.rows.length ===
        0
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'La tropa cambió de estado durante la sincronización',
        });
      }

      const troop =
        updateTroopResult.rows[0];

      // Compatibilidad con la respuesta anterior.
      // Campo ya nunca crea tropas.
      const troopCreated =
        false;

      // =================================================
      // BUSCAR PESAJE DE CAMPO EXISTENTE
      // =================================================

      const existingWeighingResult =
        await client.query(
          `
            SELECT *
            FROM slaughterhouse_live_weighings

            WHERE
              company_id = $1
              AND field_sync_id = $2

            LIMIT 1

            FOR UPDATE
          `,
          [
            companyId,
            weighingFieldSyncId,
          ],
        );

      let weighing;
      let weighingCreated = false;

      // =================================================
      // ACTUALIZAR EL MISMO DRAFT
      // =================================================

      if (
        existingWeighingResult.rows.length === 1
      ) {

        const existingWeighing =
          existingWeighingResult.rows[0];

        if (
          existingWeighing.status !==
          'draft'
        ) {
          await client.query(
            'ROLLBACK'
          );

          return res.status(409).json({
            error:
              `El pesaje ya se encuentra en estado ${existingWeighing.status}`,
          });
        }

        if (
          Number(
            existingWeighing
              .purchase_lot_id
          ) !== purchaseLotId
        ) {
          await client.query(
            'ROLLBACK'
          );

          return res.status(409).json({
            error:
              'El pesaje de campo pertenece a otro lote',
          });
        }

        if (
          Number(
            existingWeighing
              .troop_id
          ) !==
          Number(
            troop.id
          )
        ) {
          await client.query(
            'ROLLBACK'
          );

          return res.status(409).json({
            error:
              'El pesaje de campo pertenece a otra tropa',
          });
        }

        const updateWeighingResult =
          await client.query(
            `
              UPDATE slaughterhouse_live_weighings

              SET
                troop_id = $1,
                seller_person_id = $2,
                captador_person_id = $3,
                classification_id = $4,
                quantity = $5,
                gross_weight_kg = $6,
                shrink_percent = $7,
                shrink_weight_kg = $8,
                net_weight_kg = $9,
                price_per_kg = $10,
                total_amount = $11,
                weight_mode = $12,
                updated_at = NOW()

              WHERE
                id = $13
                AND company_id = $14

              RETURNING *
            `,
            [
              troop.id,
              lot.seller_person_id,
              captador.id,
              lot.classification_id,
              quantity,
              roundedGrossWeightKg,
              shrinkPercent,
              shrinkWeightKg,
              netWeightKg,
              pricePerKg,
              totalAmount,
              weightMode,
              existingWeighing.id,
              companyId,
            ],
          );

        weighing =
          updateWeighingResult.rows[0];

        // ===============================================
        // REINTENTO:
        // borrar items anteriores y volver a insertar
        // exactamente la captura recibida.
        // ===============================================

        await client.query(
          `
            DELETE FROM slaughterhouse_live_weighing_items
            WHERE weighing_id = $1
          `,
          [
            weighing.id,
          ],
        );

      } else {

        // =================================================
        // NUEVO NÚMERO DE PESAJE
        //
        // El lote está bloqueado FOR UPDATE, por lo que
        // esta secuencia queda serializada para este lote.
        // =================================================

        const numberResult =
          await client.query(
            `
              SELECT
                COALESCE(
                  MAX(
                    weighing_number
                  ),
                  0
                ) + 1
                  AS next_number

              FROM slaughterhouse_live_weighings

              WHERE
                purchase_lot_id = $1
            `,
            [
              purchaseLotId,
            ],
          );

        const weighingNumber =
          Number(
            numberResult.rows[0]
              .next_number
          );

        const insertWeighingResult =
          await client.query(
            `
              INSERT INTO slaughterhouse_live_weighings (
                company_id,
                purchase_lot_id,
                troop_id,
                weighing_number,
                seller_person_id,
                captador_person_id,
                classification_id,
                quantity,
                gross_weight_kg,
                weight_mode,
                shrink_percent,
                shrink_weight_kg,
                net_weight_kg,
                price_per_kg,
                total_amount,
                certified_offline,
                status,
                created_by,
                field_sync_id
              )

              VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10,
                $11,
                $12,
                $13,
                $14,
                $15,
                false,
                'draft',
                $16,
                $17
              )

              RETURNING *
            `,
            [
              companyId,
              purchaseLotId,
              troop.id,
              weighingNumber,
              lot.seller_person_id,
              captador.id,
              lot.classification_id,
              quantity,
              roundedGrossWeightKg,
              weightMode,
              shrinkPercent,
              shrinkWeightKg,
              netWeightKg,
              pricePerKg,
              totalAmount,
              userId,
              weighingFieldSyncId,
            ],
          );

        weighing =
          insertWeighingResult.rows[0];

        weighingCreated =
          true;
      }

      // =================================================
      // INSERTAR EXACTAMENTE LOS ITEMS RECIBIDOS
      // =================================================

      const insertedItems = [];

      for (
        const item of normalizedItems
      ) {

        const itemResult =
          await client.query(
            `
              INSERT INTO slaughterhouse_live_weighing_items (
                weighing_id,
                sequence_number,
                weight_kg,
                notes
              )

              VALUES (
                $1,
                $2,
                $3,
                $4
              )

              RETURNING *
            `,
            [
              weighing.id,
              item.sequence_number,
              item.weight_kg,
              item.notes,
            ],
          );

        insertedItems.push(
          itemResult.rows[0]
        );
      }

      // =================================================
      // AUDITORÍA
      // =================================================

      await client.query(
        `
          INSERT INTO slaughterhouse_audit_log (
            company_id,
            user_id,
            entity_type,
            entity_id,
            action,
            new_data
          )

          VALUES (
            $1,
            $2,
            'live_weighing',
            $3,
            'field_weighing_sync',
            $4::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            weighing.id
          ),
          JSON.stringify({
            troop_id:
              troop.id,
            purchase_lot_id:
              purchaseLotId,
            field_sync_id:
              weighingFieldSyncId,
            quantity,
            gross_weight_kg:
              roundedGrossWeightKg,
            weight_mode:
              weightMode,

            average_weight_kg:
              averageWeightKg,
            shrink_percent:
              shrinkPercent,
            shrink_weight_kg:
              shrinkWeightKg,
            net_weight_kg:
              netWeightKg,
            price_per_kg:
              pricePerKg,
            total_amount:
              totalAmount,
            items:
              insertedItems,
          }),
        ],
      );

      await client.query(
        'COMMIT'
      );

      return res.json({
        success: true,

        troop_created:
          troopCreated,

        weighing_created:
          weighingCreated,

        capture_sheet_id:
          captureSheetId,

        purchase_lot_id:
          purchaseLotId,

        lot_number:
          lot.lot_number,

        // Cantidad contratada del lote completo.
        expected_quantity:
          lot.expected_quantity,

        contracted_quantity:
          lot.expected_quantity,

        // Tropa/camión trabajado.
        troop_id:
          troop.id,

        // Cantidad orientativa de este camión.
        troop_expected_quantity:
          troop.expected_quantity,

        // Realidad capturada en campo.
        field_captured_quantity:
          quantity,

        field_capture_status:
          troop.field_capture_status,

        troop,

        weighing,

        items:
          insertedItems,

        calculated: {
          weight_mode:
            weightMode,

          quantity,

          gross_weight_kg:
            roundedGrossWeightKg,

          average_weight_kg:
            averageWeightKg,

          shrink_percent:
            shrinkPercent,

          shrink_weight_kg:
            shrinkWeightKg,

          net_weight_kg:
            netWeightKg,

          price_per_kg:
            pricePerKg,

          total_amount:
            totalAmount,
        },
      });

    } catch (error) {

      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (_) {}

      console.error(
        'SYNC FIELD LIVE WEIGHING ERROR:',
        error
      );

      if (
        error.code ===
        '23505'
      ) {
        return res.status(409).json({
          error:
            'Conflicto sincronizando el pesaje de campo. Intente nuevamente',
        });
      }

      return res.status(500).json({
        error:
          'Error sincronizando pesaje de campo',
      });

    } finally {

      client.release();

    }

  };