const express = require('express');
const router = express.Router();

const { placeBid } = require('../controllers/bidsController');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/', requireAuth, placeBid);

module.exports = router;