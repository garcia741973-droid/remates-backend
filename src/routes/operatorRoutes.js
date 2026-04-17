const express = require('express');
const router = express.Router();

const {
  raiseBidManual,
  lowerBidManual
} = require('../controllers/operatorController');

const { requireAuth } = require('../middleware/authMiddleware');

// subir puja manual
router.post('/raise', requireAuth, raiseBidManual);

// bajar puja manual
router.post('/lower', requireAuth, lowerBidManual);

module.exports = router;