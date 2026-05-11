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

  getSavedSearches,

  toggleSavedSearch,

  getSavedSearchAlerts,

  deleteSavedSearch,

} = require(
  '../controllers/savedSearchesController'
);

/// 🔍 LISTAR
router.get(
  '/',
  requireAuth,
  getSavedSearches
);

/// 🔥 TOGGLE
router.patch(
  '/:id/toggle',
  requireAuth,
  toggleSavedSearch
);

/// 🗑️ DELETE
router.delete(
  '/:id',
  requireAuth,
  deleteSavedSearch
);

/// 🔥 ALERTAS DE BÚSQUEDA
router.get(
  '/:id/alerts',
  requireAuth,
  getSavedSearchAlerts
);

module.exports =
  router;