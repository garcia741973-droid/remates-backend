const { pool } = require("../config/db");
const bcrypt = require('bcrypt');

exports.getAllUsers = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ error: "No autorizado" });
    }

  const result = await pool.query(`
    SELECT 
      u.id,
      u.name,
      u.email,
      u.phone,
      u.role,
      u.kyc_status,
      u.seller_status,
      u.created_at,
      c.id as company_id,
      c.name as company_name
    FROM users u
    LEFT JOIN user_companies uc ON uc.user_id = u.id
    LEFT JOIN companies c ON c.id = uc.company_id
    WHERE u.role IN ('client', 'admin', 'super_admin')
    ORDER BY u.created_at DESC
  `);

    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error obteniendo usuarios" });
  }
};

/// 🔥 CREAR EMPRESA REMATERA
/// 🔥 CREAR EMPRESA REMATERA
exports.createRemateCompany =
  async (req, res) => {

    try {

      const {

        name,
        country,
        timezone,
        currency,
        language,

        admin_email,
        admin_password,

      } = req.body;

      if (

        !name ||
        !country ||
        !timezone ||
        !currency ||
        !admin_email ||
        !admin_password

      ) {

        return res.status(400).json({

          error:
            'Faltan campos requeridos',
        });
      }

      /// =====================================================
      /// 🔍 VALIDAR EMAIL
      /// =====================================================

      const existing =
          await pool.query(

        `
        SELECT id
        FROM users
        WHERE email = $1
        `,

        [admin_email],
      );

      if (
        existing.rows.length > 0
      ) {

        return res.status(400).json({

          error:
            'El email ya existe',
        });
      }

      /// =====================================================
      /// 🔥 CREAR EMPRESA
      /// =====================================================

      const companyResult =
          await pool.query(

        `
        INSERT INTO companies (

          name,
          country,
          timezone,
          currency,
          language,
          is_active

        )

        VALUES (

          $1,
          $2,
          $3,
          $4,
          $5,
          true

        )

        RETURNING *
        `,

        [

          name,
          country,
          timezone,
          currency,
          language || 'es',
        ],
      );

      const company =
          companyResult.rows[0];

      /// =====================================================
      /// 🔐 HASH PASSWORD
      /// =====================================================

      const hashed =
          await bcrypt.hash(
        admin_password,
        10,
      );

      /// =====================================================
      /// 🔥 CREAR ADMIN
      /// =====================================================

      const userResult =
          await pool.query(

        `
        INSERT INTO users (

          email,
          password,
          role,
          kyc_status,
          kyc_level

        )

        VALUES (

          $1,
          $2,
          'admin',
          'approved',
          2

        )

        RETURNING *
        `,

        [
          admin_email,
          hashed,
        ],
      );

      const user =
          userResult.rows[0];

      /// =====================================================
      /// 🔥 RELACIÓN EMPRESA
      /// =====================================================

      await pool.query(

        `
        INSERT INTO user_companies (

          user_id,
          company_id,
          role,
          company_status,
          approved_at

        )

        VALUES (

          $1,
          $2,
          'admin',
          'approved',
          NOW()

        )
        `,

        [
          user.id,
          company.id,
        ],
      );

      /// =====================================================
      /// ✅ RESPUESTA
      /// =====================================================

      res.json({

        success: true,

        company,
        admin_user: {

          id: user.id,
          email: user.email,
        },
      });

    } catch (e) {

      console.log(
        'CREATE REMATE COMPANY ERROR:',
        e,
      );

      res.status(500).json({

        error:
          'Error creando empresa',
      });
    }
  };
/// 🔥 UPDATE EMPRESA REMATERA
exports.updateRemateCompany =
  async (req, res) => {

    try {

      const { id } =
          req.params;

      const {

        name,

        logo_url,

        lobby_banner_url,

        mini_plaza_background_url,

        remates_pro_enabled,

      } = req.body;

      const result =
          await pool.query(

        `
        UPDATE companies
        SET

          name = COALESCE($1, name),

          logo_url = COALESCE($2, logo_url),

          lobby_banner_url =
            COALESCE($3, lobby_banner_url),

          mini_plaza_background_url =
            COALESCE($4, mini_plaza_background_url),

          remates_pro_enabled =
            COALESCE(
              $5,
              remates_pro_enabled
            )

        WHERE id = $6

        RETURNING *
        `,

        [
          name,

          logo_url,

          lobby_banner_url,

          mini_plaza_background_url,

          remates_pro_enabled,

          id,
        ],
      );

      res.json(
        result.rows[0],
      );

    } catch (e) {

      console.log(
        'UPDATE REMATE COMPANY ERROR:',
        e,
      );

      res.status(500).json({

        error:
          'Error actualizando empresa',
      });
    }
  };