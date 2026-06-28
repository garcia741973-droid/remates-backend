const express = require('express');
const router = express.Router();

const {
  registerTruck,
} = require('../controllers/transportController');

const { requireAuth } = require('../middleware/authMiddleware');

router.post(
  '/register-truck',
  requireAuth,
  registerTruck
);

module.exports = router;