const express = require('express');
const router = express.Router();

const { createLot } = require('../controllers/lotsController');
const { requireAuth } = require('../middleware/authMiddleware');

const { getLots } = require('../controllers/lotsController');

router.post('/', requireAuth, createLot);

router.get('/', requireAuth, getLots);

module.exports = router;