
const { pool } = require('../config/db');


exports.getAuctionAnalytics = async (
  req,
  res,
) => {

  try {

    const { id } = req.params;

    const auctionId =
        parseInt(id);

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

        WHERE l.auction_id = $1
      `,
      [auctionId],
    );

    const lots =
        lotsResult.rows;

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

const source =

    lot.sale_source
        ?.toString()
        .toLowerCase();

        if (
        source === 'online'
        ) {

        onlineCount++;

        } else if (

        source === 'floor' ||

        source === 'sala' ||

        source === 'operator' ||

        source === null ||

        source === undefined ||

        source === ''
        ) {

        floorCount++;
        }

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

      top_buyers:
          topBuyers,

      lots,
    });

  } catch (e) {

    console.log(
      'ANALYTICS ERROR',
      e,
    );

    res.status(500).json({

      error:
          'Analytics error',
    });
  }
};