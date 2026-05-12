const { pool } = require('../config/db');

const startQrExpirationService =
  () => {

  console.log(
    '🟠 QR EXPIRATION SERVICE STARTED'
  );

  setInterval(async () => {

    try {

      const result =
        await pool.query(
          `
          SELECT *
          FROM payment_qrs
          WHERE is_active = true
          AND valid_until IS NOT NULL
          LIMIT 1
          `
        );

      if (
        result.rows.length === 0
      ) {

        return;
      }

      const qr =
        result.rows[0];

      const now =
        new Date();

      const validUntil =
        new Date(
          qr.valid_until
        );

      const diffMs =
        validUntil - now;

      const diffDays =
        Math.ceil(
          diffMs /
          (1000 * 60 * 60 * 24)
        );

      console.log(
        `🧠 QR vence en ${diffDays} días`
      );

      /// 🚨 ALERTA
      if (diffDays <= 7) {

        console.log(
          '🚨 ALERTA: QR próximo a vencer'
        );
      }

      /// ❌ EXPIRADO
      if (diffDays <= 0) {

        console.log(
          '❌ QR EXPIRADO'
        );

        await pool.query(
          `
          UPDATE payment_qrs
          SET is_active = false
          WHERE id = $1
          `,
          [qr.id]
        );
      }

    } catch (error) {

      console.log(
        '❌ ERROR QR SERVICE:',
        error
      );
    }

  }, 1000 * 60 * 60 * 6);

  /// cada 6 horas
};

module.exports = {
  startQrExpirationService,
};