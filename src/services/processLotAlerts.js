const { pool } = require('../config/db');

const admin = require('firebase-admin');

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

    let shouldSendPush = false;

    let pushUserId = null;

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

      /// 🔥 VERIFICAR SI YA EXISTE ALERTA PARA ESTE LOTE
      const existingLotAlert =
        await pool.query(
          `
          SELECT id
          FROM search_alerts
          WHERE user_id = $1
          AND lot_id = $2
          LIMIT 1
          `,
          [
            search.user_id,
            lot.id,
          ]
        );

      const isFirstMatch =
        existingLotAlert.rows.length === 0;

        if (isFirstMatch) {

        shouldSendPush = true;

        pushUserId =
            search.user_id;
        }        

      console.log(
        '🧠 FIRST MATCH:',
        isFirstMatch
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

        /// 🔔 PUSH FINAL
        if (shouldSendPush) {

        console.log(
            '📲 SENDING PUSH...'
        );

        /// 🔥 TOKEN USUARIO
        const tokensResult =
            await pool.query(
            `
            SELECT fcm_token
            FROM users
            WHERE id = $1
            AND fcm_token IS NOT NULL
            `,
            [pushUserId]
            );

        const tokens =
            tokensResult.rows.map(
            t => t.fcm_token
            );

        console.log(
            '📲 TOKENS:',
            tokens.length
        );

        if (tokens.length > 0) {

            const message = {

            notification: {

                title:
                '🔥 Encontramos ganado para ti',

                body:
                `${lot.class} ${lot.breed} - ${lot.department}`,
            },

            data: {

                type: 'search_alert',

                lot_id:
                String(lot.id),

                click_action:
                'FLUTTER_NOTIFICATION_CLICK',
            },

            tokens,
            };

            try {

            const response =
                await admin.messaging()
                .sendEachForMulticast(
                    message
                );

            console.log(
                '✅ PUSH SENT:',
                response.successCount
            );

            console.log(
            '❌ PUSH FAILURES:',
            response.failureCount
            );

            console.log(
            '❌ PUSH RESPONSES:',
            response.responses
            );            

            } catch (pushError) {

            console.log(
                '❌ PUSH ERROR:',
                pushError
            );
            }
        }
        }
    }

    console.log(
      '✅ PROCESS ALERTS FINISHED'
    );

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