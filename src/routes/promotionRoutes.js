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

/// 🔥 ADMIN APROBAR
router.post(
    '/approve/:id',
    requireAuth,
    requireAdmin,
    controller.approvePromotion,
);

router.put(
  '/:id/proof',
  requireAuth,
  controller.uploadProof
);

module.exports = router;