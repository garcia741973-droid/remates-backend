const { pool } = require('../config/db');

const admin =
  require('firebase-admin');

const {
  sendUserNotification,
  sendAdminNotification,
} = require('../services/notificationService');

const {
  createOperationEvent,
} = require('../services/operationEventsService');

const {
  analyzePaymentProof,
} = require('../services/paymentAiService');

const {
  buildPaymentAudit,
} = require('../services/paymentAuditService');

/// 🔥 LISTAR VALIDACIONES
const getPaymentValidations =
  async (req, res) => {
    try {
      const result =
        await pool.query(
          `
          SELECT *
          FROM payment_validations
          ORDER BY id DESC
          `
        );

      res.json(
        result.rows
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error obteniendo validaciones',
      });
    }
  };


/// 🔥 APROBAR
const approvePaymentValidation =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const paymentRes =
      await pool.query(
        `
        UPDATE payment_validations
        SET
          status = 'approved',
          reviewed_by = $2,
          reviewed_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [
          id,
          req.user.user_id,
        ]
      );

      if (
        paymentRes.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            'Pago no encontrado',
        });
      }

      const payment =
        paymentRes.rows[0];

      /// 🔥 SI ES TRANSPORTE
      if (
        payment.module ===
        'transport'
      ) {
        const negotiationRes =
          await pool.query(
            `
            SELECT *
            FROM transport_negotiations
            WHERE id = $1
            LIMIT 1
            `,
            [payment.reference_id]
          );

          if (negotiationRes.rows.length === 0) {
            return res.status(404).json({
              error:
                'Negociación no encontrada',
            });
          }

        const negotiation =
          negotiationRes.rows[0];

        const existingPayment =
          await pool.query(
            `
            SELECT id
            FROM transport_payments
            WHERE negotiation_id = $1
            LIMIT 1
            `,
            [payment.reference_id]
          );

          const duplicatedProof =
            await pool.query(
              `
              SELECT id
              FROM transport_payments
              WHERE proof_hash = $1
              LIMIT 1
              `,
              [payment.proof_hash]
            );

          if (duplicatedProof.rows.length > 0) {
            return res.status(400).json({
              error:
                'Este comprobante ya fue utilizado anteriormente.',
            });
          }

        if (existingPayment.rows.length > 0) {
          return res.status(400).json({
            error:
              'Este pago ya fue aprobado anteriormente',
          });
        }

        /// CREAR PAGO REAL
        await pool.query(
          `
          INSERT INTO transport_payments (

            negotiation_id,
            payer_user_id,
            amount,
            proof_image_url,

            bank_detected,
            reference_detected,
            sender_name,

            payment_date,
            payment_time,

            destination_account,
            destination_holder,

            account_match,
            holder_match,

            proof_complete,
            possible_manipulation,

            payment_valid,

            ai_verified,
            ai_confidence,
            ai_notes,

            ai_model,
            ai_json,
            proof_hash,

            status

          )
          VALUES (

            $1,$2,$3,$4,

            $5,$6,$7,

            $8,$9,

            $10,$11,

            $12,$13,

            $14,$15,

            $16,

            $17,$18,$19,

            $20,$21,$22,

            $23

          )
          `,
          [

            payment.reference_id,
            payment.payer_user_id,
            payment.expected_amount,
            payment.proof_image_url,

            payment.detected_bank,
            payment.detected_reference,
            payment.detected_sender,

            payment.detected_date,
            payment.detected_time,

            payment.destination_account,
            payment.destination_holder,

            payment.account_match,
            payment.holder_match,

            payment.proof_complete,
            payment.possible_manipulation,

            payment.payment_valid,

            payment.ai_verified,
            payment.ai_confidence,
            payment.ai_notes,

            payment.ai_model,
            payment.ai_json,
            payment.proof_hash,

            'approved',

          ]
        );

        /// NEGOCIACIÓN PAGADA
        await pool.query(
          `
          UPDATE transport_negotiations
          SET status = 'paid'
          WHERE id = $1
          `,
          [payment.reference_id]
        );

        /// REQUEST PAGADO
        await pool.query(
          `
          UPDATE transport_requests
          SET status = 'paid'
          WHERE id = $1
          `,
          [negotiation.request_id]
        );

        /// CAJA
        await pool.query(
          `
          INSERT INTO cash_movements (
            type,
            category,
            amount,
            description,
            reference_type,
            reference_id,
            proof_url,
            created_by,
            company_id
          )
          VALUES (
            'income',
            'Transporte',
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7
          )
          `,
          [
            payment.expected_amount,
            `Pago transporte negociación #${payment.reference_id}`,
            'transport_payment',
            payment.reference_id,
            payment.proof_image_url,
            payment.payer_user_id,
            1,
          ]
        );

        /// OBTENER CONTACTOS
        const usersRes =
          await pool.query(
            `
            SELECT
              r.name AS requester_name,
              r.phone AS requester_phone,
              t.name AS transporter_name,
              t.phone AS transporter_phone
            FROM transport_negotiations tn
            JOIN users r
              ON tn.requester_id = r.id
            JOIN users t
              ON tn.transporter_id = t.id
            WHERE tn.id = $1
            LIMIT 1
            `,
            [payment.reference_id]
          );

        const users =
          usersRes.rows[0];

        /// MENSAJE FIRESTORE
        await admin
          .firestore()
          .collection(
            'transport_negotiations'
          )
          .doc(
            payment.reference_id.toString()
          )
          .collection('messages')
          .add({
            sender_id: 0,
            system: true,
            message:
              `✅ Pago aprobado manualmente.

        Pago aprobado correctamente.

        Contactos liberados:

        👨‍🌾 Ganadero:
        ${users.requester_name}
        ${users.requester_phone}

        🚛 Transportista:
        ${users.transporter_name}
        ${users.transporter_phone}

        📦 Ahora ve a MIS VIAJES para continuar:

        • Crear despacho
        • Confirmar carga
        • Iniciar viaje
        • Reportar avance
        • Marcar entrega final

        💬 Este chat seguirá disponible hasta la entrega.`,
            created_at:
              admin.firestore.FieldValue.serverTimestamp(),
          });

        /// PUSH CAMIONERO
        await sendUserNotification({
          userId:
            negotiation.transporter_id,
          title:
            'Pago aprobado',
          body:
            'El pago fue aprobado manualmente.',
          data: {
            type:
              'transport_paid',
            negotiation_id:
              payment.reference_id,
          },
        });

        /// PUSH GANADERO
        await sendUserNotification({
          userId:
            negotiation.requester_id,
          title:
            'Pago aprobado',
          body:
            'Tu pago fue aprobado manualmente.',
          data: {
            type:
              'transport_paid',
            negotiation_id:
              payment.reference_id,
          },
        });

      }

      /// 🔥 SI ES MARKETPLACE
      if (
        payment.module ===
        'negotiation'
      ) {

        const negotiationRes =
          await pool.query(
            `
            SELECT *
            FROM negotiations
            WHERE id = $1
            LIMIT 1
            `,
            [payment.reference_id]
          );

        if (
          negotiationRes.rows.length === 0
        ) {
          return res.status(404).json({
            error:
              'Negociación no encontrada',
          });
        }

        const negotiation =
          negotiationRes.rows[0];

  /// 🔥 VALIDAR PAGO DUPLICADO
  const existingPayment =
    await pool.query(
      `
      SELECT id
      FROM negotiation_payments
      WHERE negotiation_id = $1
      LIMIT 1
      `,
      [payment.reference_id]
    );

  if (
    existingPayment.rows.length > 0
  ) {
    return res.status(400).json({
      error:
        'Esta negociación ya fue aprobada anteriormente',
    });
  }

  /// 🔥 VALIDAR COMPROBANTE DUPLICADO
  const duplicatedProof =
    await pool.query(
      `
      SELECT id
      FROM negotiation_payments
      WHERE proof_hash = $1
      LIMIT 1
      `,
      [payment.proof_hash]
    );

  if (
    duplicatedProof.rows.length > 0
  ) {
    return res.status(400).json({
      error:
        'Este comprobante ya fue utilizado anteriormente.',
    });
  }

  /// 🔥 CREAR PAGO REAL
  await pool.query(
    `
    INSERT INTO negotiation_payments
    (
      negotiation_id,
      lot_id,
      seller_id,
      buyer_id,
      amount,
      proof_url,
      status,

      bank_detected,
      reference_detected,
      sender_name,
      payment_date,
      payment_time,

      destination_account,
      destination_holder,

      account_match,
      holder_match,

      proof_complete,
      possible_manipulation,
      payment_valid,

      ai_confidence,
      ai_model,
      ai_json,
      proof_hash,

      unlocked_at
    )
    VALUES
    (
      $1,$2,$3,$4,$5,$6,$7,

      $8,$9,$10,$11,$12,

      $13,$14,

      $15,$16,

      $17,$18,$19,

      $20,$21,$22,$23,

      NOW()
    )
    `,
    [
      negotiation.id,
      negotiation.lot_id,
      negotiation.seller_id,
      negotiation.buyer_id,

      payment.expected_amount,
      payment.proof_image_url,

      'approved',

      payment.detected_bank,
      payment.detected_reference,
      payment.detected_sender,
      payment.detected_date,
      payment.detected_time,

      payment.destination_account,
      payment.destination_holder,

      payment.account_match,
      payment.holder_match,

      payment.proof_complete,
      payment.possible_manipulation,
      payment.payment_valid,

      payment.ai_confidence,
      payment.ai_model,
      payment.ai_json,
      payment.proof_hash,
    ]
  );

  /// 🔥 DESBLOQUEAR NEGOCIACIÓN
  await pool.query(
    `
    UPDATE negotiations
    SET

      status = 'contacts_unlocked',

      contacts_unlocked_at = NOW(),

      review_available_at =
        NOW() + INTERVAL '24 hours',

      closed_at = NOW()

    WHERE id = $1
    `,
    [negotiation.id]
  );

  /// 🔥 MARCAR LOTE VENDIDO
  await pool.query(
    `
    UPDATE lots
    SET
      status = 'sold',
      winner_user_id = $1,
      sold_at = NOW(),
      final_price = $2
    WHERE id = $3
    `,
    [
      negotiation.buyer_id,
      negotiation.final_price,
      negotiation.lot_id,
    ]
  );
  
  /// 🔥 LIMPIAR DESTACADO / PREMIUM
  await pool.query(
    `
    UPDATE lots
    SET
      promoted_until = NULL,
      promotion_priority = 0
    WHERE id = $1
    `,
    [negotiation.lot_id]
  );
  
  /// 🔥 CERRAR OTRAS NEGOCIACIONES
  await pool.query(
    `
    UPDATE negotiations
    SET status = 'closed_other_buyer'
    WHERE lot_id = $1
      AND id != $2
      AND status = 'open'
    `,
    [
      negotiation.lot_id,
      negotiation.id,
    ]
  );
  
  /// 🔥 REGISTRAR INGRESO EN CAJA
  await pool.query(
    `
    INSERT INTO cash_movements
    (
      type,
      category,
      amount,
      description,
      reference_type,
      reference_id,
      proof_url,
      created_by,
      company_id
    )
    VALUES
    (
      'income',
      'negociaciones',
      $1,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7
    )
    `,
    [
      payment.expected_amount,
      `Pago desbloqueo negociación #${negotiation.id}`,
      'negotiation_payment',
      negotiation.id,
      payment.proof_image_url,
      payment.payer_user_id,
      1,
    ]
  );  

  /// 🔥 EVENTO OPERATIVO
  await createOperationEvent({

    type: 'negotiation_closed',

    title:
      '🤝 Negociación cerrada',

    message:
      `El lote ${negotiation.lot_id} fue vendido exitosamente`,

    priority: 'high',

    data: {

      negotiation_id:
        negotiation.id,

      lot_id:
        negotiation.lot_id,

      seller_id:
        negotiation.seller_id,

      buyer_id:
        negotiation.buyer_id,
    },
  });  

  /// 🔥 PUSH SUPER ADMIN
  await sendAdminNotification({

    title:
      '🤝 Negociación cerrada',

    body:
      `Lote ${negotiation.lot_id} vendido exitosamente`,

    data: {

      type:
        'negotiation_closed',

      negotiation_id:
        negotiation.id.toString(),

      lot_id:
        negotiation.lot_id.toString(),
    },
  });

  /// 🔥 PUSH COMPRADOR
  const tokensRes =
    await pool.query(
      `
      SELECT fcm_token
      FROM devices
      WHERE user_id = $1
      `,
      [negotiation.buyer_id]
    );

  const tokens =
    tokensRes.rows.map(
      t => t.fcm_token
    );

  if (tokens.length > 0) {

    try {

      await admin.messaging()
        .sendEachForMulticast({

          tokens,

          notification: {

            title:
              '🎉 Venta confirmada',

            body:
              'El pago fue aprobado y los contactos fueron liberados.',

          },

          data: {

            type:
              'contacts_unlocked',

            negotiationId:
              negotiation.id.toString(),
          },
        });

    } catch (e) {

      console.log(e);

    }

  }

  /// 🔥 DESACTIVAR PROMOCIONES DEL LOTE
  await pool.query(
    `
    UPDATE promotion_requests
    SET

      status = 'completed',

      is_visible = false,

      ends_at = NOW()

    WHERE entity_type = 'lot'
      AND entity_id = $1
      AND is_visible = true
    `,
    [negotiation.lot_id]
  );
  
  /// 🔥 FIRESTORE UPDATE
  const lotRes =
    await pool.query(
      `
      SELECT company_id
      FROM lots
      WHERE id = $1
      `,
      [negotiation.lot_id]
    );

  const company_id =
    lotRes.rows[0]?.company_id;

  if (company_id) {

    await admin.firestore()
      .collection('companies')
      .doc(company_id.toString())
      .collection('negotiations')
      .doc(negotiation.id.toString())
      .set({

        status: 'contacts_unlocked',

        contacts_unlocked_at:
          admin.firestore.FieldValue.serverTimestamp(),

      }, { merge: true });

  }  

  return res.json({

    success: true,

    module: 'negotiation',

    status: 'contacts_unlocked',

  });

    }

    /// Respuesta por defecto para módulos futuros

      res.json({
        success: true,
      });



    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error aprobando pago',
      });
    }
  };


    /// 🔥 RECHAZAR
    const rejectPaymentValidation =
      async (req, res) => {
        try {
          const { id } =
            req.params;

    /// 🔥 OBTENER VALIDACIÓN
    const paymentRes =
      await pool.query(
        `
        SELECT *
        FROM payment_validations
        WHERE id = $1
        LIMIT 1
        `,
        [id]
      );

    if (
      paymentRes.rows.length === 0
    ) {
      return res.status(404).json({
        error:
          'Validación no encontrada',
      });
    }

    const payment =
      paymentRes.rows[0];

    /// 🔥 MARCAR VALIDACIÓN COMO RECHAZADA
    await pool.query(
      `
      UPDATE payment_validations
      SET
        status = 'rejected'
      WHERE id = $1
      `,
      [id]
    );

    /// 🔥 SI ES MARKETPLACE
    if (
      payment.module ===
      'negotiation'
    ) {

      await pool.query(
        `
        UPDATE negotiations
        SET
          status = 'open',
          final_price = NULL
        WHERE id = $1
        `,
        [payment.reference_id]
      );

      /// 🔥 OBTENER NEGOCIACIÓN
      const negotiationRes =
        await pool.query(
          `
          SELECT *
          FROM negotiations
          WHERE id = $1
          LIMIT 1
          `,
          [payment.reference_id]
        );

      if (negotiationRes.rows.length > 0) {

        const negotiation =
          negotiationRes.rows[0];

        try {

          await sendUserNotification({

            userId:
              negotiation.seller_id,

            title:
              '❌ Comprobante rechazado',

            body:
              'Tu comprobante fue rechazado. Puedes subir uno nuevo para continuar con la negociación.',

            data: {

              type:
                'payment_rejected',

              negotiation_id:
                negotiation.id,
            },
          });

        } catch (e) {

          console.log(
            '❌ ERROR PUSH PAYMENT REJECTED',
            e,
          );
        }
      }
    }

    /// 🔥 SI ES TRANSPORTE
    if (
      payment.module ===
      'transport'
    ) {

      await pool.query(
        `
        UPDATE transport_negotiations
        SET
          status = 'open'
        WHERE id = $1
        `,
        [payment.reference_id]
      );
    }

    res.json({
      success: true,
    });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error rechazando pago',
      });
    }
  };

/// 🔥 BORRAR SOLO PRUEBAS
const deletePaymentValidation =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const paymentRes =
        await pool.query(
          `
          SELECT *
          FROM payment_validations
          WHERE id = $1
          LIMIT 1
          `,
          [id]
        );

      if (
        paymentRes.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            'Validación no encontrada',
        });
      }

      const payment =
        paymentRes.rows[0];

      /// SOLO PRUEBAS
      if (
        payment.module ===
        'transport'
      ) {
        return res.status(400).json({
          error:
            'No se puede borrar una validación real',
        });
      }

      await pool.query(
        `
        DELETE FROM payment_validations
        WHERE id = $1
        `,
        [id]
      );

      res.json({
        success: true,
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error borrando validación',
      });
    }
  };

/// 🔥 REANALIZAR IA
const recheckPaymentValidation =
  async (req, res) => {
    try {
      const { id } =
        req.params;

      const paymentRes =
        await pool.query(
          `
          SELECT *
          FROM payment_validations
          WHERE id = $1
          LIMIT 1
          `,
          [id]
        );

      if (
        paymentRes.rows.length === 0
      ) {
        return res.status(404).json({
          error:
            'Pago no encontrado',
        });
      }

      const payment =
        paymentRes.rows[0];

      const aiResult =
        await analyzePaymentProof({
          proofImageUrl:
            payment.proof_image_url,
          expectedAmount:
            payment.expected_amount,
        });

      const audit =
        buildPaymentAudit({
          aiResult,
          proofImageUrl:
            payment.proof_image_url,
        });

        await pool.query(
          `
          UPDATE payment_validations
          SET
            detected_amount = $1,
            detected_bank = $2,
            detected_reference = $3,
            detected_sender = $4,
            detected_date = $5,
            detected_time = $6,

            destination_account = $7,
            destination_holder = $8,

            account_match = $9,
            holder_match = $10,

            proof_complete = $11,
            possible_manipulation = $12,

            payment_valid = $13,

            ai_verified = $14,
            ai_confidence = $15,
            ai_notes = $16,

            ai_model = $17,
            ai_json = $18,
            proof_hash = $19

          WHERE id = $20
          `,
          [
            audit.detected_amount,
            audit.detected_bank,
            audit.detected_reference,
            audit.detected_sender,
            audit.detected_date,
            audit.detected_time,

            audit.destination_account,
            audit.destination_holder,

            audit.account_match,
            audit.holder_match,

            audit.proof_complete,
            audit.possible_manipulation,

            audit.payment_valid,

            audit.ai_verified,
            audit.ai_confidence,
            audit.ai_notes,

            audit.ai_model,
            audit.ai_json,
            audit.proof_hash,

            id,
          ]
        );

      res.json({
        success: true,
        aiResult,
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error reanalizando pago',
      });
    }
  };

const createManualPaymentValidation =
  async (req, res) => {
    try {
      const userId =
        req.user.user_id;

      const {
        module,
        reference_id,
        expected_amount,
        proof_image_url,
      } = req.body;

      const aiResult =
        await analyzePaymentProof({
          proofImageUrl:
            proof_image_url,
          expectedAmount:
            expected_amount,
        });

      console.log(
        '🤖 AI MANUAL RESULT:',
        aiResult
      );

      const audit =
        buildPaymentAudit({
          aiResult,
          proofImageUrl:
            proof_image_url,
        });

      const result =
        await pool.query(
          `
          INSERT INTO payment_validations (
            module,
            reference_id,
            payer_user_id,
            expected_amount,
            proof_image_url,

            detected_amount,
            detected_bank,
            detected_reference,
            detected_sender,
            detected_date,
            detected_time,

            destination_account,
            destination_holder,

            account_match,
            holder_match,

            proof_complete,
            possible_manipulation,

            payment_valid,

            ai_verified,
            ai_confidence,
            ai_notes,

            ai_model,
            ai_json,
            proof_hash,

            status
          )
          VALUES (
            $1,$2,$3,$4,$5,
            $6,$7,$8,$9,$10,$11,
            $12,$13,
            $14,$15,
            $16,$17,
            $18,
            $19,$20,$21,
            $22,$23,$24,
            $25
          )
          RETURNING *
          `,
          [
            module,
            reference_id,
            userId,
            expected_amount,
            proof_image_url,

            audit.detected_amount,
            audit.detected_bank,
            audit.detected_reference,
            audit.detected_sender,
            audit.detected_date,
            audit.detected_time,

            audit.destination_account,
            audit.destination_holder,

            audit.account_match,
            audit.holder_match,

            audit.proof_complete,
            audit.possible_manipulation,

            audit.payment_valid,

            audit.ai_verified,
            audit.ai_confidence,
            audit.ai_notes,

            audit.ai_model,
            audit.ai_json,
            audit.proof_hash,

            (() => {

              if (
                audit.payment_valid &&
                audit.account_match &&
                audit.holder_match &&
                audit.proof_complete &&
                !audit.possible_manipulation &&
                audit.ai_confidence >= 90
              ) {
                return 'approved';
              }

              if (
                !audit.payment_valid ||
                !audit.account_match ||
                !audit.holder_match ||
                audit.possible_manipulation ||
                audit.ai_confidence < 60
              ) {
                return 'rejected';
              }

              return 'pending';

            })(),
          ]
        );

      res.json(
        result.rows[0]
      );

    } catch (error) {
      console.error(error);

      res.status(500).json({
        error:
          'Error creando validación manual',
      });
    }
  };

module.exports = {
  getPaymentValidations,
  approvePaymentValidation,
  rejectPaymentValidation,
  deletePaymentValidation,
  recheckPaymentValidation,
  createManualPaymentValidation,
};