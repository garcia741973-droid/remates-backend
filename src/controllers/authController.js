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
    if (user.role === 'super_admin') {

      const token = jwt.sign(
        {
          user_id: user.id,
          role: user.role,
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return res.json({
        token,
        role: user.role,
      });
    }    

    // 🔥 VALIDAR QUE EL USUARIO PERTENECE A ESA EMPRESA
    const companyCheck = await pool.query(
      `
      SELECT role FROM user_companies
      WHERE user_id = $1 AND company_id = $2
      `,
      [user.id, company_id]
    );

    if (companyCheck.rows.length === 0) {
      return res.status(403).json({ error: 'No pertenece a esta empresa' });
    }

    const role = companyCheck.rows[0].role;

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
      company_id,
      role,
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
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // 🔐 VALIDACIÓN PASSWORD (bcrypt + compatibilidad)
    let validPassword = false;

    if (user.password && user.password.startsWith('$2b$')) {
      validPassword = await bcrypt.compare(password, user.password);
    } else {
      validPassword = user.password === password;
    }

    if (!validPassword) {
      return res.status(400).json({ error: 'Password incorrecto' });
    }

    // 🔥 TRAER EMPRESAS
    const companiesResult = await pool.query(
      `
      SELECT c.id, c.name
      FROM user_companies uc
      JOIN companies c ON c.id = uc.company_id
      WHERE uc.user_id = $1
      `,
      [user.id]
    );

    res.json({
      user_id: user.id,
      companies: companiesResult.rows,
    });

  } catch (error) {
    console.error('GET USER ERROR:', error);
    res.status(500).json({ error: 'Error obteniendo empresas' });
  }
};