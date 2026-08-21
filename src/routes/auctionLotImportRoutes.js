const express =
  require('express');

const router =
  express.Router();

const {
  requireAuth,
  requireAdmin,
} = require(
  '../middleware/authMiddleware'
);

const {

  getImportTemplates,

  createImportTemplate,

  updateImportTemplate,

  deleteImportTemplate,

  importAuctionLots,

} = require(
  '../controllers/auctionLotImportController'
);


/// 📄 PLANTILLAS CSV

router.get(
  '/templates',
  requireAuth,
  requireAdmin,
  getImportTemplates,
);


router.post(
  '/templates',
  requireAuth,
  requireAdmin,
  createImportTemplate,
);


router.put(
  '/templates/:id',
  requireAuth,
  requireAdmin,
  updateImportTemplate,
);


router.delete(
  '/templates/:id',
  requireAuth,
  requireAdmin,
  deleteImportTemplate,
);


/// 📥 IMPORTAR LOTES

router.post(
  '/import',
  requireAuth,
  requireAdmin,
  importAuctionLots,
);


module.exports =
  router;