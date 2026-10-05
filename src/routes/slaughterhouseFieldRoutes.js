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
  getAssignedCaptureSheets,
  getAssignedCaptureSheetById,
  syncFieldLotCapture,
  syncFieldLiveWeighing,
  updateFieldCaptadorNotes,
  getFieldApprovedTransportTrucks,
  assignFieldPurchaseLotTransport,
  closeFieldPurchaseLotTransportRequest,
} = require(
  '../controllers/slaughterhouseFieldController'
);

const {
  certifyFieldLot,
} = require(
  '../controllers/slaughterhouseFieldCertificationController'
);

// =====================================================
// 📱 CAMPO FRIGORÍFICO
//
// Usuario normal Plaza Ganadera.
// NO requiere requireSlaughterhouseAdmin.
// =====================================================

router.use(
  requireAuth
);


// =====================================================
// 📋 HOJAS ASIGNADAS AL CAPTADOR
// =====================================================

router.get(
  '/capture-sheets',
  getAssignedCaptureSheets,
);

router.get(
  '/capture-sheets/:id',
  getAssignedCaptureSheetById,
);

// =====================================================
// 🚛 CAMIONES HABILITADOS PARA EL CAPTADOR
// =====================================================

router.get(
  '/transport/trucks',
  getFieldApprovedTransportTrucks,
);

router.post(
  '/purchase-lots/:id/assign-transport',
  assignFieldPurchaseLotTransport,
);

router.post(
  '/purchase-lots/:id/close-transport-request',
  closeFieldPurchaseLotTransportRequest,
);

// =====================================================
// 📤 SINCRONIZAR CAPTURA DE UN LOTE / CAMIÓN
// =====================================================

router.post(
  '/capture-sheets/:captureSheetId/lots/:purchaseLotId/sync-capture',
  syncFieldLotCapture,
);

// =====================================================
// 📝 OBSERVACIÓN DEL CAPTADOR SOBRE EL LOTE
// =====================================================

router.patch(
  '/capture-sheets/:captureSheetId/lots/:purchaseLotId/captador-notes',
  updateFieldCaptadorNotes,
);

// =====================================================
// ⚖️ SINCRONIZAR PESAJE DE CAMPO / PESO EN ORIGEN
// =====================================================

router.post(
  '/capture-sheets/:captureSheetId/lots/:purchaseLotId/sync-weighing',
  syncFieldLiveWeighing,
);

// =====================================================
// 🔐 CERTIFICAR CARGA DE CAMPO CON QR
// =====================================================

router.post(
  '/capture-sheets/:captureSheetId/lots/:purchaseLotId/certify',
  certifyFieldLot,
);

module.exports = router;