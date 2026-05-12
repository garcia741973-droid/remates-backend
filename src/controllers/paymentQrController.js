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

        AND (
        valid_until IS NULL
        OR valid_until > NOW()
        )

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

/// 🔥 CREAR QR
exports.createQr = async (
  req,
  res
) => {

  try {

    const {
      qr_image_url,
      amount,
    } = req.body;

    if (!qr_image_url) {

      return res.status(400).json({
        error:
          'QR requerido'
      });
    }

    /// 🔥 DESACTIVAR TODOS
    await pool.query(
      `
      UPDATE payment_qrs
      SET is_active = false
      `
    );

    /// 🔥 CREAR NUEVO
    const { rows } =
      await pool.query(
        `
        INSERT INTO payment_qrs
        (
        qr_image_url,
        amount,
        is_active,
        valid_from,
        valid_until
        )
        VALUES
        (
        $1,
        $2,
        true,
        NOW(),
        NOW() + INTERVAL '30 days'
        )
        RETURNING *
        `,
        [
          qr_image_url,
          amount || 70,
        ]
      );

    res.json(rows[0]);

  } catch (error) {

    console.error(
      'ERROR CREATE QR:',
      error
    );

    res.status(500).json({
      error:
        'Error creando QR'
    });
  }
};

/// 🔥 LISTAR QRS
exports.getAllQrs = async (
  req,
  res
) => {

  try {

    const { rows } =
      await pool.query(
        `
        SELECT *
        FROM payment_qrs
        ORDER BY id DESC
        `
      );

    res.json(rows);

  } catch (error) {

    console.error(
      'ERROR GET QRS:',
      error
    );

    res.status(500).json({
      error:
        'Error obteniendo QRs'
    });
  }
};

/// 🔥 ACTIVAR QR
exports.activateQr = async (
  req,
  res
) => {

  try {

    const { id } =
      req.params;

    /// 🔥 DESACTIVAR TODOS
    await pool.query(
      `
      UPDATE payment_qrs
      SET is_active = false
      `
    );

    /// 🔥 ACTIVAR
    await pool.query(
      `
      UPDATE payment_qrs
      SET is_active = true
      WHERE id = $1
      `,
      [id]
    );

    res.json({
      success: true
    });

  } catch (error) {

    console.error(
      'ERROR ACTIVATE QR:',
      error
    );

    res.status(500).json({
      error:
        'Error activando QR'
    });
  }
};