const express = require('express');
const router = express.Router();

const {
  registerTruck,
  getMyTruck,
  updateMyTruck,
  createGuide,
  getMyGuides,
  getSharedGuide,
} = require('../controllers/transportController');

const {
  requireAuth,
} = require('../middleware/authMiddleware');

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

router.get(
  '/my-guides',
  requireAuth,
  getMyGuides
);

router.get(
  '/shared-guide/:token',
  getSharedGuide
);

module.exports = router;