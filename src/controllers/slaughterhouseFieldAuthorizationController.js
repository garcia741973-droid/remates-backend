const { pool } = require('../config/db');
const crypto = require('crypto');

const {
  createSignedFieldQrPayload,
} = require('../services/fieldQrSignatureService');

// =====================================================
// 🔐 EMITIR AUTORIZACIÓN QR DE CAMPO V2
//
// POST /slaughterhouse/admin/purchase-lots/:id/field-authorizations
//
// - QR firmado Ed25519.
// - Asociado a UN lote/camión.
// - Se entrega al vendedor.
// - El token real NO se guarda.
// - Solo guardamos SHA-256(token).
// - qr_payload se devuelve UNA SOLA VEZ.
// - purpose = field_load_close.
// =====================================================

exports.issueFieldAuthorization =
  async (req, res) => {
    const client =
      await pool.connect();

    try {
      const companyId =
        Number(
          req.slaughterhouseAdmin.company_id
        );

      const userId =
        Number(
          req.slaughterhouseAdmin.user_id
        );

      const purchaseLotId =
        Number(
          req.params.id
        );

      const expectedDate =
        req.body.expected_date
          ?.toString()
          .trim() ||
        null;

      const expiresAtInput =
        req.body.expires_at
          ?.toString()
          .trim() ||
        null;

      const deliveryChannel =
        req.body.delivery_channel
          ?.toString()
          .trim()
          .toLowerCase() ||
        'whatsapp';

      // ===============================================
      // VALIDACIONES BÁSICAS
      // ===============================================

      if (
        !Number.isInteger(
          purchaseLotId
        ) ||
        purchaseLotId <= 0
      ) {
        return res.status(400).json({
          error:
            'ID de lote inválido',
        });
      }

      if (
        expectedDate !== null &&
        !/^\d{4}-\d{2}-\d{2}$/.test(
          expectedDate
        )
      ) {
        return res.status(400).json({
          error:
            'expected_date debe tener formato YYYY-MM-DD',
        });
      }

      if (
        ![
          'whatsapp',
          'sms',
          'manual',
        ].includes(
          deliveryChannel
        )
      ) {
        return res.status(400).json({
          error:
            'delivery_channel inválido',
        });
      }

      let expiresAt;

      if (
        expiresAtInput !== null
      ) {
        const parsedExpiresAt =
          new Date(
            expiresAtInput
          );

        if (
          Number.isNaN(
            parsedExpiresAt.getTime()
          )
        ) {
          return res.status(400).json({
            error:
              'expires_at inválido',
          });
        }

        if (
          parsedExpiresAt.getTime() <=
          Date.now()
        ) {
          return res.status(400).json({
            error:
              'expires_at debe ser una fecha futura',
          });
        }

        expiresAt =
          parsedExpiresAt;
      } else {
        expiresAt =
          new Date(
            Date.now() +
              7 *
                24 *
                60 *
                60 *
                1000
          );
      }

      await client.query(
        'BEGIN'
      );

      // ===============================================
      // OBTENER Y BLOQUEAR LOTE
      // ===============================================

      const lotResult =
        await client.query(
          `
            SELECT
              spl.id,
              spl.lot_number,
              spl.status,
              spl.planned_date,
              spl.seller_person_id,

              seller.full_name
                AS seller_name,

              seller.phone
                AS seller_phone,

              spl.estate_id,

              estate.name
                AS estate_name,

              estate.location_text
                AS estate_location,

              spl.classification_id,

              classification.generated_code
                AS classification_code,

              classification.display_name
                AS classification_name

            FROM slaughterhouse_purchase_lots spl

            JOIN slaughterhouse_people seller
              ON seller.id =
                spl.seller_person_id
              AND seller.company_id =
                spl.company_id

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

      const purchaseLot =
        lotResult.rows[0];

      // ===============================================
      // ESTADO DEL LOTE
      // ===============================================

      if (
        ![
          'open',
          'in_transport',
        ].includes(
          purchaseLot.status
        )
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            `No puede emitirse una autorización de campo para un lote en estado ${purchaseLot.status}`,
        });
      }

      // ===============================================
      // WHATSAPP REQUIERE TELÉFONO
      // ===============================================

      if (
        deliveryChannel ===
          'whatsapp' &&
        !purchaseLot.seller_phone
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(400).json({
          error:
            'El vendedor no tiene teléfono registrado para enviar el QR por WhatsApp',
        });
      }

      // ===============================================
      // EXPIRAR AUTORIZACIONES VENCIDAS DEL MISMO LOTE
      // ===============================================

      await client.query(
        `
          UPDATE slaughterhouse_weighing_authorizations
          SET
            status = 'expired',
            updated_at = NOW()
          WHERE
            company_id = $1
            AND purchase_lot_id = $2
            AND purpose = 'field_load_close'
            AND status = 'pending'
            AND expires_at IS NOT NULL
            AND expires_at <= NOW()
        `,
        [
          companyId,
          purchaseLotId,
        ],
      );

      // ===============================================
      // NO PERMITIR DOS QR DE CAMPO ACTIVOS
      // ===============================================

      const activeResult =
        await client.query(
          `
            SELECT
              id,
              public_code,
              expires_at
            FROM slaughterhouse_weighing_authorizations
            WHERE
              company_id = $1
              AND purchase_lot_id = $2
              AND purpose = 'field_load_close'
              AND status = 'pending'
              AND (
                expires_at IS NULL
                OR expires_at > NOW()
              )
            LIMIT 1
            FOR UPDATE
          `,
          [
            companyId,
            purchaseLotId,
          ],
        );

      if (
        activeResult.rows.length > 0
      ) {
        await client.query(
          'ROLLBACK'
        );

        return res.status(409).json({
          error:
            'Este lote ya tiene una autorización QR de campo activa. Debe revocarla antes de emitir una nueva.',
          authorization: {
            id:
              activeResult.rows[0].id,
            public_code:
              activeResult.rows[0]
                .public_code,
            expires_at:
              activeResult.rows[0]
                .expires_at,
          },
        });
      }

      // ===============================================
      // SIGUIENTE NÚMERO DE AUTORIZACIÓN DEL LOTE
      // ===============================================

      const numberResult =
        await client.query(
          `
            SELECT
              COALESCE(
                MAX(
                  authorization_number
                ),
                0
              ) + 1
                AS next_number
            FROM slaughterhouse_weighing_authorizations
            WHERE
              purchase_lot_id = $1
          `,
          [
            purchaseLotId,
          ],
        );

      const authorizationNumber =
        Number(
          numberResult.rows[0]
            .next_number
        );

      // ===============================================
      // CÓDIGO PÚBLICO
      // ===============================================

      const randomCode =
        crypto
          .randomBytes(4)
          .toString('hex')
          .toUpperCase();

      const publicCode =
        `FQ-${companyId}-${purchaseLotId}-${authorizationNumber}-${randomCode}`;

      // ===============================================
      // TOKEN SECRETO
      // ===============================================

      const token =
        crypto
          .randomBytes(32)
          .toString('base64url');

      const tokenHash =
        crypto
          .createHash('sha256')
          .update(token)
          .digest('hex');

      // ===============================================
      // SNAPSHOT DE EMISIÓN
      // ===============================================

      const detailsSnapshot = {
        purchase_lot_id:
          purchaseLotId,

        lot_number:
          purchaseLot.lot_number,

        seller_person_id:
          purchaseLot.seller_person_id,

        seller_name:
          purchaseLot.seller_name,

        estate_id:
          purchaseLot.estate_id,

        estate_name:
          purchaseLot.estate_name,

        classification_id:
          purchaseLot.classification_id,

        classification_code:
          purchaseLot.classification_code,

        classification_name:
          purchaseLot.classification_name,

        expected_date:
          expectedDate ||
          purchaseLot.planned_date,
      };

      // ===============================================
      // CREAR QR V2 FIRMADO
      // ===============================================

      const {
        qrPayload,
        qrPayloadObject,
        signedData,
      } =
        createSignedFieldQrPayload({
          companyId,
          purchaseLotId,
          authorizationNumber,
          publicCode,
          token,

          sellerPersonId:
            purchaseLot.seller_person_id,

          expiresAt,
        });

      const qrPayloadHash =
        crypto
          .createHash('sha256')
          .update(qrPayload)
          .digest('hex');

      // ===============================================
      // GUARDAR AUTORIZACIÓN
      // ===============================================

      const result =
        await client.query(
          `
            INSERT INTO slaughterhouse_weighing_authorizations (
              company_id,
              purchase_lot_id,
              authorization_number,
              public_code,
              token_hash,
              qr_payload_hash,
              key_id,
              purpose,
              details_snapshot,
              recipient_phone_snapshot,
              delivery_channel,
              expected_date,
              status,
              issued_by,
              expires_at
            )
            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              'field_load_close',
              $8::jsonb,
              $9,
              $10,
              $11,
              'pending',
              $12,
              $13
            )
            RETURNING
              id,
              company_id,
              purchase_lot_id,
              authorization_number,
              public_code,
              key_id,
              purpose,
              details_snapshot,
              recipient_phone_snapshot,
              delivery_channel,
              expected_date,
              status,
              issued_by,
              issued_at,
              expires_at,
              created_at
          `,
          [
            companyId,
            purchaseLotId,
            authorizationNumber,
            publicCode,
            tokenHash,
            qrPayloadHash,

            qrPayloadObject.key_id,

            JSON.stringify(
              detailsSnapshot
            ),

            purchaseLot.seller_phone,

            deliveryChannel,

            expectedDate ||
              purchaseLot.planned_date,

            userId,

            expiresAt,
          ],
        );

      const authorization =
        result.rows[0];

      // ===============================================
      // AUDITORÍA
      //
      // NO guardamos token,
      // payload_b64, signature ni qr_payload.
      // ===============================================

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
            'weighing_authorization',
            $3,
            'issue_field_qr',
            $4::jsonb
          )
        `,
        [
          companyId,
          userId,

          String(
            authorization.id
          ),

          JSON.stringify({
            authorization_id:
              authorization.id,

            purchase_lot_id:
              purchaseLotId,

            authorization_number:
              authorizationNumber,

            public_code:
              publicCode,

            purpose:
              'field_load_close',

            key_id:
              qrPayloadObject.key_id,

            seller_person_id:
              purchaseLot.seller_person_id,

            recipient_phone:
              purchaseLot.seller_phone,

            delivery_channel:
              deliveryChannel,

            expires_at:
              expiresAt.toISOString(),
          }),
        ],
      );

      await client.query(
        'COMMIT'
      );

      // ===============================================
      // RESPUESTA
      //
      // El QR completo aparece únicamente aquí.
      // ===============================================

      return res.status(201).json({
        success: true,

        message:
          'Autorización QR de campo emitida correctamente',

        authorization,

        qr_payload:
          qrPayload,

        qr_info: {
          version:
            qrPayloadObject.version,

          type:
            qrPayloadObject.type,

          key_id:
            qrPayloadObject.key_id,

          purpose:
            signedData.purpose,
        },

        recipient: {
          seller_person_id:
            purchaseLot.seller_person_id,

          seller_name:
            purchaseLot.seller_name,

          phone:
            purchaseLot.seller_phone,

          delivery_channel:
            deliveryChannel,
        },
      });
    } catch (error) {
      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (_) {
        // Ignorar rollback si la transacción
        // ya terminó.
      }

      console.error(
        '❌ ISSUE FIELD AUTHORIZATION ERROR:',
        error
      );

      return res.status(500).json({
        error:
          'No fue posible emitir la autorización QR de campo',
      });
    } finally {
      client.release();
    }
  };