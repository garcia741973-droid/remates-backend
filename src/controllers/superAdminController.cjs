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

exports.getUserDetail = async (req, res) => {

  try {

    if (req.user.role !== 'super_admin') {

      return res.status(403).json({
        error: 'No autorizado',
      });
    }

    const { id } = req.params;

    const result = await pool.query(

      `
      SELECT

        u.*,

        c.name AS company_name,
        uc.role AS company_role,
        'PRUEBA123' AS debug_field,

        k.full_name,
        k.document_number,
        k.document_type,
        k.phone,
        k.country,
        k.city,
        k.address,
        k.nit,
        k.client_type,

        k.document_front_url,
        k.document_back_url,
        k.video_url,

        k.submitted_at,
        k.reviewed_at,
        k.rejection_reason

      FROM users u

      LEFT JOIN user_companies uc
        ON uc.user_id = u.id

      LEFT JOIN companies c
        ON c.id = uc.company_id

      LEFT JOIN user_kyc k
        ON k.user_id = u.id

      WHERE u.id = $1
      `,
      [id],
    );

    if (
      result.rows.length == 0
    ) {

      return res.status(404).json({
        error: 'Usuario no encontrado',
      });
    }

    res.json(
      result.rows[0],
    );

  } catch (e) {

    console.log(
      'GET USER DETAIL ERROR:',
      e,
    );

    res.status(500).json({

      error:
          'Error obteniendo usuario',
    });
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

// =========================================================
// 🏭 FRIGORÍFICOS — CONTROL EXCLUSIVO SUPER ADMIN
// =========================================================


// =========================================================
// 📋 LISTAR FRIGORÍFICOS
// GET /superadmin/slaughterhouses
// =========================================================

exports.getSlaughterhouses =
  async (req, res) => {

    try {

      if (
        req.user.role !==
        'super_admin'
      ) {

        return res
          .status(403)
          .json({
            error:
              'No autorizado',
          });
      }


      const result =
          await pool.query(
        `
        SELECT

          c.id,

          c.name,

          c.company_type,

          c.country,

          c.timezone,

          c.currency,

          c.is_active,

          c.created_at,

          COUNT(
            CASE
              WHEN uc.company_status = 'approved'
              THEN 1
            END
          )::int
          AS authorized_users

        FROM companies c

        LEFT JOIN user_companies uc
          ON uc.company_id = c.id

        WHERE
          c.company_type =
            'slaughterhouse'

        GROUP BY
          c.id,
          c.name,
          c.company_type,
          c.country,
          c.timezone,
          c.currency,
          c.is_active,
          c.created_at

        ORDER BY
          c.name ASC
        `
      );


      res.json(
        result.rows,
      );

    } catch (e) {

      console.log(
        'GET SLAUGHTERHOUSES ERROR:',
        e,
      );

      res.status(500).json({
        error:
          'Error obteniendo frigoríficos',
      });
    }
  };


// =========================================================
// 👥 USUARIOS AUTORIZADOS DEL FRIGORÍFICO
// GET /superadmin/slaughterhouses/:id/users
// =========================================================

exports.getSlaughterhouseUsers =
  async (req, res) => {

    try {

      if (
        req.user.role !==
        'super_admin'
      ) {

        return res
          .status(403)
          .json({
            error:
              'No autorizado',
          });
      }


      const {
        id,
      } = req.params;


      // -----------------------------------------------------
      // VALIDAR QUE SEA FRIGORÍFICO
      // -----------------------------------------------------

      const companyResult =
          await pool.query(
        `
        SELECT
          id,
          name,
          company_type,
          is_active

        FROM companies

        WHERE
          id = $1
          AND company_type =
            'slaughterhouse'

        LIMIT 1
        `,
        [
          id,
        ],
      );


      if (
        companyResult.rows.length ===
        0
      ) {

        return res
          .status(404)
          .json({
            error:
              'Frigorífico no encontrado',
          });
      }


      const usersResult =
          await pool.query(
        `
        SELECT

          uc.id
            AS user_company_id,

          uc.user_id,

          u.name,

          u.full_name,

          u.email,

          u.phone,

          u.role
            AS global_role,

          uc.role
            AS company_role,

          uc.company_status,

          uc.approved_at,

          uc.approved_by,

          uc.created_at

        FROM user_companies uc

        JOIN users u
          ON u.id = uc.user_id

        WHERE
          uc.company_id = $1

        ORDER BY
          u.email ASC
        `,
        [
          id,
        ],
      );


      res.json({

        company:
          companyResult.rows[0],

        users:
          usersResult.rows,
      });

    } catch (e) {

      console.log(
        'GET SLAUGHTERHOUSE USERS ERROR:',
        e,
      );

      res.status(500).json({
        error:
          'Error obteniendo usuarios del frigorífico',
      });
    }
  };


// =========================================================
// ➕ AGREGAR USUARIO EXISTENTE A FRIGORÍFICO
// POST /superadmin/slaughterhouses/:id/users
//
// BODY:
// {
//   "user_id": 2
// }
// =========================================================

exports.addSlaughterhouseUser =
  async (req, res) => {

    const client =
        await pool.connect();

    try {

      if (
        req.user.role !==
        'super_admin'
      ) {

        return res
          .status(403)
          .json({
            error:
              'No autorizado',
          });
      }


      const {
        id,
      } = req.params;


      const {
        user_id,
      } = req.body;


      if (!user_id) {

        return res
          .status(400)
          .json({
            error:
              'user_id requerido',
          });
      }


      await client.query(
        'BEGIN',
      );


      // -----------------------------------------------------
      // VALIDAR FRIGORÍFICO
      // -----------------------------------------------------

      const companyResult =
          await client.query(
        `
        SELECT
          id,
          name,
          company_type,
          is_active

        FROM companies

        WHERE
          id = $1
          AND company_type =
            'slaughterhouse'

        LIMIT 1
        `,
        [
          id,
        ],
      );


      if (
        companyResult.rows.length ===
        0
      ) {

        await client.query(
          'ROLLBACK',
        );

        return res
          .status(404)
          .json({
            error:
              'Frigorífico no encontrado',
          });
      }


      // -----------------------------------------------------
      // VALIDAR USUARIO GLOBAL
      // -----------------------------------------------------

      const userResult =
          await client.query(
        `
        SELECT
          id,
          email,
          role

        FROM users

        WHERE
          id = $1

        LIMIT 1
        `,
        [
          user_id,
        ],
      );


      if (
        userResult.rows.length ===
        0
      ) {

        await client.query(
          'ROLLBACK',
        );

        return res
          .status(404)
          .json({
            error:
              'Usuario no encontrado',
          });
      }


      // -----------------------------------------------------
      // VERIFICAR SI YA EXISTE RELACIÓN
      // -----------------------------------------------------

      const existingResult =
          await client.query(
        `
        SELECT
          id,
          company_status

        FROM user_companies

        WHERE
          user_id = $1
          AND company_id = $2

        LIMIT 1
        `,
        [
          user_id,
          id,
        ],
      );


      let relation;


      if (
        existingResult.rows.length >
        0
      ) {

        // ---------------------------------------------------
        // YA EXISTÍA:
        // REACTIVAMOS / APROBAMOS
        // ---------------------------------------------------

        const updateResult =
            await client.query(
          `
          UPDATE user_companies

          SET
            role = 'client',
            company_status =
              'approved',
            approved_at = NOW(),
            approved_by = $1,
            rejection_reason = NULL

          WHERE id = $2

          RETURNING *
          `,
          [
            req.user.user_id,
            existingResult
              .rows[0].id,
          ],
        );


        relation =
          updateResult.rows[0];

      } else {

        // ---------------------------------------------------
        // NUEVA RELACIÓN
        // ---------------------------------------------------

        const insertResult =
            await client.query(
          `
          INSERT INTO
            user_companies (

              user_id,

              company_id,

              role,

              company_status,

              approved_at,

              approved_by

            )

          VALUES (

            $1,

            $2,

            'client',

            'approved',

            NOW(),

            $3

          )

          RETURNING *
          `,
          [
            user_id,
            id,
            req.user.user_id,
          ],
        );


        relation =
          insertResult.rows[0];
      }


      await client.query(
        'COMMIT',
      );


      res.json({

        success: true,

        message:
          'Usuario autorizado en el frigorífico',

        company:
          companyResult.rows[0],

        user:
          userResult.rows[0],

        relation,
      });

    } catch (e) {

      await client.query(
        'ROLLBACK',
      );

      console.log(
        'ADD SLAUGHTERHOUSE USER ERROR:',
        e,
      );

      res.status(500).json({
        error:
          'Error autorizando usuario en frigorífico',
      });

    } finally {

      client.release();
    }
  };


// =========================================================
// ➖ QUITAR ACCESO A FRIGORÍFICO
// DELETE /superadmin/slaughterhouses/:id/users/:userId
//
// NO BORRA AL USUARIO GLOBAL.
// SOLO BORRA LA RELACIÓN CON ESTE FRIGORÍFICO.
// =========================================================

exports.removeSlaughterhouseUser =
  async (req, res) => {

    try {

      if (
        req.user.role !==
        'super_admin'
      ) {

        return res
          .status(403)
          .json({
            error:
              'No autorizado',
          });
      }


      const {
        id,
        userId,
      } = req.params;


      // -----------------------------------------------------
      // VALIDAR FRIGORÍFICO
      // -----------------------------------------------------

      const companyResult =
          await pool.query(
        `
        SELECT
          id,
          name

        FROM companies

        WHERE
          id = $1
          AND company_type =
            'slaughterhouse'

        LIMIT 1
        `,
        [
          id,
        ],
      );


      if (
        companyResult.rows.length ===
        0
      ) {

        return res
          .status(404)
          .json({
            error:
              'Frigorífico no encontrado',
          });
      }


      // -----------------------------------------------------
      // ELIMINAR SOLO RELACIÓN
      // -----------------------------------------------------

      const result =
          await pool.query(
        `
        DELETE FROM user_companies

        WHERE
          company_id = $1
          AND user_id = $2

        RETURNING
          id,
          user_id,
          company_id
        `,
        [
          id,
          userId,
        ],
      );


      if (
        result.rows.length ===
        0
      ) {

        return res
          .status(404)
          .json({
            error:
              'El usuario no pertenece a este frigorífico',
          });
      }


      res.json({

        success: true,

        message:
          'Acceso al frigorífico eliminado',

        removed:
          result.rows[0],
      });

    } catch (e) {

      console.log(
        'REMOVE SLAUGHTERHOUSE USER ERROR:',
        e,
      );

      res.status(500).json({
        error:
          'Error quitando acceso al frigorífico',
      });
    }
  };  