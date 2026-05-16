const express = require('express');

const router = express.Router();

const {
  requireAuth,
} = require('../middleware/authMiddleware');

const {
  getOperationEvents,
} = require('../controllers/operationEventsController');

router.get(
  '/',
  requireAuth,
  getOperationEvents,
);

module.exports = router;