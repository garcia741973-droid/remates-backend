const express = require('express');

const router = express.Router();

const {

  requestAccess,
  getPendingAccess,
  approveAccess,

} = require(
  '../controllers/companyAccessController'
);

const {

  requireAuth,
  requireAdmin,

} = require(
  '../middleware/authMiddleware'
);


/// 🔥 SOLICITAR ACCESO
router.post(
  '/request',
  requireAuth,
  requestAccess,
);


/// 🔥 PENDIENTES
router.get(
  '/pending',
  requireAuth,
  requireAdmin,
  getPendingAccess,
);


/// 🔥 APROBAR
router.post(
  '/approve/:id',
  requireAuth,
  requireAdmin,
  approveAccess,
);

module.exports = router;