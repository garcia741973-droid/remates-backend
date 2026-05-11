const pool = require('../config/db');

const {
  calculateLotMatchScore,
} = require('./searchMatcher');

async function processLotAlerts(lot) {

  try {

    console.log(
      '🧠 PROCESSING LOT ALERTS...'
    );

    /// 🔍 BUSQUEDAS ACTIVAS
    const searchesResult = await pool.query(`
      SELECT *
      FROM saved_searches
      WHERE alerts_enabled = true
    `);

    const searches = searchesResult.rows;

    for (const search of searches) {

      const filters = search.filters;

      const result =
        calculateLotMatchScore(
          filters,
          lot
        );

      console.log(
        '🧠 MATCH RESULT:',
        result
      );

      if (!result.matched) continue;

      /// 🚫 EVITAR DUPLICADOS
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

      if (
        existing.rows.length > 0
      ) {
        continue;
      }

      /// 💾 CREAR ALERTA
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
        '🔥 ALERT CREATED FOR USER:',
        search.user_id
      );

      /// 🔔 PUSH VENDRA DESPUES
    }

  } catch (err) {

    console.log(
      '❌ PROCESS LOT ALERTS ERROR:',
      err
    );
  }
}

module.exports = {
  processLotAlerts,
};