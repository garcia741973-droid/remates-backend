const express = require('express');
const router = express.Router();

const {
  registerParticipant,
} = require('../controllers/authController');

const {

  login,

  getUser,

  saveFcmToken,

  checkParticipant,

  changePassword,

} = require(
  '../controllers/authController'
);

router.post('/login', login);
router.post(
  '/register-participant',
  registerParticipant,
);

router.post('/get-companies', getUser);

router.post(
  '/check-participant',
  checkParticipant,
);

const { requireAuth } = require('../middleware/authMiddleware');

// 🔥 GUARDAR TOKEN
router.post('/save-fcm-token', requireAuth, saveFcmToken);

/// 🔒 CAMBIAR PASSWORD
router.put(
  '/change-password',
  requireAuth,
  changePassword,
);

module.exports = router;