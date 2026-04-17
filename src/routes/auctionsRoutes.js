const express = require('express');
const router = express.Router();

const { createAuction } = require('../controllers/auctionsController');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/', requireAuth, createAuction);

module.exports = router;