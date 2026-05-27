const { pool } = require("../config/db");

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
exports.createRemateCompany =
  async (req, res) => {

    try {

      const {

        name,
        country,
        timezone,
        currency,
        language,

      } = req.body;

      if (
        !name ||
        !country ||
        !timezone ||
        !currency
      ) {

        return res.status(400).json({

          error:
            'Faltan campos requeridos',
        });
      }

      const result =
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

      res.json(
        result.rows[0],
      );

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
            COALESCE($4, mini_plaza_background_url)

        WHERE id = $5

        RETURNING *
        `,

        [

          name,

          logo_url,

          lobby_banner_url,

          mini_plaza_background_url,

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