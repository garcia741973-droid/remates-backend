const bcrypt = require('bcrypt');
const { pool } = require('../config/db');

exports.createUser = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,

      // 🔥 CAMPOS KYC (solo si es cliente)
      full_name,
      document_number,
      document_type,
      phone,
      country,
      city,
      address,
      nit,
      client_type
    } = req.body;

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

    // 🔥 VALIDAR EMAIL DUPLICADO
    const exists = await pool.query(
      `SELECT id FROM users WHERE email = $1`,
      [email]
    );

    if (exists.rows.length > 0) {
      return res.status(400).json({ error: 'Email ya registrado' });
    }

    const hash = await bcrypt.hash(password, 10);

    // 🔥 AUTO KYC SI ES CLIENTE
    const kycStatus = role === 'client' ? 'approved' : 'not_started';
    const kycLevel = role === 'client' ? 2 : 0;

    const userResult = await pool.query(
      `
      INSERT INTO users (
        company_id, name, email, password,
        full_name, phone, document_number, document_type,
        kyc_status, kyc_level, kyc_verified_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id
      `,
      [
        company_id,
        name,
        email,
        hash,
        full_name || null,
        phone || null,
        document_number || null,
        document_type || null,
        kycStatus,
        kycLevel,
        role === 'client' ? new Date() : null
      ]
    );

    const userId = userResult.rows[0].id;

    // 🔗 RELACIÓN EMPRESA
    await pool.query(
      `
      INSERT INTO user_companies (user_id, company_id, role)
      VALUES ($1,$2,$3)
      `,
      [userId, company_id, role]
    );

    // 🔥 CREAR / ACTUALIZAR KYC SI ES CLIENTE
    if (role === 'client') {
      await pool.query(
        `
        INSERT INTO user_kyc (
          user_id, full_name, document_number, document_type,
          phone, country, city, address, nit, client_type,
          submitted_at, reviewed_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now(), now())
        ON CONFLICT (user_id) DO UPDATE SET
          full_name = EXCLUDED.full_name,
          document_number = EXCLUDED.document_number,
          document_type = EXCLUDED.document_type,
          phone = EXCLUDED.phone,
          country = EXCLUDED.country,
          city = EXCLUDED.city,
          address = EXCLUDED.address,
          nit = EXCLUDED.nit,
          client_type = EXCLUDED.client_type,
          submitted_at = now(),
          reviewed_at = now()
        `,
        [
          userId,
          full_name || null,
          document_number || null,
          document_type || null,
          phone || null,
          country || null,
          city || null,
          address || null,
          nit || null,
          client_type || 'ganadero'
        ]
      );
    }

    res.json({ message: 'Usuario creado correctamente' });

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
      SELECT 
        u.id,
        u.name,
        u.full_name,
        u.email,
        u.phone,
        u.document_number,
        u.document_type,
        u.kyc_status,
        u.kyc_level,
        uc.role
      FROM users u
      JOIN user_companies uc ON uc.user_id = u.id
      WHERE uc.company_id = $1
      ORDER BY u.id DESC
      `,
      [company_id]
    );

    res.json(result.rows);

  } catch (error) {
    console.error('ERROR GET USERS:', error);
    res.status(500).json({ error: 'Error obteniendo usuarios' });
  }
};

// ✏️ EDITAR USUARIO
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      full_name,
      email,
      phone,
      document_number,
      document_type,
      password,
    } = req.body;

    const { company_id } = req.user;

    const check = await pool.query(
      `SELECT 1 FROM user_companies WHERE user_id = $1 AND company_id = $2`,
      [id, company_id]
    );

    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    await pool.query(
      `
      UPDATE users
      SET 
        name = $1,
        full_name = $2,
        email = $3,
        phone = $4,
        document_number = $5,
        document_type = $6
      WHERE id = $7
      `,
      [
        name,
        full_name,
        email,
        phone,
        document_number,
        document_type,
        id,
      ]
    );

    if (password && password.trim() !== '') {
      const hash = await bcrypt.hash(password, 10);

      await pool.query(
        `UPDATE users SET password = $1 WHERE id = $2`,
        [hash, id]
      );
    }

    res.json({ message: 'Usuario actualizado correctamente' });

  } catch (error) {
    console.error('ERROR UPDATE USER:', error);
    res.status(500).json({ error: 'Error actualizando usuario' });
  }
};

// 🗑 ELIMINAR USUARIO
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_id } = req.user;

    const check = await pool.query(
      `SELECT * FROM user_companies WHERE user_id = $1 AND company_id = $2`,
      [id, company_id]
    );

    if (check.rows.length === 0) {
      return res.status(403).json({ error: 'No autorizado' });
    }

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