const express = require('express');

const router = express.Router();

const {
    requireAuth,
} = require('../middleware/authMiddleware');

const controller =
    require('../controllers/adminNotificationsController');


/// 🔥 ENVIAR
router.post(
    '/send',
    requireAuth,
    controller.sendNotification,
);


/// 🔥 HISTORIAL
router.get(
    '/',
    requireAuth,
    controller.getNotifications,
);

/// 🔥 DETALLE
router.get(
    '/:id',
    requireAuth,
    controller.getNotificationById,
);

module.exports = router;