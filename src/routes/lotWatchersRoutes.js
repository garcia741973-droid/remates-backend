const express = require('express');

const router = express.Router();

const {
  watchLot,
} = require(
  '../controllers/lotWatchersController'
);

const {
  requireAuth,
} = require(
  '../middleware/authMiddleware'
);

router.post(
  '/watch',
  requireAuth,
  watchLot,
);

module.exports = router;