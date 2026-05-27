
const express = require('express');
const router = express.Router();

const lotsController =
  require('../controllers/lotsController');

const { requireAuth } = require('../middleware/authMiddleware');

const {
  createLot,
  getLots,
  getMyLots,
  updateLot,
  deleteLot,
  searchLots,
  getFeaturedLots,
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

router.get(
  '/featured',
  getFeaturedLots
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

router.get(
  '/:id',
  requireAuth,
  lotsController.getLotById
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