const bcrypt = require('bcrypt');
const { pool } = require('../config/db');

exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const { company_id } = req.user;

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

    const hash = await bcrypt.hash(password, 10);

    const userResult = await pool.query(
      `
      INSERT INTO users (company_id, name, email, password, kyc_status)
      VALUES ($1,$2,$3,$4,'not_started')
      RETURNING id
      `,
      [company_id, name, email, hash]
    );

    const userId = userResult.rows[0].id;

    await pool.query(
      `
      INSERT INTO user_companies (user_id, company_id, role)
      VALUES ($1,$2,$3)
      `,
      [userId, company_id, role]
    );

    res.json({ message: 'Usuario creado' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creando usuario' });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const { company_id } = req.user;

    const result = await pool.query(
      `
      SELECT u.id, u.name, u.email, uc.role, u.kyc_status
      FROM users u
      JOIN user_companies uc ON uc.user_id = u.id
      WHERE uc.company_id = $1
      ORDER BY u.id DESC
      `,
      [company_id]
    );

    res.json(result.rows);

  } catch (error) {
    res.status(500).json({ error: 'Error' });
  }
};

// ✏️ EDITAR USUARIO
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role } = req.body;
    const { company_id } = req.user;

    // validar pertenencia
    const check = await pool.query(
      `SELECT * FROM user_companies WHERE user_id = $1 AND company_id = $2`,
      [id, company_id]
    );

    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    // actualizar datos
    await pool.query(
      `UPDATE users SET name = $1, email = $2 WHERE id = $3`,
      [name, email, id]
    );

    // actualizar rol
    await pool.query(
      `UPDATE user_companies SET role = $1 WHERE user_id = $2 AND company_id = $3`,
      [role, id, company_id]
    );

    res.json({ message: 'Usuario actualizado' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error actualizando usuario' });
  }
};


// 🗑 ELIMINAR USUARIO
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_id } = req.user;

    // validar pertenencia
    const check = await pool.query(
      `SELECT * FROM user_companies WHERE user_id = $1 AND company_id = $2`,
      [id, company_id]
    );

    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    // borrar relación
    await pool.query(
      `DELETE FROM user_companies WHERE user_id = $1 AND company_id = $2`,
      [id, company_id]
    );

    res.json({ message: 'Usuario eliminado de la empresa' });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error eliminando usuario' });
  }
};