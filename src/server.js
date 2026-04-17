require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

app.use(cors());
app.use(express.json());

// 🔥 CONEXIÓN A POSTGRES (RENDER)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// ✅ Ruta base
app.get('/', (req, res) => {
  res.send('API Remates funcionando 🚀');
});

// 🔥 TEST DE BASE DE DATOS
app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json(result.rows[0]);
  } catch (error) {
    console.error('ERROR DB:', error);
    res.status(500).json({ error: 'Error conectando a DB' });
  }
});

// 🚀 SERVIDOR
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});