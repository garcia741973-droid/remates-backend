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
  startSlaughterhouseSlaughter,
  getSlaughterhouseSlaughterReceptions,
  createSlaughterhouseCarcass,
  updateLastSlaughterhouseCarcass,
  finishSlaughterhouseSlaughter,
  getSlaughterhouseExportCatalog,
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

// =====================================================
// 🏭 INICIAR FAENA
// =====================================================

router.post(
  '/receptions/:id/start-slaughter',
  requireAuth,
  startSlaughterhouseSlaughter,
);

// =====================================================
// 🏭 RECEPCIONES PARA FAENA
// =====================================================

router.get(
  '/slaughter',
  requireAuth,
  getSlaughterhouseSlaughterReceptions,
);

// =====================================================
// 🏭 REGISTRAR CARCASA
// =====================================================

router.post(
  '/slaughter/:id/carcasses',
  requireAuth,
  createSlaughterhouseCarcass,
);

// =====================================================
// 🏭 CORREGIR ÚLTIMA CARCASA
// =====================================================

router.put(
  '/slaughter/:id/carcasses/last',
  requireAuth,
  updateLastSlaughterhouseCarcass,
);

// =====================================================
// 🏭 FINALIZAR FAENA
// =====================================================

router.post(
  '/slaughter/:id/finish',
  requireAuth,
  finishSlaughterhouseSlaughter,
);

// =====================================================
// 📄 CATÁLOGO EXPORTACIÓN CSV
// =====================================================

router.get(
  '/export/catalog',
  requireAuth,
  getSlaughterhouseExportCatalog,
);

module.exports = router;