const express = require('express');

const router = express.Router();

const {
  requireAuth,
} = require(
  '../middleware/authMiddleware'
);

const {
  getSlaughterhouseTrucks,
  getSlaughterhouseReceptionCandidates,
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
// 🐄 TRANSPORTES DISPONIBLES PARA RECEPCIÓN
// =====================================================

router.get(
  '/reception-candidates',
  requireAuth,
  getSlaughterhouseReceptionCandidates,
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