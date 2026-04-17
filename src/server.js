require('dotenv').config();

const express = require('express');
const cors = require('cors');

// 🔥 ROUTES
const authRoutes = require('./routes/authRoutes');
const testRoutes = require('./routes/testRoutes');
const lotsRoutes = require('./routes/lotsRoutes');
const auctionsRoutes = require('./routes/auctionsRoutes');
const livekitRoutes = require('./routes/livekitRoutes');

const { pool } = require('./config/db');

const app = express();

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

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});