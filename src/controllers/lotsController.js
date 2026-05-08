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
      town,
      distance_km,      
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

    const lot_number = count;

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

        town,
        distance_km,

        images,
        video_url
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15,
        $16,
        $17
      )
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

        town?.trim() || null,
        distance_km || 0,

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

        COALESCE(
          u.full_name,
          u.name
        ) as seller_name,

        u.seller_rating_avg,

        u.seller_rating_count,

        u.successful_sales_count,

        u.seller_status

      FROM lots l
      JOIN users u ON u.id = l.seller_id
      WHERE l.company_id = $1
      AND l.status != 'sold'
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

/// 🔥 MIS LOTES (VENDEDOR)
exports.getMyLots = async (req, res) => {
  try {

    const company_id =
        req.user.company_id;

    const user_id =
        req.user.user_id;

    const { rows } = await pool.query(
      `
      SELECT

        l.*,

        u.full_name as seller_name,

        u.seller_rating_avg,

        u.seller_rating_count,

        u.successful_sales_count,

        u.seller_status

      FROM lots l

      JOIN users u
        ON u.id = l.seller_id
        WHERE l.company_id = $1
        AND l.seller_id = $2
      ORDER BY created_at DESC
      `,
      [
        company_id,
        user_id
      ]
    );

    res.json(rows);

  } catch (error) {

    console.error(
      'ERROR GET MY LOTS:',
      error
    );

    res.status(500).json({
      error:
        'Error obteniendo mis lotes'
    });
  }
};

/// 🔥 EDITAR LOTE
exports.updateLot = async (req, res) => {
  try {

    const company_id =
        req.user.company_id;

    const user_id =
        req.user.user_id;

    const { id } = req.params;

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

      town,

      distance_km,

      images,

      video,

    } = req.body;

    /// 🔥 VALIDAR LOTE
    const lotRes = await pool.query(
      `
      SELECT *
      FROM lots
      WHERE id = $1
      `,
      [id]
    );

    if (lotRes.rows.length === 0) {

      return res.status(404).json({
        error: 'Lote no encontrado'
      });
    }

    const lot = lotRes.rows[0];

    /// 🔥 VALIDAR DUEÑO
    if (
      lot.seller_id !== user_id
    ) {

      return res.status(403).json({
        error: 'No autorizado'
      });
    }

    /// 🔥 BLOQUEAR VENDIDOS
    if (
      lot.status === 'sold'
    ) {

      return res.status(400).json({
        error: 'No puedes editar un lote vendido'
      });
    }

    /// 🔥 UPDATE
    const { rows } = await pool.query(
      `
      UPDATE lots
      SET

        quantity = $1,

        class = $2,

        breed = $3,

        weight = $4,

        sale_type = $5,

        base_price = $6,

        current_price = $6,

        department = $7,

        province = $8,

        municipality = $9,

        town = $10,

        distance_km = $11,

        images = $12,

        video_url = $13

      WHERE id = $14

      RETURNING *
      `,
      [

        quantity,

        lot_class,

        breed,

        weight,

        sale_type,

        base_price,

        department,

        province,

        municipality,

        town,

        distance_km,

        images || [],

        video || null,

        id,
      ]
    );

    res.json(rows[0]);

  } catch (error) {

    console.error(
      'ERROR UPDATE LOT:',
      error
    );

    res.status(500).json({
      error: 'Error editando lote'
    });
  }
};


/// 🔥 ELIMINAR LOTE
exports.deleteLot = async (req, res) => {
  try {

    const user_id =
        req.user.user_id;

    const { id } = req.params;

    /// 🔥 VALIDAR
    const lotRes = await pool.query(
      `
      SELECT *
      FROM lots
      WHERE id = $1
      `,
      [id]
    );

    if (lotRes.rows.length === 0) {

      return res.status(404).json({
        error: 'Lote no encontrado'
      });
    }

    const lot = lotRes.rows[0];

    /// 🔥 VALIDAR DUEÑO
    if (
      lot.seller_id !== user_id
    ) {

      return res.status(403).json({
        error: 'No autorizado'
      });
    }

    /// 🔥 BLOQUEAR SI YA VENDIDO
    if (
      lot.status === 'sold'
    ) {

      return res.status(400).json({
        error: 'No puedes eliminar un lote vendido'
      });
    }

    /// 🔥 DELETE
    await pool.query(
      `
      DELETE FROM lots
      WHERE id = $1
      `,
      [id]
    );

    res.json({
      success: true
    });

  } catch (error) {

    console.error(
      'ERROR DELETE LOT:',
      error
    );

    res.status(500).json({
      error: 'Error eliminando lote'
    });
  }
};