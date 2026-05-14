const { pool } = require('../config/db');

/// ======================================================
/// 🔥 REPORTE GENERAL
/// ======================================================
exports.getCashReport = async (req, res) => {

    try {

        const { rows } =
            await pool.query(

                `
                SELECT

                    COALESCE(
                        SUM(
                            CASE
                                WHEN type = 'income'
                                THEN amount
                                ELSE 0
                            END
                        ),
                        0
                    ) as total_income,

                    COALESCE(
                        SUM(
                            CASE
                                WHEN type = 'expense'
                                THEN amount
                                ELSE 0
                            END
                        ),
                        0
                    ) as total_expense

                FROM cash_movements
                `
            );

        const income =
            Number(
                rows[0].total_income || 0,
            );

        const expense =
            Number(
                rows[0].total_expense || 0,
            );

        res.json({

            total_income: income,

            total_expense: expense,

            balance:
                income - expense,
        });

    } catch (err) {

        console.log(
            '❌ CASH REPORT ERROR',
            err,
        );

        res.status(500).json({
            error:
                'Error obteniendo reporte',
        });
    }
};


/// ======================================================
/// 🔥 MOVIMIENTOS
/// ======================================================
exports.getCashMovements =
    async (req, res) => {

    try {

        const { rows } =
            await pool.query(

                `
                SELECT *

                FROM cash_movements

                ORDER BY created_at DESC
                `
            );

        res.json(rows);

    } catch (err) {

        console.log(
            '❌ CASH MOVEMENTS ERROR',
            err,
        );

        res.status(500).json({
            error:
                'Error obteniendo movimientos',
        });
    }
};


/// ======================================================
/// 🔥 CREAR EGRESO MANUAL
/// ======================================================
exports.createExpense =
    async (req, res) => {

    try {

        const user_id =
            req.user.user_id;

        const {
            amount,
            description,
            category,
        } = req.body;

        const { rows } =
            await pool.query(

                `
                INSERT INTO cash_movements
                (
                    type,
                    category,
                    amount,
                    description,
                    reference_type,
                    created_by
                )

                VALUES
                (
                    'expense',
                    $1,
                    $2,
                    $3,
                    'manual_expense',
                    $4
                )

                RETURNING *
                `,
                [
                    category,
                    amount,
                    description,
                    user_id,
                ],
            );

        res.json(rows[0]);

    } catch (err) {

        console.log(
            '❌ CREATE EXPENSE ERROR',
            err,
        );

        res.status(500).json({
            error:
                'Error creando egreso',
        });
    }
};