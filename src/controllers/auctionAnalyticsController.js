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

    /// 🔥 LOTES VENDIDOS
    const lotsResult =
        await pool.query(

      `
      SELECT

        l.id,
        l.lot_number,
        l.status,
        l.quantity,
        l.weight,
        l.final_price,
        l.sale_type,

        l.cattle_type,
        l.breed,
        l.gender,
        l.age,

        l.department,
        l.municipality,

        l.winner_user_id,

        b.bid_source,
        b.bidder_label

      FROM auction_live_lots l

      LEFT JOIN LATERAL (

        SELECT

          bid_source,
          bidder_label,
          amount,
          created_at

        FROM bids

        WHERE bids.lot_id = l.id

        ORDER BY
          amount DESC,
          created_at DESC

        LIMIT 1

      ) b ON true

      WHERE
        l.auction_id = $1
        AND l.status = 'sold'
        ${dateFilter}
      `,
      params,
    );

    const lots =
        lotsResult.rows;

    console.log(
      '🔥 LOTS ANALYTICS 👉',
      lots,
    );

    /// 🔥 TOTALES
    let lotsSold = 0;

    let animalsSold = 0;

    let totalWeight = 0;

    let totalRevenue = 0;

    let onlineSales = 0;

    let floorSales = 0;

    let kiloRevenue = 0;

    let kiloWeight = 0;

    let bultoRevenue = 0;

    let bultoAnimals = 0;

    const buyersMap = {};

    for (const lot of lots) {

      const quantity =
          parseFloat(
            lot.quantity || 0,
          );

      const weight =
          parseFloat(
            lot.weight || 0,
          );

      const finalPrice =
          parseFloat(
            lot.final_price || 0,
          );

      const saleType =
          lot.sale_type
              ?.toString()
              .toLowerCase();

      const source =
          lot.bid_source
              ?.toString()
              .toLowerCase();

      lotsSold++;

      animalsSold += quantity;

      totalWeight += weight;

      /// 🔥 FACTURACIÓN REAL
      let revenue = 0;

      if (
        saleType === 'kilo'
      ) {

        revenue =
            weight *
            finalPrice;

        kiloRevenue += revenue;

        kiloWeight += weight;

      } else {

        revenue =
            quantity *
            finalPrice;

        bultoRevenue += revenue;

        bultoAnimals += quantity;
      }

      totalRevenue += revenue;

      /// 🔥 ONLINE / SALA
      if (
        source === 'online'
      ) {

        onlineSales++;

      } else {

        floorSales++;
      }

      /// 🔥 TOP COMPRADORES
      let buyerName =
          'SALA';

      if (
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

        buyerName =

            userResult.rows[0]
                ?.full_name ??

            'Comprador';
      }

      if (
        lot.bidder_label
      ) {

        buyerName =
            lot.bidder_label;
      }

      if (!buyersMap[buyerName]) {

        buyersMap[
            buyerName
        ] = {

          total: 0,
          lots: 0,
          animals: 0,
        };
      }

      buyersMap[
          buyerName
      ].total += revenue;

      buyersMap[
          buyerName
      ].lots += 1;

      buyersMap[
          buyerName
      ].animals += quantity;
    }

    /// 🔥 TOP COMPRADORES
    const topBuyers =

        Object.entries(
      buyersMap,
    )

            .map(
      ([name, data]) => ({

        name,

        total:
            data.total,

        lots:
            data.lots,

        animals:
            data.animals,
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

        l.sale_type,

        l.cattle_type,

        l.breed,

        l.gender,

        l.age,

        l.department,

        l.municipality,

        COUNT(*) AS total_lots,

        SUM(
          l.quantity
        ) AS animals,

        SUM(
          l.weight
        ) AS total_weight,

        AVG(

          CASE

            WHEN l.quantity > 0

            THEN l.weight / l.quantity

            ELSE 0

          END

        ) AS avg_weight_per_animal,

        AVG(

          CASE

            WHEN l.sale_type = 'kilo'

            THEN l.final_price

            ELSE 0

          END

        ) AS avg_price_kg,

        AVG(

          CASE

            WHEN l.sale_type = 'bulto'

            THEN l.final_price

            ELSE 0

          END

        ) AS avg_price_animal,

        SUM(

          CASE

            WHEN l.sale_type = 'kilo'

            THEN l.weight * l.final_price

            ELSE l.quantity * l.final_price

          END

        ) AS total_revenue

      FROM auction_live_lots l

      WHERE
        l.auction_id = $1
        AND l.status = 'sold'
        ${dateFilter}

      GROUP BY

        l.sale_type,

        l.cattle_type,

        l.breed,

        l.gender,

        l.age,

        l.department,

        l.municipality

      ORDER BY
        total_revenue DESC
      `,
      params,
    );

    return res.json({

      auction,

      summary: {

        lots_sold:
            lotsSold,

        animals_sold:
            animalsSold,

        total_weight:
            totalWeight,

        total_revenue:
            totalRevenue,

        online_sales:
            onlineSales,

        floor_sales:
            floorSales,

        avg_price_kg:

            kiloWeight > 0

                ? kiloRevenue /
                    kiloWeight

                : 0,

        avg_price_animal:

            bultoAnimals > 0

                ? bultoRevenue /
                    bultoAnimals

                : 0,
      },

      top_buyers:
          topBuyers,

      market:
          marketResult.rows,
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