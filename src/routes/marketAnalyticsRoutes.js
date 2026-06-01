const express = require('express');

const router = express.Router();

const {
  getGlobalAuctionAnalytics,
} = require(
  '../controllers/marketAnalyticsController'
);

router.get(
  '/',
  getGlobalAuctionAnalytics
);

module.exports = router;