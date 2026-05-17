const { pool } = require('../config/db');


/// ======================================================
/// 🔥 META NOTIFICATIONS
/// ======================================================
exports.getMeta = async (
    req,
    res,
) => {

    try {

        /// 🔥 EMPRESAS
        const companies =
            await pool.query(

                `
                SELECT
                    id,
                    name
                FROM companies
                ORDER BY name ASC
                `
            );

        /// 🔥 USUARIOS
        const users =
            await pool.query(

                `
                SELECT

                    u.id,

                    COALESCE(
                        u.full_name,
                        u.name,
                        u.email
                    ) as name,

                    u.email,

                    uc.company_id,

                    c.name as company_name,

                    u.role

                FROM users u

                LEFT JOIN user_companies uc
                    ON uc.user_id = u.id

                LEFT JOIN companies c
                    ON c.id = uc.company_id

                ORDER BY name ASC
                `
            );

        res.json({

            roles: [

                'client',
                'admin',
                'operator',
                'streamer',
                'super_admin',
            ],

            companies:
                companies.rows,

            users:
                users.rows,
        });

    } catch (err) {

        console.log(
            '❌ META ERROR',
            err,
        );

        res.status(500).json({

            error:
                'Error obteniendo meta',
        });
    }
};