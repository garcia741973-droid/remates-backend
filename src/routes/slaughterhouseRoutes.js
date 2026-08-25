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
  getOpenSlaughterhouseReceptions,
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
// 📋 RECEPCIONES ABIERTAS
// =====================================================

router.get(
  '/receptions/open',
  requireAuth,
  getOpenSlaughterhouseReceptions,
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