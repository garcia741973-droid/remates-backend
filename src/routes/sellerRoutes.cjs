const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/authMiddleware");
const { requestSeller } = require("../controllers/sellerController.cjs");

router.post("/request", requireAuth, requestSeller);

const { approveSeller } = require("../controllers/sellerController.cjs");

router.post("/approve/:userId", requireAuth, approveSeller);

const {
  getPendingSellers,
  approveSeller
} = require("../controllers/sellerController.cjs");

router.get("/pending", requireAuth, getPendingSellers);
router.post("/approve/:id", requireAuth, approveSeller);

module.exports = router;