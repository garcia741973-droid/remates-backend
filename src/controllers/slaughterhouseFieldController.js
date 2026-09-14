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
// - Es idempotente por lote/camión.
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
      // Bloqueamos el lote para evitar que dos reintentos
      // creen dos tropas al mismo tiempo.
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
              spl.status
                AS lot_status,

              scs.status
                AS capture_sheet_status,
              scs.captador_person_id

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
              AND scs.captador_person_id = $4

            FOR UPDATE OF spl
          `,
          [
            purchaseLotId,
            companyId,
            captureSheetId,
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
            'Lote no encontrado o no asignado a este captador',
        });
      }

      const lot =
        lotResult.rows[0];

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
      // KG VIVO / ORIGEN
      //
      // Ese caso debe sincronizar además los pesos
      // individuales. Lo construiremos en el siguiente
      // paso para el Lote 4.
      // =================================================

      if (
        lot.pricing_basis ===
          'live_kg' &&
        lot.weight_source ===
          'origin'
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'Este lote requiere sincronización de pesos individuales',
        });
      }

      // =================================================
      // ID ESTABLE DEL CAMIÓN/CARGA
      //
      // En nuestro modelo actual:
      // 1 lote = 1 camión/carga.
      //
      // No dependemos de que el teléfono genere otro UUID
      // después de una pérdida de conexión.
      // =================================================

      const fieldSyncId =
        `field:${companyId}:lot:${purchaseLotId}`;

      // =================================================
      // BUSCAR TROPA EXISTENTE DEL LOTE
      // =================================================

      const existingTroopsResult =
        await client.query(
          `
            SELECT *
            FROM slaughterhouse_troops

            WHERE
              company_id = $1
              AND purchase_lot_id = $2
              AND status <> 'cancelled'

            ORDER BY id ASC

            FOR UPDATE
          `,
          [
            companyId,
            purchaseLotId,
          ],
        );

      if (
        existingTroopsResult.rows.length > 1
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'El lote tiene más de una tropa activa y requiere revisión administrativa',
        });
      }

      let troop;
      let created = false;
      let oldData = null;

      // =================================================
      // REUTILIZAR TROPA EXISTENTE
      // =================================================

      if (
        existingTroopsResult.rows.length === 1
      ) {

        const existingTroop =
          existingTroopsResult.rows[0];

        oldData =
          existingTroop;

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
              'La captura de este camión ya fue certificada y no puede modificarse',
          });
        }

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

        const updateResult =
          await client.query(
            `
              UPDATE slaughterhouse_troops

              SET
                field_sync_id = $1,
                field_capture_status = $2,
                field_captured_quantity = $3,
                field_captured_at =
                  CASE
                    WHEN $2 = 'captured'
                      THEN COALESCE(
                        field_captured_at,
                        NOW()
                      )
                    ELSE NULL
                  END,
                updated_at = NOW()

              WHERE
                id = $4
                AND company_id = $5

              RETURNING *
            `,
            [
              fieldSyncId,
              captureStatus,
              quantity,
              existingTroop.id,
              companyId,
            ],
          );

        troop =
          updateResult.rows[0];

      } else {

        // =================================================
        // CREAR TROPA DE CAMPO
        // =================================================

        const insertResult =
          await client.query(
            `
              INSERT INTO slaughterhouse_troops (
                company_id,
                purchase_lot_id,
                expected_quantity,
                status,
                created_by,
                field_sync_id,
                field_capture_status,
                field_captured_quantity,
                field_captured_at
              )

              VALUES (
                $1,
                $2,
                $3,
                'planned',
                $4,
                $5,
                $6,
                $7,
                CASE
                  WHEN $6 = 'captured'
                    THEN NOW()
                  ELSE NULL
                END
              )

              RETURNING *
            `,
            [
              companyId,
              purchaseLotId,
              lot.expected_quantity,
              userId,
              fieldSyncId,
              captureStatus,
              quantity,
            ],
          );

        troop =
          insertResult.rows[0];

        created = true;
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
        expected_quantity:
          lot.expected_quantity,
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