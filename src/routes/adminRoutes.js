const express = require('express');

const router = express.Router();

const {
  createUser,
  getUsers,
  updateUser,
  deleteUser,
  updateClientBiddingAccess,
} = require('../controllers/adminController');

const {
  requireAuth,
} = require('../middleware/authMiddleware');


// =====================================================
// 👥 USUARIOS / CLIENTES DE LA EMPRESA
// =====================================================

router.post(
  '/users',
  requireAuth,
  createUser,
);


router.get(
  '/users',
  requireAuth,
  getUsers,
);


router.put(
  '/users/:id',
  requireAuth,
  updateUser,
);


router.delete(
  '/users/:id',
  requireAuth,
  deleteUser,
);


// =====================================================
// 🔨 CONGELAR / REACTIVAR PUJAS
// SOLO AFECTA AL CLIENTE EN ESTA EMPRESA
// =====================================================

router.put(
  '/users/:id/bidding-access',
  requireAuth,
  updateClientBiddingAccess,
);


module.exports = router;