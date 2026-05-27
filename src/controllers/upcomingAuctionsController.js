const { pool } =
    require('../config/db');

/// ===========================================
/// 🔥 CREAR PRÓXIMO REMATE
/// ===========================================
exports.createUpcomingAuction =
    async (req, res) => {

    try {

        const companyId =
            req.user.company_id;

        const {

            title,

            description,

            location,

            banner_url,

            start_date,

        } = req.body;

        if (
            !title
        ) {

            return res.status(400)
                .json({

                error:
                    'Título requerido',
            });
        }

        const result =
            await pool.query(

            `
            INSERT INTO
            upcoming_auctions (

                company_id,

                title,

                description,

                location,

                banner_url,

                start_date

            )

            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6
            )

            RETURNING *
            `,

            [

                companyId,

                title,

                description,

                location,

                banner_url,

                start_date,
            ],
        );

        res.json({

            success: true,

            auction:
                result.rows[0],
        });

    } catch (e) {

        console.log(
            'CREATE UPCOMING AUCTION ERROR:',
            e,
        );

        res.status(500).json({

            error:
                'Error creando remate',
        });
    }
};

/// ===========================================
/// 🔥 LISTAR REMATES EMPRESA
/// ===========================================
exports.getUpcomingAuctions =
    async (req, res) => {

    try {

        const { company_id } =
            req.params;

        const result =
            await pool.query(

            `
            SELECT *

            FROM upcoming_auctions

            WHERE company_id = $1

            ORDER BY start_date ASC
            `,

            [company_id],
        );

        res.json(
            result.rows,
        );

    } catch (e) {

        console.log(
            'GET UPCOMING AUCTIONS ERROR:',
            e,
        );

        res.status(500).json({

            error:
                'Error obteniendo remates',
        });
    }
};

/// ===========================================
/// 🔥 ELIMINAR
/// ===========================================
exports.deleteUpcomingAuction =
    async (req, res) => {

    try {

        const { id } =
            req.params;

        await pool.query(

            `
            DELETE FROM
            upcoming_auctions
            WHERE id = $1
            `,

            [id],
        );

        res.json({

            success: true,
        });

    } catch (e) {

        console.log(
            'DELETE UPCOMING AUCTION ERROR:',
            e,
        );

        res.status(500).json({

            error:
                'Error eliminando remate',
        });
    }
};

/// ===========================================
/// 🔥 EDITAR
/// ===========================================
exports.updateUpcomingAuction =
    async (req, res) => {

    try {

        const { id } =
            req.params;

        const {

            title,

            description,

            location,

            start_date,

        } = req.body;

        const result =
            await pool.query(

            `
            UPDATE upcoming_auctions

            SET

                title = $1,

                description = $2,

                location = $3,

                start_date = $4

            WHERE id = $5

            RETURNING *
            `,

            [

                title,

                description,

                location,

                start_date,

                id,
            ],
        );

        res.json({

            success: true,

            auction:
                result.rows[0],
        });

    } catch (e) {

        console.log(
            'UPDATE UPCOMING ERROR:',
            e,
        );

        res.status(500).json({

            error:
                'Error actualizando remate',
        });
    }
};