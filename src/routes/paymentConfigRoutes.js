const express = require('express');
const router = express.Router();

const {
  getPaymentConfigs,
  updatePaymentConfig,
} = require(
  '../controllers/paymentConfigController'
);

const {
  requireAuth,
} = require(
  '../middleware/authMiddleware'
);

router.get(
  '/',
  requireAuth,
  getPaymentConfigs
);

router.put(
  '/:id',
  requireAuth,
  updatePaymentConfig
);

module.exports = router;