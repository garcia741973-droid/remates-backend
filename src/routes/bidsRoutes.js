const express = require('express');

const router = express.Router();

const {

  placeBid,

  placeFloorBid,

  adjustFloorPrice,

  rollbackFloorBid,

  hammerLot,

  getLatestBids,

} = require(
  '../controllers/bidsController'
);

const {
  requireAuth,
} = require(
  '../middleware/authMiddleware'
);


/// 🔥 PUJA ONLINE
router.post(
  '/',
  requireAuth,
  placeBid,
);


/// 🔥 PUJA DE SALA
router.post(
  '/floor',
  requireAuth,
  placeFloorBid,
);


/// 🔥 AJUSTAR PRECIO DE SALIDA
/// SOLO ANTES DE EXISTIR PUJAS
router.post(
  '/adjust-floor-price',
  requireAuth,
  adjustFloorPrice,
);


/// 🔥 RETIRAR ÚLTIMA PUJA DE SALA
router.post(
  '/rollback-floor',
  requireAuth,
  rollbackFloorBid,
);


/// 🔥 MARTILLO
router.post(
  '/hammer',
  requireAuth,
  hammerLot,
);


/// 🔥 ÚLTIMAS PUJAS
router.get(
  '/lot/:lotId/latest',
  requireAuth,
  getLatestBids,
);

module.exports = router;