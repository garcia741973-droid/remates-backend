const express = require('express');
const router = express.Router();

const { createAuction } = require('../controllers/auctionsController');
const { requireAuth } = require('../middleware/authMiddleware');

const { setCurrentLot } = require('../controllers/auctionsController');

router.post('/', requireAuth, createAuction);

router.post('/current-lot', requireAuth, setCurrentLot);

module.exports = router;