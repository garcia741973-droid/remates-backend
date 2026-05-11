const express =
  require('express');

const router =
  express.Router();

const searchAlertsController =
  require(
    '../controllers/searchAlertsController'
  );

const {
  requireAuth,
} = require(
  '../middleware/authMiddleware'
);

router.get(
  '/',
  requireAuth,
  searchAlertsController.getSearchAlerts
);

router.get(
  '/unread-count',
  requireAuth,
  searchAlertsController.getUnreadCount
);

router.put(
  '/:id/open',
  requireAuth,
  searchAlertsController.markAsOpened
);

module.exports =
  router;