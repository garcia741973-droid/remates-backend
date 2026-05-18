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

/// 🔥 LOTE INDIVIDUAL
router.get(
  '/:id',
  requireAuth,
  getAuctionLiveLotById,
);

module.exports = router;