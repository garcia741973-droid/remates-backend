const express = require('express');
const router = express.Router();

const { createAuction, setCurrentLot, getAuctionById } = require('../controllers/auctionsController');
const { requireAuth } = require('../middleware/authMiddleware');

const { setCurrentLot } = require('../controllers/auctionsController');

router.post('/', requireAuth, createAuction);

router.get('/:id', requireAuth, getAuctionById);

router.post('/current-lot', requireAuth, setCurrentLot);

module.exports = router;