const { pool } = require('../config/db');

/// 🔥 LISTAR VENTAS ONLINE
exports.getAuctionSales =
  async (req, res) => {

    const { auction_id } =
        req.query;

  try {

    let query = `
      SELECT

        s.*,

        l.lot_number,

        l.title,

        l.weight,

        l.quantity,

        u.full_name

      FROM auction_sales s

      LEFT JOIN auction_live_lots l
      ON l.id = s.lot_id

      LEFT JOIN users u
      ON u.id = s.buyer_user_id
    `;

    const params = [];

    if (auction_id) {

      query += `
        WHERE s.auction_id = $1
      `;

      params.push(
        auction_id,
      );
    }

    query += `
      ORDER BY s.id DESC
    `;

    const result =
        await pool.query(
      query,
      params,
    );

    res.json(
      result.rows,
    );

  } catch (e) {

    console.log(
      'GET SALES ERROR:',
      e,
    );

    res.status(500).json({

      error:
        'Error obteniendo ventas',
    });
  }
};