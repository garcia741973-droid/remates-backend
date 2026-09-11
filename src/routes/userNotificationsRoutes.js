const express = require('express');

const router = express.Router();

const {
  requireAuth,
} = require('../middleware/authMiddleware');

const {
  getUserNotifications,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
} = require(
  '../controllers/userNotificationsController'
);

// =====================================================
// 🔔 BANDEJA
// =====================================================

router.get(
  '/',
  requireAuth,
  getUserNotifications,
);

// =====================================================
// 🔴 NO LEÍDAS
// =====================================================

router.get(
  '/unread-count',
  requireAuth,
  getUnreadCount,
);

// =====================================================
// ✅ MARCAR TODAS
// =====================================================

router.put(
  '/read-all',
  requireAuth,
  markAllNotificationsRead,
);

// =====================================================
// ✅ MARCAR UNA
// =====================================================

router.put(
  '/:id/read',
  requireAuth,
  markNotificationRead,
);

module.exports = router;
