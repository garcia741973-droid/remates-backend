const express = require('express');
const router = express.Router();

const negotiationsController = require('../controllers/negotiationsController');

const { requireAuth } = require('../middleware/authMiddleware');

const upload = require('../middleware/uploadMiddleware');

router.post('/', requireAuth, negotiationsController.createNegotiation);
router.post('/message', requireAuth, negotiationsController.sendMessage);
router.get('/:id/messages', requireAuth, negotiationsController.getMessages);
router.put('/:id/close', requireAuth, negotiationsController.closeNegotiation);

router.post(
  '/:id/upload-payment',
  requireAuth,
  upload.single('proof'),
  negotiationsController.uploadPaymentProof
);

router.post('/get-or-create', requireAuth, negotiationsController.getOrCreateNegotiation);

router.get('/my-negotiations', requireAuth, negotiationsController.getMyNegotiations);

module.exports = router;