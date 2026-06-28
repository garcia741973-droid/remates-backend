const { pool } = require('../config/db');

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
        await pool.query(
          `
          UPDATE transport_negotiations
          SET status = 'paid'
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

module.exports = {
  getPaymentValidations,
  approvePaymentValidation,
  rejectPaymentValidation,
  recheckPaymentValidation,
};