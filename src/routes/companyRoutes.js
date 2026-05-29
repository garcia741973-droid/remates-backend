const express = require('express');
const router = express.Router();

const {

  getMyCompany,

  getRemateCompanies,

  getCompanyById,

} = require(
  '../controllers/companyController'
);

const { requireAuth } = require('../middleware/authMiddleware');

const upload = require('../middleware/uploadMiddleware');

const {

  uploadLogo,

  uploadLobbyBanner,

  uploadMiniPlazaBackground,

  uploadHeroVideo,

} = require(
  '../controllers/companyController'
);

router.get('/me', requireAuth, getMyCompany);

/// 🔥 EMPRESAS REMATERAS
router.get(

  '/remates',

  getRemateCompanies,
);

/// 🔥 EMPRESA POR ID
router.get(

  '/:company_id',

  getCompanyById,
);

router.post('/logo', requireAuth, upload.single('logo'), uploadLogo);

/// 🔥 BANNER LOBBY
router.post(

  '/:company_id/lobby-banner',

  requireAuth,

  upload.single('banner'),

  uploadLobbyBanner,
);

/// 🔥 FONDO MINI PLAZA
router.post(

  '/:company_id/mini-plaza-background',

  requireAuth,

  upload.single('background'),

  uploadMiniPlazaBackground,
);

/// 🔥 HERO VIDEO
router.post(

  '/:company_id/hero-video',

  requireAuth,

  upload.single('video'),

  uploadHeroVideo,
);

module.exports = router;