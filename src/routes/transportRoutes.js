const express = require('express');
const router = express.Router();

const {
  registerTruck,
} = require('../controllers/transportController');

const authMiddleware = require('../middleware/authMiddleware');

router.post(
  '/register-truck',
  authMiddleware,
  registerTruck
);

module.exports = router;