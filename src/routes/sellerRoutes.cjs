const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middlewares/authMiddleware");
const { requestSeller } = require("../controllers/sellerController.cjs");

router.post("/request", requireAuth, requestSeller);

module.exports = router;