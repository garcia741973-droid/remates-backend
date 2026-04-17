const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

exports.createLot = async (req, res) => {
  try {
    const company_id = req.user.company_id;

    const {
    lot_number,
    quantity,
    class: lot_class,   // 🔥 aquí está el fix
    breed,
    weight,
    sale_type,
    base_price
    } = req.body;

    const { rows } = await pool.query(
    `
    INSERT INTO lots 
    (company_id, lot_number, quantity, class, breed, weight, sale_type, base_price, current_price)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *
    `,
    [
        company_id,
        lot_number,
        quantity,
        lot_class, // 🔥 usar variable corregida
        breed,
        weight,
        sale_type,
        base_price,
        base_price
    ]
    );

    res.json(rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creando lote' });
  }
};