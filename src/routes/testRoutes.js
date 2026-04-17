const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/authMiddleware');

router.get('/me', requireAuth, (req, res) => {
  res.json({
    message: 'Usuario autenticado',
    user: req.user
  });
});

module.exports = router;