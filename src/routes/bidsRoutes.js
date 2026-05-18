const express = require('express');
const router = express.Router();

const {

  placeBid,

  placeFloorBid,

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

module.exports = router;