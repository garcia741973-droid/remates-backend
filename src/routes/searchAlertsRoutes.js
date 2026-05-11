const express =
  require('express');

const router =
  express.Router();

const {
  getSearchAlerts,
} = require(
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
  getSearchAlerts
);

router.put(
  '/:id/open',
  requireAuth,
  searchAlertsController.markAsOpened
);

module.exports =
  router;