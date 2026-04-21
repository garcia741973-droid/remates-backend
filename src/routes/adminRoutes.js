const express = require('express');
const router = express.Router();

const { createUser, getUsers } = require('../controllers/adminController');
const { requireAuth } = require('../middleware/authMiddleware');

router.post('/users', requireAuth, createUser);
router.get('/users', requireAuth, getUsers);

const { updateUser, deleteUser } = require('../controllers/adminController');

router.put('/users/:id', requireAuth, updateUser);
router.delete('/users/:id', requireAuth, deleteUser);

module.exports = router;