const { pool } = require('../config/db');

/// ======================================================
/// 🔥 CREAR EVENTO OPERATIVO
/// ======================================================
exports.createOperationEvent = async ({
    type,
    title,
    message = '',
    data = {},
    priority = 'normal',
}) => {

    try {

        const result =
            await pool.query(

                `
                INSERT INTO operation_events (

                    type,
                    title,
                    message,
                    data,
                    priority

                ) VALUES (

                    $1,
                    $2,
                    $3,
                    $4,
                    $5

                )

                RETURNING *
                `,
                [

                    type,
                    title,
                    message,
                    data,
                    priority,
                ]
            );

        console.log(
            '🔥 OPERATION EVENT CREATED:',
            result.rows[0].id,
        );

        return result.rows[0];

    } catch (err) {

        console.log(
            '❌ CREATE OPERATION EVENT ERROR',
            err,
        );
    }
};