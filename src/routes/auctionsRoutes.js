const express = require('express');
const router = express.Router();

const auctionsController = require('../controllers/auctionsController');

const {
  createAuction,
  setCurrentLot,
  getAuctionById,
  getAuctions // 🔥 NUEVO
} = require('../controllers/auctionsController');

const { requireAuth } = require('../middleware/authMiddleware');


// 🟢 CREAR REMATE
router.post('/', requireAuth, createAuction);


// 🔥 LISTAR REMATES (IMPORTANTE: VA ANTES DE /:id)
router.get('/', requireAuth, getAuctions);


// 🟢 OBTENER REMATE POR ID
router.get('/:id', requireAuth, getAuctionById);


// 🟢 CAMBIAR LOTE ACTUAL
router.post('/current-lot', requireAuth, setCurrentLot);

router.post('/start', requireAuth, auctionsController.startAuction);

module.exports = router;