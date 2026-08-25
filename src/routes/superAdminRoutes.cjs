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

  getSlaughterhouses,

  createSlaughterhouseCompany,

  getSlaughterhouseUsers,

  getSlaughterhouseCandidates,

  addSlaughterhouseUser,

  removeSlaughterhouseUser,

  updateSlaughterhouseStatus,

  updateSlaughterhouseLocation,

  deleteSlaughterhouseLocation,

  getSlaughterhouseOperators,

  createSlaughterhouseOperator,

  updateSlaughterhouseOperatorStatus,

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

/// =====================================================
/// 🏭 FRIGORÍFICOS
/// CONTROL EXCLUSIVO SUPER ADMIN
/// =====================================================


/// 📋 LISTAR FRIGORÍFICOS

router.get(

  "/slaughterhouses",

  requireAuth,

  getSlaughterhouses

);

/// ➕ CREAR FRIGORÍFICO

router.post(

  "/slaughterhouses",

  requireAuth,

  createSlaughterhouseCompany

);

/// 🔘 ACTIVAR / DESACTIVAR FRIGORÍFICO

router.put(

  "/slaughterhouses/:id/status",

  requireAuth,

  updateSlaughterhouseStatus

);


/// 📍 ACTUALIZAR UBICACIÓN DE PLANTA

router.put(

  "/slaughterhouses/:id/location",

  requireAuth,

  updateSlaughterhouseLocation

);


/// 🗑️ ELIMINAR UBICACIÓN DE PLANTA

router.delete(

  "/slaughterhouses/:id/location",

  requireAuth,

  deleteSlaughterhouseLocation

);


/// 👥 CANDIDATOS PARA AGREGAR

router.get(

  "/slaughterhouses/:id/candidates",

  requireAuth,

  getSlaughterhouseCandidates

);


/// 👥 USUARIOS DEL FRIGORÍFICO

router.get(

  "/slaughterhouses/:id/users",

  requireAuth,

  getSlaughterhouseUsers

);


/// ➕ AUTORIZAR USUARIO

router.post(

  "/slaughterhouses/:id/users",

  requireAuth,

  addSlaughterhouseUser

);


/// ➖ QUITAR USUARIO

router.delete(

  "/slaughterhouses/:id/users/:userId",

  requireAuth,

  removeSlaughterhouseUser

);


/// =====================================================
/// 👷 OPERADORES DE FRIGORÍFICO
/// CONTROL EXCLUSIVO SUPER ADMIN
/// =====================================================

/// 📋 LISTAR OPERADORES

router.get(

  "/slaughterhouses/:id/operators",

  requireAuth,

  getSlaughterhouseOperators

);


/// ➕ CREAR OPERADOR

router.post(

  "/slaughterhouses/:id/operators",

  requireAuth,

  createSlaughterhouseOperator

);


/// 🔘 ACTIVAR / DESACTIVAR OPERADOR

router.put(

  "/slaughterhouses/:id/operators/:userId/status",

  requireAuth,

  updateSlaughterhouseOperatorStatus

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