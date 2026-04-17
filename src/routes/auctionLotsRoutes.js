const express = require('express');
const router = express.Router();

const {
  addLotToAuction,
  getAuctionLots
} = require('../controllers/auctionLotsController');

const { requireAuth } = require('../middleware/authMiddleware');

// agregar lote al remate
router.post('/', requireAuth, addLotToAuction);

// obtener lotes del remate
router.get('/:auction_id', requireAuth, getAuctionLots);

module.exports = router;