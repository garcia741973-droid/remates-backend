const express = require('express');

const router = express.Router();

const {

  requireAuth,

} = require(
  '../middleware/authMiddleware'
);

const {

  createMiniPlazaAd,

  getMiniPlazaAds,

  getPublicMiniPlazaAds,

  toggleMiniPlazaAd,

  deleteMiniPlazaAd,

} = require(
  '../controllers/miniPlazaAdsController'
);

/// 🔥 CREAR PUBLICIDAD
router.post(
  '/',
  requireAuth,
  createMiniPlazaAd,
);

/// 🔥 ADS ADMIN EMPRESA
router.get(
  '/',
  requireAuth,
  getMiniPlazaAds,
);

/// 🔥 ADS PÚBLICOS MINI PLAZA
router.get(
  '/public/:company_id',
  getPublicMiniPlazaAds,
);

/// 🔥 ACTIVAR / DESACTIVAR
router.put(
  '/:id/toggle',
  requireAuth,
  toggleMiniPlazaAd,
);

/// 🔥 DELETE
router.delete(
  '/:id',
  requireAuth,
  deleteMiniPlazaAd,
);

module.exports = router;