const { pool } = require('../config/db');

/// ======================================================
/// 🔥 REPORTE GENERAL
/// ======================================================
exports.getCashReport = async (req, res) => {

    try {

        const company_id =
            req.user.company_id;

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

                WHERE company_id = $1
                `,
                [company_id]
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

        const company_id =
            req.user.company_id;    

        const { rows } =
            await pool.query(

                `
                SELECT *

                FROM cash_movements

                WHERE company_id = $1

                ORDER BY created_at DESC
                `,
                [company_id]
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

        const company_id =
            req.user.company_id;

        const {
            amount,
            description,
            category,
        } = req.body;

        /// 🔥 VALIDAR MONTO
        if (!amount || amount <= 0) {

            return res.status(400).json({
                error:
                    'Monto inválido',
            });
        }

        /// 🔥 VALIDAR DESCRIPCIÓN
        if (!description) {

            return res.status(400).json({
                error:
                    'Descripción requerida',
            });
        }

        const { rows } =
            await pool.query(

                `
                INSERT INTO cash_movements
                (
                    company_id,
                    type,
                    category,
                    amount,
                    description,
                    reference_type,
                    created_by
                )

                VALUES
                (
                    $1,
                    'expense',
                    $2,
                    $3,
                    $4,
                    'manual_expense',
                    $5
                )

                RETURNING *
                `,
                [
                    company_id,
                    category || 'general',
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

/// ======================================================
/// 🔥 OBTENER CATEGORÍAS
/// ======================================================
exports.getCategories =
    async (req, res) => {

    try {

        console.log(
            '🔥 CASH USER 👉',
            req.user,
        );        

        const company_id =
            req.user.company_id;

        const { rows } =
            await pool.query(

                `
                SELECT *

                FROM cash_categories

                WHERE
                    company_id = $1

                    AND is_active = true

                ORDER BY name ASC
                `,
                [company_id],
            );

        res.json(rows);

    } catch (err) {

        console.log(
            '❌ GET CASH CATEGORIES ERROR',
            err,
        );

        res.status(500).json({
            error:
                'Error obteniendo categorías',
        });
    }
};

/// ======================================================
/// 🔥 CREAR CATEGORÍA
/// ======================================================
exports.createCategory =
    async (req, res) => {

    try {

        const company_id =
            req.user.company_id;

        const {
            name,
            type,
        } = req.body;

        /// 🔥 VALIDAR
        if (!name || !type) {

            return res.status(400).json({
                error:
                    'Datos incompletos',
            });
        }

        /// 🔥 EVITAR DUPLICADOS
        const exists =
            await pool.query(

                `
                SELECT id

                FROM cash_categories

                WHERE
                    company_id = $1

                    AND LOWER(name) = LOWER($2)

                LIMIT 1
                `,
                [
                    company_id,
                    name,
                ],
            );

        if (
            exists.rows.length > 0
        ) {

            return res.status(400).json({
                error:
                    'La categoría ya existe',
            });
        }

        const { rows } =
            await pool.query(

                `
                INSERT INTO cash_categories
                (
                    company_id,
                    name,
                    type
                )

                VALUES
                (
                    $1,
                    $2,
                    $3
                )

                RETURNING *
                `,
                [
                    company_id,
                    name,
                    type,
                ],
            );

        res.json(rows[0]);

    } catch (err) {

        console.log(
            '❌ CREATE CASH CATEGORY ERROR',
            err,
        );

        res.status(500).json({
            error:
                'Error creando categoría',
        });
    }
};