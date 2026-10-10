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
                        st.field_authorization_id,

                      'field_authorization_status',
                        field_auth.status,

                      'field_authorization_snapshot_version',
                        field_auth.details_snapshot->>'snapshot_version',

                      'authorized_categories',
                        COALESCE(
                          field_auth.details_snapshot->'categories',
                          '[]'::jsonb
                        ),

                      'authorized_commercial_agreement',
                        field_auth.details_snapshot->'commercial_agreement',

                      'authorized_commercial_agreement_hash',
                        field_auth.details_snapshot->>'commercial_agreement_hash'
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

              LEFT JOIN slaughterhouse_weighing_authorizations field_auth
                ON field_auth.id =
                  st.field_authorization_id
                AND field_auth.company_id =
                  st.company_id
                AND field_auth.purpose =
                  'field_load_close'

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


      // =================================================
      // MODELO MULTICATEGORÍA PARA TRABAJO DE CAMPO
      //
      // El teléfono recibe:
      //
      // - categorías comerciales contratadas
      // - catálogo activo para reclasificación
      // - cargas parciales ya sincronizadas
      //
      // Todo esto queda disponible también en Hive.
      // =================================================

      const lotIds =
        lotsResult.rows.map(
          (row) =>
            Number(row.id)
        );


      let contractedCategoryRows =
        [];

      let partialLoadRows =
        [];


      if (
        lotIds.length > 0
      ) {

        const [
          contractedCategoriesResult,
          partialLoadsResult,
        ] =
          await Promise.all([

            pool.query(
              `
                SELECT
                  plc.id
                    AS purchase_lot_category_id,

                  plc.purchase_lot_id,
                  plc.line_number,
                  plc.classification_id,

                  sac.generated_code
                    AS classification_code,

                  sac.display_name
                    AS classification_name,

                  plc.expected_quantity,
                  plc.pricing_basis,
                  plc.weight_source,
                  plc.price_per_unit,
                  plc.currency,
                  plc.shrink_percent

                FROM slaughterhouse_purchase_lot_categories plc

                JOIN slaughterhouse_animal_classifications sac
                  ON sac.id =
                    plc.classification_id
                  AND sac.company_id =
                    plc.company_id

                WHERE
                  plc.company_id = $1
                  AND plc.purchase_lot_id =
                    ANY($2::int[])

                ORDER BY
                  plc.purchase_lot_id ASC,
                  plc.line_number ASC,
                  plc.id ASC
              `,
              [
                companyId,
                lotIds,
              ],
            ),


            pool.query(
              `
                SELECT
                  spl.id,
                  spl.company_id,
                  spl.purchase_lot_id,
                  spl.troop_id,
                  spl.capture_sheet_id,
                  spl.partial_number,
                  spl.partial_code,
                  spl.field_sync_id,
                  spl.captador_person_id,
                  spl.captador_assignment_version,
                  spl.estate_id,
                  spl.pickup_reference,
                  spl.notes,
                  spl.event_lat,
                  spl.event_lng,
                  spl.event_local_time,
                  spl.status,
                  spl.total_quantity,
                  spl.gross_weight_kg,
                  spl.created_at,
                  spl.updated_at,

                  COALESCE(
                    (
                      SELECT
                        jsonb_agg(
                          jsonb_build_object(
                            'id',
                              plc.id,

                            'line_number',
                              plc.line_number,

                            'original_purchase_lot_category_id',
                              plc.original_purchase_lot_category_id,

                            'contracted_category_id',
                              plc.contracted_category_id,

                            'actual_classification_id',
                              plc.actual_classification_id,

                            'actual_classification_code',
                              actual_classification.generated_code,

                            'actual_classification_name',
                              actual_classification.display_name,

                            'quantity',
                              plc.quantity,

                            'commercial_status',
                              plc.commercial_status,

                            'pricing_basis',
                              plc.pricing_basis,

                            'weight_source',
                              plc.weight_source,

                            'price_per_unit',
                              plc.price_per_unit,

                            'currency',
                              plc.currency,

                            'shrink_percent',
                              plc.shrink_percent,

                            'observation',
                              plc.observation,

                            'weight_mode',
                              plc.weight_mode,

                            'gross_weight_kg',
                              plc.gross_weight_kg,

                            'price_confirmed_by',
                              plc.price_confirmed_by,

                            'price_confirmed_at',
                              plc.price_confirmed_at,

                            'weights',
                              COALESCE(
                                (
                                  SELECT
                                    jsonb_agg(
                                      jsonb_build_object(
                                        'id',
                                          weight.id,

                                        'sequence_number',
                                          weight.sequence_number,

                                        'weight_kg',
                                          weight.weight_kg,

                                        'notes',
                                          weight.notes
                                      )
                                      ORDER BY
                                        weight.sequence_number ASC
                                    )

                                  FROM slaughterhouse_field_partial_load_weights weight

                                  WHERE
                                    weight.partial_load_category_id =
                                      plc.id
                                ),
                                '[]'::jsonb
                              )
                          )
                          ORDER BY
                            plc.line_number ASC
                        )

                      FROM slaughterhouse_field_partial_load_categories plc

                      JOIN slaughterhouse_animal_classifications actual_classification
                        ON actual_classification.id =
                          plc.actual_classification_id
                        AND actual_classification.company_id =
                          plc.company_id

                      WHERE
                        plc.partial_load_id =
                          spl.id
                    ),
                    '[]'::jsonb
                  )
                    AS categories

                FROM slaughterhouse_field_partial_loads spl

                WHERE
                  spl.company_id = $1
                  AND spl.capture_sheet_id = $2
                  AND spl.purchase_lot_id =
                    ANY($3::int[])

                ORDER BY
                  spl.purchase_lot_id ASC,
                  spl.troop_id ASC,
                  spl.partial_number ASC,
                  spl.id ASC
              `,
              [
                companyId,
                captureSheetId,
                lotIds,
              ],
            ),

          ]);


        contractedCategoryRows =
          contractedCategoriesResult.rows;

        partialLoadRows =
          partialLoadsResult.rows;

      }


      // =================================================
      // CATÁLOGO ACTIVO DE CLASIFICACIONES
      //
      // Se descarga junto con la hoja para que el
      // captador pueda reclasificar OFFLINE.
      //
      // El captador NO crea categorías nuevas.
      // =================================================

      const classificationCatalogResult =
        await pool.query(
          `
            SELECT
              sac.id,
              sac.generated_code,
              sac.display_name,

              category.name
                AS category_name,

              breed.name
                AS breed_name,

              feeding.name
                AS feeding_method_name,

              age.name
                AS age_range_name,

              age.min_months,
              age.max_months

            FROM slaughterhouse_animal_classifications sac

            JOIN slaughterhouse_animal_categories category
              ON category.id =
                sac.category_id
              AND category.company_id =
                sac.company_id

            JOIN slaughterhouse_breeds breed
              ON breed.id =
                sac.breed_id
              AND breed.company_id =
                sac.company_id

            JOIN slaughterhouse_feeding_methods feeding
              ON feeding.id =
                sac.feeding_method_id
              AND feeding.company_id =
                sac.company_id

            JOIN slaughterhouse_age_ranges age
              ON age.id =
                sac.age_range_id
              AND age.company_id =
                sac.company_id

            WHERE
              sac.company_id = $1
              AND sac.is_active = true

            ORDER BY
              category.name ASC,
              breed.name ASC,
              feeding.name ASC,
              age.min_months ASC NULLS FIRST,
              sac.id ASC
          `,
          [
            companyId,
          ],
        );


      // =================================================
      // AGRUPAR CATEGORÍAS CONTRATADAS POR LOTE
      // =================================================

      const contractedByLot =
        new Map();


      for (
        const row
        of contractedCategoryRows
      ) {

        const lotId =
          Number(
            row.purchase_lot_id
          );


        if (
          !contractedByLot.has(
            lotId
          )
        ) {

          contractedByLot.set(
            lotId,
            []
          );

        }


        contractedByLot
          .get(lotId)
          .push({
            purchase_lot_category_id:
              Number(
                row.purchase_lot_category_id
              ),

            line_number:
              Number(
                row.line_number
              ),

            classification_id:
              Number(
                row.classification_id
              ),

            classification_code:
              row.classification_code,

            classification_name:
              row.classification_name,

            expected_quantity:
              Number(
                row.expected_quantity
              ),

            pricing_basis:
              row.pricing_basis,

            weight_source:
              row.weight_source,

            price_per_unit:
              Number(
                row.price_per_unit
              ),

            currency:
              row.currency,

            shrink_percent:
              Number(
                row.shrink_percent ||
                0
              ),
          });

      }


      // =================================================
      // AGRUPAR CARGAS PARCIALES POR TROPA
      // =================================================

      const partialLoadsByTroop =
        new Map();


      for (
        const partialLoad
        of partialLoadRows
      ) {

        const troopId =
          Number(
            partialLoad.troop_id
          );


        if (
          !partialLoadsByTroop.has(
            troopId
          )
        ) {

          partialLoadsByTroop.set(
            troopId,
            []
          );

        }


        partialLoadsByTroop
          .get(troopId)
          .push(
            partialLoad
          );

      }


      // =================================================
      // RESPUESTA DE LOTES ENRIQUECIDA
      // =================================================

      const lotsForResponse =
        lotsResult.rows.map(
          (row) => {

            const lotId =
              Number(row.id);


            const rawTroops =
              Array.isArray(
                row.troops
              )
                ? row.troops
                : [];


            const troops =
              rawTroops.map(
                (troop) => {

                  const troopId =
                    Number(
                      troop.id
                    );


                  return {
                    ...troop,

                    partial_loads:
                      partialLoadsByTroop
                        .get(
                          troopId
                        ) ||
                      [],
                  };

                },
              );


            return {
              ...row,

              categories:
                contractedByLot.get(
                  lotId
                ) ||
                [],

              troops,
            };

          },
        );


      const totalExpectedQuantity =
        lotsForResponse.reduce(
          (
            total,
            lot,
          ) =>
            total +
            Number(
              lot.expected_quantity ||
              0
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
            lotsForResponse.length,

          total_expected_quantity:
            totalExpectedQuantity,
        },

        classification_catalog:
          classificationCatalogResult.rows,

        lots:
          lotsForResponse,
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
              -- DATOS DEL CAMIÓN FRIGORIFICO
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
              -- El camión NO desaparece de la lista FRIGORIFICO.
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
// - El camión debe pertenecer a la red privada FRIGORIFICO.
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

      const destination =
        lot.company_name
          ?.toString()
          .trim();


      if (!destination) {

        await client.query(
          'ROLLBACK'
        );

        return res.status(400).json({
          error:
            'El frigorífico no tiene un nombre válido como destino',
        });
      }

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
      // VALIDAR CAMIÓN DE RED PRIVADA FRIGORIFICO
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
            'El camión no pertenece a la red privada del frigorífico o todavía no está vinculado a Plaza Transporte',
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
            `${destination} - Transporte asignado directamente`,

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
        `✅ ${destination} te asignó un transporte.\n\n` +
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
            `${destination} te asignó un transporte`,

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
// 🐂 SINCRONIZAR CARGA PARCIAL MULTICATEGORÍA
//
// POST
// /slaughterhouse/field/
// capture-sheets/:captureSheetId/
// lots/:purchaseLotId/
// troops/:troopId/
// partial-loads/sync
//
// La carga se crea localmente en Hive y utiliza
// field_sync_id como identidad estable.
//
// REGLAS:
//
// - Una tropa puede tener N cargas parciales.
// - La tropa ya debe existir.
// - Campo NO crea tropas.
// - Cada línea usa una clasificación existente.
// - Si la clasificación está contratada:
//      usa automáticamente SUS condiciones.
// - Si existe en maestro pero NO fue contratada:
//      pending_price
//      observación obligatoria.
// - No modifica el acuerdo comercial original.
// - No certifica.
// - No despacha.
// =====================================================

exports.syncFieldPartialLoad =
  async (req, res) => {

    const client =
      await pool.connect();

    let transactionStarted =
      false;


    const reject = (
      httpStatus,
      message,
      appCode = null,
    ) => {

      const error =
        new Error(message);

      error.httpStatus =
        httpStatus;

      error.appCode =
        appCode;

      throw error;

    };


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
          req.params.troopId
        );


      const captadorAssignmentVersion =
        Number(
          req.body
            ?.captador_assignment_version
        );


      const fieldSyncId =
        req.body
          ?.field_sync_id
          ?.toString()
          .trim() ||
        '';


      const partialNumber =
        Number(
          req.body
            ?.partial_number
        );


      const pickupReference =
        req.body
          ?.pickup_reference
          ?.toString()
          .trim() ||
        null;


      const notes =
        req.body
          ?.notes
          ?.toString()
          .trim() ||
        null;


      const eventLat =
        req.body?.event_lat ===
          null ||
        req.body?.event_lat ===
          undefined
          ? null
          : Number(
              req.body.event_lat
            );


      const eventLng =
        req.body?.event_lng ===
          null ||
        req.body?.event_lng ===
          undefined
          ? null
          : Number(
              req.body.event_lng
            );


      const eventLocalTimeInput =
        req.body
          ?.event_local_time ||
        null;


      const rawCategories =
        Array.isArray(
          req.body?.categories
        )
          ? req.body.categories
          : [];


      // =================================================
      // VALIDACIONES BÁSICAS
      // =================================================

      if (
        !Number.isInteger(userId) ||
        userId <= 0
      ) {
        reject(
          401,
          'Usuario autenticado inválido'
        );
      }


      if (
        !Number.isInteger(companyId) ||
        companyId <= 0
      ) {
        reject(
          400,
          'Contexto de empresa inválido'
        );
      }


      if (
        !Number.isInteger(
          captureSheetId
        ) ||
        captureSheetId <= 0 ||
        !Number.isInteger(
          purchaseLotId
        ) ||
        purchaseLotId <= 0 ||
        !Number.isInteger(
          troopId
        ) ||
        troopId <= 0
      ) {
        reject(
          400,
          'Identificación de operación inválida'
        );
      }


      if (
        !Number.isInteger(
          captadorAssignmentVersion
        ) ||
        captadorAssignmentVersion <= 0
      ) {
        reject(
          400,
          'captador_assignment_version inválido'
        );
      }


      if (
        fieldSyncId.length === 0 ||
        fieldSyncId.length > 160
      ) {
        reject(
          400,
          'field_sync_id inválido'
        );
      }


      if (
        !Number.isInteger(
          partialNumber
        ) ||
        partialNumber <= 0
      ) {
        reject(
          400,
          'partial_number inválido'
        );
      }


      if (
        rawCategories.length === 0
      ) {
        reject(
          400,
          'La carga parcial debe contener al menos una categoría'
        );
      }


      if (
        eventLat !== null &&
        (
          !Number.isFinite(
            eventLat
          ) ||
          eventLat < -90 ||
          eventLat > 90
        )
      ) {
        reject(
          400,
          'event_lat inválido'
        );
      }


      if (
        eventLng !== null &&
        (
          !Number.isFinite(
            eventLng
          ) ||
          eventLng < -180 ||
          eventLng > 180
        )
      ) {
        reject(
          400,
          'event_lng inválido'
        );
      }


      let eventLocalTime =
        null;


      if (
        eventLocalTimeInput !==
        null
      ) {

        eventLocalTime =
          new Date(
            eventLocalTimeInput
          );


        if (
          Number.isNaN(
            eventLocalTime
              .getTime()
          )
        ) {

          reject(
            400,
            'event_local_time inválido'
          );

        }

      }


      await client.query(
        'BEGIN'
      );

      transactionStarted =
        true;


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
              ON spr.person_id =
                sp.id
              AND spr.role =
                'captador'
              AND spr.is_active =
                true

            WHERE
              sp.company_id = $1
              AND sp.user_id = $2
              AND sp.is_active =
                true

            LIMIT 1

            FOR UPDATE OF sp
          `,
          [
            companyId,
            userId,
          ],
        );


      if (
        captadorResult.rows.length ===
        0
      ) {

        reject(
          403,
          'El usuario no está habilitado como captador/comprador en este frigorífico'
        );

      }


      const captador =
        captadorResult.rows[0];


      // =================================================
      // LOTE + ASIGNACIÓN
      // =================================================

      const lotResult =
        await client.query(
          `
            SELECT
              id,
              lot_number,
              capture_sheet_id,
              captador_person_id,
              captador_assignment_version,
              estate_id,
              currency,
              status

            FROM slaughterhouse_purchase_lots

            WHERE
              id = $1
              AND company_id = $2
              AND capture_sheet_id = $3

            FOR UPDATE
          `,
          [
            purchaseLotId,
            companyId,
            captureSheetId,
          ],
        );


      if (
        lotResult.rows.length ===
        0
      ) {

        reject(
          404,
          'Lote de compra no encontrado'
        );

      }


      const lot =
        lotResult.rows[0];


      if (
        Number(
          lot.captador_person_id
        ) !==
          Number(
            captador.id
          ) ||
        Number(
          lot.captador_assignment_version
        ) !==
          captadorAssignmentVersion
      ) {

        reject(
          409,
          'La asignación del captador cambió',
          'assignment_revoked'
        );

      }


      if (
        ![
          'open',
          'in_transport',
        ].includes(
          lot.status
        )
      ) {

        reject(
          409,
          `El lote no admite captura de campo en estado ${lot.status}`
        );

      }


      // =================================================
      // TROPA / CAMIÓN
      // =================================================

      const troopResult =
        await client.query(
          `
            SELECT
              *

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
        troopResult.rows.length ===
        0
      ) {

        reject(
          404,
          'La tropa no existe o no pertenece a este lote'
        );

      }


      const troop =
        troopResult.rows[0];


      if (
        troop.field_capture_status ===
        'certified'
      ) {

        reject(
          409,
          'La carga de esta tropa ya fue certificada'
        );

      }


      if (
        [
          'dispatched',
          'in_transit',
          'received',
          'in_slaughter',
          'completed',
        ].includes(
          troop.status
        )
      ) {

        reject(
          409,
          `La tropa ya se encuentra en estado ${troop.status}`
        );

      }


      if (
        troop.truck_id === null ||
        troop.truck_id === undefined
      ) {

        reject(
          409,
          'La tropa todavía no tiene un camión asignado'
        );

      }


      // =================================================
      // ACUERDO COMERCIAL AUTORIZADO PARA ESTA TROPA
      //
      // La autoridad NO es el lote actual.
      //
      // La autoridad es el snapshot inmutable que quedó
      // firmado cuando se emitió el QR de esta tropa.
      // =================================================

      const fieldAuthorizationId =
        troop.field_authorization_id !==
          null &&
        troop.field_authorization_id !==
          undefined
          ? Number(
              troop.field_authorization_id
            )
          : null;


      if (
        !Number.isInteger(
          fieldAuthorizationId
        ) ||
        fieldAuthorizationId <= 0
      ) {

        reject(
          409,
          'La tropa no tiene una autorización QR de campo vigente'
        );

      }


      const authorizationResult =
        await client.query(
          `
            SELECT
              id,
              authorization_number,
              purpose,
              status,
              details_snapshot,
              expires_at

            FROM slaughterhouse_weighing_authorizations

            WHERE
              id = $1
              AND company_id = $2
              AND purpose = 'field_load_close'

            FOR UPDATE
          `,
          [
            fieldAuthorizationId,
            companyId,
          ],
        );


      if (
        authorizationResult.rows.length ===
        0
      ) {

        reject(
          409,
          'La autorización QR de esta tropa no existe'
        );

      }


      const fieldAuthorization =
        authorizationResult.rows[0];


      if (
        fieldAuthorization.status !==
        'pending'
      ) {

        reject(
          409,
          `La autorización QR se encuentra en estado ${fieldAuthorization.status}`
        );

      }


      if (
        fieldAuthorization.expires_at &&
        new Date(
          fieldAuthorization.expires_at
        ).getTime() <=
          Date.now()
      ) {

        reject(
          409,
          'La autorización QR de campo está vencida'
        );

      }


      const authorizationSnapshot =
        fieldAuthorization
          .details_snapshot &&
        typeof fieldAuthorization
          .details_snapshot ===
          'object'
          ? fieldAuthorization
              .details_snapshot
          : {};


      if (
        Number(
          authorizationSnapshot
            .purchase_lot_id
        ) !==
          purchaseLotId ||
        Number(
          authorizationSnapshot
            .troop_id
        ) !==
          troopId
      ) {

        reject(
          409,
          'La autorización QR no corresponde a esta tropa y lote'
        );

      }


      const snapshotVersion =
        Number(
          authorizationSnapshot
            .snapshot_version ||
          0
        );


      if (
        snapshotVersion !== 2
      ) {

        reject(
          409,
          'La autorización QR utiliza el modelo comercial anterior. Debe revocarse y emitirse nuevamente.'
        );

      }


      const snapshotCategories =
        Array.isArray(
          authorizationSnapshot
            .categories
        )
          ? authorizationSnapshot
              .categories
          : [];


      if (
        snapshotCategories.length ===
        0
      ) {

        reject(
          409,
          'La autorización QR no contiene categorías comerciales'
        );

      }


      // =================================================
      // NORMALIZAR CATEGORÍAS DEL SNAPSHOT
      // =================================================

      const contractedCategories =
        snapshotCategories.map(
          (
            category,
            index
          ) => {

            const purchaseLotCategoryId =
              category
                .purchase_lot_category_id !==
                null &&
              category
                .purchase_lot_category_id !==
                undefined
                ? Number(
                    category
                      .purchase_lot_category_id
                  )
                : null;


            const classificationId =
              Number(
                category
                  .classification_id
              );


            const expectedQuantity =
              Number(
                category
                  .expected_quantity
              );


            const pricePerUnit =
              Number(
                category
                  .price_per_unit
              );


            const shrinkPercent =
              Number(
                category
                  .shrink_percent ||
                0
              );


            if (
              !Number.isInteger(
                classificationId
              ) ||
              classificationId <= 0
            ) {

              reject(
                409,
                `Clasificación inválida en el contrato QR, línea ${index + 1}`
              );

            }


            if (
              !Number.isInteger(
                expectedQuantity
              ) ||
              expectedQuantity <= 0
            ) {

              reject(
                409,
                `Cantidad inválida en el contrato QR, línea ${index + 1}`
              );

            }


            if (
              !Number.isFinite(
                pricePerUnit
              ) ||
              pricePerUnit <= 0
            ) {

              reject(
                409,
                `Precio inválido en el contrato QR, línea ${index + 1}`
              );

            }


            return {
              id:
                purchaseLotCategoryId,

              line_number:
                Number(
                  category
                    .line_number ||
                  index + 1
                ),

              classification_id:
                classificationId,

              classification_code:
                category
                  .classification_code ||
                null,

              classification_name:
                category
                  .classification_name ||
                null,

              expected_quantity:
                expectedQuantity,

              pricing_basis:
                category
                  .pricing_basis,

              weight_source:
                category
                  .weight_source,

              price_per_unit:
                pricePerUnit,

              currency:
                category.currency ||
                lot.currency ||
                'BOB',

              shrink_percent:
                shrinkPercent,
            };

          },
        );


      // =================================================
      // ÍNDICES DEL CONTRATO CONGELADO
      // =================================================

      const contractedById =
        new Map();

      const contractedByClassification =
        new Map();


      for (
        const row
        of contractedCategories
      ) {

        if (
          Number.isInteger(
            row.id
          ) &&
          row.id > 0
        ) {

          contractedById.set(
            Number(
              row.id
            ),
            row
          );

        }


        contractedByClassification.set(
          Number(
            row.classification_id
          ),
          row
        );

      }


      // =================================================
      // VALIDAR CLASIFICACIONES REALES
      // =================================================

      const requestedClassificationIds =
        [
          ...new Set(
            rawCategories.map(
              (item) =>
                Number(
                  item
                    ?.actual_classification_id
                )
            ),
          ),
        ];


      if (
        requestedClassificationIds.some(
          (id) =>
            !Number.isInteger(id) ||
            id <= 0
        )
      ) {

        reject(
          400,
          'Existe una clasificación real inválida'
        );

      }


      const actualClassificationsResult =
        await client.query(
          `
            SELECT
              id,
              generated_code,
              display_name,
              is_active

            FROM slaughterhouse_animal_classifications

            WHERE
              company_id = $1
              AND id =
                ANY($2::int[])
          `,
          [
            companyId,
            requestedClassificationIds,
          ],
        );


      const classificationById =
        new Map(
          actualClassificationsResult.rows.map(
            (row) => [
              Number(row.id),
              row,
            ],
          ),
        );


      if (
        classificationById.size !==
        requestedClassificationIds.length
      ) {

        reject(
          400,
          'Una o más clasificaciones no existen en el sistema'
        );

      }


      // =================================================
      // NORMALIZAR LÍNEAS DE LA CARGA
      // =================================================

      const allowedPricingBasis =
        new Set([
          'live_kg',
          'hook_kg',
          'per_head',
        ]);


      const allowedWeightSources =
        new Set([
          'origin',
          'plant',
          'not_applicable',
        ]);


      const normalizedCategories =
        [];


      for (
        let index = 0;
        index <
          rawCategories.length;
        index++
      ) {

        const raw =
          rawCategories[index] ||
          {};


        const actualClassificationId =
          Number(
            raw.actual_classification_id
          );


        const actualClassification =
          classificationById.get(
            actualClassificationId
          );


        const quantity =
          Number(
            raw.quantity
          );


        if (
          !Number.isInteger(quantity) ||
          quantity <= 0
        ) {

          reject(
            400,
            `Cantidad inválida en la categoría ${index + 1}`
          );

        }


        const rawOriginalId =
          raw
            .original_purchase_lot_category_id;


        const originalCategoryId =
          rawOriginalId === null ||
          rawOriginalId === undefined ||
          rawOriginalId === ''
            ? null
            : Number(
                rawOriginalId
              );


        let originalCategory =
          null;


        if (
          originalCategoryId !==
          null
        ) {

          if (
            !Number.isInteger(
              originalCategoryId
            ) ||
            originalCategoryId <= 0
          ) {

            reject(
              400,
              `Categoría original inválida en la línea ${index + 1}`
            );

          }


          originalCategory =
            contractedById.get(
              originalCategoryId
            ) ||
            null;


          if (
            originalCategory ===
            null
          ) {

            reject(
              400,
              `La categoría original de la línea ${index + 1} no pertenece a este lote`
            );

          }

        }


        const contractedCategory =
          contractedByClassification.get(
            actualClassificationId
          ) ||
          null;


        // Si no estaba contratada,
        // debe seguir activa en el maestro.
        if (
          contractedCategory ===
            null &&
          actualClassification
            .is_active !== true
        ) {

          reject(
            400,
            `La clasificación ${actualClassification.display_name} no está activa`
          );

        }


        const observation =
          raw.observation
            ?.toString()
            .trim() ||
          null;


        const reclassified =
          originalCategory !== null &&
          Number(
            originalCategory
              .classification_id
          ) !==
            actualClassificationId;


        if (
          (
            contractedCategory ===
              null ||
            reclassified
          ) &&
          !observation
        ) {

          reject(
            400,
            `Debe registrar una observación para la reclasificación de ${actualClassification.display_name}`
          );

        }


        let commercialStatus;
        let pricingBasis;
        let weightSource;
        let pricePerUnit;
        let currency;
        let shrinkPercent;


        if (
          contractedCategory !==
          null
        ) {

          commercialStatus =
            'confirmed';

          pricingBasis =
            contractedCategory
              .pricing_basis;

          weightSource =
            contractedCategory
              .weight_source;

          pricePerUnit =
            contractedCategory
              .price_per_unit !==
              null
              ? Number(
                  contractedCategory
                    .price_per_unit
                )
              : null;

          currency =
            contractedCategory
              .currency ||
            lot.currency ||
            'BOB';

          shrinkPercent =
            Number(
              contractedCategory
                .shrink_percent ||
              0
            );

        } else {

          commercialStatus =
            'pending_price';


          pricingBasis =
            raw
              .proposed_pricing_basis
              ?.toString()
              .trim() ||
            null;


          weightSource =
            raw
              .proposed_weight_source
              ?.toString()
              .trim() ||
            null;


          const proposedPriceRaw =
            raw
              .proposed_price_per_unit;


          pricePerUnit =
            proposedPriceRaw ===
              null ||
            proposedPriceRaw ===
              undefined ||
            proposedPriceRaw ===
              ''
              ? null
              : Number(
                  proposedPriceRaw
                );


          currency =
            raw
              .proposed_currency
              ?.toString()
              .trim() ||
            lot.currency ||
            'BOB';


          const proposedShrinkRaw =
            raw
              .proposed_shrink_percent;


          shrinkPercent =
            proposedShrinkRaw ===
              null ||
            proposedShrinkRaw ===
              undefined ||
            proposedShrinkRaw ===
              ''
              ? 0
              : Number(
                  proposedShrinkRaw
                );


          if (
            pricingBasis !== null &&
            !allowedPricingBasis.has(
              pricingBasis
            )
          ) {

            reject(
              400,
              `Modalidad propuesta inválida en la línea ${index + 1}`
            );

          }


          if (
            weightSource !== null &&
            !allowedWeightSources.has(
              weightSource
            )
          ) {

            reject(
              400,
              `Fuente de peso propuesta inválida en la línea ${index + 1}`
            );

          }


          if (
            pricePerUnit !== null &&
            (
              !Number.isFinite(
                pricePerUnit
              ) ||
              pricePerUnit <= 0
            )
          ) {

            reject(
              400,
              `Precio propuesto inválido en la línea ${index + 1}`
            );

          }


          if (
            pricePerUnit !== null &&
            pricingBasis === null
          ) {

            reject(
              400,
              `Debe indicar la modalidad del precio propuesto en la línea ${index + 1}`
            );

          }


          if (
            pricingBasis ===
              'live_kg' &&
            ![
              'origin',
              'plant',
            ].includes(
              weightSource
            )
          ) {

            reject(
              400,
              `La modalidad kg vivo requiere origen o planta en la línea ${index + 1}`
            );

          }


          if (
            !Number.isFinite(
              shrinkPercent
            ) ||
            shrinkPercent < 0 ||
            shrinkPercent > 100
          ) {

            reject(
              400,
              `Destare propuesto inválido en la línea ${index + 1}`
            );

          }

        }


        // =================================================
        // PESAJE POR CATEGORÍA
        //
        // Solo live_kg + origin exige peso de campo.
        // hook_kg queda pendiente del peso gancho.
        // =================================================

        const requiresOriginWeight =
          pricingBasis ===
            'live_kg' &&
          weightSource ===
            'origin';


        const rawWeights =
          Array.isArray(
            raw.weights
          )
            ? raw.weights
            : [];


        const normalizedWeights =
          rawWeights.map(
            (item) => {

              const value =
                typeof item ===
                  'number'
                  ? Number(item)
                  : Number(
                      item?.weight_kg
                    );


              if (
                !Number.isFinite(
                  value
                ) ||
                value <= 0
              ) {

                reject(
                  400,
                  `Peso inválido en la línea ${index + 1}`
                );

              }


              return value;

            },
          );


        let weightMode =
          raw.weight_mode
            ?.toString()
            .trim() ||
          null;


        const rawGrossWeight =
          raw.gross_weight_kg;


        let grossWeightKg =
          rawGrossWeight ===
            null ||
          rawGrossWeight ===
            undefined ||
          rawGrossWeight ===
            ''
            ? null
            : Number(
                rawGrossWeight
              );


        if (
          requiresOriginWeight
        ) {

          if (
            weightMode ===
              null
          ) {

            if (
              normalizedWeights.length >
              0
            ) {

              weightMode =
                'individual';

            } else if (
              grossWeightKg !==
              null
            ) {

              weightMode =
                'category_total';

            }

          }


          if (
            ![
              'individual',
              'category_total',
            ].includes(
              weightMode
            )
          ) {

            reject(
              400,
              `Debe indicar el pesaje de origen para ${actualClassification.display_name}`
            );

          }


          if (
            weightMode ===
            'individual'
          ) {

            if (
              normalizedWeights.length !==
              quantity
            ) {

              reject(
                400,
                `La cantidad de pesos de ${actualClassification.display_name} no coincide con sus animales`
              );

            }


            grossWeightKg =
              Number(
                normalizedWeights
                  .reduce(
                    (
                      total,
                      value,
                    ) =>
                      total +
                      value,
                    0,
                  )
                  .toFixed(3)
              );

          } else {

            if (
              grossWeightKg ===
                null ||
              !Number.isFinite(
                grossWeightKg
              ) ||
              grossWeightKg <= 0
            ) {

              reject(
                400,
                `Peso total inválido para ${actualClassification.display_name}`
              );

            }

          }

        } else {

          weightMode =
            'not_required';

          grossWeightKg =
            null;

          normalizedWeights.length =
            0;

        }


        normalizedCategories.push({
          line_number:
            index + 1,

          original_purchase_lot_category_id:
            originalCategoryId !==
              null
              ? originalCategoryId
              : contractedCategory !==
                null
                ? Number(
                    contractedCategory.id
                  )
                : null,

          contracted_category_id:
            contractedCategory !==
              null
              ? Number(
                  contractedCategory.id
                )
              : null,

          actual_classification_id:
            actualClassificationId,

          actual_classification_code:
            actualClassification
              .generated_code,

          actual_classification_name:
            actualClassification
              .display_name,

          quantity,

          commercial_status:
            commercialStatus,

          pricing_basis:
            pricingBasis,

          weight_source:
            weightSource,

          price_per_unit:
            pricePerUnit,

          currency,

          shrink_percent:
            shrinkPercent,

          observation,

          weight_mode:
            weightMode,

          gross_weight_kg:
            grossWeightKg,

          weights:
            normalizedWeights,
        });

      }


      const totalQuantity =
        normalizedCategories.reduce(
          (
            total,
            category
          ) =>
            total +
            category.quantity,
          0
        );


      const measuredCategories =
        normalizedCategories.filter(
          (category) =>
            category
              .gross_weight_kg !==
            null
        );


      const grossWeightKg =
        measuredCategories.length >
          0
          ? Number(
              measuredCategories
                .reduce(
                  (
                    total,
                    category
                  ) =>
                    total +
                    Number(
                      category
                        .gross_weight_kg
                    ),
                  0,
                )
                .toFixed(3)
            )
          : null;


      // =================================================
      // IDENTIDAD DE CARGA PARCIAL
      // =================================================

      const troopBaseCode =
        troop.troop_number
          ?.toString()
          .trim() ||
        `T${troop.id}`;


      const partialCode =
        `${troopBaseCode}-${String(
          partialNumber
        ).padStart(
          2,
          '0'
        )}`;


      // =================================================
      // IDEMPOTENCIA POR field_sync_id
      // =================================================

      const existingSyncResult =
        await client.query(
          `
            SELECT *

            FROM slaughterhouse_field_partial_loads

            WHERE
              company_id = $1
              AND field_sync_id = $2

            FOR UPDATE
          `,
          [
            companyId,
            fieldSyncId,
          ],
        );


      let existingPartial =
        existingSyncResult.rows[0] ||
        null;


      if (
        existingPartial !==
        null &&
        (
          Number(
            existingPartial
              .purchase_lot_id
          ) !==
            purchaseLotId ||
          Number(
            existingPartial
              .troop_id
          ) !==
            troopId
        )
      ) {

        reject(
          409,
          'field_sync_id ya pertenece a otra carga'
        );

      }


      if (
        existingPartial !==
          null &&
        existingPartial.status ===
          'certified'
      ) {

        reject(
          409,
          'Esta carga parcial ya fue certificada'
        );

      }


      const numberConflictResult =
        await client.query(
          `
            SELECT
              id,
              field_sync_id

            FROM slaughterhouse_field_partial_loads

            WHERE
              company_id = $1
              AND troop_id = $2
              AND partial_number = $3

            FOR UPDATE
          `,
          [
            companyId,
            troopId,
            partialNumber,
          ],
        );


      if (
        numberConflictResult.rows
          .length > 0 &&
        numberConflictResult.rows[0]
          .field_sync_id !==
          fieldSyncId
      ) {

        reject(
          409,
          `La carga parcial ${partialCode} ya existe con otra identidad`
        );

      }


      let partialLoadResult;


      if (
        existingPartial ===
        null
      ) {

        partialLoadResult =
          await client.query(
            `
              INSERT INTO slaughterhouse_field_partial_loads (
                company_id,
                purchase_lot_id,
                troop_id,
                capture_sheet_id,
                partial_number,
                partial_code,
                field_sync_id,
                captador_person_id,
                captador_assignment_version,
                estate_id,
                pickup_reference,
                notes,
                event_lat,
                event_lng,
                event_local_time,
                status,
                total_quantity,
                gross_weight_kg,
                created_by
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
                'captured',
                $16,
                $17,
                $18
              )
              RETURNING *
            `,
            [
              companyId,
              purchaseLotId,
              troopId,
              captureSheetId,
              partialNumber,
              partialCode,
              fieldSyncId,
              captador.id,
              captadorAssignmentVersion,
              lot.estate_id,
              pickupReference,
              notes,
              eventLat,
              eventLng,
              eventLocalTime,
              totalQuantity,
              grossWeightKg,
              userId,
            ],
          );

      } else {

        partialLoadResult =
          await client.query(
            `
              UPDATE slaughterhouse_field_partial_loads

              SET
                captador_person_id = $1,
                captador_assignment_version = $2,
                estate_id = $3,
                pickup_reference = $4,
                notes = $5,
                event_lat = $6,
                event_lng = $7,
                event_local_time = $8,
                status = 'captured',
                total_quantity = $9,
                gross_weight_kg = $10,
                updated_at = NOW()

              WHERE
                id = $11

              RETURNING *
            `,
            [
              captador.id,
              captadorAssignmentVersion,
              lot.estate_id,
              pickupReference,
              notes,
              eventLat,
              eventLng,
              eventLocalTime,
              totalQuantity,
              grossWeightKg,
              existingPartial.id,
            ],
          );

      }


      const partialLoad =
        partialLoadResult.rows[0];


      // =================================================
      // REEMPLAZAR DETALLE DE ESTA CARGA
      //
      // Los pesos caen por ON DELETE CASCADE.
      // =================================================

      await client.query(
        `
          DELETE FROM slaughterhouse_field_partial_load_categories

          WHERE
            partial_load_id = $1
        `,
        [
          partialLoad.id,
        ],
      );


      const insertedCategories =
        [];


      for (
        const category
        of normalizedCategories
      ) {

        const categoryResult =
          await client.query(
            `
              INSERT INTO slaughterhouse_field_partial_load_categories (
                company_id,
                partial_load_id,
                line_number,
                original_purchase_lot_category_id,
                contracted_category_id,
                actual_classification_id,
                quantity,
                commercial_status,
                pricing_basis,
                weight_source,
                price_per_unit,
                currency,
                shrink_percent,
                observation,
                weight_mode,
                gross_weight_kg
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
                $16
              )
              RETURNING *
            `,
            [
              companyId,
              partialLoad.id,
              category.line_number,
              category
                .original_purchase_lot_category_id,
              category
                .contracted_category_id,
              category
                .actual_classification_id,
              category.quantity,
              category
                .commercial_status,
              category
                .pricing_basis,
              category
                .weight_source,
              category
                .price_per_unit,
              category.currency,
              category
                .shrink_percent,
              category.observation,
              category.weight_mode,
              category
                .gross_weight_kg,
            ],
          );


        const insertedCategory =
          categoryResult.rows[0];


        for (
          let weightIndex = 0;
          weightIndex <
            category.weights.length;
          weightIndex++
        ) {

          await client.query(
            `
              INSERT INTO slaughterhouse_field_partial_load_weights (
                company_id,
                partial_load_category_id,
                sequence_number,
                weight_kg
              )
              VALUES (
                $1,
                $2,
                $3,
                $4
              )
            `,
            [
              companyId,
              insertedCategory.id,
              weightIndex + 1,
              category
                .weights[
                  weightIndex
                ],
            ],
          );

        }


        insertedCategories.push({
          ...insertedCategory,

          actual_classification_code:
            category
              .actual_classification_code,

          actual_classification_name:
            category
              .actual_classification_name,

          weights:
            category.weights.map(
              (
                value,
                weightIndex
              ) => ({
                sequence_number:
                  weightIndex + 1,

                weight_kg:
                  value,
              }),
            ),
        });

      }


      // =================================================
      // ACUMULADO REAL DE LA TROPA
      //
      // Agregar una/corregir una carga vuelve la tropa
      // a in_progress hasta pulsar FINALIZAR TROPA.
      // =================================================

      const accumulatedResult =
        await client.query(
          `
            SELECT
              COALESCE(
                SUM(
                  total_quantity
                ),
                0
              )::int
                AS total_quantity

            FROM slaughterhouse_field_partial_loads

            WHERE
              company_id = $1
              AND troop_id = $2
              AND status IN (
                'captured',
                'certified'
              )
          `,
          [
            companyId,
            troopId,
          ],
        );


      const accumulatedQuantity =
        Number(
          accumulatedResult
            .rows[0]
            ?.total_quantity ||
          0
        );


      const updatedTroopResult =
        await client.query(
          `
            UPDATE slaughterhouse_troops

            SET
              field_capture_status =
                'in_progress',

              field_captured_quantity =
                $1,

              field_captured_at =
                NULL,

              updated_at =
                NOW()

            WHERE
              id = $2
              AND company_id = $3
              AND purchase_lot_id = $4
              AND COALESCE(
                field_capture_status,
                ''
              ) <> 'certified'

            RETURNING *
          `,
          [
            accumulatedQuantity,
            troopId,
            companyId,
            purchaseLotId,
          ],
        );


      if (
        updatedTroopResult.rows.length ===
        0
      ) {

        reject(
          409,
          'La tropa ya no admite modificaciones de campo'
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
            old_data,
            new_data
          )
          VALUES (
            $1,
            $2,
            'field_partial_load',
            $3,
            'sync_field_partial_load',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            partialLoad.id
          ),
          JSON.stringify(
            existingPartial
          ),
          JSON.stringify({
            partial_load:
              partialLoad,

            categories:
              insertedCategories,
          }),
        ],
      );


      await client.query(
        'COMMIT'
      );

      transactionStarted =
        false;


      return res.json({
        success: true,

        partial_load: {
          ...partialLoad,

          categories:
            insertedCategories,
        },

        troop:
          updatedTroopResult
            .rows[0],

        accumulated_quantity:
          accumulatedQuantity,

        pending_commercial_count:
          insertedCategories.filter(
            (category) =>
              category
                .commercial_status ===
              'pending_price'
          ).length,
      });


    } catch (error) {

      if (
        transactionStarted
      ) {

        try {
          await client.query(
            'ROLLBACK'
          );
        } catch (_) {}

      }


      if (
        error.appCode ===
        'assignment_revoked'
      ) {

        return res.status(409).json({
          error:
            'assignment_revoked',

          message:
            error.message,
        });

      }


      if (
        error.code ===
        '23505'
      ) {

        return res.status(409).json({
          error:
            'Ya existe una carga parcial con esa identidad o número',
        });

      }


      if (
        error.httpStatus
      ) {

        return res
          .status(
            error.httpStatus
          )
          .json({
            error:
              error.message,
          });

      }


      console.error(
        'SYNC FIELD PARTIAL LOAD ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error sincronizando carga parcial de campo',
      });


    } finally {

      client.release();

    }

  };


// =====================================================
// ✅ FINALIZAR CAPTURA DE UNA TROPA
//
// POST
// /slaughterhouse/field/
// capture-sheets/:captureSheetId/
// lots/:purchaseLotId/
// troops/:troopId/finalize
//
// No certifica QR.
// Solo indica que el captador terminó físicamente
// las cargas parciales de este camión.
//
// Puede existir pending_price:
// eso NO bloquea el transporte.
// =====================================================

exports.finalizeFieldTroopCapture =
  async (req, res) => {

    const client =
      await pool.connect();

    let transactionStarted =
      false;


    const reject = (
      httpStatus,
      message,
      appCode = null,
    ) => {

      const error =
        new Error(message);

      error.httpStatus =
        httpStatus;

      error.appCode =
        appCode;

      throw error;

    };


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
          req.params.troopId
        );


      const captadorAssignmentVersion =
        Number(
          req.body
            ?.captador_assignment_version
        );


      if (
        !Number.isInteger(userId) ||
        userId <= 0 ||
        !Number.isInteger(companyId) ||
        companyId <= 0 ||
        !Number.isInteger(
          captureSheetId
        ) ||
        captureSheetId <= 0 ||
        !Number.isInteger(
          purchaseLotId
        ) ||
        purchaseLotId <= 0 ||
        !Number.isInteger(
          troopId
        ) ||
        troopId <= 0
      ) {

        reject(
          400,
          'Datos de operación inválidos'
        );

      }


      if (
        !Number.isInteger(
          captadorAssignmentVersion
        ) ||
        captadorAssignmentVersion <= 0
      ) {

        reject(
          400,
          'captador_assignment_version inválido'
        );

      }


      await client.query(
        'BEGIN'
      );

      transactionStarted =
        true;


      const captadorResult =
        await client.query(
          `
            SELECT
              sp.id,
              sp.full_name

            FROM slaughterhouse_people sp

            JOIN slaughterhouse_person_roles spr
              ON spr.person_id =
                sp.id
              AND spr.role =
                'captador'
              AND spr.is_active =
                true

            WHERE
              sp.company_id = $1
              AND sp.user_id = $2
              AND sp.is_active =
                true

            LIMIT 1

            FOR UPDATE OF sp
          `,
          [
            companyId,
            userId,
          ],
        );


      if (
        captadorResult.rows.length ===
        0
      ) {

        reject(
          403,
          'Usuario no habilitado como captador'
        );

      }


      const captador =
        captadorResult.rows[0];


      const lotResult =
        await client.query(
          `
            SELECT
              id,
              lot_number,
              captador_person_id,
              captador_assignment_version,
              status

            FROM slaughterhouse_purchase_lots

            WHERE
              id = $1
              AND company_id = $2
              AND capture_sheet_id = $3

            FOR UPDATE
          `,
          [
            purchaseLotId,
            companyId,
            captureSheetId,
          ],
        );


      if (
        lotResult.rows.length ===
        0
      ) {

        reject(
          404,
          'Lote no encontrado'
        );

      }


      const lot =
        lotResult.rows[0];


      if (
        Number(
          lot.captador_person_id
        ) !==
          Number(
            captador.id
          ) ||
        Number(
          lot.captador_assignment_version
        ) !==
          captadorAssignmentVersion
      ) {

        reject(
          409,
          'La asignación del captador cambió',
          'assignment_revoked'
        );

      }


      const troopResult =
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
        troopResult.rows.length ===
        0
      ) {

        reject(
          404,
          'Tropa no encontrada'
        );

      }


      const troop =
        troopResult.rows[0];


      if (
        troop.field_capture_status ===
        'certified'
      ) {

        reject(
          409,
          'La tropa ya fue certificada'
        );

      }


      if (
        [
          'dispatched',
          'in_transit',
          'received',
          'in_slaughter',
          'completed',
        ].includes(
          troop.status
        )
      ) {

        reject(
          409,
          `La tropa ya se encuentra en estado ${troop.status}`
        );

      }


      const loadSummaryResult =
        await client.query(
          `
            SELECT
              COUNT(*) FILTER (
                WHERE status IN (
                  'captured',
                  'certified'
                )
              )::int
                AS captured_load_count,

              COUNT(*) FILTER (
                WHERE status = 'draft'
              )::int
                AS draft_load_count,

              COALESCE(
                SUM(
                  total_quantity
                ) FILTER (
                  WHERE status IN (
                    'captured',
                    'certified'
                  )
                ),
                0
              )::int
                AS total_quantity

            FROM slaughterhouse_field_partial_loads

            WHERE
              company_id = $1
              AND purchase_lot_id = $2
              AND troop_id = $3
          `,
          [
            companyId,
            purchaseLotId,
            troopId,
          ],
        );


      const summary =
        loadSummaryResult.rows[0];


      const capturedLoadCount =
        Number(
          summary
            ?.captured_load_count ||
          0
        );


      const draftLoadCount =
        Number(
          summary
            ?.draft_load_count ||
          0
        );


      const totalQuantity =
        Number(
          summary
            ?.total_quantity ||
          0
        );


      if (
        capturedLoadCount <= 0 ||
        totalQuantity <= 0
      ) {

        reject(
          409,
          'La tropa todavía no tiene cargas parciales finalizadas'
        );

      }


      if (
        draftLoadCount > 0
      ) {

        reject(
          409,
          'Existen cargas parciales todavía en borrador'
        );

      }


      const pendingCommercialResult =
        await client.query(
          `
            SELECT
              COUNT(*)::int
                AS total

            FROM slaughterhouse_field_partial_load_categories category_line

            JOIN slaughterhouse_field_partial_loads partial_load
              ON partial_load.id =
                category_line.partial_load_id

            WHERE
              partial_load.company_id = $1
              AND partial_load.purchase_lot_id = $2
              AND partial_load.troop_id = $3
              AND partial_load.status IN (
                'captured',
                'certified'
              )
              AND category_line.commercial_status =
                'pending_price'
          `,
          [
            companyId,
            purchaseLotId,
            troopId,
          ],
        );


      const pendingCommercialCount =
        Number(
          pendingCommercialResult
            .rows[0]
            ?.total ||
          0
        );


      const updatedTroopResult =
        await client.query(
          `
            UPDATE slaughterhouse_troops

            SET
              field_capture_status =
                'captured',

              field_captured_quantity =
                $1,

              field_captured_at =
                COALESCE(
                  field_captured_at,
                  NOW()
                ),

              updated_at =
                NOW()

            WHERE
              id = $2
              AND company_id = $3
              AND purchase_lot_id = $4
              AND COALESCE(
                field_capture_status,
                ''
              ) <> 'certified'

            RETURNING *
          `,
          [
            totalQuantity,
            troopId,
            companyId,
            purchaseLotId,
          ],
        );


      if (
        updatedTroopResult.rows.length ===
        0
      ) {

        reject(
          409,
          'La tropa ya no puede finalizarse'
        );

      }


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
            'field_finalize_troop_capture',
            $4::jsonb,
            $5::jsonb
          )
        `,
        [
          companyId,
          userId,
          String(
            troopId
          ),
          JSON.stringify(
            troop
          ),
          JSON.stringify({
            ...updatedTroopResult
              .rows[0],

            partial_load_count:
              capturedLoadCount,

            pending_commercial_count:
              pendingCommercialCount,
          }),
        ],
      );


      await client.query(
        'COMMIT'
      );

      transactionStarted =
        false;


      return res.json({
        success: true,

        troop:
          updatedTroopResult
            .rows[0],

        partial_load_count:
          capturedLoadCount,

        captured_quantity:
          totalQuantity,

        pending_commercial_count:
          pendingCommercialCount,

        commercial_confirmation_required:
          pendingCommercialCount >
          0,
      });


    } catch (error) {

      if (
        transactionStarted
      ) {

        try {
          await client.query(
            'ROLLBACK'
          );
        } catch (_) {}

      }


      if (
        error.appCode ===
        'assignment_revoked'
      ) {

        return res.status(409).json({
          error:
            'assignment_revoked',

          message:
            error.message,
        });

      }


      if (
        error.httpStatus
      ) {

        return res
          .status(
            error.httpStatus
          )
          .json({
            error:
              error.message,
          });

      }


      console.error(
        'FINALIZE FIELD TROOP CAPTURE ERROR:',
        error
      );


      return res.status(500).json({
        error:
          'Error finalizando la captura de la tropa',
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