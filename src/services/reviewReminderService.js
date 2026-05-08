const { pool } = require('../config/db');

const admin = require('firebase-admin');

/// 🔥 REVIEW REMINDER SERVICE
const startReviewReminderService = () => {

  console.log(
    '⭐ Review Reminder Service iniciado'
  );

  /// 🔥 CADA 5 MINUTOS
  setInterval(async () => {

    try {

      console.log(
        '🔎 Buscando reviews pendientes...'
      );

      /// 🔥 NEGOCIACIONES LISTAS
      const result = await pool.query(
        `
        SELECT

          n.id,

          n.buyer_id,

          n.seller_id,

          l.lot_number

        FROM negotiations n

        JOIN lots l
          ON l.id = n.lot_id

        WHERE

          n.status = 'contacts_unlocked'

          AND n.review_available_at <= NOW()

          AND n.review_push_sent_at IS NULL
        `
      );

      const negotiations = result.rows;

      console.log(
        `⭐ Reviews pendientes: ${negotiations.length}`
      );

      /// 🔥 RECORRER
      for (const negotiation of negotiations) {

        /// 🔥 TOKENS COMPRADOR
        const tokensRes = await pool.query(
          `
          SELECT fcm_token
          FROM devices
          WHERE user_id = $1
          `,
          [negotiation.buyer_id]
        );

        const tokens =
          tokensRes.rows.map(
            t => t.fcm_token
          );

        console.log(
          '📲 TOKENS REVIEW:',
          tokens.length
        );

        /// 🔥 ENVIAR PUSH
        if (tokens.length > 0) {

        try {

            await admin.messaging()
            .sendEachForMulticast({

            tokens,

            notification: {

                title:
                '⭐ Califica tu experiencia',

                body:
                `¿Cómo fue la compra del lote #${negotiation.lot_number}?`,
            },

            data: {

                type: 'seller_review',

                negotiationId:
                negotiation.id.toString(),
            },

            android: {

                priority: 'high',
            },

            apns: {

                headers: {

                'apns-priority': '10',
                },
            },
            });

            console.log(
            `✅ Push review enviado NEG ${negotiation.id}`
            );

            /// 🔥 MARCAR PUSH ENVIADO SOLO SI FUE EXITOSO
            await pool.query(
            `
            UPDATE negotiations
            SET review_push_sent_at = NOW()
            WHERE id = $1
            `,
            [negotiation.id]
            );

        } catch (e) {

            console.log(
            '❌ ERROR PUSH REVIEW:',
            e
            );
        }
        }

        /// 🔥 MARCAR PUSH ENVIADO
        await pool.query(
          `
          UPDATE negotiations
          SET review_push_sent_at = NOW()
          WHERE id = $1
          `,
          [negotiation.id]
        );
      }

    } catch (error) {

      console.error(
        '❌ ERROR REVIEW SERVICE:',
        error
      );
    }

  }, 1000 * 60 * 5); // 5 min
};

module.exports = {
  startReviewReminderService
};