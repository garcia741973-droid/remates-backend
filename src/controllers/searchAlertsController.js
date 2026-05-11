const { pool } = require('../config/db');

exports.getSearchAlerts = async (
  req,
  res
) => {

  try {

    const user_id =
      req.user.user_id;

    const company_id =
      req.user.company_id;

    const result =
      await pool.query(
        `
        SELECT

          sa.*,

          l.class,
          l.breed,
          l.quantity,
          l.weight,
          l.base_price,
          l.department,
          l.province,
          l.municipality,
          l.images,
          l.sale_type,

          COALESCE(
            u.full_name,
            u.name
          ) as seller_name

        FROM search_alerts sa

        JOIN lots l
          ON l.id = sa.lot_id

        JOIN users u
          ON u.id = l.seller_id

        WHERE sa.user_id = $1
        AND sa.company_id = $2

        ORDER BY sa.created_at DESC
        `,
        [
          user_id,
          company_id,
        ]
      );

    res.json(
      result.rows
    );

  } catch (error) {

    console.log(
      'ERROR GET SEARCH ALERTS:',
      error
    );

    res.status(500).json({
      error:
        'Error obteniendo alertas'
    });
  }
};