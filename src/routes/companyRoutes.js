const express = require('express');
const router = express.Router();

const {

  getMyCompany,

  getRemateCompanies,

} = require(
  '../controllers/companyController'
);

const { requireAuth } = require('../middleware/authMiddleware');

const upload = require('../middleware/uploadMiddleware');

const {

  uploadLogo,

  uploadLobbyBanner,

  uploadMiniPlazaBackground,

} = require(
  '../controllers/companyController'
);

router.get('/me', requireAuth, getMyCompany);

/// 🔥 EMPRESAS REMATERAS
router.get(

  '/remates',

  requireAuth,

  getRemateCompanies,
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

module.exports = router;