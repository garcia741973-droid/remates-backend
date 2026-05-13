const express = require("express");

const router = express.Router();

const {
  requireAuth
} = require(
  "../middleware/authMiddleware"
);

const {
  getAllUsers,
} = require(
  "../controllers/superAdminController.cjs"
);

const {

  getFeaturedRequests,

  approveFeaturedRequest,

  rejectFeaturedRequest,

} = require(
  "../controllers/featuredController"
);

const {

  getPromotionRequests,

  approvePromotion,

  rejectPromotion,

  togglePromotionVisibility,

  toggleSponsor,

  updatePromotionPriority,

} = require(
  "../controllers/promotionController"
);

/// 👥 USUARIOS
router.get(
  "/users",
  requireAuth,
  getAllUsers
);

/// 📢 PROMOCIONES
router.get(
  "/promotions",
  requireAuth,
  getPromotionRequests
);

/// ✅ APROBAR
router.post(
  "/promotions/:id/approve",
  requireAuth,
  approvePromotion
);

/// ❌ RECHAZAR
router.post(
  "/promotions/:id/reject",
  requireAuth,
  rejectPromotion
);

/// 👁️ VISIBILIDAD
router.put(
  "/promotions/:id/visibility",
  requireAuth,
  togglePromotionVisibility
);

/// ⭐ SPONSOR
router.put(
  "/promotions/:id/sponsor",
  requireAuth,
  toggleSponsor
);

/// 🔥 PRIORIDAD
router.put(
  "/promotions/:id/priority",
  requireAuth,
  updatePromotionPriority
);

module.exports = router;