const { pool } = require('../config/db');

const {

  sendCompanyAdminNotification,

  sendUserNotification,

} = require('../services/notificationService');

/// 🔥 SOLICITAR ACCESO EMPRESA
exports.requestAccess = async (
  req,
  res
) => {

  try {

    const userId =
      req.user.user_id;

    const { company_id } =
      req.body;

    /// 🔍 YA EXISTE RELACIÓN
    const existing =
      await pool.query(
        `
        SELECT *
        FROM user_companies
        WHERE user_id = $1
        AND company_id = $2
        `,
        [userId, company_id]
      );

    /// 🔥 SI YA EXISTE
    if (
      existing.rows.length > 0
    ) {

      return res.json({

        message:
          'Solicitud ya existente',
      });
    }

    /// 🔥 CREAR SOLICITUD
    await pool.query(
      `
      INSERT INTO user_companies (
        user_id,
        company_id,
        role,
        company_status
      )
      VALUES ($1,$2,$3,$4)
      `,
      [
        userId,
        company_id,
        'client',
        'pending',
      ]
    );

    await sendCompanyAdminNotification({

      companyId: company_id,

      title:
          '👤 Nuevo acceso pendiente',

      body:
          `Usuario ${userId} solicitó acceso a la empresa`,

      data: {

        type:
            'company_access_request',

        user_id:
            userId.toString(),

        company_id:
            company_id.toString(),
      },
    });    

    res.json({
      message:
        'Solicitud enviada',
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({

      error:
        'Error solicitando acceso',
    });
  }
};


/// 🔥 PENDIENTES EMPRESA
exports.getPendingAccess =
  async (req, res) => {

  try {

    const company_id =
      req.user.company_id;

    const result =
      await pool.query(
        `
        SELECT

          uc.id,
          uc.user_id,
          uc.created_at,

          u.name,
          u.email,
          u.phone,
          u.kyc_status,

          k.full_name,
          k.document_number,
          k.document_type

        FROM user_companies uc

        JOIN users u
          ON u.id = uc.user_id

        LEFT JOIN user_kyc k
          ON k.user_id = u.id

        WHERE uc.company_id = $1
        AND uc.company_status = 'pending'

        ORDER BY uc.created_at DESC
        `,
        [company_id]
      );

    res.json(
      result.rows,
    );

  } catch (error) {

    console.error(error);

    res.status(500).json({

      error:
        'Error obteniendo pendientes',
    });
  }
};


/// 🔥 APROBAR ACCESO
exports.approveAccess =
  async (req, res) => {

  try {

    const company_id =
      req.user.company_id;

    const admin_id =
      req.user.user_id;

    const { id } =
      req.params;

    const access =
        await pool.query(
      `
      SELECT user_id
      FROM user_companies
      WHERE id = $1
      `,
      [id]
    );

    const targetUserId =
        access.rows[0]?.user_id;

    await pool.query(
      `
      UPDATE user_companies

      SET
        company_status = 'approved',
        approved_at = NOW(),
        approved_by = $1

      WHERE id = $2
      AND company_id = $3
      `,
      [
        admin_id,
        id,
        company_id,
      ]
    );

    if (targetUserId) {

      await sendUserNotification({

        userId:
            targetUserId,

        title:
            '✅ Acceso aprobado',

        body:
            'Tu acceso a la rematadora fue aprobado. Ya puedes ingresar.',

        data: {

          type:
              'company_access_approved',
        },
      });
    }

    res.json({
      message:
        'Acceso aprobado',
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({

      error:
        'Error aprobando acceso',
    });
  }
};

/// 🔥 MI ESTADO EMPRESA
exports.getMyCompanyAccess =
  async (req, res) => {

  try {

    const user_id =
      req.user.user_id;

    /// 🔥 AHORA VIENE DEL FRONT
    const { company_id } =
      req.body;

    const result =
      await pool.query(
        `
        SELECT

          uc.company_status,

          u.kyc_status,

          u.kyc_level

        FROM user_companies uc

        JOIN users u
          ON u.id = uc.user_id

        WHERE uc.user_id = $1
        AND uc.company_id = $2
        `,
        [user_id, company_id]
      );

    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({

        error:
          'Sin relación empresa',
      });
    }

    res.json(
      result.rows[0],
    );

  } catch (error) {

    console.error(error);

    res.status(500).json({

      error:
        'Error obteniendo estado',
    });
  }
};