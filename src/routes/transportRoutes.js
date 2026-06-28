const express = require('express');
const router = express.Router();

const {
  registerTruck,
  getMyTruck,
  updateMyTruck,
} = require('../controllers/transportController');

const { requireAuth } = require('../middleware/authMiddleware');

router.get(
  '/my-truck',
  requireAuth,
  getMyTruck
);

router.put(
  '/update-my-truck',
  requireAuth,
  updateMyTruck
);

module.exports = router;