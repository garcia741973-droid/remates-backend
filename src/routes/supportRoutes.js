const express = require('express');

const router = express.Router();

const {
    requireAuth,
} = require('../middleware/authMiddleware');

const {

    createSupportRequest,

    getMySupportRequests,

    getOpenSupportRequests,

    resolveSupportRequest,

    sendDeviceCommand,

    sendDiagnostic,

    getPendingDeviceCommand,

    confirmDeviceCommand,

} = require('../controllers/supportController');


/// =======================================
/// USUARIO
/// =======================================

router.post(
    '/create',
    requireAuth,
    createSupportRequest,
);

router.get(
    '/my-conversations',
    requireAuth,
    getMySupportRequests,
);

router.get(
    '/pending-command',
    requireAuth,
    getPendingDeviceCommand,
);

router.post(
    '/command-executed/:id',
    requireAuth,
    confirmDeviceCommand,
);


/// =======================================
/// SUPER ADMIN
/// =======================================

router.get(
    '/open',
    requireAuth,
    getOpenSupportRequests,
);

router.post(
    '/resolve/:id',
    requireAuth,
    resolveSupportRequest,
);

router.post(
    '/send-command',
    requireAuth,
    sendDeviceCommand,
);

router.post(
    '/send-diagnostic',
    requireAuth,
    sendDiagnostic,
);


module.exports = router;