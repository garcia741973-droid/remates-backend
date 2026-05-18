const express = require('express');

const router = express.Router();

const {

  createAuctionLiveLot,

  getAuctionLiveLots,

  getAuctionLiveLotById,

  getAvailableLotNumbers,

} = require(
  '../controllers/auctionLiveLotsController'
);

const {

  requireAuth,

} = require(
  '../middleware/authMiddleware'
);

const {
  createAuctionLiveLot,
  getAuctionLiveLots,
  getAuctionLiveLotById,
  reorderAuctionLiveLots,
} = require(
  '../controllers/auctionLiveLotsController'
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

router.get(

  '/available-numbers/:auction_id',

  requireAuth,

  getAvailableLotNumbers,
);

router.put(
  '/reorder',
  requireAuth,
  reorderAuctionLiveLots,
);

/// 🔥 LOTE INDIVIDUAL
router.get(
  '/:id',
  requireAuth,
  getAuctionLiveLotById,
);

module.exports = router;