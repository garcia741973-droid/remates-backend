const express = require('express');

const router = express.Router();

const {

  getAuctionSales,

} = require(
  '../controllers/auctionSalesController'
);

const {

  requireAuth,

} = require(
  '../middleware/authMiddleware'
);

/// 🔥 VENTAS ONLINE
router.get(
  '/',
  requireAuth,
  getAuctionSales,
);

module.exports = router;