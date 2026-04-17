const express = require('express');
const router = express.Router();

const { getLivekitToken } = require('../controllers/livekitController');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/token', requireAuth, getLivekitToken);

module.exports = router;