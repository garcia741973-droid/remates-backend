const express =
    require('express');

const router =
    express.Router();

const {

  generateCertificate,

} = require(
  '../controllers/auctionCertificatesController'
);

const {

  requireAuth,

} = require(
  '../middleware/authMiddleware'
);

router.post(

  '/:id/generate',

  requireAuth,

  generateCertificate,
);

module.exports = router;