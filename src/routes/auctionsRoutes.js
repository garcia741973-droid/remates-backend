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

const {
  getGlobalAuctionAnalytics,
} = require(
  '../controllers/globalAuctionAnalyticsController'
);

const {
  exportGlobalAuctionAnalytics,
} = require(
  '../controllers/globalAuctionAnalyticsController'
);

// 🟢 CREAR REMATE
router.post('/', requireAuth, createAuction);


// 🔥 LISTAR REMATES (IMPORTANTE: VA ANTES DE /:id)
router.get('/', requireAuth, getAuctions);

/// 🔥 REMATE LIVE ACTUAL
router.get(
  '/current-live',
  auctionsController.getCurrentLiveAuction,
);

/// 🔥 REMATES LIVE GLOBAL
router.get(
  '/live',
  auctionsController.getLiveAuctions,
);

/// 🔥 REPORTES REMATES
router.get(
  '/report-list',
  requireAuth,
  getAuctionReports,
);

router.get(
  '/analytics/global',
  requireAuth,
  getGlobalAuctionAnalytics,
);

router.get(
  '/analytics/export',
  requireAuth,
  exportGlobalAuctionAnalytics,
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

const {
  getAuctionAnalytics,
} = require(
  '../controllers/auctionAnalyticsController',
);

router.get(
  '/:id/analytics',
  requireAuth,
  getAuctionAnalytics,
);

router.get(
  '/my-live',
  requireAuth,
  auctionsController.getMyLiveAuction
);

module.exports = router;