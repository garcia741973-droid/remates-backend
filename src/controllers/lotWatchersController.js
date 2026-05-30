const { pool } = require('../config/db');

/// 🔔 SEGUIR LOTE DE REMATE
exports.watchLot = async (req, res) => {

  try {

    const userId = req.user.user_id;

    const { lot_id } = req.body;

    /// 🔥 OBTENER LOTE + EMPRESA
    const lotResult = await pool.query(
      `
      SELECT

        l.id,
        l.company_id,

        c.name AS company_name

      FROM auction_live_lots l

      JOIN companies c
        ON c.id = l.company_id

      WHERE l.id = $1
      `,
      [lot_id]
    );

    if (
      lotResult.rows.length === 0
    ) {

      return res.status(404).json({
        error: 'Lote no encontrado',
      });
    }

    const lot =
      lotResult.rows[0];

    /// 🔥 VALIDAR KYC
    const userResult =
      await pool.query(
        `
        SELECT kyc_status
        FROM users
        WHERE id = $1
        `,
        [userId]
      );

    const user =
      userResult.rows[0];

    if (
      !user ||
      user.kyc_status !== 'approved'
    ) {

      return res.json({

        action: 'kyc',
      });
    }

    /// 🔥 VALIDAR ACCESO EMPRESA
    const accessResult =
      await pool.query(
        `
        SELECT company_status
        FROM user_companies
        WHERE user_id = $1
        AND company_id = $2
        `,
        [
          userId,
          lot.company_id,
        ]
      );

    /// 🔥 NO TIENE RELACIÓN
    if (
      accessResult.rows.length === 0
    ) {

      return res.json({

        action: 'company_access',

        company_id:
          lot.company_id,

        company_name:
          lot.company_name,
      });
    }

    const access =
      accessResult.rows[0];

    /// 🔥 PENDIENTE
    if (
      access.company_status ===
      'pending'
    ) {

      return res.json({

        action:
          'pending_company_access',
      });
    }

    /// 🔥 RECHAZADO
    if (
      access.company_status !==
      'approved'
    ) {

      return res.json({

        action:
          'company_access',

        company_id:
          lot.company_id,

        company_name:
          lot.company_name,
      });
    }

    /// 🔥 CREAR WATCHER
    await pool.query(
      `
      INSERT INTO auction_lot_watchers (
        user_id,
        lot_id
      )
      VALUES ($1,$2)

      ON CONFLICT (
        user_id,
        lot_id
      )
      DO NOTHING
      `,
      [
        userId,
        lot_id,
      ]
    );

    return res.json({

      action:
        'watch_created',
    });

  } catch (error) {

    console.log(
      'WATCH LOT ERROR:',
      error,
    );

    res.status(500).json({

      error:
        'Error registrando interés',
    });
  }
};