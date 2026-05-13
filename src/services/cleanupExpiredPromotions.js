const { pool } =
    require('../config/db');

const cleanupExpiredPromotions =
    async () => {

    try {

        console.log(
            '🧹 CLEANING EXPIRED PROMOTIONS...',
        );

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