const express =
  require('express');

const router =
  express.Router();


const {
  requireAuth,
} = require(
  '../middleware/authMiddleware'
);


const {
  requireSlaughterhouseAdmin,
  requireSlaughterhousePermission,
} = require(
  '../middleware/slaughterhouseAdminMiddleware'
);


const {
  getAdminSession,
  getAdminDashboard,
  getPeople,
  createPerson,
} = require(
  '../controllers/slaughterhouseAdminController'
);


// =====================================================
// 👤 SESIÓN
// =====================================================

router.get(
  '/session',
  requireAuth,
  requireSlaughterhouseAdmin,
  getAdminSession,
);


// =====================================================
// 📊 DASHBOARD
// =====================================================

router.get(
  '/dashboard',
  requireAuth,
  requireSlaughterhouseAdmin,
  requireSlaughterhousePermission(
    'dashboard.view'
  ),
  getAdminDashboard,
);


// =====================================================
// 👥 PERSONAS
// =====================================================

router.get(
  '/people',
  requireAuth,
  requireSlaughterhouseAdmin,
  requireSlaughterhousePermission(
    'people.view'
  ),
  getPeople,
);


router.post(
  '/people',
  requireAuth,
  requireSlaughterhouseAdmin,
  requireSlaughterhousePermission(
    'people.manage'
  ),
  createPerson,
);


module.exports =
  router;