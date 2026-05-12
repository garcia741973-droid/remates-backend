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

/// 👥 USUARIOS
router.get(
  "/users",
  requireAuth,
  getAllUsers
);

/// ⭐ SOLICITUDES PREMIUM
//router.get(
//  "/featured-requests",
//  requireAuth,
//  getFeaturedRequests
//);

/// ✅ APROBAR PREMIUM
//router.post(
//  "/featured-requests/:id/approve",
//  requireAuth,
//  approveFeaturedRequest
//);

/// ❌ RECHAZAR PREMIUM
//router.post(
//  "/featured-requests/:id/reject",
//  requireAuth,
//  rejectFeaturedRequest
//);

module.exports = router;