const express =
    require('express');

const router =
    express.Router();

const {
  requireAuth,
} = require(
  '../middleware/authMiddleware'
);

const {

  getAuctionLiveAds,

  createAuctionLiveAd,

} = require(
  '../controllers/auctionLiveAdsController'
);


/// 🔥 LISTAR ADS DE UN REMATE
router.get(

  '/auction/:auctionId',

  requireAuth,

  getAuctionLiveAds,
);


/// 🔥 CREAR AD LIVE
router.post(

  '/',

  requireAuth,

  createAuctionLiveAd,
);

module.exports =
    router;