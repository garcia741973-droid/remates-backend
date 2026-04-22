const { Pool } = require('pg');

const { pool } = require('../config/db');

exports.createLot = async (req, res) => {
  try {
    const company_id = req.user.company_id;
    const user_id = req.user.user_id;

    /// 🔴 VALIDAR VENDEDOR APROBADO
    const userResult = await pool.query(
      `SELECT seller_status FROM users WHERE id = $1`,
      [user_id]
    );

    const user = userResult.rows[0];

    if (!user || user.seller_status !== 'approved') {
      return res.status(403).json({
        error: 'Debes ser vendedor aprobado para publicar lotes'
      });
    }

    const {
      lot_number,
      quantity,
      class: lot_class,
      breed,
      weight,
      sale_type,
      base_price,

      /// 🆕 UBICACIÓN
      department,
      province,
      municipality
    } = req.body;

    /// 🔴 VALIDAR UBICACIÓN
    if (!department || !province || !municipality) {
      return res.status(400).json({
        error: 'Debes seleccionar departamento, provincia y municipio'
      });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO lots 
      (
        company_id,
        lot_number,
        quantity,
        class,
        breed,
        weight,
        sale_type,
        base_price,
        current_price,
        department,
        province,
        municipality
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
      `,
      [
        company_id,
        lot_number,
        quantity,
        lot_class,
        breed,
        weight,
        sale_type,
        base_price,
        base_price,
        department,
        province,
        municipality
      ]
    );

    res.json(rows[0]);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creando lote' });
  }
};

exports.getLots = async (req, res) => {
  try {
    const company_id = req.user.company_id;

    const { rows } = await pool.query(
      `
      SELECT * FROM lots
      WHERE company_id = $1
      ORDER BY created_at DESC
      `,
      [company_id]
    );

    res.json(rows);

  } catch (error) {
    console.error('ERROR GET LOTS:', error);
    res.status(500).json({ error: 'Error obteniendo lotes' });
  }
};