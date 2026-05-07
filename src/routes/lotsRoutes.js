const express = require('express');
const router = express.Router();

const { createLot } = require('../controllers/lotsController');
const { requireAuth } = require('../middleware/authMiddleware');

const {
  getLots,
  getMyLots
} = require('../controllers/lotsController');

router.post('/', requireAuth, createLot);

router.get('/', requireAuth, getLots);

router.get(
  '/my-lots',
  requireAuth,
  getMyLots
);

module.exports = router;