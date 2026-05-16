const { pool } =
    require('../config/db');

const {
    createOperationEvent,
} = require('./operationEventsService');    

const cleanupExpiredPromotions =
    async () => {

    try {

        console.log(
            '🧹 CLEANING EXPIRED PROMOTIONS...',
        );

        /// ⚠ PROMOCIONES POR VENCER
        const expiringPromotions =
            await pool.query(

                `
                SELECT
                    id,
                    title,
                    ends_at
                FROM promotion_requests
                WHERE

                    is_visible = true

                    AND ends_at IS NOT NULL

                    AND ends_at > NOW()

                    AND ends_at <= NOW() + INTERVAL '3 days'
                `
            );

        for (const promo of expiringPromotions.rows) {

            /// 🔥 EVITAR DUPLICADOS
            const existing =
                await pool.query(

                    `
                    SELECT id
                    FROM operation_events
                    WHERE

                        type = 'promotion_expiring'

                        AND data->>'promotion_id' = $1

                        AND created_at >= NOW() - INTERVAL '24 hours'

                    LIMIT 1
                    `,
                    [
                        promo.id.toString(),
                    ]
                );

            if (existing.rows.length === 0) {

                await createOperationEvent({

                    type:
                        'promotion_expiring',

                    title:
                        '⚠ Campaña por vencer',

                    message:
                        `La campaña "${promo.title}" vence en menos de 3 días`,

                    priority:
                        'high',

                    data: {

                        promotion_id:
                            promo.id,
                    },
                });

                console.log(
                    `⚠ PROMOTION EXPIRING EVENT: ${promo.title}`
                );
            }
        }

        const result =
            await pool.query(

                `
                UPDATE lots
                SET

                    promoted_until = NULL,

                    promotion_priority = 0

                WHERE

                    promoted_until IS NOT NULL

                    AND promoted_until < NOW()

                RETURNING id
                `
            );

        console.log(

            `✅ EXPIRED CLEANED: ${result.rowCount}`,
        );

    } catch (err) {

        console.log(
            '❌ CLEANUP ERROR',
            err,
        );
    }
};

module.exports = {
    cleanupExpiredPromotions,
};