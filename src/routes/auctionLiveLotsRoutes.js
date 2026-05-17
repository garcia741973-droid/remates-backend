const express = require('express');

const router = express.Router();

const {

  createAuctionLiveLot,

  getAuctionLiveLots,

  getAuctionLiveLotById,

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

/// 🔥 LOTE INDIVIDUAL
router.get(
  '/:id',
  requireAuth,
  getAuctionLiveLotById,
);

module.exports = router;