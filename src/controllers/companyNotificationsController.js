const { pool } =
    require('../config/db');

/// ======================================================
/// 🔥 ENVIAR MENSAJE EMPRESA
/// ======================================================
exports.sendCompanyBroadcast =
    async (req, res) => {

    try {

        const companyId =
            req.user.company_id;

        const {

            title,
            body,
            image_url,

        } = req.body;

        if (
            !title ||
            !body
        ) {

            return res.status(400)
                .json({

                error:
                    'Faltan datos',
            });
        }

        /// 🔥 CREAR CAMPAÑA
        const campaign =
            await pool.query(

                `
                INSERT INTO
                notification_campaigns (

                    company_id,

                    title,

                    body,

                    image_url,


                    type,

                    target_type,

                    target_value,

                    status,

                    scheduled_at,

                    created_by

                )

                VALUES (

                    $1,
                    $2,
                    $3,
                    $4,

                    'mini_plaza',

                    'company',

                    $5,

                    'scheduled',

                    NOW(),

                    $6
                )

                RETURNING *
                `,
                [

                    companyId,

                    title,

                    body,

                    image_url,

                    `${companyId}|client`,

                    req.user.id,
                ]
            );

        /// 🔥 PROGRAMAR
        await pool.query(

            `
            INSERT INTO
            scheduled_notifications (

                campaign_id,

                scheduled_for

            )

            VALUES (
                $1,
                NOW()
            )
            `,
            [
                campaign.rows[0].id,
            ]
        );

        return res.json({

            success: true,

            message:
                'Mensaje enviado',

            campaign:
                campaign.rows[0],
        });

    } catch (e) {

        console.log(
            'COMPANY BROADCAST ERROR',
            e,
        );

        return res.status(500)
            .json({

            error:
                'Error enviando mensaje',
        });
    }
};

/// ======================================================
/// 🔥 OBTENER CAMPAÑA
/// ======================================================
exports.getCampaignById =
    async (req, res) => {

    try {

        const { id } =
            req.params;

        const result =
            await pool.query(

                `
                SELECT

                    nc.*,

                    c.name AS company_name,

                    c.logo_url,

                    c.mini_plaza_background_url

                FROM notification_campaigns nc

                LEFT JOIN companies c
                    ON c.id = nc.company_id

                WHERE nc.id = $1

                LIMIT 1
                `,
                [id]
            );

        if (
            result.rows.length === 0
        ) {

            return res.status(404)
                .json({

                error:
                    'Campaña no encontrada',
            });
        }

        return res.json(
            result.rows[0],
        );

    } catch (e) {

        console.log(
            'GET CAMPAIGN ERROR',
            e,
        );

        return res.status(500)
            .json({

            error:
                'Error obteniendo campaña',
        });
    }
};