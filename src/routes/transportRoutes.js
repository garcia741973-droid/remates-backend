const express = require('express');
const router = express.Router();

const {
  registerTruck,
  getMyTruck,
  updateMyTruck,
  createGuide,
} = require('../controllers/transportController');

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

router.post(
  '/create-guide',
  requireAuth,
  createGuide
);

module.exports = router;