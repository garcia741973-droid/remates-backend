const express = require('express');
const router = express.Router();

const { createLot } = require('../controllers/lotsController');
const { requireAuth } = require('../middleware/authMiddleware');

const {

  getLots,

  getMyLots,

  updateLot,

  deleteLot,

} = require('../controllers/lotsController');

router.post('/', requireAuth, createLot);

router.get('/', requireAuth, getLots);

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