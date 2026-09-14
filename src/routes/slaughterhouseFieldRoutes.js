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
} = require(
  '../controllers/slaughterhouseFieldController'
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
// 📤 SINCRONIZAR CAPTURA DE UN LOTE / CAMIÓN
// =====================================================

router.post(
  '/capture-sheets/:captureSheetId/lots/:purchaseLotId/sync-capture',
  syncFieldLotCapture,
);

module.exports = router;