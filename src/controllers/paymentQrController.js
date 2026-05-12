const { pool } = require(
  '../config/db'
);

/// 🔥 QR ACTIVO
exports.getActiveQr = async (
  req,
  res
) => {

  try {

    const qrRes =
      await pool.query(
        `
        SELECT *

        FROM payment_qrs

        WHERE is_active = true

        ORDER BY id DESC

        LIMIT 1
        `
      );

    if (
      qrRes.rows.length === 0
    ) {

      return res.status(404).json({
        error:
          'No existe QR activo'
      });
    }

    res.json(
      qrRes.rows[0]
    );

  } catch (error) {

    console.error(
      'ERROR ACTIVE QR:',
      error
    );

    res.status(500).json({
      error:
        'Error obteniendo QR'
    });
  }
};