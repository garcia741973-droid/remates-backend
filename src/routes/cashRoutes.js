const express = require('express');

const router = express.Router();

const {
    getCashReport,
    getCashMovements,
    createMovement,
    getCategories,
    createCategory,
} = require(
    '../controllers/cashController',
);

const {
    requireAuth,
} = require(
    '../middleware/authMiddleware',
);

router.get(
    '/report',
    requireAuth,
    getCashReport,
);

router.get(
    '/movements',
    requireAuth,
    getCashMovements,
);

router.post(
    '/movement',
    requireAuth,
    createMovement,
);

router.get(
    '/categories',
    requireAuth,
    getCategories,
);

router.post(
    '/categories',
    requireAuth,
    createCategory,
);

module.exports = router;