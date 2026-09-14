const { pool } = require('../config/db');


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
            ) lot_summary
              ON true

            WHERE
              scs.company_id = $1
              AND scs.captador_person_id = $2
              AND scs.status IN (
                'draft',
                'open',
                'field_certified'
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
              AND scs.captador_person_id = $3
              AND scs.status IN (
                'draft',
                'open',
                'field_certified'
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
                AS received_quantity

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