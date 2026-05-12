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

  getActiveQr,

  createQr,

  getAllQrs,

  activateQr,

} = require(
  '../controllers/paymentQrController'
);

/// 🔥 QR ACTIVO
router.get(
  '/active',
  requireAuth,
  getActiveQr
);

/// 🔥 CREAR QR
router.post(
  '/',
  requireAuth,
  createQr
);

/// 🔥 LISTAR
router.get(
  '/',
  requireAuth,
  getAllQrs
);

/// 🔥 ACTIVAR
router.put(
  '/:id/activate',
  requireAuth,
  activateQr
);

module.exports = router;