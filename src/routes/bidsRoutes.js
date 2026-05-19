const express = require('express');
const router = express.Router();

const {

  placeBid,

  placeFloorBid,

  hammerLot,

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

module.exports = router;