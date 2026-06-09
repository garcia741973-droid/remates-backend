const { pool } = require('../config/db');
const bcrypt = require('bcrypt');

const {
  sendResetCode,
} = require('../services/emailService');

/// 🔹 GENERAR CÓDIGO 6 DÍGITOS
function generateCode() {

  return Math.floor(
    100000 + Math.random() * 900000
  ).toString();
}

/// ======================================================
/// 🔹 1. SOLICITAR CÓDIGO
/// ======================================================

exports.requestResetCode =
async (req, res) => {

  try {

    const { email } = req.body;

    if (!email) {

      return res.status(400).json({

        error: 'Email requerido',
      });
    }

    const userResult =
      await pool.query(
        `
        SELECT id
        FROM users
        WHERE email = $1
        AND is_active = true
        `,
        [email]
      );

    if (
      userResult.rows.length === 0
    ) {

      return res.json({
        success: true,
      });
    }

    const code =
      generateCode();

    const expiresAt =
      new Date(
        Date.now() +
        10 * 60 * 1000
      );

    await pool.query(
      `
      INSERT INTO password_reset_codes (

        email,
        code,
        expires_at

      )

      VALUES (

        $1,
        $2,
        $3

      )
      `,
      [
        email,
        code,
        expiresAt,
      ]
    );

    await sendResetCode(
      email,
      code,
    );

    return res.json({
      success: true,
    });

  } catch (e) {

    console.log(
      'REQUEST RESET ERROR:',
      e,
    );

    return res.status(500).json({

      error:
        'Error enviando código',
    });
  }
};


/// ======================================================
/// 🔹 2. VALIDAR CÓDIGO
/// ======================================================

exports.verifyResetCode =
async (req, res) => {

  try {

    const {
      email,
      code,
    } = req.body;

    const result =
      await pool.query(
        `
        SELECT *
        FROM password_reset_codes

        WHERE email = $1
        AND code = $2
        AND used = false

        ORDER BY id DESC

        LIMIT 1
        `,
        [
          email,
          code,
        ]
      );

    if (
      result.rows.length === 0
    ) {

      return res.status(400).json({

        error:
          'Código inválido',
      });
    }

    const reset =
      result.rows[0];

    if (
      new Date() >
      new Date(
        reset.expires_at
      )
    ) {

      return res.status(400).json({

        error:
          'Código expirado',
      });
    }

    return res.json({
      success: true,
    });

  } catch (e) {

    console.log(
      'VERIFY CODE ERROR:',
      e,
    );

    return res.status(500).json({

      error:
        'Error validando código',
    });
  }
};


/// ======================================================
/// 🔹 3. NUEVA CONTRASEÑA
/// ======================================================

exports.setNewPassword =
async (req, res) => {

  try {

    const {
      email,
      code,
      new_password,
    } = req.body;

    const result =
      await pool.query(
        `
        SELECT *
        FROM password_reset_codes

        WHERE email = $1
        AND code = $2
        AND used = false

        ORDER BY id DESC

        LIMIT 1
        `,
        [
          email,
          code,
        ]
      );

    if (
      result.rows.length === 0
    ) {

      return res.status(400).json({

        error:
          'Código inválido',
      });
    }

    const reset =
      result.rows[0];

    if (
      new Date() >
      new Date(
        reset.expires_at
      )
    ) {

      return res.status(400).json({

        error:
          'Código expirado',
      });
    }

    const hashedPassword =
      await bcrypt.hash(
        new_password,
        10,
      );

    await pool.query(
      `
      UPDATE users

      SET password = $1

      WHERE email = $2
      `,
      [
        hashedPassword,
        email,
      ]
    );

    await pool.query(
      `
      UPDATE password_reset_codes

      SET used = true

      WHERE id = $1
      `,
      [
        reset.id,
      ]
    );

    return res.json({
      success: true,
    });

  } catch (e) {

    console.log(
      'SET PASSWORD ERROR:',
      e,
    );

    return res.status(500).json({

      error:
        'Error actualizando contraseña',
    });
  }
};