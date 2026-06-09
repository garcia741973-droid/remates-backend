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

  deleteAccount,

} = require(
  '../controllers/authController'
);

const {
  sendResetCode,
} = require(
  '../services/emailService'
);

const {
  requestResetCode,
  verifyResetCode,
  setNewPassword,
} = require(
  '../controllers/passwordRecoveryController'
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

router.delete(
  '/delete-account',
  requireAuth,
  deleteAccount,
);

router.get(
  '/test-email',
  async (req, res) => {

    try {

      await sendResetCode(

        'garcia741973@gmail.com',

        '123456',
      );

      res.json({
        success: true,
      });

    } catch (e) {

      console.log(
        'EMAIL ERROR:',
        e,
      );

      res.status(500).json({

        error:
          e.message,
      });
    }
  }
);

/// 🔑 RECUPERAR PASSWORD

router.post(
  '/request-reset-code',
  requestResetCode,
);

router.post(
  '/verify-reset-code',
  verifyResetCode,
);

router.post(
  '/set-new-password',
  setNewPassword,
);

module.exports = router;