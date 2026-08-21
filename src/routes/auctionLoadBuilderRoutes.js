const express =
  require('express');

const router =
  express.Router();

const {
  requireAuth,
} =
  require('../middleware/authMiddleware');

const {
  getAuctionCattleTypes,
  searchTruckCapacity,
} =
  require('../controllers/auctionLoadBuilderController');


/// ===============================================
/// TIPOS DISPONIBLES EN UN REMATE
/// ===============================================

router.get(
  '/types/:auctionId',
  requireAuth,
  getAuctionCattleTypes,
);


/// ===============================================
/// ARMAR CAPACIDAD
/// ===============================================

router.post(
  '/search',
  requireAuth,
  searchTruckCapacity,
);


module.exports =
  router;