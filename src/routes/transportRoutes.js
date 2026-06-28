const express = require('express');
const router = express.Router();

const {
  registerTruck,
  getMyTruck,
} = require('../controllers/transportController');

const { requireAuth } = require('../middleware/authMiddleware');

router.get(
  '/my-truck',
  requireAuth,
  getMyTruck
);

module.exports = router;