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
const { uploadLogo } = require('../controllers/companyController');

router.get('/me', requireAuth, getMyCompany);

/// 🔥 EMPRESAS REMATERAS
router.get(

  '/remates',

  requireAuth,

  getRemateCompanies,
);

router.post('/logo', requireAuth, upload.single('logo'), uploadLogo);

module.exports = router;