const express = require('express');

const router = express.Router();

const requireAuth =
  require('../middlewares/requireAuth');

const {
  uploadFeaturedProof,
} = require(
  '../controllers/featuredController'
);

/// ⭐ SUBIR COMPROBANTE
router.post(
  '/:id/upload-proof',
  requireAuth,
  uploadFeaturedProof
);

module.exports = router;