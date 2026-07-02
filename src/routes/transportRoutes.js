const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/authMiddleware');

const {
  registerTruck,
  getMyTruck,
  toggleTruckAvailability,
  updateMyTruck,
  createGuide,
  getMyGuides,
  getSharedGuide,
  createTransportRequest,
  getOpenTransportRequests,
  createTransportNegotiation,
  sendTransportMessage,
  getTransportNegotiationDetails,
  getTransportRoutePoints,
  getTransportMessages,
  getMyTransportRequests,
  getRequestNegotiations, 
  acceptTransportNegotiation, 
  createTransportPayment,
  createDispatch,
  prepareTrip,
  saveTracking,
  getTripTracking,
  getMyTrips,
  getMyIncomingTrips,
  getTripMapData,
  startTrip,
  finishTrip,
  createDeliveryReport,
  getGuideByNegotiation,
  archiveTransportNegotiation,
  getMyTripsHistory,
  getTransportDashboard,
  rejectTransportRequest,
  cancelTransportRequest,
  createSavedLocation,
  getMySavedLocations,
  deleteSavedLocation,
  createLocationRoute,
  getLocationRoutes, 
  getSharedTripMap, 
  getRequesterTrips,  
  createPublicTracking,
  getPublicTracking,  
} = require('../controllers/transportController');

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

router.put(
  '/truck/availability',
  requireAuth,
  toggleTruckAvailability
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
  '/create-public-tracking/:negotiation_id',
  requireAuth,
  createPublicTracking
);

router.get(
  '/public-track/:token',
  getPublicTracking
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
  '/negotiation-details/:negotiation_id',
  requireAuth,
  getTransportNegotiationDetails
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

router.get(
  '/incoming-trips',
  requireAuth,
  getMyIncomingTrips
);

router.post(
  '/prepare-trip',
  requireAuth,
  prepareTrip
);

router.post(
  '/create-dispatch',
  requireAuth,
  createDispatch
);

router.post(
  '/save-tracking',
  requireAuth,
  saveTracking
);

router.post(
  '/start-trip',
  requireAuth,
  startTrip
);

router.post(
  '/finish-trip',
  requireAuth,
  finishTrip
);

router.post(
  '/delivery-report',
  requireAuth,
  createDeliveryReport
);

router.post(
  '/archive-negotiation',
  requireAuth,
  archiveTransportNegotiation
);

router.get(
  '/my-trips-history',
  requireAuth,
  getMyTripsHistory
);

router.get(
  '/trip-tracking/:negotiation_id',
  requireAuth,
  getTripTracking
);

router.get(
  '/trip-map/:negotiationId',
  requireAuth,
  getTripMapData
);

router.get(
  '/guide/:negotiationId',
  requireAuth,
  getGuideByNegotiation
);

router.get(
  '/dashboard',
  requireAuth,
  getTransportDashboard
);

router.post(
  '/reject-request',
  requireAuth,
  rejectTransportRequest
);

router.post(
  '/cancel-request',
  requireAuth,
  cancelTransportRequest
);

router.post(
  '/saved-locations',
  requireAuth,
  createSavedLocation
);

router.get(
  '/saved-locations',
  requireAuth,
  getMySavedLocations
);

router.delete(
  '/saved-locations/:id',
  requireAuth,
  deleteSavedLocation
);

router.post(
  '/create-location-route',
  requireAuth,
  createLocationRoute
);

router.get(
  '/location-routes/:saved_location_id',
  requireAuth,
  getLocationRoutes
);

router.get(
  '/request-routes/:request_id',
  requireAuth,
  getTransportRoutePoints
);

router.get(
  '/shared-trip-map/:negotiation_id',
  requireAuth,
  getSharedTripMap
);

router.get(
  '/requester-trips',
  requireAuth,
  getRequesterTrips
);

module.exports = router;