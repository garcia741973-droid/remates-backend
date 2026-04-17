const express = require('express');
const router = express.Router();

const { createLot } = require('../controllers/lotsController');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/', requireAuth, createLot);

module.exports = router;