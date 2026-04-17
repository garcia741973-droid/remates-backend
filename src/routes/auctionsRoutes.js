const express = require('express');
const router = express.Router();

const { createAuction, setCurrentLot, getAuctionById } = require('../controllers/auctionsController');

const { requireAuth } = require('../middleware/authMiddleware');

// crear remate
router.post('/', requireAuth, createAuction);

// obtener remate por id 🔥
router.get('/:id', requireAuth, getAuctionById);

// cambiar lote actual
router.post('/current-lot', requireAuth, setCurrentLot);

module.exports = router;