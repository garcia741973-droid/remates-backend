const express = require("express");

const router = express.Router();

const {
  requireAuth
} = require(
  "../middleware/authMiddleware"
);

const {
  getAllUsers,
  getUserDetail,
  createRemateCompany,
  updateRemateCompany,
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

  getPromotions,

  approvePromotion,

  toggleVisibility,

} = require(
  "../controllers/superAdminPromotionsController"
);

const {

  rejectPromotion,

  toggleSponsor,

  updatePromotionPriority,

  updatePromotion,

} = require(
  "../controllers/promotionController"
);

/// 👥 USUARIOS
router.get(
  "/users",
  requireAuth,
  getAllUsers
);

router.get(
  "/users/:id",
  requireAuth,
  getUserDetail
);

/// 🏢 CREAR EMPRESA REMATERA
router.post(

  "/remate-companies",

  requireAuth,

  createRemateCompany
);

/// ✏️ UPDATE EMPRESA REMATERA
router.put(

  "/remate-companies/:id",

  requireAuth,

  updateRemateCompany
);

/// 📢 PROMOCIONES
router.get(
  "/promotions",
  requireAuth,
  getPromotions
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
  toggleVisibility
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

/// ✏️ UPDATE PROMOTION
router.put(
  "/promotions/:id",
  requireAuth,
  updatePromotion
);

module.exports = router;