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
  requireAnySlaughterhousePermission,
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
  updateSlaughterhouseReceptionTruckLiveWeight,
  getSlaughterhouseScaleFieldCategories,
  startSlaughterhouseSlaughter,
  getSlaughterhouseSlaughterReceptions,
  createSlaughterhouseCarcass,
  getSlaughterhouseCarcasses,
  updateLastSlaughterhouseCarcass,
  updateSlaughterhouseCarcass,
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

const {
  getSlaughterhouseScaleGroups,
  saveSlaughterhouseScaleGroups,
  registerSlaughterhouseScaleGroupPlantWeight,
} = require(
  '../controllers/slaughterhouseScaleGroupsController'
);

const {
  startSlaughterhouseScaleGroup,
} = require(
  '../controllers/slaughterhouseGroupSlaughterController'
);

const {
  createSlaughterhouseScaleGroupCarcass,
} = require(
  '../controllers/slaughterhouseGroupCarcassController'
);

const {
  finishSlaughterhouseScaleGroup,
} = require(
  '../controllers/slaughterhouseGroupFinishController'
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
// ⚖️ PESO VIVO EN PLANTA
// =====================================================

router.patch(
  '/receptions/:id/trucks/:truckId/live-weight',

  requireSlaughterhousePermission(
    'plant_weight.manage'
  ),

  updateSlaughterhouseReceptionTruckLiveWeight,
);

// =====================================================
// ⚖️ BALANZA — CATEGORÍAS CERTIFICADAS DE CAMPO
//
// SOLO LECTURA.
// Requiere permiso de pesaje en planta.
// =====================================================

router.get(
  '/scale/troops/:troopId/field-categories',

  requireSlaughterhousePermission(
    'plant_weight.manage'
  ),

  getSlaughterhouseScaleFieldCategories,
);

// =====================================================
// ⚖️ BALANZA — GRUPOS OPERATIVOS
// =====================================================

// Consultar grupos guardados
router.get(
  '/scale/troops/:troopId/groups',

  requireAnySlaughterhousePermission([
    'plant_weight.manage',
    'slaughter.view',
    'slaughter.manage',
  ]),

  getSlaughterhouseScaleGroups,
);

// Guardar o reorganizar grupos
router.put(
  '/scale/troops/:troopId/groups',

  requireSlaughterhousePermission(
    'plant_weight.manage'
  ),

  saveSlaughterhouseScaleGroups,
);

// =====================================================
// ⚖️ BALANZA — PESO VIVO POR GRUPO
// =====================================================

router.patch(
  '/scale/troops/:troopId/groups/:groupId/plant-weight',

  requireSlaughterhousePermission(
    'plant_weight.manage'
  ),

  registerSlaughterhouseScaleGroupPlantWeight,
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
// FAENA — INICIO INDEPENDIENTE POR GRUPO
// =====================================================

router.post(
  '/scale/troops/:troopId/groups/:groupId/start-slaughter',

  requireSlaughterhousePermission(
    'slaughter.manage'
  ),

  startSlaughterhouseScaleGroup,
);

// =====================================================
// FAENA — REGISTRAR MEDIA CARCASA POR GRUPO
// =====================================================

router.post(
  '/scale/troops/:troopId/groups/:groupId/carcasses',

  requireSlaughterhousePermission(
    'slaughter.manage'
  ),

  createSlaughterhouseScaleGroupCarcass,
);

// =====================================================
// FAENA — CIERRE INDEPENDIENTE POR GRUPO
// =====================================================

router.post(
  '/scale/troops/:troopId/groups/:groupId/finish-slaughter',

  requireSlaughterhousePermission(
    'slaughter.manage'
  ),

  finishSlaughterhouseScaleGroup,
);

// =====================================================
// 🏭 RECEPCIONES PARA FAENA
// =====================================================

router.get(
  '/slaughter',
  requireAnySlaughterhousePermission([
    'slaughter.view',
    'plant_weight.view',
  ]),
  getSlaughterhouseSlaughterReceptions,
);

// =====================================================
// 🏭 LISTAR MEDIAS DE FAENA
// =====================================================

router.get(
  '/slaughter/:id/carcasses',
  requireSlaughterhousePermission(
    'slaughter.manage'
  ),
  getSlaughterhouseCarcasses,
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
// 🏭 CORREGIR MEDIA CARCASA ESPECÍFICA
// =====================================================

router.put(
  '/slaughter/:id/carcasses/:carcassId',
  requireSlaughterhousePermission(
    'slaughter.manage'
  ),
  updateSlaughterhouseCarcass,
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