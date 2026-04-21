const bcrypt = require('bcrypt');
const { pool } = require('../config/db');

exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const { company_id } = req.user;

    // 🔒 validar rol permitido
    const allowedRoles = [
      'operator_sala',
      'streaming',
      'corral',
      'admin_operativo',
      'client'
    ];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }

    // 🔒 hash password
    const hash = await bcrypt.hash(password, 10);

    // 🔥 crear usuario
    const userResult = await pool.query(
      `
      INSERT INTO users (company_id, name, email, password, kyc_status)
      VALUES ($1,$2,$3,$4,'not_started')
      RETURNING id
      `,
      [company_id, name, email, hash]
    );

    const userId = userResult.rows[0].id;

    // 🔥 vincular a empresa con rol
    await pool.query(
      `
      INSERT INTO user_companies (user_id, company_id, role)
      VALUES ($1,$2,$3)
      `,
      [userId, company_id, role]
    );

    res.json({ message: 'Usuario creado correctamente' });

  } catch (error) {
    console.error('ERROR CREATE USER:', error);
    res.status(500).json({ error: 'Error creando usuario' });
  }
};

exports.getUsersByCompany = async (req, res) => {
  try {
    const { company_id } = req.user;

    const result = await pool.query(
      `
      SELECT 
        u.id,
        u.name,
        u.email,
        uc.role,
        u.kyc_status
      FROM users u
      JOIN user_companies uc ON uc.user_id = u.id
      WHERE uc.company_id = $1
      ORDER BY u.id DESC
      `,
      [company_id]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo usuarios' });
  }
};