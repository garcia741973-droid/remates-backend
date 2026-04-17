const express = require('express');
const router = express.Router();

const {
  raiseBidManual,
  lowerBidManual
} = require('../controllers/operatorController');

const { requireAuth } = require('../middleware/authMiddleware');

const { closeLot } = require('../controllers/operatorController');

// subir puja manual
router.post('/raise', requireAuth, raiseBidManual);

// bajar puja manual
router.post('/lower', requireAuth, lowerBidManual);

router.post('/close-lot', requireAuth, closeLot);

module.exports = router;