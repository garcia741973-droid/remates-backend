const express =
    require('express');

const router =
    express.Router();

const {
    sendCompanyBroadcast,
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

module.exports =
    router;