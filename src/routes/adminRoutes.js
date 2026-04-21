const express = require('express');
const router = express.Router();

const { createUser, getUsers } = require('../controllers/adminController');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/users', requireAuth, createUser);
router.get('/users', requireAuth, getUsers);

module.exports = router;