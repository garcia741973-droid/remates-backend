const { pool } = require('../config/db');

exports.getAuctionAnalytics = async (
  req,
  res,
) => {

  try {

    const { id } = req.params;

    const {
      from,
      to,
    } = req.query;

    const auctionId =
        parseInt(id);

    /// 🔥 FILTRO FECHAS
    let dateFilter = '';

    const params = [auctionId];

    if (from && to) {

      dateFilter =

          ` AND DATE(l.closed_at)
              BETWEEN $2 AND $3`;

      params.push(from);

      params.push(to);
    }

    /// 🔥 REMATE
    const auctionResult =
        await pool.query(

      `
      SELECT
        id,
        name,
        status,
        started_at,
        ended_at
      FROM auctions
      WHERE id = $1
      `,
      [auctionId],
    );

    const auction =
        auctionResult.rows[0];

    if (!auction) {

      return res.status(404).json({

        error:
            'Auction not found',
      });
    }

    /// 🔥 LOTES
    const lotsResult =
        await pool.query(

      `
      SELECT

        l.id,
        l.lot_number,
        l.title,
        l.status,
        l.weight,
        l.final_price,
        l.winner_user_id,

        s.sale_source,
        s.total_amount,
        s.sale_type

      FROM auction_live_lots l

      LEFT JOIN auction_sales s

      ON s.lot_id = l.id
      AND s.auction_id = l.auction_id

      WHERE
        l.auction_id = $1
        ${dateFilter}
      `,
      params,
    );

    const lots =
        lotsResult.rows;

    /// 🔥 CARGAR BID GANADOR
    for (const lot of lots) {

      const bidResult =
          await pool.query(

        `
        SELECT
          bid_source
        FROM bids
        WHERE lot_id = $1
        ORDER BY amount DESC
        LIMIT 1
        `,
        [lot.id],
      );

      const winningBid =
          bidResult.rows[0];

      lot.bid_source =

          winningBid?.bid_source ??
          'floor';
    }

    console.log(
      '🔥 LOTS ANALYTICS 👉',
      lots,
    );

    /// 🔥 TOTALES
    let totalSold = 0;

    let totalWeight = 0;

    let soldCount = 0;

    let passedCount = 0;

    let onlineCount = 0;

    let floorCount = 0;

    const buyersMap = {};

    for (const lot of lots) {

      const sold =
          lot.status === 'sold';

      const price =
          parseFloat(
            lot.final_price || 0,
          );

      const weight =
          parseFloat(
            lot.weight || 0,
          );

      if (sold) {

        soldCount++;

        totalSold += price;

        totalWeight += weight;

      } else {

        passedCount++;
      }

      /// 🔥 ORIGEN PUJA
      const source =

          lot.bid_source
              ?.toString()
              .toLowerCase();

      if (
        source === 'online'
      ) {

        onlineCount++;

      } else {

        floorCount++;
      }

      /// 🔥 TOP COMPRADORES
      if (
        sold &&
        lot.winner_user_id
      ) {

        const userResult =
            await pool.query(

          `
          SELECT
            full_name
          FROM users
          WHERE id = $1
          `,
          [
            lot.winner_user_id,
          ],
        );

        const user =
            userResult.rows[0];

        const buyerName =

            user?.full_name ??
            'Comprador';

        if (!buyersMap[buyerName]) {

          buyersMap[
              buyerName
          ] = 0;
        }

        buyersMap[
            buyerName
        ] += price;
      }
    }

    /// 🔥 TOP COMPRADORES
    const topBuyers =

        Object.entries(
      buyersMap,
    )

            .map(
      ([name, total]) => ({

        name,
        total,
      }),
    )

            .sort(
      (a, b) =>
          b.total - a.total,
    )

            .slice(0, 10);

    /// 🔥 MERCADO GANADERO
    const marketResult =
        await pool.query(

      `
      SELECT

        sale_type,

        cattle_type,

        breed,

        gender,

        age,

        department,

        municipality,

        COUNT(*) AS total_lots,

        AVG(final_price)
          AS avg_price,

        AVG(
          CASE

            WHEN weight > 0

            THEN final_price / weight

            ELSE 0

          END
        ) AS avg_price_per_kg

      FROM auction_live_lots l

      WHERE
        l.auction_id = $1
        AND l.status = 'sold'
        ${dateFilter}

      GROUP BY

        sale_type,

        cattle_type,

        breed,

        gender,

        age,

        department,

        municipality

      ORDER BY
        avg_price DESC
      `,
      params,
    );

    return res.json({

      auction,

      summary: {

        total_sold:
            totalSold,

        total_weight:
            totalWeight,

        sold_count:
            soldCount,

        passed_count:
            passedCount,

        online_count:
            onlineCount,

        floor_count:
            floorCount,

        buyers_count:
            Object.keys(
              buyersMap,
            ).length,

        average_price:

            soldCount > 0

                ? totalSold /
                    soldCount

                : 0,
      },

      market:
          marketResult.rows,

      top_buyers:
          topBuyers,
    });

  } catch (e) {

    console.log(
      '🔥 ANALYTICS ERROR 👉',
      e,
    );

    res.status(500).json({

      error:
          'Analytics error',
    });
  }
};