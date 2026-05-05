require('dotenv').config();

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
    projectId: serviceAccount.project_id, // 🔥 IMPORTANTE
  });

  console.log("🔥 Firebase Admin inicializado");

  // 🔥 DEBUG REAL FIREBASE AUTH
  admin.credential
    .cert(serviceAccount)
    .getAccessToken()
    .then(token => {
      console.log("🔐 ACCESS TOKEN STATUS 👉", token?.access_token ? "OK" : "VACÍO");
    })
    .catch(err => {
      console.log("❌ ERROR ACCESS TOKEN 👉", err);
    });

}

const express = require('express');
const cors = require('cors');

// 🔥 ROUTES
const authRoutes = require('./routes/authRoutes');
const testRoutes = require('./routes/testRoutes');
const lotsRoutes = require('./routes/lotsRoutes');
const auctionsRoutes = require('./routes/auctionsRoutes');
const livekitRoutes = require('./routes/livekitRoutes');
const auctionLotsRoutes = require('./routes/auctionLotsRoutes');
const bidsRoutes = require('./routes/bidsRoutes');
const operatorRoutes = require('./routes/operatorRoutes');
const companyRoutes = require('./routes/companyRoutes');

const { pool } = require('./config/db');

const app = express();

const kycRoutes = require('./routes/kyc.cjs');

app.use(cors());
app.use(express.json());

// ✅ Ruta base
app.get('/', (req, res) => {
  res.send('API Remates funcionando 🚀');
});

// 🔥 TEST DB
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json(result.rows[0]);
  } catch (error) {
    console.error('ERROR DB:', error);
    res.status(500).json({ error: 'Error conectando a DB' });
  }
});

// 🔥 ROUTES
app.use('/auth', authRoutes);
app.use('/test', testRoutes);
app.use('/lots', lotsRoutes);
app.use('/auctions', auctionsRoutes);
app.use('/livekit', livekitRoutes);

// 🚀 SERVIDOR
const PORT = process.env.PORT || 3000;

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

// 🔥 conexión sockets
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

app.use('/auction-lots', auctionLotsRoutes);

app.use('/bids', bidsRoutes);

app.set('io', io);

app.use('/operator', operatorRoutes);

app.use('/company', companyRoutes);

app.use('/kyc', kycRoutes);

const adminRoutes = require('./routes/adminRoutes');
app.use('/admin', adminRoutes);

const sellerRoutes = require('./routes/sellerRoutes.cjs');
app.use('/seller', sellerRoutes);

const superAdminRoutes = require('./routes/superAdminRoutes.cjs');
app.use('/superadmin', superAdminRoutes);

const negotiationsRoutes = require('./routes/negotiationsRoutes');
app.use('/negotiations', negotiationsRoutes);