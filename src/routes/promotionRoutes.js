const express =
    require('express');

const router =
    express.Router();

const controller =
    require('../controllers/promotionController');

const {

    requireAuth,

    requireAdmin,

} = require(
    '../middleware/authMiddleware'
);

/// 🔥 PLANES
router.get(
    '/plans',
    controller.getPlans,
);

/// 🔥 CREAR PLAN
router.post(
    '/plans',
    requireAuth,
    requireAdmin,
    controller.createPlan,
);

/// 🔥 EDITAR PLAN
router.put(
    '/plans/:id',
    requireAuth,
    requireAdmin,
    controller.updatePlan,
);

/// 🔥 ACTIVAR / DESACTIVAR
router.post(
    '/plans/:id/toggle',
    requireAuth,
    requireAdmin,
    controller.togglePlan,
);

/// 🔥 CREAR REQUEST
router.post(
    '/request',
    requireAuth,
    controller.createPromotionRequest,
);

/// 🔥 ADMIN LISTAR
router.get(
    '/requests',
    requireAuth,
    requireAdmin,
    controller.getPromotionRequests,
);

/// 🔥 STATS ACTIVAS
router.get(
    '/active-stats',
    requireAuth,
    requireAdmin,
    controller.getActivePromotionsStats,
);

/// 🔥 ADMIN APROBAR
router.post(
    '/approve/:id',
    requireAuth,
    requireAdmin,
    controller.approvePromotion,
);

/// 🔥 CANCELAR PROMOCIÓN
router.post(
    '/cancel/:id',
    requireAuth,
    requireAdmin,
    controller.cancelPromotion,
);

router.put(
  '/:id/proof',
  requireAuth,
  controller.uploadProof
);

module.exports = router;