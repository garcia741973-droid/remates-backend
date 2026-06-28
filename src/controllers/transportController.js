const { pool } = require('../config/db');

const registerTruck = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const {
      plate,
      brand,
      model,
      year,
      truck_type,
      capacity_large,
      capacity_small,
      has_trailer,
      trailer_capacity,
      front_photo,
      side_photo,
      ownership_doc,
    } = req.body;

    const existingTruck = await pool.query(
    `
    SELECT id
    FROM transporter_trucks
    WHERE user_id = $1
        AND is_active = true
    LIMIT 1
    `,
    [userId]
    );

    if (existingTruck.rows.length > 0) {
    return res.status(400).json({
        error: 'Ya tienes un camión registrado',
    });
    }

    const result = await pool.query(
      `
      INSERT INTO transporter_trucks (
        user_id,
        plate,
        brand,
        model,
        year,
        truck_type,
        capacity_large,
        capacity_small,
        has_trailer,
        trailer_capacity,
        front_photo,
        side_photo,
        ownership_doc
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13
      )
      RETURNING *
      `,
      [
        userId,
        plate,
        brand,
        model,
        year,
        truck_type,
        capacity_large,
        capacity_small,
        has_trailer,
        trailer_capacity,
        front_photo,
        side_photo,
        ownership_doc,
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'Error registrando camión',
    });
  }
};

const getMyTruck = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const result = await pool.query(
      `
      SELECT *
      FROM transporter_trucks
      WHERE user_id = $1
        AND is_active = true
      LIMIT 1
      `,
      [userId]
    );

    res.json(
      result.rows[0] || null
    );

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error obteniendo camión',
    });
  }
};

const updateMyTruck = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const {
      plate,
      brand,
      model,
      year,
      truck_type,
      capacity_large,
      capacity_small,
      has_trailer,
      trailer_capacity,
      front_photo,
      side_photo,
      ownership_doc,
    } = req.body;

    const result = await pool.query(
      `
      UPDATE transporter_trucks
      SET
        plate = $1,
        brand = $2,
        model = $3,
        year = $4,
        truck_type = $5,
        capacity_large = $6,
        capacity_small = $7,
        has_trailer = $8,
        trailer_capacity = $9,
        front_photo = COALESCE($10, front_photo),
        side_photo = COALESCE($11, side_photo),
        ownership_doc = COALESCE($12, ownership_doc)
      WHERE user_id = $13
        AND is_active = true
      RETURNING *
      `,
      [
        plate,
        brand,
        model,
        year,
        truck_type,
        capacity_large,
        capacity_small,
        has_trailer,
        trailer_capacity,
        front_photo,
        side_photo,
        ownership_doc,
        userId,
      ]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error actualizando camión',
    });
  }
};

const createGuide = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const truckRes = await pool.query(
      `
      SELECT *
      FROM transporter_trucks
      WHERE user_id = $1
        AND is_active = true
      LIMIT 1
      `,
      [userId]
    );

    if (truckRes.rows.length === 0) {
      return res.status(400).json({
        error: 'No tienes camión registrado',
      });
    }

    const truck = truckRes.rows[0];

    const {
      origin,
      destination,
      driver_name,
      driver_ci,

      male_0_12,
      female_0_12,

      male_13_24,
      female_13_24,

      male_25_36,
      female_25_36,

      male_36_plus,
      female_36_plus,

      guide_image_url,
    } = req.body;

    const result = await pool.query(
      `
      INSERT INTO transport_guides (
        truck_id,
        user_id,
        origin,
        destination,
        driver_name,
        driver_ci,
        plate,

        male_0_12,
        female_0_12,

        male_13_24,
        female_13_24,

        male_25_36,
        female_25_36,

        male_36_plus,
        female_36_plus,

        guide_image_url
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,$12,$13,$14,$15,$16
      )
      RETURNING *
      `,
      [
        truck.id,
        userId,
        origin,
        destination,
        driver_name,
        driver_ci,
        truck.plate,

        male_0_12,
        female_0_12,

        male_13_24,
        female_13_24,

        male_25_36,
        female_25_36,

        male_36_plus,
        female_36_plus,

        guide_image_url,
      ]
    );

    res.json(result.rows[0]);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error creando guía',
    });
  }
};

const getMyGuides = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const result = await pool.query(
      `
      SELECT *
      FROM transport_guides
      WHERE user_id = $1
      ORDER BY id DESC
      `,
      [userId]
    );

    res.json(result.rows);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: 'Error obteniendo manifiestos',
    });
  }
};

module.exports = {
  registerTruck,
  getMyTruck,
  updateMyTruck,
  createGuide,
  getMyGuides,
};