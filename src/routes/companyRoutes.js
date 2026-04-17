const express = require('express');
const router = express.Router();

const { getMyCompany } = require('../controllers/companyController');
const { requireAuth } = require('../middleware/authMiddleware');

router.get('/me', requireAuth, getMyCompany);

module.exports = router;