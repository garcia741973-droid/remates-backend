const express = require('express');
const router = express.Router();

const { login, getUser } = require('../controllers/authController');

router.post('/login', login);
router.post('/get-companies', getUser);

module.exports = router;