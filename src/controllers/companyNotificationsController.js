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

                    'announcement',

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