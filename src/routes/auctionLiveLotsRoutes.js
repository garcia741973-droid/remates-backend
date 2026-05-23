const express = require('express');

const router = express.Router();

const {

  createAuctionLiveLot,

  getAuctionLiveLots,

  getAuctionLiveLotById,

  getAvailableLotNumbers,

  reorderAuctionLiveLots,

  updateAuctionLiveLot,

  deleteAuctionLiveLot,

  openLiveLot,

  returnLotToQueue,

  getAuctionResults,

  getMiniPlazaLots,

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

/// 🔥 MINI PLAZA LOTES
router.get(
  '/mini-plaza/:company_id',
  requireAuth,
  getMiniPlazaLots,
);

/// 🔥 UPDATE LOTE
router.put(
  '/:id',
  requireAuth,
  updateAuctionLiveLot,
);

/// 🔥 DELETE LOTE
router.delete(
  '/:id',
  requireAuth,
  deleteAuctionLiveLot,
);

/// 🔥 ABRIR LOTE
router.post(
  '/open-lot',
  requireAuth,
  openLiveLot,
);

/// 🔥 VOLVER A COLA
router.post(
  '/return-to-queue',
  requireAuth,
  returnLotToQueue,
);

/// 🔥 RESULTADOS REMATE
router.get(
  '/results/:auction_id',
  requireAuth,
  getAuctionResults,
);

/// 🔥 LOTE INDIVIDUAL
router.get(
  '/:id',
  requireAuth,
  getAuctionLiveLotById,
);

module.exports = router;