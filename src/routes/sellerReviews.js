const express = require('express');

const router = express.Router();

const sellerReviewsController =
  require('../controllers/sellerReviewsController');

const {
  requireAuth
} = require('../middleware/authMiddleware');

router.post(
  '/',
  requireAuth,
  sellerReviewsController.createReview
);

module.exports = router;