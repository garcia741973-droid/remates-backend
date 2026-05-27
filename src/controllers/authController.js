const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');


// 🔐 LOGIN FINAL (YA CON company_id)
exports.login = async (req, res) => {
  try {
    const { email, password, company_id } = req.body;

    // 🔍 Buscar usuario
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    const user = rows[0];

    if (!user) {
      return res.status(400).json({ error: 'Usuario no existe' });
    }

    // 🔐 VALIDACIÓN PASSWORD (bcrypt + compatibilidad)
    let validPassword = false;

    if (user.password && user.password.startsWith('$2b$')) {
      // 🔒 bcrypt (nuevo)
      validPassword = await bcrypt.compare(password, user.password);
    } else {
      // ⚠️ texto plano (compatibilidad temporal)
      validPassword = user.password === password;
    }

    if (!validPassword) {
      return res.status(400).json({ error: 'Password incorrecto' });
    }

    /// 🔴 SUPER ADMIN (SIN EMPRESA)
    /// 🔴 SUPER ADMIN
    if (user.role === 'super_admin') {

      const token = jwt.sign(
        {
          user_id: user.id,

          company_id: user.company_id,

          role: user.role,
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({

        token,

        role: user.role,

        company_id: user.company_id,
      });
    }  


    /// 🔥 SI NO VIENE company_id
    /// SOLO VALIDAR LOGIN
    /// Y DEVOLVER EMPRESAS

    if (!company_id) {

      const companiesResult = await pool.query(
        `
        SELECT c.id, c.name
        FROM user_companies uc
        JOIN companies c ON c.id = uc.company_id
        WHERE uc.user_id = $1
        `,
        [user.id]
      );

      return res.json({
        companies: companiesResult.rows,
      });
    }


    // 🔥 VALIDAR QUE EL USUARIO PERTENECE A ESA EMPRESA
    const companyCheck = await pool.query(
      `
      SELECT
        role,
        company_status

      FROM user_companies

      WHERE user_id = $1
      AND company_id = $2
      `,
      [user.id, company_id]
    );

    if (companyCheck.rows.length === 0) {
      return res.status(403).json({ error: 'No pertenece a esta empresa' });
    }

    /// 🔥 VALIDAR AUTORIZACIÓN EMPRESA
    if (
      companyCheck.rows[0].company_status !== 'approved'
    ) {

      return res.status(403).json({

        error:
          'Pendiente de aprobación por la empresa',
      });
    }    

    const role = companyCheck.rows[0].role;
    const seller_status = user.seller_status || 'none';

    // 🔐 GENERAR TOKEN
    const token = jwt.sign(
      {
        user_id: user.id,
        company_id,
        role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user_id: user.id,
      company_id,
      role,
      seller_status,
    });

  } catch (error) {
    console.error('LOGIN ERROR:', error);
    res.status(500).json({ error: 'Error login' });
  }
};



  // 🔥 OBTENER EMPRESAS DEL USUARIO (ANTES DEL LOGIN FINAL)
  exports.getUser = async (req, res) => {
    try {
      const { email, password } = req.body;

      const userResult = await pool.query(
        `SELECT * FROM users WHERE email = $1`,
        [email]
      );

      const user = userResult.rows[0];

      if (!user) {
        return res.status(404).json({
          error: 'Usuario no encontrado'
        });
      }

      // 🔐 VALIDACIÓN PASSWORD
      let validPassword = false;

      if (
        user.password &&
        user.password.startsWith('$2b$')
      ) {

        validPassword = await bcrypt.compare(
          password,
          user.password,
        );

      } else {

        validPassword =
            user.password === password;
      }

      if (!validPassword) {
        return res.status(400).json({
          error: 'Password incorrecto'
        });
      }

      // 🔥 TRAER EMPRESAS
      const companiesResult = await pool.query(
        `
        SELECT c.id, c.name
        FROM user_companies uc
        JOIN companies c
          ON c.id = uc.company_id
        WHERE uc.user_id = $1
        `,
        [user.id]
      );

      return res.json({
        user_id: user.id,
        companies: companiesResult.rows,
      });

    } catch (error) {

      console.error(
        'GET USER ERROR:',
        error,
      );

      res.status(500).json({
        error: 'Error obteniendo empresas'
      });
    }
  };



// 🔥 GUARDAR FCM TOKEN
exports.saveFcmToken = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    const { fcm_token } = req.body;

    console.log("🔥 GUARDANDO TOKEN...");
    console.log("👤 USER ID 👉", user_id);
    console.log("📲 TOKEN 👉", fcm_token);    

    if (!fcm_token) {
      return res.status(400).json({ error: 'Token requerido' });
    }

    await pool.query(
      `
      INSERT INTO devices (user_id, fcm_token)
      VALUES ($1, $2)

      ON CONFLICT (fcm_token)

      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        updated_at = NOW()
      `,
      [user_id, fcm_token]
    );

    res.json({ message: 'Token guardado' });

  } catch (error) {
    console.error('SAVE FCM ERROR:', error);
    res.status(500).json({ error: 'Error guardando token' });
  }
};

/// 🔥 REGISTER PARTICIPANT
exports.registerParticipant =
  async (req, res) => {

  try {

    const {
      email,
      password,
      company_id,
    } = req.body;

    if (
      !email ||
      !password
    ) {

      return res.status(400).json({

        error:
          'Email y password requeridos',
      });
    }

    /// 🔍 BUSCAR EXISTENTE
    const existing =
        await pool.query(

      `
      SELECT

        u.id,

        u.email,

        COALESCE(

          uk.kyc_status,

          u.kyc_status,

          'not_started'

        ) AS kyc_status

      FROM users u

      LEFT JOIN user_kyc uk
      ON uk.user_id = u.id

      WHERE u.email = $1
      `,
      [email]
    );

    /// 🔥 YA EXISTE
    if (
      existing.rows.length > 0
    ) {

      const user =
          existing.rows[0];

      /// 🔍 VERIFICAR RELACIÓN EMPRESA
      const companyCheck =
          await pool.query(

        `
        SELECT
          company_status
        FROM user_companies
        WHERE user_id = $1
        AND company_id = $2
        `,
        [
          user.id,
          company_id,
        ],
      );

      let company_access =
          'none';

      if (
        companyCheck.rows.length > 0
      ) {

        company_access =
            companyCheck.rows[0]
                .company_status;
      }

      /// 🔐 TOKEN
      const token = jwt.sign(

        {

          user_id:
              user.id,

          role: 'client',
        },

        process.env.JWT_SECRET,

        {
          expiresIn: '7d',
        },
      );

      return res.json({

        token,

        role: 'client',

        existing_user: true,

        kyc_status:
            user.kyc_status,

        company_access,
      });
    }

    /// 🔐 HASH PASSWORD
    const hashed =
        await bcrypt.hash(
      password,
      10,
    );

    /// 🔥 CREAR USER
    const created =
        await pool.query(

      `
      INSERT INTO users (

        email,
        password,
        role,
        kyc_status

      )

      VALUES (

        $1,
        $2,
        'client',
        'incomplete'

      )

      RETURNING
        id,
        email,
        role,
        kyc_status
      `,

      [
        email,
        hashed,
      ],
    );

    const user =
        created.rows[0];

    /// 🔐 TOKEN
    const token = jwt.sign(

      {

        user_id:
            user.id,

        role:
            user.role,
      },

      process.env.JWT_SECRET,

      {
        expiresIn: '7d',
      },
    );

    res.json({

      token,

      user_id:
          user.id,

      role:
          user.role,

      kyc_status:
          user.kyc_status,

      existing_user: false,
    });

  } catch (e) {

    console.log(
      'REGISTER PARTICIPANT ERROR:',
      e,
    );

    res.status(500).json({

      error:
          'Error registrando participante',
    });
  }
};