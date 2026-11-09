'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');

const router = express.Router();

// La clave entre servidores y el rate-limit general se aplican en
// minicoreIdentityRoutes.js antes de montar este router.
router.post('/', async (req, res) => {
  if (process.env.MINICORE_ESTANCIA_REGISTER_ENABLED !== 'true') {
    return res.status(503).json({ error: 'Registro no habilitado' });
  }

  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' ||
      email.length > 150 || Buffer.byteLength(password, 'utf8') < 10 ||
      Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: 'Datos de registro invalidos' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
      normalizedEmail.length > 150) {
    return res.status(400).json({ error: 'Datos de registro invalidos' });
  }

  try {
    const existing = await pool.query(
      'SELECT id FROM public.users WHERE LOWER(TRIM(email)) = $1 LIMIT 1',
      [normalizedEmail]
    );
    if (existing.rows.length) {
      return res.status(409).json({ error: 'Este correo ya tiene una cuenta' });
    }

    const hash = await bcrypt.hash(password, 12);
    const created = await pool.query(
      `INSERT INTO public.users (email, password, role, kyc_status, is_active)
       VALUES ($1, $2, 'client', 'not_started', true)
       RETURNING id`,
      [normalizedEmail, hash]
    );

    return res.status(201).json({ success: true, user_id: created.rows[0].id });
  } catch (error) {
    if (error && error.code === '23505') {
      return res.status(409).json({ error: 'Este correo ya tiene una cuenta' });
    }
    // No registrar el correo, la contraseña ni el hash.
    console.error('MINICORE IDENTITY REGISTER ERROR');
    return res.status(500).json({ error: 'No se pudo crear la cuenta' });
  }
});

module.exports = router;
