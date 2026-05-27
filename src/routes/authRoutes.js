const express = require('express');
const router = express.Router();

const {
  registerParticipant,
} = require('../controllers/authController');

const { login, getUser, saveFcmToken } = require('../controllers/authController');
router.post('/login', login);
router.post(
  '/register-participant',
  registerParticipant,
);

router.post('/get-companies', getUser);

const { requireAuth } = require('../middleware/authMiddleware');

// 🔥 GUARDAR TOKEN
router.post('/save-fcm-token', requireAuth, saveFcmToken);

module.exports = router;