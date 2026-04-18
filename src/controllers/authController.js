const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const { pool } = require('../config/db');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    const user = rows[0];

    if (!user) {
      return res.status(400).json({ error: 'Usuario no existe' });
    }

    // ⚠️ TEMPORAL (luego bcrypt)
    if (user.password !== password) {
      return res.status(400).json({ error: 'Password incorrecto' });
    }

    const token = jwt.sign(
      {
        user_id: user.id,
        company_id: user.company_id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error login' });
  }
};


exports.getUserCompanies = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 🔍 validar usuario
    const userResult = await pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email]
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // ⚠️ aquí debes validar password (usa tu lógica actual)

    // 🔥 traer empresas del usuario
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
      companies: companiesResult.rows
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo empresas' });
  }
};