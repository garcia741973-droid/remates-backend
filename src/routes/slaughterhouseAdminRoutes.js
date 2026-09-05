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

  requestTransportForTroop,

  getTroopTransport,

  selectTroopTransportNegotiation,

  authorizeTroopTransportPayment,

  markTroopTransportPaymentPaid,

  issueWeighingAuthorization,

  getWeighingAuthorizations,

  revokeWeighingAuthorization,

  createLiveWeighingDraft,

  certifyLiveWeighingWithQr,

  getLiveWeighings,

  getLiveWeighingById,

  updateLiveWeighingDraft,

  createLiveWeighingRectification,

  dispatchTroop,

  linkTransportGuideToTroop,

  syncTroopTransportState,

  receiveTroop,

  generatePreliquidationDraft,

  getPreliquidationById,

  addPreliquidationAdjustment,

  deletePreliquidationAdjustment,

  reviewPreliquidation,

  approvePreliquidation,

  cancelPreliquidation,

  getPurchaseLotPreliquidations,

  exportPreliquidation,

  exportPreliquidationCsv,

  getAdminReceptions,

  getAdminReceptionById,

  closeAdminReception,

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

router.post(

  '/purchase-lots/:id/preliquidation',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'preliquidation.manage'

  ),

  generatePreliquidationDraft,

);

router.get(

  '/purchase-lots/:id/preliquidations',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'preliquidation.view'

  ),

  getPurchaseLotPreliquidations,

);

router.delete(

  '/preliquidations/:id/adjustments/:adjustmentId',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'preliquidation.manage'

  ),

  deletePreliquidationAdjustment,

);

router.patch(

  '/preliquidations/:id/review',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'preliquidation.manage'

  ),

  reviewPreliquidation,

);

router.patch(

  '/preliquidations/:id/approve',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'preliquidation.approve'

  ),

  approvePreliquidation,

);

router.patch(

  '/preliquidations/:id/export',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'preliquidation.export'

  ),

  exportPreliquidation,

);

router.post(

  '/preliquidations/:id/export-csv',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'preliquidation.export'

  ),

  exportPreliquidationCsv,

);

router.patch(

  '/preliquidations/:id/cancel',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'preliquidation.manage'

  ),

  cancelPreliquidation,

);

router.get(

  '/preliquidations/:id',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'preliquidation.view'

  ),

  getPreliquidationById,

);

router.post(

  '/preliquidations/:id/adjustments',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(

    'preliquidation.manage'

  ),

  addPreliquidationAdjustment,

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

router.post(

  '/troops/:id/request-transport',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'transport.request'
  ),

  requestTransportForTroop,

);

router.get(

  '/troops/:id/transport',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'transport.view'
  ),

  getTroopTransport,

);

router.post(

  '/troops/:id/select-negotiation',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'transport.negotiate'
  ),

  selectTroopTransportNegotiation,

);

router.post(

  '/troops/:id/authorize-payment',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'transport.authorize_payment'
  ),

  authorizeTroopTransportPayment,

);

router.post(

  '/troops/:id/mark-payment-paid',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'transport.mark_payment_paid'
  ),

  markTroopTransportPaymentPaid,

);

router.post(

  '/purchase-lots/:id/weighing-authorizations',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'weighing.issue_qr'
  ),

  issueWeighingAuthorization,

);

router.post(

  '/purchase-lots/:id/weighing-authorizations',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'weighing.issue_qr'
  ),

  issueWeighingAuthorization,

);

router.get(

  '/purchase-lots/:id/weighing-authorizations',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'weighing.view'
  ),

  getWeighingAuthorizations,

);

router.patch(

  '/weighing-authorizations/:id/revoke',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'weighing.issue_qr'
  ),

  revokeWeighingAuthorization,

);

router.post(

  '/purchase-lots/:id/weighings',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'weighing.manage'
  ),

  createLiveWeighingDraft,

);

router.post(

  '/weighings/:id/certify',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'weighing.manage'
  ),

  certifyLiveWeighingWithQr,

);

router.get(

  '/purchase-lots/:id/weighings',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'weighing.view'
  ),

  getLiveWeighings,

);

router.get(

  '/purchase-lots/:id/weighings',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'weighing.view'
  ),

  getLiveWeighings,

);

router.get(

  '/weighings/:id',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'weighing.view'
  ),

  getLiveWeighingById,

);

router.put(

  '/weighings/:id',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'weighing.manage'
  ),

  updateLiveWeighingDraft,

);

router.post(

  '/weighings/:id/rectify',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'weighing.manage'
  ),

  createLiveWeighingRectification,

);

router.post(

  '/troops/:id/dispatch',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'troops.manage'
  ),

  dispatchTroop,

);

router.post(

  '/troops/:id/link-guide',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'transport.view'
  ),

  linkTransportGuideToTroop,

);

router.post(

  '/troops/:id/sync-transport-state',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'transport.view'
  ),

  syncTroopTransportState,

);

router.post(

  '/troops/:id/receive',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'reception.manage'
  ),

  receiveTroop,

);

router.get(

  '/receptions',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'reception.view'
  ),

  getAdminReceptions,

);

router.get(

  '/receptions/:id',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'reception.view'
  ),

  getAdminReceptionById,

);

router.post(

  '/receptions/:id/close',

  requireAuth,

  requireSlaughterhouseAdmin,

  requireSlaughterhousePermission(
    'reception.manage'
  ),

  closeAdminReception,

);

module.exports =
  router;