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

    updateUpcomingAuction,

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

/// 🔥 EDITAR
router.put(

    '/:id',

    requireAuth,

    updateUpcomingAuction,
);

/// 🔥 ELIMINAR
router.delete(

    '/:id',

    requireAuth,

    deleteUpcomingAuction,
);

module.exports =
    router;