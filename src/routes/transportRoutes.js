const express = require('express');
const router = express.Router();

const { requireAuth } = require('../middleware/authMiddleware');

const {
  registerTruck,
  getMyTruck,
  toggleTruckAvailability,
  updateMyTruck,
  createTripCashbox,
  addTripCashboxItem,
  getTripCashbox,
  getMyTripCashboxes,
  getMyTruckReviews,  
  closeTripCashbox,  
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
  getMyOpenNegotiations,
  getTripMapData,
  startTrip,
  finishTrip,
  createDeliveryReport,
  getGuideByNegotiation,
  archiveTransportNegotiation,
  getMyTripsHistory,
  getRequesterTripsHistory,
  getTransportDashboard,
  rejectTransportRequest,
  cancelTransportRequest,
  createSavedLocation,
  getMySavedLocations,
  deleteSavedLocation,
  shareLocation,
  importLocation,
  createLocationRoute,
  getLocationRoutes, 
  getSharedTripMap, 
  getRequesterTrips,  
  createPublicTracking,
  getPublicTracking,
  disablePublicTracking, 
  createTransportReview,
  getMyRatings,
} = require('../controllers/transportController');

router.post(
  '/register-truck',
  requireAuth,
  registerTruck
);

router.get(
  '/my-truck',
  requireAuth,
  getMyTruck
);

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
  '/create-trip-cashbox',
  requireAuth,
  createTripCashbox
);

router.post(
  '/trip-cashbox-item',
  requireAuth,
  addTripCashboxItem
);

router.get(
  '/trip-cashbox/:negotiation_id',
  requireAuth,
  getTripCashbox
);

router.get(
  '/my-trip-cashboxes',
  requireAuth,
  getMyTripCashboxes
);

router.get(
  '/my-truck-reviews',
  requireAuth,
  getMyTruckReviews
);

router.put(
  '/close-trip-cashbox',
  requireAuth,
  closeTripCashbox
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

router.put(
  '/disable-public-tracking',
  requireAuth,
  disablePublicTracking
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
  '/my-open-negotiations',
  requireAuth,
  getMyOpenNegotiations
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
  '/requester-trips-history',
  requireAuth,
  getRequesterTripsHistory
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
  '/share-location',
  requireAuth,
  shareLocation
);

router.post(
  '/import-location',
  requireAuth,
  importLocation
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

router.post(
  '/create-review',
  requireAuth,
  createTransportReview
);

router.get(
  '/my-ratings',
  requireAuth,
  getMyRatings
);

module.exports = router;