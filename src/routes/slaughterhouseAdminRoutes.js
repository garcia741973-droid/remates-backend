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

  getPersonById,

  createPerson,

  updatePerson,

  setPersonActive,

  getEstates,

  createEstate,

  updateEstate,

  setEstateActive,

  getBanks,

  createBank,

  setBankActive,

  getPersonPaymentMethods,

  createPersonPaymentMethod,

  updatePersonPaymentMethod,

  setPersonPaymentMethodActive,

  getCompanyPaymentAccounts,

  createCompanyPaymentAccount,

  updateCompanyPaymentAccount,

  setCompanyPaymentAccountActive,

  getAnimalCategories,

  createAnimalCategory,

  updateAnimalCategory,

  setAnimalCategoryActive,

  getBreeds,

  createBreed,

  updateBreed,

  setBreedActive,

  getFeedingMethods,

  createFeedingMethod,

  updateFeedingMethod,

  setFeedingMethodActive,

  getAgeRanges,

  createAgeRange,

  updateAgeRange,

  setAgeRangeActive,

  getAnimalClassifications,

  createAnimalClassification,

  updateAnimalClassification,

  setAnimalClassificationActive,

  getPurchaseLots,

  getPurchaseLotById,

  createPurchaseLot,

  updatePurchaseLot,

  cancelPurchaseLot,

  reactivatePurchaseLot,

  getTroops,

  createTroop,

  updateTroop,

  cancelTroop,

  reactivateTroop,

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

router.get(

  '/people/:id',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'people.view'

  ),

  getPersonById,

);

router.get(

  '/people/:id/payment-methods',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'people.view'

  ),

  getPersonPaymentMethods,

);

router.post(

  '/people/:id/payment-methods',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'people.manage'

  ),

  createPersonPaymentMethod,

);

router.put(

  '/people/:id/payment-methods/:methodId',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'people.manage'

  ),

  updatePersonPaymentMethod,

);

router.patch(

  '/people/:id/payment-methods/:methodId/active',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'people.manage'

  ),

  setPersonPaymentMethodActive,

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

router.put(

  '/people/:id',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'people.manage'

  ),

  updatePerson,

);

router.patch(

  '/people/:id/active',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'people.manage'

  ),

  setPersonActive,

);

// =====================================================

// 🏡 ESTANCIAS

// =====================================================

router.get(

  '/estates',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'people.view'

  ),

  getEstates,

);

router.post(

  '/estates',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'people.manage'

  ),

  createEstate,

);

router.put(

  '/estates/:id',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'people.manage'

  ),

  updateEstate,

);

router.patch(

  '/estates/:id/active',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'people.manage'

  ),

  setEstateActive,

);

// =====================================================

// 🏦 BANCOS

// =====================================================

router.get(

  '/banks',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.view'

  ),

  getBanks,

);

router.post(

  '/banks',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.manage'

  ),

  createBank,

);

router.patch(

  '/banks/:id/active',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.manage'

  ),

  setBankActive,

);

// =====================================================

// 🏦 CUENTAS DE PAGO DE LA EMPRESA

// =====================================================

router.get(

  '/company-payment-accounts',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'billing.view'

  ),

  getCompanyPaymentAccounts,

);

router.post(

  '/company-payment-accounts',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'billing.view'

  ),

  createCompanyPaymentAccount,

);

router.put(

  '/company-payment-accounts/:id',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'billing.view'

  ),

  updateCompanyPaymentAccount,

);

router.patch(

  '/company-payment-accounts/:id/active',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'billing.view'

  ),

  setCompanyPaymentAccountActive,

);

// =====================================================

// 🐄 CATÁLOGOS ANIMALES

// =====================================================

router.get(

  '/animal-categories',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.view'

  ),

  getAnimalCategories,

);

router.post(

  '/animal-categories',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.manage'

  ),

  createAnimalCategory,

);

router.put(

  '/animal-categories/:id',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.manage'

  ),

  updateAnimalCategory,

);

router.patch(

  '/animal-categories/:id/active',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.manage'

  ),

  setAnimalCategoryActive,

);

router.get(

  '/breeds',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.view'

  ),

  getBreeds,

);

router.post(

  '/breeds',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.manage'

  ),

  createBreed,

);

router.put(

  '/breeds/:id',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.manage'

  ),

  updateBreed,

);

router.patch(

  '/breeds/:id/active',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.manage'

  ),

  setBreedActive,

);

router.get(

  '/feeding-methods',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.view'

  ),

  getFeedingMethods,

);

router.post(

  '/feeding-methods',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.manage'

  ),

  createFeedingMethod,

);

router.put(

  '/feeding-methods/:id',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.manage'

  ),

  updateFeedingMethod,

);

router.patch(

  '/feeding-methods/:id/active',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.manage'

  ),

  setFeedingMethodActive,

);

router.get(

  '/age-ranges',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.view'

  ),

  getAgeRanges,

);

router.post(

  '/age-ranges',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.manage'

  ),

  createAgeRange,

);

router.put(

  '/age-ranges/:id',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.manage'

  ),

  updateAgeRange,

);

router.patch(

  '/age-ranges/:id/active',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.manage'

  ),

  setAgeRangeActive,

);

router.get(

  '/animal-classifications',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.view'

  ),

  getAnimalClassifications,

);

router.post(

  '/animal-classifications',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.manage'

  ),

  createAnimalClassification,

);

router.put(

  '/animal-classifications/:id',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.manage'

  ),

  updateAnimalClassification,

);

router.patch(

  '/animal-classifications/:id/active',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'catalogs.manage'

  ),

  setAnimalClassificationActive,

);

// =====================================================

// 🐄 LOTES DE COMPRA

// =====================================================

router.get(

  '/purchase-lots',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'lots.view'

  ),

  getPurchaseLots,

);

router.get(

  '/purchase-lots/:id',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'lots.view'

  ),

  getPurchaseLotById,

);

router.post(

  '/purchase-lots',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'lots.manage'

  ),

  createPurchaseLot,

);

router.put(

  '/purchase-lots/:id',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'lots.manage'
  ),

  updatePurchaseLot,

);

router.patch(

  '/purchase-lots/:id/cancel',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'lots.manage'
  ),

  cancelPurchaseLot,

);

router.patch(

  '/purchase-lots/:id/reactivate',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'lots.manage'
  ),

  reactivatePurchaseLot,

);

// =====================================================

// 🚛 TROPAS

// =====================================================

router.get(

  '/troops',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'troops.view'
  ),

  getTroops,

);

router.post(

  '/troops',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'troops.manage'
  ),

  createTroop,

);

router.put(

  '/troops/:id',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'troops.manage'
  ),

  updateTroop,

);

router.patch(

  '/troops/:id/cancel',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'troops.manage'
  ),

  cancelTroop,

);

router.patch(

  '/troops/:id/reactivate',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'troops.manage'
  ),

  reactivateTroop,

);

module.exports =
  router;