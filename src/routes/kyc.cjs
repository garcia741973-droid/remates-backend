const express = require("express");
const router = express.Router();

const {
  getMyKyc,
  updateKyc,
  uploadDocuments,
  uploadVideo,
  submitKyc,
  getPendingKyc,
  approveKyc,
  rejectKyc
} = require("../controllers/kycController.cjs");

const { requireAuth, requireAdmin } = require("../middlewares/auth");

// CLIENT
router.get("/me", requireAuth, getMyKyc);
router.post("/update", requireAuth, updateKyc);
router.post("/documents", requireAuth, uploadDocuments);
router.post("/video", requireAuth, uploadVideo);
router.post("/submit", requireAuth, submitKyc);

// ADMIN
router.get("/pending", requireAuth, requireAdmin, getPendingKyc);
router.post("/:userId/approve", requireAuth, requireAdmin, approveKyc);
router.post("/:userId/reject", requireAuth, requireAdmin, rejectKyc);

module.exports = router;