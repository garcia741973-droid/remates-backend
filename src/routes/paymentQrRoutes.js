const express = require(
  'express'
);

const router =
  express.Router();

const {
  requireAuth
} = require(
  '../middleware/authMiddleware'
);

const {
  getActiveQr
} = require(
  '../controllers/paymentQrController'
);

/// 🔥 QR ACTIVO
router.get(
  '/active',
  requireAuth,
  getActiveQr
);

module.exports = router;