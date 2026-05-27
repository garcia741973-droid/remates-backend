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

    createUpcomingAuction,

    getUpcomingAuctions,

    deleteUpcomingAuction,

} = require(
    '../controllers/upcomingAuctionsController'
);

/// 🔥 CREAR
router.post(

    '/',

    requireAuth,

    createUpcomingAuction,
);

/// 🔥 LISTAR
router.get(

    '/:company_id',

    getUpcomingAuctions,
);

/// 🔥 ELIMINAR
router.delete(

    '/:id',

    requireAuth,

    deleteUpcomingAuction,
);

module.exports =
    router;