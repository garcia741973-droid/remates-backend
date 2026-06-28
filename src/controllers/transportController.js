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

module.exports = {
  registerTruck,
};