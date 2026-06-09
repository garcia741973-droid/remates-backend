const express = require('express');
const router = express.Router();

const {

  placeBid,

  placeFloorBid,

  hammerLot,

  getLatestBids,

} = require(
  '../controllers/bidsController'
);

const { requireAuth } = require('../middleware/authMiddleware');

router.post('/', requireAuth, placeBid);

router.post(
  '/floor',
  requireAuth,
  placeFloorBid,
);

router.post(
  '/hammer',
  requireAuth,
  hammerLot,
);

router.get(
  '/lot/:lotId/latest',
  requireAuth,
  getLatestBids,
);

module.exports = router;