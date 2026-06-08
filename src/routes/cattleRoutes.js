const express =
  require('express');

const router =
  express.Router();

const {

  getCategories,
  getBreeds,

  getAdminCategories,
  getAdminBreeds,

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

/// 🐄 ADMIN CATEGORÍAS
router.get(
  '/admin/categories',
  getAdminCategories
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

/// 🧬 ADMIN RAZAS
router.get(
  '/admin/breeds',
  getAdminBreeds
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