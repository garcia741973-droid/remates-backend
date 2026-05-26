const express =
    require('express');

const router =
    express.Router();

const {

    sendCompanyBroadcast,

    getCampaignById,

} = require(
    '../controllers/companyNotificationsController'
);

const {
    requireAuth,
} = require(
    '../middleware/authMiddleware'
);

router.post(

    '/broadcast',

    requireAuth,

    sendCompanyBroadcast,
);

router.get(
    '/:id',
    requireAuth,
    getCampaignById,
);

module.exports =
    router;