const express =
  require('express');

const router =
  express.Router();

const {

  getCategories,

  getBreeds,

} = require(
  '../controllers/cattleController'
);

/// 🐄 CATEGORÍAS
router.get(
  '/categories',
  getCategories
);

/// 🐄 RAZAS
router.get(
  '/breeds',
  getBreeds
);

module.exports =
  router;