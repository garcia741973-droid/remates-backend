const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/authMiddleware');

const {
  createLot,
  getLots,
  getMyLots,
  updateLot,
  deleteLot,
  searchLots,
} = require('../controllers/lotsController');

/// 🔍 BUSCAR LOTES
router.post(
  '/search',
  requireAuth,
  searchLots
);

/// 🔥 CREAR LOTE
router.post(
  '/',
  requireAuth,
  createLot
);

/// 🔥 LISTAR LOTES
router.get(
  '/',
  requireAuth,
  getLots
);

/// 🔥 MIS LOTES
router.get(
  '/my-lots',
  requireAuth,
  getMyLots
);

/// 🔥 EDITAR LOTE
router.put(
  '/:id',
  requireAuth,
  updateLot
);

/// 🔥 ELIMINAR LOTE
router.delete(
  '/:id',
  requireAuth,
  deleteLot
);

module.exports = router;