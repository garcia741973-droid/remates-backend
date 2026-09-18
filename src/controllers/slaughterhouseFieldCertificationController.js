const crypto = require('crypto');

const { pool } = require('../config/db');

const {
  verifySignedFieldQrPayload,
} = require(
  '../services/fieldQrSignatureService'
);

// =====================================================
// HELPERS
// =====================================================

function fail(
  statusCode,
  message
) {
  const error = new Error(message);

  error.statusCode =
    statusCode;

  throw error;
}

function sha256Hex(
  value
) {
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex');
}

function safeHexEqual(
  left,
  right
) {
  if (
    typeof left !== 'string' ||
    typeof right !== 'string'
  ) {
    return false;
  }

  const leftBuffer =
    Buffer.from(
      left,
      'hex'
    );

  const rightBuffer =
    Buffer.from(
      right,
      'hex'
    );

  return (
    leftBuffer.length ===
      rightBuffer.length &&
    crypto.timingSafeEqual(
      leftBuffer,
      rightBuffer
    )
  );
}

function sameNumber(
  left,
  right,
  tolerance = 0.0005
) {
  if (
    left === null ||
    left === undefined ||
    right === null ||
    right === undefined
  ) {
    return (
      left === right ||
      (
        left == null &&
        right == null
      )
    );
  }

  const a =
    Number(left);

  const b =
    Number(right);

  return (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Math.abs(
      a - b
    ) <= tolerance
  );
}

function canonicalize(
  value
) {
  if (
    Array.isArray(value)
  ) {
    return value.map(
      canonicalize
    );
  }

  if (
    value !== null &&
    typeof value ===
      'object'
  ) {
    const result = {};

    for (
      const key of
      Object.keys(value)
        .sort()
    ) {
      result[key] =
        canonicalize(
          value[key]
        );
    }

    return result;
  }

  return value;
}

function canonicalJson(
  value
) {
  return JSON.stringify(
    canonicalize(value)
  );
}

function commercialDateOnly(
  value
) {

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  if (
    value instanceof Date
  ) {
    return value
      .toISOString()
      .slice(
        0,
        10
      );
  }

  return String(
    value
  ).slice(
    0,
    10
  );

}

// =====================================================
// 🔐 CERTIFICAR CARGA DE CAMPO CON QR V2
//
// POST
// /slaughterhouse/field/
// capture-sheets/:captureSheetId/
// lots/:purchaseLotId/certify
//
// Reglas:
//
// - Captador asignado.
// - La captura ya debe existir en backend.
// - QR v2 firmado Ed25519.
// - QR debe ser field_load_close.
// - Valida firma + hash + token + DB.
// - Compara lo revisado por vendedor
//   contra los datos del backend.
// - Consume QR una sola vez.
// - Certifica troop.
// - Si es live_kg/origin,
//   certifica también live_weighing.
// - NO despacha.
// - NO cambia troop.status.
// - dispatched_quantity permanece separado.
// =====================================================

exports.certifyFieldLot =
  async (req, res) => {
    const client =
      await pool.connect();

    let transactionStarted =
      false;

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

      const qrPayload =
        req.body?.qr_payload;

      const reviewSnapshot =
        req.body?.review_snapshot;

      const clientSnapshotHash =
        req.body
          ?.review_snapshot_hash
          ?.toString()
          .trim() ||
        null;

      const certifiedOffline =
        req.body
          ?.certified_offline ===
        true;

      const eventLat =
        req.body?.event_lat !==
          null &&
        req.body?.event_lat !==
          undefined
          ? Number(
              req.body.event_lat
            )
          : null;

      const eventLng =
        req.body?.event_lng !==
          null &&
        req.body?.event_lng !==
          undefined
          ? Number(
              req.body.event_lng
            )
          : null;

      const eventLocalTimeInput =
        req.body
          ?.event_local_time
          ?.toString()
          .trim() ||
        null;

      // ===============================================
      // VALIDACIONES BÁSICAS
      // ===============================================

      if (
        !Number.isInteger(userId) ||
        userId <= 0
      ) {
        fail(
          401,
          'Usuario autenticado inválido'
        );
      }

      if (
        !Number.isInteger(
          companyId
        ) ||
        companyId <= 0
      ) {
        fail(
          400,
          'Contexto de empresa inválido'
        );
      }

      if (
        !Number.isInteger(
          captureSheetId
        ) ||
        captureSheetId <= 0
      ) {
        fail(
          400,
          'captureSheetId inválido'
        );
      }

      if (
        !Number.isInteger(
          purchaseLotId
        ) ||
        purchaseLotId <= 0
      ) {
        fail(
          400,
          'purchaseLotId inválido'
        );
      }

      if (
        !Number.isInteger(
          troopId
        ) ||
        troopId <= 0
      ) {

        fail(
          400,
          'troop_id inválido'
        );

      }

      if (
        typeof qrPayload !==
          'string' ||
        !qrPayload.trim()
      ) {
        fail(
          400,
          'qr_payload es obligatorio'
        );
      }

      if (
        reviewSnapshot ===
          null ||
        typeof reviewSnapshot !==
          'object' ||
        Array.isArray(
          reviewSnapshot
        )
      ) {
        fail(
          400,
          'review_snapshot es obligatorio'
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
        fail(
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
        fail(
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
          fail(
            400,
            'event_local_time inválido'
          );
        }
      }

      // ===============================================
      // VERIFICAR FIRMA ED25519
      // ===============================================

      let signedData;

      try {
        const verification =
          verifySignedFieldQrPayload(
            qrPayload
          );

        signedData =
          verification.signedData;
      } catch (error) {
        fail(
          401,
          error.message ||
            'Firma QR inválida'
        );
      }

      if (
        Number(
          signedData.company_id
        ) !== companyId
      ) {
        fail(
          409,
          'El QR pertenece a otra empresa'
        );
      }

      if (
        Number(
          signedData
            .purchase_lot_id
        ) !== purchaseLotId
      ) {
        fail(
          409,
          'El QR no corresponde a este lote / camión'
        );
      }

      if (
        Number(
          signedData.troop_id
        ) !== troopId
      ) {

        fail(
          409,
          'El QR no corresponde a esta tropa / camión'
        );

      }

      const signedCommercialAgreementHash =
        signedData
          .commercial_agreement_hash
          ?.toString()
          .trim()
          .toLowerCase();

      if (
        !signedCommercialAgreementHash ||
        !/^[a-f0-9]{64}$/.test(
          signedCommercialAgreementHash
        )
      ) {

        fail(
          409,
          'El QR no contiene un acuerdo comercial válido'
        );

      }

      if (
        signedData.purpose !==
          'field_load_close'
      ) {
        fail(
          409,
          'El QR no autoriza el cierre de esta carga'
        );
      }

      const signedExpiresAt =
        new Date(
          signedData.expires_at
        );

      if (
        Number.isNaN(
          signedExpiresAt
            .getTime()
        ) ||
        signedExpiresAt
          .getTime() <=
          Date.now()
      ) {
        fail(
          409,
          'Este QR está vencido'
        );
      }

      // ===============================================
      // HASH CANÓNICO DEL ESTADO REVISADO
      //
      // El backend genera su propio hash.
      // No confía en el hash recibido.
      // ===============================================

      const serverSnapshotHash =
        sha256Hex(
          canonicalJson(
            reviewSnapshot
          )
        );

      await client.query(
        'BEGIN'
      );

      transactionStarted =
        true;

      // ===============================================
      // CAPTADOR AUTENTICADO
      // ===============================================

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
        captadorResult.rows
          .length === 0
      ) {
        fail(
          403,
          'El usuario no está habilitado como captador/comprador en este frigorífico'
        );
      }

      const captador =
        captadorResult.rows[0];

      // ===============================================
      // LOTE + HOJA
      // ===============================================

      const lotResult =
        await client.query(
          `
            SELECT
              spl.id,
              spl.lot_number,
              spl.capture_sheet_id,
              spl.seller_person_id,
              spl.captador_person_id,
              spl.estate_id,
              spl.classification_id,
              spl.purchase_type,
              spl.pricing_basis,
              spl.weight_source,

              spl.expected_quantity,
              spl.price_per_unit,
              spl.currency,
              spl.shrink_percent,

              spl.purchase_date,
              spl.planned_date,

              spl.seller_payment_method_id,
              spl.planned_payment_date,
              spl.payment_terms,

              spl.status
                AS lot_status,

              scs.capture_number,
              scs.status
                AS capture_sheet_status,

              seller.full_name
                AS seller_name,

              estate.name
                AS estate_name,

              classification.generated_code
                AS classification_code,

              classification.display_name
                AS classification_name

            FROM slaughterhouse_purchase_lots spl

            JOIN slaughterhouse_capture_sheets scs
              ON scs.id =
                spl.capture_sheet_id
              AND scs.company_id =
                spl.company_id

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
        lotResult.rows.length ===
        0
      ) {
        fail(
          404,
          'Lote no encontrado o no asignado a este captador'
        );
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
        fail(
          409,
          `El lote no puede certificarse en estado ${lot.lot_status}`
        );
      }

      if (
        Number(
          signedData
            .seller_person_id
        ) !==
        Number(
          lot.seller_person_id
        )
      ) {
        fail(
          409,
          'El QR pertenece a otro vendedor'
        );
      }

      // ===============================================
      // ACUERDO COMERCIAL ACTUAL DEL LOTE
      //
      // Debe producir EXACTAMENTE el mismo hash
      // que fue firmado al emitir el QR.
      // ===============================================

      const currentCommercialAgreement = {

        seller_person_id:
          Number(
            lot.seller_person_id
          ),

        estate_id:
          lot.estate_id !== null
            ? Number(
                lot.estate_id
              )
            : null,

        classification_id:
          lot.classification_id !==
            null
            ? Number(
                lot.classification_id
              )
            : null,

        classification_code:
          lot.classification_code ||
          null,

        purchase_type:
          lot.purchase_type,

        pricing_basis:
          lot.pricing_basis,

        weight_source:
          lot.weight_source,

        expected_quantity:
          lot.expected_quantity !==
            null
            ? Number(
                lot.expected_quantity
              )
            : null,

        price_per_unit:
          lot.price_per_unit !==
            null
            ? Number(
                lot.price_per_unit
              )
            : null,

        currency:
          lot.currency,

        shrink_percent:
          Number(
            lot.shrink_percent ||
            0
          ),

        purchase_date:
          commercialDateOnly(
            lot.purchase_date
          ),

        planned_date:
          commercialDateOnly(
            lot.planned_date
          ),

        seller_payment_method_id:
          lot
            .seller_payment_method_id !==
            null
            ? Number(
                lot
                  .seller_payment_method_id
              )
            : null,

        planned_payment_date:
          commercialDateOnly(
            lot.planned_payment_date
          ),

        payment_terms:
          lot.payment_terms ||
          null,

      };

      const currentCommercialAgreementHash =
        sha256Hex(
          canonicalJson(
            currentCommercialAgreement
          )
        );

      if (
        currentCommercialAgreementHash !==
        signedCommercialAgreementHash
      ) {

        fail(
          409,
          'Las condiciones comerciales del lote cambiaron después de emitir el QR. Debe revocarse y emitir una nueva autorización.'
        );

      }

      // ===============================================
      // TROPA ESPECÍFICA YA SINCRONIZADA
      // ===============================================

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
        troopResult.rows.length === 0
      ) {

        fail(
          409,
          'La tropa indicada no existe o no pertenece a este lote'
        );

      }

      let troop =
        troopResult.rows[0];

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
        fail(
          409,
          `La tropa ya se encuentra en estado ${troop.status}`
        );
      }

      // ===============================================
      // AUTORIZACIÓN QR
      // ===============================================

      const authorizationResult =
        await client.query(
          `
            SELECT
              *,
              CASE
                WHEN
                  expires_at IS NOT NULL
                  AND expires_at <= NOW()
                THEN true
                ELSE false
              END
                AS is_expired

            FROM slaughterhouse_weighing_authorizations

            WHERE
              company_id = $1
              AND purchase_lot_id = $2
              AND public_code = $3

            FOR UPDATE
          `,
          [
            companyId,
            purchaseLotId,
            signedData.public_code,
          ],
        );

      if (
        authorizationResult.rows
          .length === 0
      ) {
        fail(
          404,
          'Autorización QR no encontrada'
        );
      }

      const authorization =
        authorizationResult.rows[0];

      // ===============================================
      // VALIDAR TROPA + ACUERDO DEL SNAPSHOT DEL QR
      // ===============================================

      const authorizationTroopId =
        Number(
          authorization
            .details_snapshot
            ?.troop_id
        );

      if (
        !Number.isInteger(
          authorizationTroopId
        ) ||
        authorizationTroopId !==
          troopId
      ) {

        fail(
          409,
          'La autorización QR fue emitida para otra tropa'
        );

      }

      const authorizationAgreementHash =
        authorization
          .details_snapshot
          ?.commercial_agreement_hash
          ?.toString()
          .trim()
          .toLowerCase();

      if (
        !authorizationAgreementHash ||
        authorizationAgreementHash !==
          signedCommercialAgreementHash ||
        authorizationAgreementHash !==
          currentCommercialAgreementHash
      ) {

        fail(
          409,
          'El acuerdo comercial de la autorización no coincide'
        );

      }

      const authorizationAgreement =
        authorization
          .details_snapshot
          ?.commercial_agreement;

      if (
        authorizationAgreement === null ||
        typeof authorizationAgreement !==
          'object' ||
        Array.isArray(
          authorizationAgreement
        )
      ) {

        fail(
          409,
          'La autorización no contiene el acuerdo comercial certificado'
        );

      }

      const authorizationAgreementCalculatedHash =
        sha256Hex(
          canonicalJson(
            authorizationAgreement
          )
        );

      if (
        authorizationAgreementCalculatedHash !==
        authorizationAgreementHash
      ) {

        fail(
          409,
          'El acuerdo comercial almacenado en la autorización fue alterado'
        );

      }

      if (
        authorization.purpose !==
          'field_load_close'
      ) {
        fail(
          409,
          'La autorización no corresponde al cierre de campo'
        );
      }

      if (
        authorization.key_id !==
          signedData.key_id
      ) {
        fail(
          409,
          'La clave de la autorización no coincide'
        );
      }

      if (
        Number(
          authorization
            .authorization_number
        ) !==
        Number(
          signedData
            .authorization_number
        )
      ) {
        fail(
          409,
          'El número de autorización no coincide'
        );
      }

      const snapshotSellerId =
        Number(
          authorization
            .details_snapshot
            ?.seller_person_id
        );

      if (
        Number.isInteger(
          snapshotSellerId
        ) &&
        snapshotSellerId !==
          Number(
            lot.seller_person_id
          )
      ) {
        fail(
          409,
          'La autorización QR pertenece a otro vendedor'
        );
      }

      // ===============================================
      // VALIDAR PAYLOAD EXACTO
      // ===============================================

      const receivedPayloadHash =
        sha256Hex(
          qrPayload
        );

      if (
        receivedPayloadHash !==
        authorization
          .qr_payload_hash
      ) {
        fail(
          401,
          'El contenido del QR fue alterado o no coincide con la autorización emitida'
        );
      }

      const receivedTokenHash =
        sha256Hex(
          signedData.token
        );

      if (
        !safeHexEqual(
          receivedTokenHash,
          authorization.token_hash
        )
      ) {
        fail(
          401,
          'Token QR inválido'
        );
      }

      // ===============================================
      // REINTENTO IDEMPOTENTE
      //
      // Si la respuesta anterior se perdió,
      // aceptar nuevamente el MISMO QR.
      // ===============================================

      if (
        troop
          .field_capture_status ===
          'certified'
      ) {
        if (
          Number(
            troop
              .field_authorization_id
          ) ===
            Number(
              authorization.id
            ) &&
          authorization.status ===
            'used'
        ) {
          const existingWeighing =
            await client.query(
              `
                SELECT *
                FROM slaughterhouse_live_weighings
                WHERE
                  company_id = $1
                  AND purchase_lot_id = $2
                  AND troop_id = $3
                  AND status IN (
                    'certified',
                    'rectified'
                  )
                ORDER BY id DESC
                LIMIT 1
              `,
              [
                companyId,
                purchaseLotId,
                troop.id,
              ],
            );

          await client.query(
            'COMMIT'
          );

          transactionStarted =
            false;

          return res.json({
            success: true,
            already_certified:
              true,
            purchase_lot_id:
              purchaseLotId,
            troop,
            weighing:
              existingWeighing
                .rows[0] ||
              null,
            authorization: {
              id:
                authorization.id,
              authorization_number:
                authorization
                  .authorization_number,
              public_code:
                authorization
                  .public_code,
              status:
                authorization.status,
            },
            document_hash:
              troop
                .field_document_hash,
          });
        }

        fail(
          409,
          'La carga ya fue certificada con otra autorización'
        );
      }

      if (
        troop
          .field_capture_status !==
          'captured'
      ) {
        fail(
          409,
          'La carga todavía no está lista para certificarse'
        );
      }

      if (
        authorization.status ===
          'revoked'
      ) {
        fail(
          409,
          'Este QR fue revocado'
        );
      }

      if (
        authorization.status ===
          'used'
      ) {
        fail(
          409,
          'Este QR ya fue utilizado'
        );
      }

      if (
        authorization.status ===
          'expired' ||
        authorization.is_expired ===
          true
      ) {
        if (
          authorization.status ===
          'pending'
        ) {
          await client.query(
            `
              UPDATE slaughterhouse_weighing_authorizations
              SET
                status = 'expired',
                updated_at = NOW()
              WHERE id = $1
            `,
            [
              authorization.id,
            ],
          );
        }

        fail(
          409,
          'Este QR está vencido'
        );
      }

      if (
        authorization.status !==
        'pending'
      ) {
        fail(
          409,
          `El QR está en estado ${authorization.status} y no puede utilizarse`
        );
      }

      const quantity =
        Number(
          troop
            .field_captured_quantity
        );

      if (
        !Number.isInteger(
          quantity
        ) ||
        quantity <= 0
      ) {
        fail(
          409,
          'La cantidad capturada de la tropa es inválida'
        );
      }

      // ===============================================
      // VALIDAR SNAPSHOT BÁSICO
      // ===============================================

      if (
        Number(
          reviewSnapshot
            .company_id
        ) !== companyId ||
        Number(
          reviewSnapshot
            .capture_sheet_id
        ) !== captureSheetId ||
        Number(
          reviewSnapshot
            .purchase_lot_id
        ) !== purchaseLotId ||
        Number(
          reviewSnapshot
            .seller_person_id
        ) !==
          Number(
            lot.seller_person_id
          )
      ) {
        fail(
          409,
          'Los datos revisados no corresponden a esta operación'
        );
      }

      if (
        reviewSnapshot
          .capture_number !==
          lot.capture_number ||
        reviewSnapshot
          .lot_number !==
          lot.lot_number
      ) {
        fail(
          409,
          'La identificación de la carga revisada no coincide'
        );
      }

      if (
        reviewSnapshot
          .pricing_basis !==
          lot.pricing_basis ||
        reviewSnapshot
          .weight_source !==
          lot.weight_source ||
        reviewSnapshot
          .purchase_type !==
          lot.purchase_type
      ) {
        fail(
          409,
          'La modalidad comercial revisada no coincide'
        );
      }

      if (
        Number(
          reviewSnapshot
            .expected_quantity
        ) !==
          Number(
            lot.expected_quantity
          ) ||
        Number(
          reviewSnapshot
            .captured_quantity
        ) !== quantity
      ) {
        fail(
          409,
          'La cantidad revisada no coincide con la captura del servidor'
        );
      }

      if (
        reviewSnapshot.currency !==
          lot.currency
      ) {
        fail(
          409,
          'La moneda revisada no coincide'
        );
      }

      if (
        !sameNumber(
          reviewSnapshot
            .price_per_unit,
          lot.price_per_unit,
          0.0001
        )
      ) {
        fail(
          409,
          'El precio revisado no coincide con la negociación'
        );
      }

      if (
        !sameNumber(
          reviewSnapshot
            .shrink_percent,
          Number(
            lot.shrink_percent ||
              0
          ),
          0.0001
        )
      ) {
        fail(
          409,
          'El destare/merma revisado no coincide con la negociación'
        );
      }

      if (
        !Number.isInteger(
          Number(
            reviewSnapshot
              .backend_troop_id
          )
        ) ||
        Number(
          reviewSnapshot
            .backend_troop_id
        ) !==
          Number(
            troop.id
          )
      ) {

        fail(
          409,
          'La tropa revisada no coincide con el servidor'
        );

      }

      // ===============================================
      // DATOS ECONÓMICOS / PESAJE
      // ===============================================

      let weighing =
        null;

      let items =
        [];

      let grossWeightKg =
        null;

      let shrinkPercent =
        Number(
          lot.shrink_percent ||
            0
        );

      let shrinkWeightKg =
        null;

      let netWeightKg =
        null;

      let totalAmount =
        null;

      if (
        lot.pricing_basis ===
          'live_kg' &&
        lot.weight_source ===
          'origin'
      ) {
        const weighingFieldSyncId =
          `field:${companyId}:lot:${purchaseLotId}:troop:${troop.id}:weighing`;

        const weighingResult =
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

        if (
          weighingResult.rows
            .length !== 1
        ) {
          fail(
            409,
            'El pesaje de campo todavía no está sincronizado'
          );
        }

        weighing =
          weighingResult.rows[0];

        if (
          weighing.status !==
          'draft'
        ) {
          fail(
            409,
            `El pesaje está en estado ${weighing.status} y no puede certificarse`
          );
        }

        if (
          Number(
            weighing.troop_id
          ) !==
          Number(troop.id)
        ) {
          fail(
            409,
            'El pesaje no corresponde a esta tropa'
          );
        }

        if (
          reviewSnapshot
            .backend_weighing_id !==
            null &&
          reviewSnapshot
            .backend_weighing_id !==
            undefined &&
          Number(
            reviewSnapshot
              .backend_weighing_id
          ) !==
            Number(
              weighing.id
            )
        ) {
          fail(
            409,
            'El pesaje revisado no coincide con el servidor'
          );
        }

        const itemsResult =
          await client.query(
            `
              SELECT
                id,
                sequence_number,
                weight_kg,
                notes
              FROM slaughterhouse_live_weighing_items
              WHERE weighing_id = $1
              ORDER BY sequence_number ASC
              FOR UPDATE
            `,
            [
              weighing.id,
            ],
          );

        items =
          itemsResult.rows;

        if (
          items.length !==
          quantity
        ) {
          fail(
            409,
            'La cantidad de pesos no coincide con la cantidad capturada'
          );
        }

        const reviewedItems =
          Array.isArray(
            reviewSnapshot
              .weighing_items
          )
            ? reviewSnapshot
                .weighing_items
            : [];

        if (
          reviewedItems.length !==
          items.length
        ) {
          fail(
            409,
            'Los pesos revisados no coinciden con el servidor'
          );
        }

        for (
          let index = 0;
          index < items.length;
          index++
        ) {
          if (
            Number(
              reviewedItems[index]
                ?.sequence_number
            ) !==
              Number(
                items[index]
                  .sequence_number
              ) ||
            !sameNumber(
              reviewedItems[index]
                ?.weight_kg,
              items[index]
                .weight_kg,
              0.0005
            )
          ) {
            fail(
              409,
              `El peso revisado del animal ${index + 1} no coincide con el servidor`
            );
          }
        }

        grossWeightKg =
          Number(
            items
              .reduce(
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
              .toFixed(3)
          );

        shrinkWeightKg =
          Number(
            (
              grossWeightKg *
              shrinkPercent /
              100
            ).toFixed(3)
          );

        netWeightKg =
          Number(
            (
              grossWeightKg -
              shrinkWeightKg
            ).toFixed(3)
          );

        const pricePerKg =
          lot.price_per_unit !==
            null
            ? Number(
                lot.price_per_unit
              )
            : null;

        totalAmount =
          pricePerKg !== null
            ? Number(
                (
                  netWeightKg *
                  pricePerKg
                ).toFixed(2)
              )
            : null;

        if (
          !sameNumber(
            reviewSnapshot
              .gross_weight_kg,
            grossWeightKg
          ) ||
          !sameNumber(
            reviewSnapshot
              .shrink_weight_kg,
            shrinkWeightKg
          ) ||
          !sameNumber(
            reviewSnapshot
              .net_weight_kg,
            netWeightKg
          ) ||
          !sameNumber(
            reviewSnapshot
              .total_amount,
            totalAmount,
            0.005
          )
        ) {
          fail(
            409,
            'Los totales revisados no coinciden con el pesaje del servidor'
          );
        }
      } else if (
        lot.pricing_basis ===
        'per_head'
      ) {
        const price =
          lot.price_per_unit !==
            null
            ? Number(
                lot.price_per_unit
              )
            : null;

        totalAmount =
          price !== null
            ? Number(
                (
                  price *
                  quantity
                ).toFixed(2)
              )
            : null;

        if (
          !sameNumber(
            reviewSnapshot
              .total_amount,
            totalAmount,
            0.005
          )
        ) {
          fail(
            409,
            'El total revisado no coincide con la cantidad y precio negociados'
          );
        }
      }

      // ===============================================
      // DOCUMENTO CERTIFICADO
      // ===============================================

      const certificationDocument = {
        version: 2,

        type:
          'field_load_certification',

        company_id:
          companyId,

        capture_sheet_id:
          captureSheetId,

        purchase_lot_id:
          purchaseLotId,

        troop_id:
          Number(troop.id),

        weighing_id:
          weighing !== null
            ? Number(
                weighing.id
              )
            : null,

        seller_person_id:
          Number(
            lot.seller_person_id
          ),

        captador_person_id:
          Number(
            captador.id
          ),

        authorization_id:
          Number(
            authorization.id
          ),

        authorization_number:
          Number(
            authorization
              .authorization_number
          ),

        public_code:
          authorization.public_code,

        commercial_agreement_hash:
          signedCommercialAgreementHash,

        commercial_agreement:
          authorizationAgreement,

        purchase_type:
          lot.purchase_type,

        pricing_basis:
          lot.pricing_basis,

        weight_source:
          lot.weight_source,

        expected_quantity:
          Number(
            lot.expected_quantity
          ),

        quantity,

        currency:
          lot.currency,

        price_per_unit:
          lot.price_per_unit !==
            null
            ? Number(
                lot.price_per_unit
              )
            : null,

        shrink_percent:
          shrinkPercent,

        gross_weight_kg:
          grossWeightKg,

        shrink_weight_kg:
          shrinkWeightKg,

        net_weight_kg:
          netWeightKg,

        total_amount:
          totalAmount,

        review_snapshot_hash:
          serverSnapshotHash,

        event_lat:
          eventLat,

        event_lng:
          eventLng,

        event_local_time:
          eventLocalTimeInput,

        items:
          items.map(
            (item) => ({
              sequence_number:
                Number(
                  item.sequence_number
                ),
              weight_kg:
                Number(
                  item.weight_kg
                ),
              notes:
                item.notes,
            })
          ),
      };

      const documentHash =
        sha256Hex(
          canonicalJson(
            certificationDocument
          )
        );

      // ===============================================
      // CERTIFICAR TROPA
      // ===============================================

      const certifiedTroopResult =
        await client.query(
          `
            UPDATE slaughterhouse_troops
            SET
              field_capture_status = 'certified',
              field_authorization_id = $1,
              field_document_hash = $2,
              field_certified_offline = $3,
              field_certified_by = $4,
              field_certified_at = NOW(),
              field_event_lat = $5,
              field_event_lng = $6,
              field_event_local_time = $7,
              updated_at = NOW()
            WHERE
              id = $8
              AND company_id = $9
              AND field_capture_status = 'captured'
            RETURNING *
          `,
          [
            authorization.id,
            documentHash,
            certifiedOffline,
            userId,
            eventLat,
            eventLng,
            eventLocalTime,
            troop.id,
            companyId,
          ],
        );

      if (
        certifiedTroopResult.rows.length ===
        0
      ) {
        fail(
          409,
          'La tropa cambió de estado durante la certificación'
        );
      }

      troop =
        certifiedTroopResult.rows[0];

      // ===============================================
      // CERTIFICAR PESAJE SI EXISTE
      // ===============================================

      if (
        weighing !== null
      ) {
        const certifiedWeighingResult =
          await client.query(
            `
              UPDATE slaughterhouse_live_weighings
              SET
                authorization_id = $1,
                quantity = $2,
                gross_weight_kg = $3,
                shrink_percent = $4,
                shrink_weight_kg = $5,
                net_weight_kg = $6,
                price_per_kg = $7,
                total_amount = $8,
                document_hash = $9,
                certified_offline = $10,
                status = 'certified',
                certified_by = $11,
                certified_at = NOW(),
                event_lat = $12,
                event_lng = $13,
                event_local_time = $14,
                updated_at = NOW()
              WHERE
                id = $15
                AND company_id = $16
                AND status = 'draft'
              RETURNING *
            `,
            [
              authorization.id,
              quantity,
              grossWeightKg,
              shrinkPercent,
              shrinkWeightKg,
              netWeightKg,
              lot.price_per_unit,
              totalAmount,
              documentHash,
              certifiedOffline,
              userId,
              eventLat,
              eventLng,
              eventLocalTime,
              weighing.id,
              companyId,
            ],
          );

        if (
          certifiedWeighingResult
            .rows.length === 0
        ) {
          fail(
            409,
            'El pesaje cambió de estado durante la certificación'
          );
        }

        weighing =
          certifiedWeighingResult
            .rows[0];
      }

      // ===============================================
      // CONSUMIR QR
      // ===============================================

      const usedAuthorizationResult =
        await client.query(
          `
            UPDATE slaughterhouse_weighing_authorizations
            SET
              status = 'used',
              used_by = $1,
              used_at = NOW(),
              updated_at = NOW()
            WHERE
              id = $2
              AND status = 'pending'
            RETURNING
              id,
              authorization_number,
              public_code,
              key_id,
              purpose,
              status,
              used_by,
              used_at,
              expires_at
          `,
          [
            userId,
            authorization.id,
          ],
        );

      if (
        usedAuthorizationResult
          .rows.length === 0
      ) {
        fail(
          409,
          'No fue posible consumir la autorización QR'
        );
      }

      const usedAuthorization =
        usedAuthorizationResult
          .rows[0];

      // ===============================================
      // AUDITORÍA
      //
      // Nunca guardar token ni qr_payload.
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
            'troop',
            $3,
            'field_certify_with_qr',
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

            weighing_id:
              weighing?.id ||
              null,

            authorization: {
              id:
                usedAuthorization.id,

              authorization_number:
                usedAuthorization
                  .authorization_number,

              public_code:
                usedAuthorization
                  .public_code,

              key_id:
                usedAuthorization
                  .key_id,

              purpose:
                usedAuthorization
                  .purpose,

              status:
                usedAuthorization
                  .status,

              used_by:
                usedAuthorization
                  .used_by,

              used_at:
                usedAuthorization
                  .used_at,
            },

            certified_offline:
              certifiedOffline,

            client_review_snapshot_hash:
              clientSnapshotHash,

            review_snapshot_hash:
              serverSnapshotHash,

            review_snapshot:
              reviewSnapshot,

            commercial_agreement_hash:
              signedCommercialAgreementHash,

            document_hash:
              documentHash,
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

        already_certified:
          false,

        capture_sheet_id:
          captureSheetId,

        purchase_lot_id:
          purchaseLotId,

        field_capture_status:
          troop
            .field_capture_status,

        troop,

        weighing,

        authorization:
          usedAuthorization,

        review_snapshot_hash:
          serverSnapshotHash,

        document_hash:
          documentHash,
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

      console.error(
        'CERTIFY FIELD LOT ERROR:',
        error
      );

      return res
        .status(
          error.statusCode ||
            500
        )
        .json({
          error:
            error.statusCode
              ? error.message
              : 'Error certificando carga de campo',
        });
    } finally {
      client.release();
    }
  };