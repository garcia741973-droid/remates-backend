const express =
    require('express');

const router =
    express.Router();

const controller =
    require('../controllers/promotionController');

const requireAuth =
    require('../middlewares/requireAuth');

/// 🔥 PLANES
router.get(
    '/plans',
    controller.getPlans,
);

/// 🔥 CREAR SOLICITUD
router.post(
    '/request',
    requireAuth,
    controller.createPromotionRequest,
);

/// 🔥 ADMIN APROBAR
router.post(
    '/approve/:id',
    requireAuth,
    controller.approvePromotion,
);

/// 🔥 ADMIN LISTAR
router.get(
    '/requests',
    requireAuth,
    controller.getPromotionRequests,
);

module.exports = router;