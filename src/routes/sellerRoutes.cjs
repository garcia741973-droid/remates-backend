const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/authMiddleware");
const { requestSeller } = require("../controllers/sellerController.cjs");

router.post("/request", requireAuth, requestSeller);

module.exports = router;