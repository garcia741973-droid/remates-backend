const { pool } =
    require('../config/db');

/// ======================================================
/// 🔥 CREAR PLANTILLA
/// ======================================================
exports.createTemplate =
    async (req, res) => {

    try {

        const created_by =
            req.user.user_id;

        const {

            name,
            title,
            body,
            type,

        } = req.body;

        const result =
            await pool.query(

                `
                INSERT INTO notification_templates (

                    created_by,

                    name,

                    title,

                    body,

                    type

                )

                VALUES (

                    $1,
                    $2,
                    $3,
                    $4,
                    $5
                )

                RETURNING *
                `,
                [

                    created_by,

                    name,

                    title,

                    body,

                    type ||
                        'announcement',
                ]
            );

        res.json(
            result.rows[0]
        );

    } catch (err) {

        console.log(
            '❌ CREATE TEMPLATE ERROR',
            err,
        );

        res.status(500).json({

            error:
                'Error creando plantilla',
        });
    }
};

/// ======================================================
/// 🔥 LISTAR PLANTILLAS
/// ======================================================
exports.getTemplates =
    async (req, res) => {

    try {

        const result =
            await pool.query(

                `
                SELECT *
                FROM notification_templates
                WHERE is_active = true
                ORDER BY created_at DESC
                `
            );

        res.json(
            result.rows
        );

    } catch (err) {

        console.log(
            '❌ GET TEMPLATES ERROR',
            err,
        );

        res.status(500).json({

            error:
                'Error obteniendo plantillas',
        });
    }
};

/// ======================================================
/// 🔥 ELIMINAR
/// ======================================================
exports.deleteTemplate =
    async (req, res) => {

    try {

        const { id } =
            req.params;

        await pool.query(

            `
            UPDATE notification_templates
            SET is_active = false
            WHERE id = $1
            `,
            [id]
        );

        res.json({
            success: true,
        });

    } catch (err) {

        console.log(
            '❌ DELETE TEMPLATE ERROR',
            err,
        );

        res.status(500).json({

            error:
                'Error eliminando plantilla',
        });
    }
};