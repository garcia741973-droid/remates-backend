const express =
    require('express');

const router =
    express.Router();

const {
    requireAuth,
} = require(
    '../middleware/authMiddleware'
);

const {

    createCampaign,

    getCampaigns,

} = require(
    '../controllers/notificationCampaignsController'
);

/// 🔥 CREAR / PROGRAMAR
router.post(
    '/',
    requireAuth,
    createCampaign,
);

/// 🔥 HISTORIAL
router.get(
    '/',
    requireAuth,
    getCampaigns,
);

module.exports =
    router;