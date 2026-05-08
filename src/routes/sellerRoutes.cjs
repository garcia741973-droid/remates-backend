const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/authMiddleware");

const {
  requestSeller,
  getPendingSellers,
  approveSeller,
  getSellerProfile
} = require("../controllers/sellerController.cjs");

/// 🟢 SOLICITAR SER VENDEDOR
router.post("/request", requireAuth, requestSeller);

/// 🔵 LISTA PENDIENTES (SUPER ADMIN)
router.get("/pending", requireAuth, getPendingSellers);

/// 🟢 APROBAR VENDEDOR
router.post("/approve/:id", requireAuth, approveSeller);

/// 🔥 PERFIL PÚBLICO VENDEDOR
router.get(
  "/profile/:id",
  requireAuth,
  getSellerProfile
);

module.exports = router;