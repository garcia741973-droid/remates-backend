const { pool } = require('../config/db');

/// 🔥 LISTAR VENTAS ONLINE
exports.getAuctionSales =
  async (req, res) => {

  try {

    const result =
        await pool.query(

      `
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

      ORDER BY s.id DESC
      `
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