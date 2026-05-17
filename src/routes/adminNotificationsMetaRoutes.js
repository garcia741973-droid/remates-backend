const express =
    require('express');

const router =
    express.Router();

const {
    requireAuth,
} = require('../middleware/authMiddleware');

const {
    getMeta,
} = require(
    '../controllers/adminNotificationsMetaController'
);


/// 🔥 META
router.get(
    '/',
    requireAuth,
    getMeta,
);

module.exports =
    router;