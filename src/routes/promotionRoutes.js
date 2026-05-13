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

/// 🏠 HOME BANNERS
router.get(
    '/home-banners',
    requireAuth,
    controller.getHomeBanners,
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

/// 📢 CREAR CAMPAÑA PUBLICITARIA
router.post(
    '/create-campaign',
    requireAuth,
    requireAdmin,
    controller.createAdCampaign,
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

/// ❌ RECHAZAR PROMOCIÓN
router.post(
    '/reject/:id',
    requireAuth,
    requireAdmin,
    controller.rejectPromotion,
);

/// 🔥 CANCELAR PROMOCIÓN
router.post(
    '/cancel/:id',
    requireAuth,
    requireAdmin,
    controller.cancelPromotion,
);

/// ✏️ UPDATE PROMOTION
router.put(
    '/:id',
    requireAuth,
    requireAdmin,
    controller.updatePromotion,
);

router.put(
  '/:id/proof',
  requireAuth,
  controller.uploadProof
);

/// 👁 IMPRESSION
router.post(
    '/:id/impression',
    controller.incrementImpression,
);

/// 🖱 CLICK
router.post(
    '/:id/click',
    controller.incrementClick,
);

module.exports = router;