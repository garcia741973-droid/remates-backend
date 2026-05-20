const express = require('express');
const router = express.Router();

const auctionsController = require('../controllers/auctionsController');

const {
  createAuction,
  setCurrentLot,
  getAuctionById,
  getAuctions,
  closeAuction,
  getAuctionReports,
} = require('../controllers/auctionsController');

const { requireAuth } = require('../middleware/authMiddleware');


// 🟢 CREAR REMATE
router.post('/', requireAuth, createAuction);


// 🔥 LISTAR REMATES (IMPORTANTE: VA ANTES DE /:id)
router.get('/', requireAuth, getAuctions);

/// 🔥 REMATE LIVE ACTUAL
router.get(
  '/current-live',
  requireAuth,
  auctionsController.getCurrentLiveAuction,
);

/// 🔥 REMATES LIVE GLOBAL
router.get(
  '/live',
  requireAuth,
  auctionsController.getLiveAuctions,
);

/// 🔥 REPORTES REMATES
router.get(
  '/report-list',
  requireAuth,
  getAuctionReports,
);

// 🟢 OBTENER REMATE POR ID
router.get('/:id', requireAuth, getAuctionById);


// 🟢 CAMBIAR LOTE ACTUAL
router.post('/current-lot', requireAuth, setCurrentLot);

router.post('/start', requireAuth, auctionsController.startAuction);

router.post(
  '/close',
  requireAuth,
  closeAuction,
);

module.exports = router;