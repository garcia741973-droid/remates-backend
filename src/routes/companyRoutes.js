const express = require('express');
const router = express.Router();

const { getMyCompany } = require('../controllers/companyController');
const { requireAuth } = require('../middleware/authMiddleware');

const upload = require('../middleware/uploadMiddleware');
const { uploadLogo } = require('../controllers/companyController');

router.get('/me', requireAuth, getMyCompany);

router.post('/logo', requireAuth, upload.single('logo'), uploadLogo);

module.exports = router;