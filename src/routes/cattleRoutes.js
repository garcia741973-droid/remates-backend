const express =
  require('express');

const router =
  express.Router();

const {

  getCategories,
  getBreeds,

  createCategory,
  updateCategory,
  toggleCategoryStatus,

  createBreed,
  updateBreed,
  toggleBreedStatus,

} = require(
  '../controllers/cattleController'
);

/// 🐄 CATEGORÍAS
router.get(
  '/categories',
  getCategories
);

/// 🐄 CREAR CATEGORÍA
router.post(
  '/categories',
  createCategory
);

/// 🐄 EDITAR CATEGORÍA
router.put(
  '/categories/:id',
  updateCategory
);

/// 🐄 ACTIVAR / DESACTIVAR
router.patch(
  '/categories/:id/status',
  toggleCategoryStatus
);

/// 🐄 RAZAS
router.get(
  '/breeds',
  getBreeds
);

/// 🧬 CREAR RAZA
router.post(
  '/breeds',
  createBreed
);

/// 🧬 EDITAR RAZA
router.put(
  '/breeds/:id',
  updateBreed
);

/// 🧬 ACTIVAR / DESACTIVAR
router.patch(
  '/breeds/:id/status',
  toggleBreedStatus
);

module.exports =
  router;