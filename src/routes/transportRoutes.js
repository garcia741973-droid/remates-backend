const express = require('express');
const router = express.Router();

const {
  registerTruck,
  getMyTruck,
  updateMyTruck,
  createGuide,
  getMyGuides,
  getSharedGuide,
  createTransportRequest,
  getOpenTransportRequests,
  createTransportNegotiation,
  sendTransportMessage,
  getTransportMessages,
  getMyTransportRequests,
  getRequestNegotiations, 
  acceptTransportNegotiation, 
  createTransportPayment,
  getMyTrips,
} = require('../controllers/transportController');

const {
  requireAuth,
} = require('../middleware/authMiddleware');

router.get(
  '/my-truck',
  requireAuth,
  getMyTruck
);

router.put(
  '/update-my-truck',
  requireAuth,
  updateMyTruck
);

router.post(
  '/create-guide',
  requireAuth,
  createGuide
);

router.get(
  '/my-guides',
  requireAuth,
  getMyGuides
);

router.get(
  '/shared-guide/:token',
  getSharedGuide
);

router.post(
  '/create-request',
  requireAuth,
  createTransportRequest
);

router.get(
  '/open-requests',
  requireAuth,
  getOpenTransportRequests
);

router.post(
  '/create-negotiation',
  requireAuth,
  createTransportNegotiation
);

router.post(
  '/send-message',
  requireAuth,
  sendTransportMessage
);

router.get(
  '/messages/:negotiation_id',
  requireAuth,
  getTransportMessages
);

router.get(
  '/my-requests',
  requireAuth,
  getMyTransportRequests
);

router.get(
  '/request-negotiations/:request_id',
  requireAuth,
  getRequestNegotiations
);

router.post(
  '/accept-negotiation',
  requireAuth,
  acceptTransportNegotiation
);

router.post(
  '/create-payment',
  requireAuth,
  createTransportPayment
);

router.get(
  '/my-trips',
  requireAuth,
  getMyTrips
);

module.exports = router;