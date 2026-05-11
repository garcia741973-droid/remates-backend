const express =
  require('express');

const router =
  express.Router();

const {
  getSearchAlerts,
} = require(
  '../controllers/searchAlertsController'
);

const requireAuth =
  require(
    '../middleware/requireAuth'
  );

router.get(
  '/',
  requireAuth,
  getSearchAlerts
);

module.exports =
  router;