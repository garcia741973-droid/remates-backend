
const {

  cleanupExpiredPromotions,

} = require(
  './services/cleanupExpiredPromotions'
);

require('dotenv').config();

/// 🇧🇴 TIMEZONE BOLIVIA
process.env.TZ =
    'America/La_Paz';

console.log(
    '🕒 SERVER TIME 👉',
    new Date(),
);    

console.log(
  "ENV FIREBASE:",
  process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ? "OK" : "NO EXISTE"
);

/// 🔥 FIREBASE ADMIN
const admin = require('firebase-admin');

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    Buffer.from(
      process.env.FIREBASE_SERVICE_ACCOUNT_BASE64,
      'base64'
    ).toString('utf8')
  );

  // 🔍 DEBUG CLAVE
  console.log("🔥 PROJECT ID 👉", serviceAccount.project_id);
  console.log("🔥 CLIENT EMAIL 👉", serviceAccount.client_email);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });

  console.log("🔥 Firebase Admin inicializado");

  // 🔥 DEBUG REAL FIREBASE AUTH
  admin.credential
    .cert(serviceAccount)
    .getAccessToken()
    .then(token => {
      console.log(
        "🔐 ACCESS TOKEN STATUS 👉",
        token?.access_token ? "OK" : "VACÍO"
      );
    })
    .catch(err => {
      console.log("❌ ERROR ACCESS TOKEN 👉", err);
    });
}

const express = require('express');
const cors = require('cors');

const http = require('http');
const { Server } = require('socket.io');

const { pool } = require('./config/db');

/// 🔥 ROUTES
const authRoutes = require('./routes/authRoutes');
const testRoutes = require('./routes/testRoutes');
const lotsRoutes = require('./routes/lotsRoutes');
const auctionsRoutes = require('./routes/auctionsRoutes');
const livekitRoutes = require('./routes/livekitRoutes');
const auctionLotsRoutes = require('./routes/auctionLotsRoutes');
const auctionLiveLotsRoutes =
  require('./routes/auctionLiveLotsRoutes');
const bidsRoutes = require('./routes/bidsRoutes');
const operatorRoutes = require('./routes/operatorRoutes');
const companyRoutes = require('./routes/companyRoutes');
const firebaseRoutes = require('./routes/firebaseRoutes');

const paymentQrRoutes =
  require('./routes/paymentQrRoutes');

const kycRoutes = require('./routes/kyc.cjs');
const adminRoutes = require('./routes/adminRoutes');
const sellerRoutes = require('./routes/sellerRoutes.cjs');
const superAdminRoutes = require('./routes/superAdminRoutes.cjs');
const negotiationsRoutes = require('./routes/negotiationsRoutes');

const sellerReviewsRoutes =
  require('./routes/sellerReviews');

const searchAlertsRoutes =
  require('./routes/searchAlertsRoutes');

const adminNotificationsMetaRoutes =
    require(
      './routes/adminNotificationsMetaRoutes'
    );

const operationEventsRoutes =
  require('./routes/operationEventsRoutes');  
  
const savedSearchesRoutes =
  require('./routes/savedSearchesRoutes');
  
const featuredRoutes =
  require('./routes/featuredRoutes');
  
const cashRoutes =
    require('./routes/cashRoutes');

const notificationCampaignsRoutes =
    require('./routes/notificationCampaignsRoutes');
    
const notificationTemplatesRoutes =
    require('./routes/notificationTemplatesRoutes');    
    
const adminNotificationsRoutes =
    require('./routes/adminNotificationsRoutes');    

const {
  startReviewReminderService
} = require('./services/reviewReminderService');

const {
  startQrExpirationService
} = require('./services/qrExpirationService');

const {
  startNotificationScheduler
} = require('./services/notificationSchedulerService');

const auctionSalesRoutes =
require('./routes/auctionSalesRoutes');

const app = express();

app.use(cors());
app.use(express.json());

/// ✅ Ruta base
app.get('/', (req, res) => {
  res.send('API Remates funcionando 🚀');
});

/// 🔥 TEST DB
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json(result.rows[0]);
  } catch (error) {
    console.error('ERROR DB:', error);

    res.status(500).json({
      error: 'Error conectando a DB',
    });
  }
});

/// 🔥 ROUTES
app.use('/auth', authRoutes);
app.use('/test', testRoutes);
app.use('/lots', lotsRoutes);
app.use('/auctions', auctionsRoutes);
app.use('/livekit', livekitRoutes);
app.use('/auction-lots', auctionLotsRoutes);
app.use(
  '/auction-live-lots',
  auctionLiveLotsRoutes
);
app.use('/bids', bidsRoutes);
app.use('/operator', operatorRoutes);
app.use('/company', companyRoutes);
app.use('/firebase', firebaseRoutes);

app.use(
  '/payment-qrs',
  paymentQrRoutes
);

app.use('/kyc', kycRoutes);
app.use('/admin', adminRoutes);
app.use('/seller', sellerRoutes);
app.use('/superadmin', superAdminRoutes);
app.use('/negotiations', negotiationsRoutes);

app.use('/seller-reviews', sellerReviewsRoutes);

app.use(
  '/search-alerts',
  searchAlertsRoutes
);

app.use(
  '/saved-searches',
  savedSearchesRoutes
);

app.use(
  '/operation-events',
  operationEventsRoutes
);

app.use(
  '/auction-sales',
  auctionSalesRoutes
);

const promotionRoutes =
    require('./routes/promotionRoutes');

app.use(
    '/promotions',
    promotionRoutes,
);

app.use(
    '/cash',
    cashRoutes,
);

app.use(
    '/notification-campaigns',
    notificationCampaignsRoutes,
);

app.use(
    '/notification-templates',
    notificationTemplatesRoutes,
);

app.use(
    '/admin-notifications-meta',
    adminNotificationsMetaRoutes,
);

app.use(
    '/admin-notifications',
    adminNotificationsRoutes,
);

/// 🚀 SERVIDOR
const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

app.set('io', io);

/// 🔥 REVIEW REMINDER SERVICE
startReviewReminderService();

startQrExpirationService();

startNotificationScheduler();

/// 🧹 LIMPIEZA PROMOCIONES VENCIDAS
setInterval(() => {

  cleanupExpiredPromotions();

}, 1000 * 60 * 5);

/// 🔥 conexión sockets
io.on('connection', (socket) => {
  console.log('Usuario conectado:', socket.id);

  socket.on('joinAuction', (auction_id) => {
    socket.join(`auction_${auction_id}`);
  });

  socket.on('disconnect', () => {
    console.log('Usuario desconectado');
  });
});

server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});