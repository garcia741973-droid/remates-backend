const express = require('express');
const router = express.Router();

const {
  sendNotification,
} = require('../controllers/firebaseController');

router.post('/send', sendNotification);

module.exports = router;