'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const { rateLimit } = require('express-rate-limit');
const { pool } = require('../config/db');

const router = express.Router();

// Comparacion en tiempo constante de hashes de longitud fija.
function secureEquals(a, b) {
  const hashA = crypto.createHash('sha256')
    .update(String(a)).digest();
  const hashB = crypto.createHash('sha256')
    .update(String(b)).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

// Esta ruta es exclusivamente para comunicacion backend a backend.
function requireServiceKey(req, res, next) {
  const expected = process.env.MINICORE_IDENTITY_SERVICE_KEY;

  if (!expected || expected.length < 32) {
    return res.status(503).json({
      error: 'Servicio de identidad no configurado',
    });
  }

  const received = req.get('x-minicore-service-key') || '';
  if (!secureEquals(received, expected)) {
    return res.status(401).json({
      error: 'Servicio no autorizado',
    });
  }

  next();
}

router.use(requireServiceKey);
router.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
}));

// Valida credenciales de una cuenta existente sin asignar empresas ni roles.
router.post('/verify', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      email.length > 150 ||
      password.length < 1 ||
      password.length > 1024
    ) {
      return res.status(400).json({
        error: 'Datos de acceso invalidos',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        error: 'Datos de acceso invalidos',
      });
    }

    const result = await pool.query(
      `SELECT id, password
       FROM public.users
       WHERE LOWER(TRIM(email)) = $1
         AND is_active = true
       LIMIT 1`,
      [normalizedEmail]
    );

    const user = result.rows[0];
    if (!user || typeof user.password !== 'string') {
      return res.status(401).json({
        error: 'Credenciales incorrectas',
      });
    }

    let validPassword;
    if (/^\$2[ab]\$/.test(user.password)) {
      validPassword = await bcrypt.compare(password, user.password);
    } else {
      // Solo compatibilidad con cuentas antiguas; nunca generar texto plano.
      validPassword = secureEquals(password, user.password);
    }

    if (!validPassword) {
      return res.status(401).json({
        error: 'Credenciales incorrectas',
      });
    }

    return res.json({
      success: true,
      user_id: user.id,
    });
  } catch (error) {
    console.error('MINICORE IDENTITY VERIFY ERROR:', error.message);
    return res.status(500).json({
      error: 'Error verificando identidad',
    });
  }
});

module.exports = router;
