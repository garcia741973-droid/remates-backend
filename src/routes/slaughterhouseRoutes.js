const express = require('express');

const router = express.Router();

const {
  requireAuth,
} = require(
  '../middleware/authMiddleware'
);

const {
  getSlaughterhouseTrucks,
} = require(
  '../controllers/slaughterhouseController'
);


// =====================================================
// 🏭 OPERACIONES DE FRIGORÍFICO
// =====================================================


// =====================================================
// 🚛 CAMIONES CONTRATADOS POR EL FRIGORÍFICO
// SOLO LECTURA
// =====================================================

router.get(
  '/trucks',
  requireAuth,
  getSlaughterhouseTrucks,
);


module.exports = router;