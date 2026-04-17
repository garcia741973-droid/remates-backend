const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

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