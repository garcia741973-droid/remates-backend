const { pool } = require('../config/db');

const admin =
  require('../config/firebase');

const {
  sendUserNotification,
} = require('../services/notificationService');

const {
  analyzePaymentProof,
} = require('../services/paymentAiService');


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

      if (payment.status === 'approved') {
        return res.status(400).json({
          error:
            'Esta validación ya fue aprobada',
        });
      }

      await pool.query(
        `
        UPDATE payment_validations
        SET status = 'approved'
        WHERE id = $1
        `,
        [id]
      );

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
            ai_verified,
            ai_notes,
            status
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          `,
          [
            payment.reference_id,
            payment.payer_user_id,
            payment.expected_amount,
            payment.proof_image_url,
            true,
            payment.ai_notes,
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

      await pool.query(
        `
        UPDATE payment_validations
        SET status = 'rejected'
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
          'Error rechazando pago',
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
          ai_verified = $7,
          ai_confidence = $8,
          ai_notes = $9
        WHERE id = $10
        `,
        [
          aiResult.monto_detectado,
          aiResult.banco,
          aiResult.referencia,
          aiResult.nombre_emisor,
          aiResult.fecha,
          aiResult.hora,
          aiResult.pago_valido,
          aiResult.confianza,
          aiResult.notas,
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

            ai_verified,
            ai_confidence,
            ai_notes,
            status
          )
          VALUES (
            $1,$2,$3,$4,$5,
            $6,$7,$8,$9,$10,$11,
            $12,$13,$14,$15
          )
          RETURNING *
          `,
          [
            module,
            reference_id,
            userId,
            expected_amount,
            proof_image_url,

            aiResult.monto_detectado,
            aiResult.banco,
            aiResult.referencia,
            aiResult.nombre_emisor,
            aiResult.fecha,
            aiResult.hora,

            aiResult.pago_valido,
            aiResult.confianza,
            aiResult.notas,

            aiResult.pago_valido
              ? 'approved'
              : 'pending',
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
  recheckPaymentValidation,
  createManualPaymentValidation,
};