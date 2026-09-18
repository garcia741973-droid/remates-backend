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
// ⚖️ SINCRONIZAR PESAJE DE CAMPO / PESO EN ORIGEN
//
// POST
// /slaughterhouse/field/capture-sheets/:captureSheetId/
// lots/:purchaseLotId/sync-weighing
//
// Reglas:
// - Solo captador asignado.
// - Solo live_kg + origin.
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

      const items =
        Array.isArray(req.body?.items)
          ? req.body.items
          : [];

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

      if (items.length === 0) {
        return res.status(400).json({
          error:
            'Debe registrar al menos un peso',
        });
      }

      // =================================================
      // NORMALIZAR PESOS
      // =================================================

      const normalizedItems = [];

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
      // ESTE ENDPOINT ES SOLO KG VIVO / ORIGEN
      // =================================================

      if (
        lot.pricing_basis !==
          'live_kg' ||
        lot.weight_source !==
          'origin'
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'Este lote no corresponde a pesaje de kg vivo en origen',
        });
      }

      // =================================================
      // CALCULAR TODO EN BACKEND
      // =================================================

      const quantity =
        normalizedItems.length;

      const grossWeightKg =
        normalizedItems.reduce(
          (
            total,
            item
          ) =>
            total +
            Number(
              item.weight_kg
            ),
          0
        );

      const roundedGrossWeightKg =
        Number(
          grossWeightKg.toFixed(
            3
          )
        );

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
      // COMO pricing_basis = live_kg,
      // price_per_unit SÍ ES precio/kg.
      // =================================================

      const pricePerKg =
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
                updated_at = NOW()

              WHERE
                id = $12
                AND company_id = $13

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
                false,
                'draft',
                $15,
                $16
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
          quantity,

          gross_weight_kg:
            roundedGrossWeightKg,

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