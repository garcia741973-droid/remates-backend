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

  updateAuctionLiveAd,

  toggleAuctionLiveAd,

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

/// 🔥 EDITAR AD LIVE
router.put(

  '/:id',

  requireAuth,

  updateAuctionLiveAd,
);


/// 🔥 ACTIVAR / DESACTIVAR AD LIVE
router.patch(

  '/:id/toggle',

  requireAuth,

  toggleAuctionLiveAd,
);

router.post(
  '/:id/toggle',
  requireAuth,
  toggleAuctionLiveAd,
);

module.exports =
    router;