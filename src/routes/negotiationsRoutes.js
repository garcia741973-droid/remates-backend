const express = require('express');
const router = express.Router();

const negotiationsController = require('../controllers/negotiationsController');

const {
  createNegotiation,
  sendMessage,
  getMessages,
  closeNegotiation
} = require('../controllers/negotiationsController');

const { requireAuth } = require('../middleware/authMiddleware');

router.post('/', requireAuth, createNegotiation);
router.post('/message', requireAuth, sendMessage);
router.get('/:id/messages', requireAuth, getMessages);
router.put('/:id/close', requireAuth, closeNegotiation);

router.post('/get-or-create', requireAuth, negotiationsController.getOrCreateNegotiation);

module.exports = router;
