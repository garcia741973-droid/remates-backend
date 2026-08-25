const express = require('express');

const router = express.Router();

const {
  requireAuth,
} = require(
  '../middleware/authMiddleware'
);

const {
  getSlaughterhouseTrucks,
  createSlaughterhouseReception,
} = require(
  '../controllers/slaughterhouseController'
);


// =====================================================
// 🚛 SEGUIMIENTO DE CAMIONES
// =====================================================

router.get(
  '/trucks',
  requireAuth,
  getSlaughterhouseTrucks,
);


// =====================================================
// 🐄 RECEPCIÓN DE GANADO
// =====================================================

router.post(
  '/receptions',
  requireAuth,
  createSlaughterhouseReception,
);


module.exports = router;