const express =
  require('express');

const router =
  express.Router();

const {
  requireAuth,
} =
  require('../middleware/authMiddleware');

const {
  getCompanyLoadBuilderAuctions,
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

/// ===============================================
/// MINI PLAZA — PÚBLICO
/// ===============================================

router.get(
  '/public/auctions/:companyId',
  getCompanyLoadBuilderAuctions,
);


router.get(
  '/public/types/:auctionId',
  getAuctionCattleTypes,
);


router.post(
  '/public/search',
  searchTruckCapacity,
);

module.exports =
  router;