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

    getCampaignById,

    hideCampaign,

    updateCampaignStatus,

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

/// 🔥 DETALLE
router.get(
    '/:id',
    requireAuth,
    getCampaignById,
);

/// 🔥 UPDATE STATUS
router.patch(
    '/:id/status',
    requireAuth,
    updateCampaignStatus,
);

/// 🔥 OCULTAR
router.delete(
    '/:id',
    requireAuth,
    hideCampaign,
);

module.exports =
    router;