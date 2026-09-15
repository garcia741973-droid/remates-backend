const express = require('express');

const router = express.Router();

const upload =
  require('../middleware/uploadMiddleware');

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
  getSlaughterhouseTrucks,
  getSlaughterhouseReceptionCandidates,
  getOpenSlaughterhouseReceptions,
  uploadSlaughterhouseReceptionPhoto,
  createSlaughterhouseGateArrival,
  createSlaughterhouseReception,
  startSlaughterhouseSlaughter,
  getSlaughterhouseSlaughterReceptions,
  createSlaughterhouseCarcass,
  updateLastSlaughterhouseCarcass,
  finishSlaughterhouseSlaughter,
  getSlaughterhouseExportCatalog,
  getSlaughterhouseExportProfiles,
  createSlaughterhouseExportProfile,
  updateSlaughterhouseExportProfile,
  deleteSlaughterhouseExportProfile,
  exportSlaughterhouseReceptionCsv,
  exportSlaughterhouseReceptionsCsv,
  getSlaughterhouseReceptionHistory,
} = require(
  '../controllers/slaughterhouseController'
);


// =====================================================
// 🔐 TODAS LAS RUTAS DE ESTE MÓDULO
// REQUIEREN:
// - usuario autenticado
// - contexto de frigorífico válido
// =====================================================

router.use(
  requireAuth,
  requireSlaughterhouseAdmin,
);


// =====================================================
// 🚛 SEGUIMIENTO DE CAMIONES
// =====================================================

router.get(
  '/trucks',
  requireSlaughterhousePermission(
    'transport.view'
  ),
  getSlaughterhouseTrucks,
);


// =====================================================
// 🐄 TRANSPORTES DISPONIBLES PARA RECEPCIÓN
// =====================================================

router.get(
  '/reception-candidates',
  requireSlaughterhousePermission(
    'reception.view'
  ),
  getSlaughterhouseReceptionCandidates,
);


// =====================================================
// 📋 RECEPCIONES ABIERTAS
// =====================================================

router.get(
  '/receptions/open',
  requireSlaughterhousePermission(
    'reception.view'
  ),
  getOpenSlaughterhouseReceptions,
);

// =====================================================
// 📷 FOTO PORTERÍA / RECEPCIÓN
// =====================================================

router.post(
  '/gate-arrivals/photo',
  requireSlaughterhousePermission(
    'reception.manage'
  ),
  upload.single('file'),
  uploadSlaughterhouseReceptionPhoto,
);

// =====================================================
// 🚪 REGISTRAR LLEGADA A PORTERÍA
// =====================================================

router.post(
  '/gate-arrivals',
  requireSlaughterhousePermission(
    'reception.manage'
  ),
  createSlaughterhouseGateArrival,
);

// =====================================================
// 🐄 RECEPCIÓN DE GANADO
// =====================================================

router.post(
  '/receptions',
  requireSlaughterhousePermission(
    'reception.manage'
  ),
  createSlaughterhouseReception,
);


// =====================================================
// 🏭 INICIAR FAENA
// =====================================================

router.post(
  '/receptions/:id/start-slaughter',
  requireSlaughterhousePermission(
    'slaughter.manage'
  ),
  startSlaughterhouseSlaughter,
);


// =====================================================
// 🏭 RECEPCIONES PARA FAENA
// =====================================================

router.get(
  '/slaughter',
  requireSlaughterhousePermission(
    'slaughter.view'
  ),
  getSlaughterhouseSlaughterReceptions,
);


// =====================================================
// 🏭 REGISTRAR CARCASA
// =====================================================

router.post(
  '/slaughter/:id/carcasses',
  requireSlaughterhousePermission(
    'slaughter.manage'
  ),
  createSlaughterhouseCarcass,
);


// =====================================================
// 🏭 CORREGIR ÚLTIMA CARCASA
// =====================================================

router.put(
  '/slaughter/:id/carcasses/last',
  requireSlaughterhousePermission(
    'slaughter.manage'
  ),
  updateLastSlaughterhouseCarcass,
);


// =====================================================
// 🏭 FINALIZAR FAENA
// =====================================================

router.post(
  '/slaughter/:id/finish',
  requireSlaughterhousePermission(
    'slaughter.manage'
  ),
  finishSlaughterhouseSlaughter,
);


// =====================================================
// 📋 HISTORIAL DE RECEPCIONES / FAENAS
// =====================================================

router.get(
  '/receptions/history',
  requireSlaughterhousePermission(
    'reports.view'
  ),
  getSlaughterhouseReceptionHistory,
);


// =====================================================
// 📄 CATÁLOGO EXPORTACIÓN CSV
// =====================================================

router.get(
  '/export/catalog',
  requireSlaughterhousePermission(
    'reports.export'
  ),
  getSlaughterhouseExportCatalog,
);


// =====================================================
// 📄 PERFILES DE EXPORTACIÓN CSV
// =====================================================

router.get(
  '/export/profiles',
  requireSlaughterhousePermission(
    'reports.export'
  ),
  getSlaughterhouseExportProfiles,
);


router.post(
  '/export/profiles',
  requireSlaughterhousePermission(
    'reports.export'
  ),
  createSlaughterhouseExportProfile,
);


router.put(
  '/export/profiles/:id',
  requireSlaughterhousePermission(
    'reports.export'
  ),
  updateSlaughterhouseExportProfile,
);


router.delete(
  '/export/profiles/:id',
  requireSlaughterhousePermission(
    'reports.export'
  ),
  deleteSlaughterhouseExportProfile,
);


// =====================================================
// 📄 EXPORTAR RECEPCIÓN SEGÚN PERFIL CSV
// =====================================================

router.get(
  '/receptions/:id/export/:profileId',
  requireSlaughterhousePermission(
    'reports.export'
  ),
  exportSlaughterhouseReceptionCsv,
);


// =====================================================
// 📦 EXPORTAR VARIAS RECEPCIONES SEGÚN PERFIL CSV
// =====================================================

router.post(
  '/receptions/export/:profileId',
  requireSlaughterhousePermission(
    'reports.export'
  ),
  exportSlaughterhouseReceptionsCsv,
);


module.exports = router;