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
// - Si weight_source = origin,
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


      const captadorAssignmentVersion =
        Number(
          req.body
            ?.captador_assignment_version
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
        !Number.isInteger(
          captadorAssignmentVersion
        ) ||
        captadorAssignmentVersion <= 0
      ) {

        fail(
          400,
          'captador_assignment_version inválido'
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
              spl.captador_assignment_version,
              spl.captador_assigned_at,
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

            FOR UPDATE OF spl
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
        fail(
          404,
          'Lote no encontrado o no asignado a este captador'
        );
      }

      const lot =
        lotResult.rows[0];

      // ===============================================
      // AUTORIDAD DE ASIGNACIÓN DEL CAPTADOR
      //
      // Una certificación pendiente offline también
      // queda invalidada si el lote fue reasignado.
      // ===============================================

      const currentCaptadorPersonId =
        lot.captador_person_id !== null
          ? Number(
              lot.captador_person_id
            )
          : null;


      const currentAssignmentVersion =
        Number(
          lot.captador_assignment_version
        );


      if (
        currentCaptadorPersonId !==
          Number(captador.id) ||
        currentAssignmentVersion !==
          captadorAssignmentVersion
      ) {

        fail(
          409,
          'assignment_revoked'
        );

      }

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
      //
      // V2:
      // el acuerdo incluye TODAS las categorías
      // comerciales contratadas.
      // ===============================================


      // ===============================================
      // CATEGORÍAS CONTRATADAS ACTUALES
      // ===============================================

      const categoriesResult =
        await client.query(
          `
            SELECT
              plc.id
                AS purchase_lot_category_id,

              plc.line_number,

              plc.classification_id,

              classification.generated_code
                AS classification_code,

              classification.display_name
                AS classification_name,

              plc.expected_quantity,

              plc.pricing_basis,

              plc.weight_source,

              plc.price_per_unit,

              plc.currency,

              plc.shrink_percent

            FROM slaughterhouse_purchase_lot_categories plc

            JOIN slaughterhouse_animal_classifications classification
              ON classification.id =
                plc.classification_id
              AND classification.company_id =
                plc.company_id

            WHERE
              plc.company_id = $1
              AND plc.purchase_lot_id = $2

            ORDER BY
              plc.line_number ASC,
              plc.id ASC
          `,
          [
            companyId,
            purchaseLotId,
          ],
        );


      let currentCommercialCategories =
        categoriesResult.rows.map(
          (row) => ({
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
              row.classification_code ||
              null,

            classification_name:
              row.classification_name ||
              null,

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
              row.currency ||
              lot.currency ||
              'BOB',

            shrink_percent:
              Number(
                row.shrink_percent ||
                0
              ),
          }),
        );


      // ===============================================
      // COMPATIBILIDAD LOTES LEGACY
      // ===============================================

      if (
        currentCommercialCategories.length === 0 &&
        lot.classification_id !== null
      ) {

        currentCommercialCategories = [
          {
            purchase_lot_category_id:
              null,

            line_number:
              1,

            classification_id:
              Number(
                lot.classification_id
              ),

            classification_code:
              lot.classification_code ||
              null,

            classification_name:
              lot.classification_name ||
              null,

            expected_quantity:
              Number(
                lot.expected_quantity ||
                0
              ),

            pricing_basis:
              lot.pricing_basis,

            weight_source:
              lot.weight_source,

            price_per_unit:
              lot.price_per_unit !== null
                ? Number(
                    lot.price_per_unit
                  )
                : null,

            currency:
              lot.currency ||
              'BOB',

            shrink_percent:
              Number(
                lot.shrink_percent ||
                0
              ),
          },
        ];

      }


      if (
        currentCommercialCategories.length === 0
      ) {

        fail(
          409,
          'El lote no tiene categorías comerciales contratadas'
        );

      }


      const currentContractedQuantity =
        currentCommercialCategories.reduce(
          (
            total,
            category
          ) =>
            total +
            Number(
              category.expected_quantity ||
              0
            ),
          0
        );


      const parentExpectedQuantity =
        Number(
          lot.expected_quantity ||
          0
        );


      if (
        parentExpectedQuantity > 0 &&
        currentContractedQuantity !==
          parentExpectedQuantity
      ) {

        fail(
          409,
          'Las categorías comerciales no coinciden con la cantidad total contratada del lote'
        );

      }


      // ===============================================
      // PRIMERA LÍNEA
      //
      // Se conserva solo para compatibilidad
      // con consumidores legacy.
      // ===============================================

      const primaryCategory =
        currentCommercialCategories[0];


      // ===============================================
      // ACUERDO V2
      //
      // IMPORTANTE:
      // Debe tener exactamente la misma estructura
      // usada al emitir el QR.
      // ===============================================

      const currentCommercialAgreement = {

        version:
          2,


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


        purchase_type:
          lot.purchase_type,


        expected_quantity:
          currentContractedQuantity,


        // =============================================
        // LEGACY = PRIMERA LÍNEA
        // =============================================

        classification_id:
          primaryCategory
            .classification_id,

        classification_code:
          primaryCategory
            .classification_code,

        classification_name:
          primaryCategory
            .classification_name,

        pricing_basis:
          primaryCategory
            .pricing_basis,

        weight_source:
          primaryCategory
            .weight_source,

        price_per_unit:
          primaryCategory
            .price_per_unit,

        currency:
          primaryCategory
            .currency,

        shrink_percent:
          primaryCategory
            .shrink_percent,


        // =============================================
        // MODELO REAL MULTICATEGORÍA
        // =============================================

        categories:
          currentCommercialCategories,


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
          signedCommercialAgreementHash
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

      // ===============================================
      // CAPTURA REAL: CARGAS PARCIALES
      //
      // La autoridad comercial es el snapshot del QR.
      // La autoridad física es lo sincronizado en las
      // tablas field_partial_load*.
      // ===============================================

      const authorizationSnapshot =
        authorization.details_snapshot &&
        typeof authorization.details_snapshot ===
          'object' &&
        !Array.isArray(
          authorization.details_snapshot
        )
          ? authorization.details_snapshot
          : {};

      if (
        Number(
          authorizationSnapshot
            .snapshot_version
        ) !== 2
      ) {
        fail(
          409,
          'La autorización QR utiliza un snapshot comercial incompatible'
        );
      }

      const authorizedCategoriesRaw =
        Array.isArray(
          authorizationSnapshot
            .categories
        )
          ? authorizationSnapshot
              .categories
          : [];

      if (
        authorizedCategoriesRaw.length ===
        0
      ) {
        fail(
          409,
          'La autorización QR no contiene categorías comerciales'
        );
      }

      const normalizeString = (
        value
      ) => {
        if (
          value === null ||
          value === undefined
        ) {
          return null;
        }

        const normalized =
          value
            .toString()
            .trim();

        return normalized.length > 0
          ? normalized
          : null;
      };

      const sameNullableNumber = (
        a,
        b,
        tolerance = 0.0005
      ) => {
        const aEmpty =
          a === null ||
          a === undefined ||
          a === '';

        const bEmpty =
          b === null ||
          b === undefined ||
          b === '';

        if (
          aEmpty &&
          bEmpty
        ) {
          return true;
        }

        if (
          aEmpty ||
          bEmpty
        ) {
          return false;
        }

        return sameNumber(
          a,
          b,
          tolerance
        );
      };

      const authorizedCategories =
        authorizedCategoriesRaw.map(
          (
            raw,
            index
          ) => {
            const categoryId =
              Number(
                raw
                  .purchase_lot_category_id ??
                raw.id
              );

            const classificationId =
              Number(
                raw
                  .classification_id
              );

            const expectedQuantity =
              Number(
                raw
                  .expected_quantity
              );

            const pricePerUnit =
              Number(
                raw
                  .price_per_unit
              );

            const shrinkPercent =
              Number(
                raw
                  .shrink_percent ||
                0
              );

            if (
              !Number.isInteger(
                categoryId
              ) ||
              categoryId <= 0 ||
              !Number.isInteger(
                classificationId
              ) ||
              classificationId <= 0 ||
              !Number.isInteger(
                expectedQuantity
              ) ||
              expectedQuantity <= 0 ||
              !Number.isFinite(
                pricePerUnit
              ) ||
              pricePerUnit <= 0
            ) {
              fail(
                409,
                `Categoría inválida en el snapshot QR, línea ${index + 1}`
              );
            }

            return {
              purchase_lot_category_id:
                categoryId,

              line_number:
                Number(
                  raw.line_number ||
                    index + 1
                ),

              classification_id:
                classificationId,

              classification_code:
                normalizeString(
                  raw
                    .classification_code
                ),

              classification_name:
                normalizeString(
                  raw
                    .classification_name
                ),

              expected_quantity:
                expectedQuantity,

              pricing_basis:
                normalizeString(
                  raw.pricing_basis
                ),

              weight_source:
                normalizeString(
                  raw.weight_source
                ),

              price_per_unit:
                pricePerUnit,

              currency:
                normalizeString(
                  raw.currency
                ) ||
                'BOB',

              shrink_percent:
                shrinkPercent,
            };
          }
        );

      const authorizedByCategoryId =
        new Map(
          authorizedCategories.map(
            (item) => [
              Number(
                item
                  .purchase_lot_category_id
              ),
              item,
            ]
          )
        );

      // ===============================================
      // CARGAS PARCIALES DEL SERVIDOR
      // ===============================================

      const partialLoadsResult =
        await client.query(
          `
            SELECT
              id,
              company_id,
              purchase_lot_id,
              troop_id,
              capture_sheet_id,
              partial_number,
              partial_code,
              field_sync_id,
              captador_person_id,
              captador_assignment_version,
              field_authorization_id,
              estate_id,
              pickup_reference,
              notes,
              event_lat,
              event_lng,
              event_local_time,
              status,
              total_quantity,
              gross_weight_kg,
              created_at,
              updated_at

            FROM slaughterhouse_field_partial_loads

            WHERE
              company_id = $1
              AND purchase_lot_id = $2
              AND troop_id = $3
              AND capture_sheet_id = $4
              AND status <> 'cancelled'

            ORDER BY
              partial_number ASC,
              id ASC

            FOR UPDATE
          `,
          [
            companyId,
            purchaseLotId,
            troop.id,
            captureSheetId,
          ],
        );

      const partialLoads =
        partialLoadsResult.rows;

      if (
        partialLoads.length ===
        0
      ) {
        fail(
          409,
          'La tropa no tiene cargas parciales sincronizadas'
        );
      }

      // ===============================================
      // TODAS LAS PARCIALES DEBEN PERTENECER
      // AL MISMO QR QUE SE ESTÁ CERTIFICANDO
      // ===============================================

      const invalidAuthorizationPartial =
        partialLoads.find(
          (item) =>
            item
              .field_authorization_id ===
              null ||
            item
              .field_authorization_id ===
              undefined ||
            Number(
              item
                .field_authorization_id
            ) !==
              Number(
                authorization.id
              )
        );


      if (
        invalidAuthorizationPartial
      ) {
        fail(
          409,
          `La carga parcial ${invalidAuthorizationPartial.partial_code} no pertenece a esta autorización QR`
        );
      }

      const invalidPartial =
        partialLoads.find(
          (item) =>
            item.status !==
              'captured'
        );

      if (
        invalidPartial
      ) {
        fail(
          409,
          `La carga parcial ${invalidPartial.partial_code} está en estado ${invalidPartial.status}`
        );
      }

      const partialCategoriesResult =
        await client.query(
          `
            SELECT
              c.id,
              c.company_id,
              c.partial_load_id,
              c.line_number,
              c.original_purchase_lot_category_id,
              c.contracted_category_id,
              c.actual_classification_id,
              c.quantity,
              c.commercial_status,
              c.pricing_basis,
              c.weight_source,
              c.price_per_unit,
              c.currency,
              c.shrink_percent,
              c.observation,
              c.price_confirmed_by,
              c.price_confirmed_at,
              c.weight_mode,
              c.gross_weight_kg,
              ac.generated_code
                AS actual_classification_code,
              ac.display_name
                AS actual_classification_name

            FROM slaughterhouse_field_partial_load_categories c

            JOIN slaughterhouse_field_partial_loads pl
              ON pl.id =
                c.partial_load_id
              AND pl.company_id =
                c.company_id

            JOIN slaughterhouse_animal_classifications ac
              ON ac.id =
                c.actual_classification_id

            WHERE
              c.company_id = $1
              AND pl.purchase_lot_id = $2
              AND pl.troop_id = $3
              AND pl.capture_sheet_id = $4
              AND pl.status = 'captured'

            ORDER BY
              pl.partial_number ASC,
              c.line_number ASC,
              c.id ASC

            FOR UPDATE OF c
          `,
          [
            companyId,
            purchaseLotId,
            troop.id,
            captureSheetId,
          ],
        );

      const partialCategories =
        partialCategoriesResult.rows;

      if (
        partialCategories.length ===
        0
      ) {
        fail(
          409,
          'Las cargas parciales no contienen categorías'
        );
      }

      const partialWeightsResult =
        await client.query(
          `
            SELECT
              w.id,
              w.partial_load_category_id,
              w.sequence_number,
              w.weight_kg,
              w.notes

            FROM slaughterhouse_field_partial_load_weights w

            JOIN slaughterhouse_field_partial_load_categories c
              ON c.id =
                w.partial_load_category_id
              AND c.company_id =
                w.company_id

            JOIN slaughterhouse_field_partial_loads pl
              ON pl.id =
                c.partial_load_id
              AND pl.company_id =
                c.company_id

            WHERE
              w.company_id = $1
              AND pl.purchase_lot_id = $2
              AND pl.troop_id = $3
              AND pl.capture_sheet_id = $4
              AND pl.status = 'captured'

            ORDER BY
              pl.partial_number ASC,
              c.line_number ASC,
              w.sequence_number ASC,
              w.id ASC

            FOR UPDATE OF w
          `,
          [
            companyId,
            purchaseLotId,
            troop.id,
            captureSheetId,
          ],
        );

      const weightsByCategory =
        new Map();

        for (
          const weight
          of partialWeightsResult.rows
        ) {
        const categoryId =
          Number(
            weight
              .partial_load_category_id
          );

        if (
          !weightsByCategory.has(
            categoryId
          )
        ) {
          weightsByCategory.set(
            categoryId,
            []
          );
        }

        weightsByCategory
          .get(
            categoryId
          )
          .push(
            weight
          );
      }

      const categoriesByPartial =
        new Map();

      for (
        const category
        of partialCategories
      ) {
        const partialLoadId =
          Number(
            category
              .partial_load_id
          );

        if (
          !categoriesByPartial.has(
            partialLoadId
          )
        ) {
          categoriesByPartial.set(
            partialLoadId,
            []
          );
        }

        categoriesByPartial
          .get(
            partialLoadId
          )
          .push(
            category
          );
      }

      // ===============================================
      // VALIDAR TOTALES FÍSICOS
      // ===============================================

      let quantity = 0;

      for (
        const partial
        of partialLoads
      ) {
        const serverCategories =
          categoriesByPartial.get(
            Number(
              partial.id
            )
          ) ||
          [];

        if (
          serverCategories.length ===
          0
        ) {
          fail(
            409,
            `La carga parcial ${partial.partial_code} no contiene categorías`
          );
        }

        const partialQuantity =
          serverCategories.reduce(
            (
              total,
              item
            ) =>
              total +
              Number(
                item.quantity
              ),
            0
          );

        if (
          partialQuantity !==
          Number(
            partial
              .total_quantity
          )
        ) {
          fail(
            409,
            `La cantidad de ${partial.partial_code} no coincide con sus categorías`
          );
        }

        quantity +=
          partialQuantity;
      }

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

      if (
        Number(
          troop
            .field_captured_quantity
        ) !== quantity
      ) {
        fail(
          409,
          'La cantidad finalizada de la tropa no coincide con sus cargas parciales'
        );
      }

      // ===============================================
      // VALIDAR REVIEW SNAPSHOT V2
      // ===============================================

      if (
        Number(
          reviewSnapshot
            .version
        ) !== 2 ||
        reviewSnapshot
          .type !==
          'field_load_review'
      ) {
        fail(
          409,
          'La revisión utiliza un formato incompatible'
        );
      }

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
            .troop_id
        ) !== Number(
          troop.id
        ) ||
        Number(
          reviewSnapshot
            .seller_person_id
        ) !== Number(
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
        Number(
          reviewSnapshot
            .field_authorization_id
        ) !== Number(
          authorization.id
        ) ||
        Number(
          reviewSnapshot
            .commercial_snapshot_version
        ) !== 2 ||
        normalizeString(
          reviewSnapshot
            .commercial_agreement_hash
        )
          ?.toLowerCase() !==
          authorizationAgreementHash
      ) {
        fail(
          409,
          'La revisión no corresponde al contrato QR autorizado'
        );
      }

      if (
        Number(
          reviewSnapshot
            .captured_quantity
        ) !== quantity
      ) {
        fail(
          409,
          'La cantidad revisada no coincide con las cargas parciales del servidor'
        );
      }

      const reviewedAuthorized =
        Array.isArray(
          reviewSnapshot
            .authorized_categories
        )
          ? reviewSnapshot
              .authorized_categories
          : [];

      if (
        reviewedAuthorized.length !==
        authorizedCategories.length
      ) {
        fail(
          409,
          'Las categorías contratadas revisadas no coinciden con el QR'
        );
      }

      for (
        const authorized
        of authorizedCategories
      ) {
        const reviewed =
          reviewedAuthorized.find(
            (item) =>
              Number(
                item
                  ?.purchase_lot_category_id
              ) ===
              Number(
                authorized
                  .purchase_lot_category_id
              )
          );

        if (
          !reviewed ||
          Number(
            reviewed
              .classification_id
          ) !==
            authorized
              .classification_id ||
          Number(
            reviewed
              .expected_quantity
          ) !==
            authorized
              .expected_quantity ||
          normalizeString(
            reviewed
              .pricing_basis
          ) !==
            authorized
              .pricing_basis ||
          normalizeString(
            reviewed
              .weight_source
          ) !==
            authorized
              .weight_source ||
          !sameNullableNumber(
            reviewed
              .price_per_unit,
            authorized
              .price_per_unit,
            0.0001
          ) ||
          normalizeString(
            reviewed.currency
          ) !==
            authorized.currency ||
          !sameNullableNumber(
            reviewed
              .shrink_percent,
            authorized
              .shrink_percent,
            0.0001
          )
        ) {
          fail(
            409,
            `La categoría contratada ${authorized.line_number} revisada no coincide con el QR`
          );
        }
      }

      const reviewedPartials =
        Array.isArray(
          reviewSnapshot
            .partial_loads
        )
          ? reviewSnapshot
              .partial_loads
          : [];

      if (
        reviewedPartials.length !==
        partialLoads.length
      ) {
        fail(
          409,
          'La cantidad de cargas revisadas no coincide con el servidor'
        );
      }

      let pendingCommercialCount =
        0;

      let hasPendingPlantWeight =
        false;

      let hasPendingHookWeight =
        false;

      const knownAmountsByCurrency =
        new Map();

      const certifiedPartialLoads =
        [];

      for (
        const partial
        of partialLoads
      ) {
        const reviewedPartial =
          reviewedPartials.find(
            (item) =>
              Number(
                item
                  ?.partial_number
              ) ===
                Number(
                  partial
                    .partial_number
                ) &&
              normalizeString(
                item
                  ?.field_sync_id
              ) ===
                normalizeString(
                  partial
                    .field_sync_id
                )
          );

        if (
          !reviewedPartial
        ) {
          fail(
            409,
            `La carga ${partial.partial_code} no aparece en la revisión`
          );
        }

        if (
          normalizeString(
            reviewedPartial
              .partial_code
          ) !==
            normalizeString(
              partial.partial_code
            ) ||
          Number(
            reviewedPartial
              .total_quantity
          ) !==
            Number(
              partial
                .total_quantity
            ) ||
          normalizeString(
            reviewedPartial
              .status
          ) !==
            partial.status ||
          normalizeString(
            reviewedPartial
              .pickup_reference
          ) !==
            normalizeString(
              partial
                .pickup_reference
            ) ||
          normalizeString(
            reviewedPartial
              .notes
          ) !==
            normalizeString(
              partial.notes
            ) ||
          !sameNullableNumber(
            reviewedPartial
              .event_lat,
            partial.event_lat,
            0.0000005
          ) ||
          !sameNullableNumber(
            reviewedPartial
              .event_lng,
            partial.event_lng,
            0.0000005
          ) ||
          !sameNullableNumber(
            reviewedPartial
              .gross_weight_kg,
            partial
              .gross_weight_kg,
            0.0005
          )
        ) {
          fail(
            409,
            `Los datos revisados de ${partial.partial_code} no coinciden con el servidor`
          );
        }

        const serverCategories =
          categoriesByPartial.get(
            Number(
              partial.id
            )
          ) ||
          [];

        const reviewedCategories =
          Array.isArray(
            reviewedPartial
              .categories
          )
            ? reviewedPartial
                .categories
            : [];

        if (
          reviewedCategories.length !==
          serverCategories.length
        ) {
          fail(
            409,
            `Las categorías revisadas de ${partial.partial_code} no coinciden`
          );
        }

        const documentCategories =
          [];

        for (
          const category
          of serverCategories
        ) {
          const reviewedCategory =
            reviewedCategories.find(
              (item) =>
                Number(
                  item
                    ?.line_number
                ) ===
                Number(
                  category
                    .line_number
                )
            );

          if (
            !reviewedCategory
          ) {
            fail(
              409,
              `Falta la línea ${category.line_number} de ${partial.partial_code} en la revisión`
            );
          }

          if (
            Number(
              reviewedCategory
                .original_purchase_lot_category_id
            ) !==
              Number(
                category
                  .original_purchase_lot_category_id
              ) &&
            !(
              reviewedCategory
                .original_purchase_lot_category_id ===
                null &&
              category
                .original_purchase_lot_category_id ===
                null
            )
          ) {
            fail(
              409,
              `La categoría original de ${partial.partial_code} no coincide`
            );
          }

          if (
            Number(
              reviewedCategory
                .contracted_category_id
            ) !==
              Number(
                category
                  .contracted_category_id
              ) &&
            !(
              reviewedCategory
                .contracted_category_id ===
                null &&
              category
                .contracted_category_id ===
                null
            )
          ) {
            fail(
              409,
              `La categoría contratada de ${partial.partial_code} no coincide`
            );
          }

          if (
            Number(
              reviewedCategory
                .actual_classification_id
            ) !==
              Number(
                category
                  .actual_classification_id
              ) ||
            Number(
              reviewedCategory
                .quantity
            ) !==
              Number(
                category.quantity
              ) ||
            normalizeString(
              reviewedCategory
                .commercial_status
            ) !==
              category
                .commercial_status ||
            normalizeString(
              reviewedCategory
                .pricing_basis
            ) !==
              normalizeString(
                category
                  .pricing_basis
              ) ||
            normalizeString(
              reviewedCategory
                .weight_source
            ) !==
              normalizeString(
                category
                  .weight_source
              ) ||
            !sameNullableNumber(
              reviewedCategory
                .price_per_unit,
              category
                .price_per_unit,
              0.0001
            ) ||
            normalizeString(
              reviewedCategory
                .currency
            ) !==
              normalizeString(
                category.currency
              ) ||
            !sameNullableNumber(
              reviewedCategory
                .shrink_percent,
              category
                .shrink_percent,
              0.0001
            ) ||
            normalizeString(
              reviewedCategory
                .observation
            ) !==
              normalizeString(
                category
                  .observation
              ) ||
            normalizeString(
              reviewedCategory
                .weight_mode
            ) !==
              normalizeString(
                category
                  .weight_mode
              ) ||
            !sameNullableNumber(
              reviewedCategory
                .gross_weight_kg,
              category
                .gross_weight_kg,
              0.0005
            )
          ) {
            fail(
              409,
              `La línea ${category.line_number} de ${partial.partial_code} no coincide con el servidor`
            );
          }

          const serverWeights =
            weightsByCategory.get(
              Number(
                category.id
              )
            ) ||
            [];

          const reviewedWeights =
            Array.isArray(
              reviewedCategory
                .weights
            )
              ? reviewedCategory
                  .weights
              : [];

          if (
            reviewedWeights.length !==
            serverWeights.length
          ) {
            fail(
              409,
              `Los pesos revisados de la línea ${category.line_number} de ${partial.partial_code} no coinciden`
            );
          }

          for (
            let index = 0;
            index < serverWeights.length;
            index++
          ) {
            if (
              Number(
                reviewedWeights[index]
                  ?.sequence_number
              ) !==
                Number(
                  serverWeights[index]
                    .sequence_number
                ) ||
              !sameNumber(
                reviewedWeights[index]
                  ?.weight_kg,
                serverWeights[index]
                  .weight_kg,
                0.0005
              )
            ) {
              fail(
                409,
                `El peso ${index + 1} de la línea ${category.line_number} de ${partial.partial_code} no coincide`
              );
            }
          }

          let fieldCalculation =
            null;

          if (
            category
              .commercial_status ===
            'confirmed'
          ) {
            const contractedCategoryId =
              Number(
                category
                  .contracted_category_id
              );

            const contractedCategory =
              authorizedByCategoryId.get(
                contractedCategoryId
              ) ||
              null;

            if (
              !contractedCategory
            ) {
              fail(
                409,
                `La línea ${category.line_number} de ${partial.partial_code} no está respaldada por el contrato QR`
              );
            }

            if (
              Number(
                category
                  .actual_classification_id
              ) !==
                Number(
                  contractedCategory
                    .classification_id
                ) ||
              normalizeString(
                category.pricing_basis
              ) !==
                contractedCategory
                  .pricing_basis ||
              normalizeString(
                category.weight_source
              ) !==
                contractedCategory
                  .weight_source ||
              !sameNumber(
                category
                  .price_per_unit,
                contractedCategory
                  .price_per_unit,
                0.0001
              ) ||
              normalizeString(
                category.currency
              ) !==
                contractedCategory
                  .currency ||
              !sameNumber(
                category
                  .shrink_percent,
                contractedCategory
                  .shrink_percent,
                0.0001
              )
            ) {
              fail(
                409,
                `Las condiciones de la línea ${category.line_number} de ${partial.partial_code} no coinciden con el QR`
              );
            }

            const basis =
              category
                .pricing_basis;

            const source =
              category
                .weight_source;

            const price =
              Number(
                category
                  .price_per_unit
              );

            const lineQuantity =
              Number(
                category.quantity
              );

            const currency =
              category.currency;

            if (
              basis ===
              'per_head'
            ) {
              const amount =
                Number(
                  (
                    lineQuantity *
                    price
                  ).toFixed(2)
                );

              fieldCalculation = {
                status:
                  'calculated_in_field',
                basis,
                quantity:
                  lineQuantity,
                unit_price:
                  price,
                currency,
                amount,
              };

              knownAmountsByCurrency.set(
                currency,
                Number(
                  (
                    (
                      knownAmountsByCurrency.get(
                        currency
                      ) ||
                      0
                    ) +
                    amount
                  ).toFixed(2)
                )
              );
            } else if (
              basis ===
                'live_kg' &&
              source ===
                'origin'
            ) {
              const weightMode =
                category
                  .weight_mode;

              let grossWeightKg;

              if (
                weightMode ===
                'individual'
              ) {
                if (
                  serverWeights.length !==
                  lineQuantity
                ) {
                  fail(
                    409,
                    `La línea ${category.line_number} de ${partial.partial_code} no tiene un peso por animal`
                  );
                }

                grossWeightKg =
                  Number(
                    serverWeights
                      .reduce(
                        (
                          total,
                          item
                        ) =>
                          total +
                          Number(
                            item
                              .weight_kg
                          ),
                        0
                      )
                      .toFixed(3)
                  );

                if (
                  !sameNumber(
                    category
                      .gross_weight_kg,
                    grossWeightKg,
                    0.0005
                  )
                ) {
                  fail(
                    409,
                    `El peso total de la línea ${category.line_number} de ${partial.partial_code} no coincide`
                  );
                }
              } else if (
                weightMode ===
                'category_total'
              ) {
                grossWeightKg =
                  Number(
                    category
                      .gross_weight_kg
                  );

                if (
                  !Number.isFinite(
                    grossWeightKg
                  ) ||
                  grossWeightKg <= 0
                ) {
                  fail(
                    409,
                    `La línea ${category.line_number} de ${partial.partial_code} no tiene peso total válido`
                  );
                }
              } else {
                fail(
                  409,
                  `La línea ${category.line_number} de ${partial.partial_code} requiere modalidad de pesaje`
                );
              }

              const shrinkPercent =
                Number(
                  category
                    .shrink_percent ||
                  0
                );

              const shrinkWeightKg =
                Number(
                  (
                    grossWeightKg *
                    shrinkPercent /
                    100
                  ).toFixed(3)
                );

              const netWeightKg =
                Number(
                  (
                    grossWeightKg -
                    shrinkWeightKg
                  ).toFixed(3)
                );

              const amount =
                Number(
                  (
                    netWeightKg *
                    price
                  ).toFixed(2)
                );

              fieldCalculation = {
                status:
                  'calculated_in_field',
                basis,
                weight_source:
                  source,
                gross_weight_kg:
                  grossWeightKg,
                shrink_percent:
                  shrinkPercent,
                shrink_weight_kg:
                  shrinkWeightKg,
                net_weight_kg:
                  netWeightKg,
                unit_price:
                  price,
                currency,
                amount,
              };

              knownAmountsByCurrency.set(
                currency,
                Number(
                  (
                    (
                      knownAmountsByCurrency.get(
                        currency
                      ) ||
                      0
                    ) +
                    amount
                  ).toFixed(2)
                )
              );
            } else if (
              basis ===
                'live_kg' &&
              source ===
                'plant'
            ) {
              hasPendingPlantWeight =
                true;

              fieldCalculation = {
                status:
                  'pending_plant_weight',
                basis,
                weight_source:
                  source,
                unit_price:
                  price,
                currency,
              };
            } else if (
              basis ===
              'hook_kg'
            ) {
              hasPendingHookWeight =
                true;

              fieldCalculation = {
                status:
                  'pending_hook_weight',
                basis,
                weight_source:
                  source,
                unit_price:
                  price,
                currency,
              };
            } else {
              fail(
                409,
                `Modalidad comercial no soportada en la línea ${category.line_number} de ${partial.partial_code}`
              );
            }
          } else if (
            category
              .commercial_status ===
            'pending_price'
          ) {
            pendingCommercialCount++;

            if (
              !normalizeString(
                category.observation
              )
            ) {
              fail(
                409,
                `La línea ${category.line_number} de ${partial.partial_code} requiere observación por diferencia comercial`
              );
            }

            fieldCalculation = {
              status:
                'pending_price',
              amount:
                null,
            };
          } else {
            fail(
              409,
              `Estado comercial inválido en la línea ${category.line_number} de ${partial.partial_code}`
            );
          }

          documentCategories.push({
            line_number:
              Number(
                category
                  .line_number
              ),

            original_purchase_lot_category_id:
              category
                .original_purchase_lot_category_id !==
                null
                ? Number(
                    category
                      .original_purchase_lot_category_id
                  )
                : null,

            contracted_category_id:
              category
                .contracted_category_id !==
                null
                ? Number(
                    category
                      .contracted_category_id
                  )
                : null,

            actual_classification_id:
              Number(
                category
                  .actual_classification_id
              ),

            actual_classification_code:
              category
                .actual_classification_code,

            actual_classification_name:
              category
                .actual_classification_name,

            quantity:
              Number(
                category.quantity
              ),

            commercial_status:
              category
                .commercial_status,

            commercial_terms:
              category
                .commercial_status ===
                'confirmed'
                ? {
                    pricing_basis:
                      category
                        .pricing_basis,
                    weight_source:
                      category
                        .weight_source,
                    price_per_unit:
                      Number(
                        category
                          .price_per_unit
                      ),
                    currency:
                      category
                        .currency,
                    shrink_percent:
                      Number(
                        category
                          .shrink_percent ||
                        0
                      ),
                  }
                : null,

            observation:
              category
                .observation,

            weight_mode:
              category
                .weight_mode,

            gross_weight_kg:
              category
                .gross_weight_kg !==
                null
                ? Number(
                    category
                      .gross_weight_kg
                  )
                : null,

            weights:
              serverWeights.map(
                (item) => ({
                  sequence_number:
                    Number(
                      item
                        .sequence_number
                    ),
                  weight_kg:
                    Number(
                      item.weight_kg
                    ),
                  notes:
                    item.notes,
                })
              ),

            field_calculation:
              fieldCalculation,
          });
        }

        certifiedPartialLoads.push({
          id:
            Number(
              partial.id
            ),

          field_sync_id:
            partial
              .field_sync_id,

          partial_number:
            Number(
              partial
                .partial_number
            ),

          partial_code:
            partial
              .partial_code,

          estate_id:
            partial
              .estate_id !==
              null
              ? Number(
                  partial
                    .estate_id
                )
              : null,

          pickup_reference:
            partial
              .pickup_reference,

          notes:
            partial.notes,

          event_lat:
            partial
              .event_lat !==
              null
              ? Number(
                  partial
                    .event_lat
                )
              : null,

          event_lng:
            partial
              .event_lng !==
              null
              ? Number(
                  partial
                    .event_lng
                )
              : null,

          event_local_time:
            partial
              .event_local_time,

          total_quantity:
            Number(
              partial
                .total_quantity
            ),

          gross_weight_kg:
            partial
              .gross_weight_kg !==
              null
              ? Number(
                  partial
                    .gross_weight_kg
                )
              : null,

          categories:
            documentCategories,
        });
      }

      if (
        Number(
          reviewSnapshot
            .pending_commercial_count
        ) !==
        pendingCommercialCount
      ) {
        fail(
          409,
          'La cantidad de categorías con precio pendiente no coincide'
        );
      }

      const knownAmounts =
        Array.from(
          knownAmountsByCurrency
            .entries()
        ).map(
          (
            [
              currency,
              amount,
            ]
          ) => ({
            currency,
            amount,
          })
        );

      const financialStatus =
        pendingCommercialCount > 0
          ? 'pending_price'
          : hasPendingHookWeight
          ? 'pending_slaughter_weight'
          : hasPendingPlantWeight
          ? 'pending_plant_weight'
          : 'field_complete';

      // Compatibilidad: ya no existe un pesaje único
      // como autoridad de esta tropa.
      let weighing =
        null;

      const certificationDocument = {
        version: 2,

        type:
          'field_load_certification',

        capture_model:
          'partial_loads_v2',

        company_id:
          companyId,

        capture_sheet_id:
          captureSheetId,

        purchase_lot_id:
          purchaseLotId,

        troop_id:
          Number(
            troop.id
          ),

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

        authorized_categories:
          authorizedCategories,

        quantity,

        partial_loads:
          certifiedPartialLoads,

        financial_summary: {
          status:
            financialStatus,

          pending_price_count:
            pendingCommercialCount,

          pending_plant_weight:
            hasPendingPlantWeight,

          pending_hook_weight:
            hasPendingHookWeight,

          known_field_amounts:
            knownAmounts,
        },

        review_snapshot_hash:
          serverSnapshotHash,

        event_lat:
          eventLat,

        event_lng:
          eventLng,

        event_local_time:
          eventLocalTimeInput,
      };

      const documentHash =
        sha256Hex(
          canonicalJson(
            certificationDocument
          )
        );

      // ===============================================
      // CERTIFICAR CARGAS PARCIALES
      // ===============================================

      const certifiedPartialsResult =
        await client.query(
          `
            UPDATE slaughterhouse_field_partial_loads
            SET
              status = 'certified',
              updated_at = NOW()
            WHERE
              company_id = $1
              AND purchase_lot_id = $2
              AND troop_id = $3
              AND capture_sheet_id = $4
              AND field_authorization_id = $5
              AND status = 'captured'
            RETURNING id
          `,
          [
            companyId,
            purchaseLotId,
            troop.id,
            captureSheetId,
            authorization.id,
          ],
        );

      if (
        certifiedPartialsResult
          .rows.length !==
        partialLoads.length
      ) {
        fail(
          409,
          'Las cargas parciales cambiaron de estado durante la certificación'
        );
      }

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
              AND purchase_lot_id = $10
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
            purchaseLotId,
          ],
        );

      if (
        certifiedTroopResult
          .rows.length ===
        0
      ) {
        fail(
          409,
          'La tropa cambió de estado durante la certificación'
        );
      }

      troop =
        certifiedTroopResult
          .rows[0];

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