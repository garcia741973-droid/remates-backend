const express = require('express');

const router = express.Router();

const {

  createAuctionLiveLot,

  getAuctionLiveLots,

  getAuctionLiveLotById,

  getAvailableLotNumbers,

  reorderAuctionLiveLots,

  updateAuctionLiveLot,

} = require(
  '../controllers/auctionLiveLotsController'
);

const {

  requireAuth,

} = require(
  '../middleware/authMiddleware'
);

/// 🔥 CREAR LOTE REMATE
router.post(
  '/',
  requireAuth,
  createAuctionLiveLot,
);

/// 🔥 LOTES DE UN REMATE
router.get(
  '/auction/:auction_id',
  requireAuth,
  getAuctionLiveLots,
);

/// 🔥 NUMEROS DISPONIBLES
router.get(
  '/available-numbers/:auction_id',
  requireAuth,
  getAvailableLotNumbers,
);

/// 🔥 REORDENAR
router.put(
  '/reorder',
  requireAuth,
  reorderAuctionLiveLots,
);

/// 🔥 UPDATE LOTE
router.put(
  '/:id',
  requireAuth,
  updateAuctionLiveLot,
);

/// 🔥 LOTE INDIVIDUAL
router.get(
  '/:id',
  requireAuth,
  getAuctionLiveLotById,
);

module.exports = router;