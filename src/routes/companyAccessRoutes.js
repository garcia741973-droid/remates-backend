const express = require('express');

const router = express.Router();

const {

  requestAccess,
  getPendingAccess,
  approveAccess,
  getMyCompanyAccess,

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

/// 🔥 MI ESTADO EMPRESA
router.get(
  '/me',
  requireAuth,
  getMyCompanyAccess,
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