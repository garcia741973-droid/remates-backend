const express = require("express");
const router = express.Router();

const { requireAuth } = require("../middleware/authMiddleware");
const { getAllUsers } = require("../controllers/superAdminController.cjs");

router.get("/users", requireAuth, getAllUsers);

module.exports = router;