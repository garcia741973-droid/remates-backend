const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/authMiddleware");

const {
  requestSeller,
  getPendingSellers,
  approveSeller
} = require("../controllers/sellerController.cjs");

/// 🟢 SOLICITAR SER VENDEDOR
router.post("/request", requireAuth, requestSeller);

/// 🔵 LISTA PENDIENTES (SUPER ADMIN)
router.get("/pending", requireAuth, getPendingSellers);

/// 🟢 APROBAR VENDEDOR
router.post("/approve/:id", requireAuth, approveSeller);

module.exports = router;