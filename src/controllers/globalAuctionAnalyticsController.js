const { pool } = require('../config/db');

exports.getGlobalAuctionAnalytics = async (req, res) => {
  try {
    const companyId = req.user.company_id;

    const {
    from,
    to,

    analysis = 'breed',

    metric = 'price_kg',

    subgroup = 'none',

    } = req.query;

    const params = [companyId];
    let dateFilter = '';

    if (from && to) {
      dateFilter = `
        AND DATE(l.closed_at)
        BETWEEN $2 AND $3
      `;
      params.push(from);
      params.push(to);
    }

    const lotsResult = await pool.query(
      `
      SELECT
        l.*,
        b.bid_source,
        b.bidder_label,
        u.full_name
      FROM auction_live_lots l
      LEFT JOIN users u
        ON u.id = l.winner_user_id
      LEFT JOIN LATERAL (
        SELECT bid_source, bidder_label, amount, created_at
        FROM bids
        WHERE bids.lot_id = l.id
        ORDER BY amount DESC, created_at DESC
        LIMIT 1
      ) b ON true
      WHERE
        l.company_id = $1
        AND l.status = 'sold'
        ${dateFilter}
      `,
      params,
    );

    const lots = lotsResult.rows;

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
      const quantity = parseFloat(lot.quantity || 0);
      const weight = parseFloat(lot.weight || 0);
      const finalPrice = parseFloat(lot.final_price || 0);
      const saleType = lot.sale_type?.toString().toLowerCase();
      const source = lot.bid_source?.toString().toLowerCase();

      lotsSold++;
      animalsSold += quantity;
      totalWeight += weight;

      let revenue = 0;

      if (saleType === 'kilo') {
        revenue = weight * finalPrice;
        kiloRevenue += revenue;
        kiloWeight += weight;
      } else {
        revenue = quantity * finalPrice;
        bultoRevenue += revenue;
        bultoAnimals += quantity;
      }

      totalRevenue += revenue;

      if (source === 'online') {
        onlineSales++;
      } else {
        floorSales++;
      }

      let buyerName = lot.full_name ?? 'SALA';

      if (lot.bidder_label) {
        buyerName = lot.bidder_label;
      }

      if (!buyersMap[buyerName]) {
        buyersMap[buyerName] = {
          total: 0,
          lots: 0,
          animals: 0,
        };
      }

      buyersMap[buyerName].total += revenue;
      buyersMap[buyerName].lots += 1;
      buyersMap[buyerName].animals += quantity;
    }

    const topBuyers = Object.entries(buyersMap)
      .map(([name, data]) => ({
        name,
        total: data.total,
        lots: data.lots,
        animals: data.animals,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);

    let groupField = 'l.breed';

    if (analysis === 'general' || analysis === 'breed') {
      groupField = 'l.breed';
    }

    if (analysis === 'municipality') {
      groupField = 'l.municipality';
    }

    if (analysis === 'age') {
      groupField = 'l.age';
    }

    if (analysis === 'category') {
      groupField = 'l.cattle_type';
    }

    let subGroupField = null;

    if (subgroup === 'breed') {
      subGroupField = 'l.breed';
    }

    if (subgroup === 'municipality') {
      subGroupField = 'l.municipality';
    }

    if (subgroup === 'age') {
      subGroupField = 'l.age';
    }

    if (subgroup === 'category') {
      subGroupField = 'l.cattle_type';
    }

    if (subgroup === 'gender') {
      subGroupField = 'l.gender';
    }

    let metricField = `
      AVG(
        CASE
          WHEN l.sale_type = 'kilo'
          THEN l.final_price
          ELSE NULL
        END
      )
    `;

    if (metric === 'revenue') {
      metricField = `
        SUM(
          CASE
            WHEN l.sale_type = 'kilo'
            THEN l.weight * l.final_price
            ELSE l.quantity * l.final_price
          END
        )
      `;
    }

    if (metric === 'animals') {
      metricField = 'SUM(l.quantity)';
    }

    if (metric === 'weight') {
      metricField = 'SUM(l.weight)';
    }

    if (metric === 'price_animal') {
      metricField = `
        AVG(
          CASE
            WHEN l.sale_type = 'bulto'
            THEN l.final_price
            ELSE NULL
          END
        )
      `;
    }

    const analyticsResult = await pool.query(
      `
        SELECT

        ${groupField} AS label,

        ${
            subGroupField

            ? `${subGroupField} AS subgroup,`

            : `'TOTAL' AS subgroup,`
        }

        COUNT(*) AS total_lots,

        SUM(l.quantity) AS animals,

        SUM(l.weight) AS total_weight,

        SUM(
          CASE
            WHEN l.sale_type = 'kilo'
            THEN l.weight * l.final_price
            ELSE l.quantity * l.final_price
          END
        ) AS total_revenue,

        AVG(
          CASE
            WHEN l.sale_type = 'kilo'
            THEN l.final_price
            ELSE NULL
          END
        ) AS avg_price_kg,

        AVG(
          CASE
            WHEN l.sale_type = 'bulto'
            THEN l.final_price
            ELSE NULL
          END
        ) AS avg_price_animal,

        ${metricField} AS metric_value

      FROM auction_live_lots l

      LEFT JOIN users u
        ON u.id = l.winner_user_id

      LEFT JOIN LATERAL (
        SELECT
          bid_source,
          bidder_label,
          amount,
          created_at
        FROM bids
        WHERE bids.lot_id = l.id
        ORDER BY amount DESC, created_at DESC
        LIMIT 1
      ) b ON true

      WHERE
        l.company_id = $1
        AND l.status = 'sold'
        ${dateFilter}
        AND ${groupField} IS NOT NULL

        GROUP BY

        ${groupField}

        ${
            subGroupField

            ? `, ${subGroupField}`

            : ''
        }

      ORDER BY
        metric_value DESC NULLS LAST

      LIMIT 20
      `,
      params,
    );

    const trendsResult =
        await pool.query(

      `
      SELECT

        DATE(l.closed_at)
        AS trend_date,

        COALESCE(
          AVG(
            CASE
              WHEN l.sale_type = 'kilo'
              THEN l.final_price
              ELSE NULL
            END
          ),
          0
        ) AS avg_price_kg

      FROM auction_live_lots l

      WHERE

        l.company_id = $1

        AND l.status = 'sold'

        ${dateFilter}

      GROUP BY
        DATE(l.closed_at)

      ORDER BY
        trend_date ASC
      `,
      params,
    );

    return res.json({
      summary: {
        lots_sold: lotsSold,
        animals_sold: animalsSold,
        total_weight: totalWeight,
        total_revenue: totalRevenue,
        online_sales: onlineSales,
        floor_sales: floorSales,
        avg_price_kg:
          kiloWeight > 0 ? kiloRevenue / kiloWeight : 0,
        avg_price_animal:
          bultoAnimals > 0 ? bultoRevenue / bultoAnimals : 0,
      },

      top_buyers: topBuyers,

      analytics_results: analyticsResult.rows,
      price_trends:
          trendsResult.rows,      
    });

  } catch (e) {
    console.log('GLOBAL ANALYTICS ERROR 👉', e);

    return res.status(500).json({
      error: 'Global analytics error',
    });
  }
};

exports.exportGlobalAuctionAnalytics =
  async (req, res) => {

  try {

    const companyId =
        req.user.company_id;

    const {
      from,
      to,
    } = req.query;

    const params = [companyId];

    let dateFilter = '';

    if (from && to) {

      dateFilter = `
        AND DATE(l.closed_at)
        BETWEEN $2 AND $3
      `;

      params.push(from);
      params.push(to);
    }

    const result =
        await pool.query(

      `
      SELECT

        DATE(l.closed_at)
        AS sale_date,

        a.name
        AS auction_name,

        l.lot_number,

        l.cattle_type,

        l.breed,

        l.gender,

        l.age,

        l.department,

        l.municipality,

        l.sale_type,

        l.quantity
        AS animals,

        l.weight
        AS total_weight,

        CASE

          WHEN l.quantity > 0

          THEN l.weight / l.quantity

          ELSE 0

        END

        AS avg_weight,

        CASE

          WHEN l.sale_type = 'kilo'

          THEN l.final_price

          ELSE NULL

        END

        AS price_kg,

        CASE

          WHEN l.sale_type = 'bulto'

          THEN l.final_price

          ELSE NULL

        END

        AS price_animal,

        CASE

          WHEN l.sale_type = 'kilo'

          THEN l.weight * l.final_price

          ELSE l.quantity * l.final_price

        END

        AS total_revenue,

        COALESCE(

          b.bidder_label,

          u.full_name,

          'SALA'

        )

        AS buyer_name,

        b.bid_source

      FROM auction_live_lots l

      INNER JOIN auctions a
      ON a.id = l.auction_id

      LEFT JOIN users u
      ON u.id = l.winner_user_id

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

        l.company_id = $1

        AND l.status = 'sold'

        ${dateFilter}

      ORDER BY
        l.closed_at DESC
      `,
      params,
    );

    return res.json(
      result.rows,
    );

  } catch (e) {

    console.log(
      'EXPORT ANALYTICS ERROR 👉',
      e,
    );

    return res.status(500).json({

      error:
          'Export analytics error',
    });
  }
};