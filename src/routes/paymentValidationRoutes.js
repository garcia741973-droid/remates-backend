const express = require('express');
const router = express.Router();

const {
  getPaymentValidations,
  approvePaymentValidation,
  rejectPaymentValidation,
  deletePaymentValidation,
  recheckPaymentValidation,
  createManualPaymentValidation,
} = require('../controllers/paymentValidationController');

const {
  requireAuth,
} = require('../middleware/authMiddleware');

router.get(
  '/validations',
  requireAuth,
  getPaymentValidations
);

router.post(
  '/manual-create',
  requireAuth,
  createManualPaymentValidation
);

router.put(
  '/:id/approve',
  requireAuth,
  approvePaymentValidation
);

router.put(
  '/:id/reject',
  requireAuth,
  rejectPaymentValidation
);

router.delete(
  '/:id',
  requireAuth,
  deletePaymentValidation
);

router.post(
  '/:id/recheck',
  requireAuth,
  recheckPaymentValidation
);

module.exports = router;