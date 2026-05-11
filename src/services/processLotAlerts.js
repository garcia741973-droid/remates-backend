const { pool } = require('../config/db');

const {
  calculateLotMatchScore,
} = require('./searchMatcher');

async function processLotAlerts(lot) {

  try {

    console.log(
      '🧠 PROCESSING LOT ALERTS...'
    );

    console.log(
      '🐂 LOT:',
      lot
    );

    /// 🔍 BUSQUEDAS
    const searchesResult =
      await pool.query(`
        SELECT *
        FROM saved_searches
        WHERE alerts_enabled = true
      `);

    console.log(
      '🔍 SEARCHES FOUND:',
      searchesResult.rows.length
    );

    const searches =
      searchesResult.rows;

    for (const search of searches) {

      console.log(
        '📦 SEARCH:',
        search.id
      );

      console.log(
        '📦 FILTERS:',
        search.filters
      );

      const filters =
        search.filters;

      const result =
        calculateLotMatchScore(
          filters,
          lot
        );

      console.log(
        '🧠 MATCH RESULT:',
        result
      );

      if (!result.matched) {

        console.log(
          '❌ NOT MATCHED'
        );

        continue;
      }

      console.log(
        '✅ MATCHED!'
      );

      /// 🚫 DUPLICADOS
      const existing =
        await pool.query(
          `
          SELECT id
          FROM search_alerts
          WHERE user_id = $1
          AND lot_id = $2
          AND saved_search_id = $3
          `,
          [
            search.user_id,
            lot.id,
            search.id,
          ]
        );

      console.log(
        '🔍 EXISTING ALERTS:',
        existing.rows.length
      );

      if (
        existing.rows.length > 0
      ) {

        console.log(
          '⚠️ ALERT ALREADY EXISTS'
        );

        continue;
      }

      console.log(
        '💾 INSERTING ALERT...'
      );

      await pool.query(
        `
        INSERT INTO search_alerts (
          user_id,
          company_id,
          lot_id,
          saved_search_id,
          score,
          reasons
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [
          search.user_id,
          search.company_id,
          lot.id,
          search.id,
          result.score,
          JSON.stringify(result.reasons),
        ]
      );

      console.log(
        '🔥 ALERT CREATED!'
      );
    }

  } catch (err) {

    console.log(
      '❌ PROCESS ALERTS ERROR:',
      err
    );
  }
}

module.exports = {
  processLotAlerts,
};