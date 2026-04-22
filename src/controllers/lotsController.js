const { pool } = require('../config/db');

exports.createLot = async (req, res) => {
  try {
    const company_id = req.user.company_id;
    const user_id = req.user.user_id;

    /// 🔴 VALIDAR VENDEDOR
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
      quantity,
      class: lot_class,
      breed,
      weight,
      sale_type,
      base_price,
      department,
      province,
      municipality,

      /// 🔥 NUEVO
      images,
      video
    } = req.body;

    /// 🔴 VALIDACIÓN UBICACIÓN
    if (!department || !province || !municipality) {
      return res.status(400).json({
        error: 'Debes seleccionar departamento, provincia y municipio'
      });
    }

    /// 🔴 VALIDACIONES NUMÉRICAS
    if (!quantity || Number(quantity) <= 0) {
      return res.status(400).json({ error: 'Cantidad inválida' });
    }

    if (!base_price || Number(base_price) <= 0) {
      return res.status(400).json({ error: 'Precio base inválido' });
    }

    /// 🔥 GENERAR NÚMERO DE LOTE AUTOMÁTICO
    const countResult = await pool.query(
      `
      SELECT COUNT(*) FROM lots
      WHERE company_id = $1 AND seller_id = $2
      `,
      [company_id, user_id]
    );

    const count = parseInt(countResult.rows[0].count) + 1;

    const companyResult = await pool.query(
      `SELECT name FROM companies WHERE id = $1`,
      [company_id]
    );

    const prefix = (companyResult.rows[0]?.name || 'LOT')
      .substring(0, 3)
      .toUpperCase();

    const lot_number = `${prefix}-${count.toString().padStart(4, '0')}`;

    /// 🔥 INSERT FINAL
    const { rows } = await pool.query(
      `
      INSERT INTO lots 
      (
        company_id,
        seller_id,
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
        municipality,
        images,
        video_url
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
      `,
      [
        company_id,
        user_id,
        lot_number,
        quantity,
        lot_class,
        breed,
        weight,
        sale_type,
        base_price,
        base_price,
        department.trim(),
        province.trim(),
        municipality.trim(),
        images || [],
        video || null
      ]
    );

    res.json(rows[0]);

  } catch (error) {
    console.error("ERROR CREATE LOT:", error);
    res.status(500).json({ error: 'Error creando lote' });
  }
};

/// 🔥 SOLO UNA VEZ
exports.getLots = async (req, res) => {
  try {
    const company_id = req.user.company_id;

    const { rows } = await pool.query(
      `
      SELECT 
        l.*,
        u.name as seller_name
      FROM lots l
      JOIN users u ON u.id = l.seller_id
      WHERE l.company_id = $1
      ORDER BY l.created_at DESC
      `,
      [company_id]
    );

    res.json(rows);

  } catch (error) {
    console.error('ERROR GET LOTS:', error);
    res.status(500).json({ error: 'Error obteniendo lotes' });
  }
};