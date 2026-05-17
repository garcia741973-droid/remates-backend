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

    createTemplate,

    getTemplates,

    deleteTemplate,

} = require(
    '../controllers/notificationTemplatesController'
);

/// 🔥 CREAR
router.post(
    '/',
    requireAuth,
    createTemplate,
);

/// 🔥 LISTAR
router.get(
    '/',
    requireAuth,
    getTemplates,
);

/// 🔥 DELETE
router.delete(
    '/:id',
    requireAuth,
    deleteTemplate,
);

module.exports =
    router;