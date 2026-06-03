const { pool } =
    require('../config/db');

const admin =
    require('firebase-admin');

/// ======================================================
/// 🔥 ENVIAR O PROGRAMAR CAMPAÑA
/// ======================================================
exports.createCampaign =
    async (req, res) => {

    try {

        const created_by =
            req.user.user_id;

        const {

            title,
            body,
            image_url,
            type,
            target_type,
            target_value,

            scheduled_at,

            template_id,

            repeat_type,

            repeat_days,

            repeat_count,

        } = req.body;

        /// 🔥 CREAR CAMPAÑA
        const campaignRes =
            await pool.query(

                `
                INSERT INTO notification_campaigns (

                    created_by,

                    title,
                    body,

                    image_url,

                    type,

                    target_type,
                    target_value,

                    status,

                    scheduled_at,

                    template_id,

                    repeat_type,
                    repeat_days,
                    repeat_count,
                    repeat_current

                )

                VALUES (

                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    $9,
                    $10,
                    $11,
                    $12,
                    $13,
                    $14
                )

                RETURNING *
                `,
                [

                    created_by,

                    title,
                    body,
                    image_url,

                    type ||
                        'announcement',

                    target_type ||
                        'all',

                    target_value || null,

                    scheduled_at
                        ? 'scheduled'
                        : 'sent',

                    scheduled_at || null,

                    template_id || null,

                    repeat_type || 'once',

                    repeat_days || [],

                    repeat_count || 1,

                    0,
                ]
            );

        const campaign =
            campaignRes.rows[0];

        /// ======================================================
        /// 🔥 PROGRAMADA
        /// ======================================================
        if (scheduled_at) {

            await pool.query(

                `
                INSERT INTO scheduled_notifications (

                    campaign_id,
                    scheduled_for

                )

                VALUES ($1,$2)
                `,
                [
                    campaign.id,
                    scheduled_at,
                ]
            );

            return res.json({

                success: true,

                scheduled: true,

                campaign,
            });
        }

        /// ======================================================
        /// 🔥 ENVÍO INMEDIATO
        /// ======================================================

        let usersQuery = '';
        let values = [];

        /// 🔥 TODOS
        if (
            target_type === 'all'
        ) {

            usersQuery = `
                SELECT id
                FROM users
            `;
        }

        /// 🔥 ROLE
        else if (
            target_type === 'role'
        ) {

            usersQuery = `
                SELECT DISTINCT user_id as id
                FROM user_companies
                WHERE role = $1
            `;

            values.push(target_value);
        }

        /// 🔥 COMPANY
        else if (
            target_type === 'company'
        ) {

            const parts =
                target_value
                    .toString()
                    .split('|');

            const companyId =
                parts[0];

            const companyRole =
                parts[1];

            if (companyRole) {

                usersQuery = `
                    SELECT DISTINCT user_id as id
                    FROM user_companies
                    WHERE company_id = $1
                    AND role = $2
                `;

                values.push(
                    companyId,
                    companyRole,
                );

            } else {

                usersQuery = `
                    SELECT DISTINCT user_id as id
                    FROM user_companies
                    WHERE company_id = $1
                `;

                values.push(companyId);
            }
        }

        /// 🔥 USER
        else if (
            target_type === 'user'
        ) {

            usersQuery = `
                SELECT id
                FROM users
                WHERE id = $1
            `;

            values.push(target_value);
        }

        const users =
            await pool.query(
                usersQuery,
                values,
            );

        const userIds =
            users.rows.map(
                u => u.id
            );

        if (
            userIds.length === 0
        ) {

            return res.status(400).json({

                error:
                    'No hay usuarios',
            });
        }

        /// 🔥 TOKENS
        const tokensRes =
            await pool.query(

                `
                SELECT DISTINCT fcm_token
                FROM devices
                WHERE user_id = ANY($1)
                `,
                [userIds]
            );

        const tokens =
            tokensRes.rows.map(
                t => t.fcm_token
            );

        if (
            tokens.length === 0
        ) {

            return res.status(400).json({

                error:
                    'No hay tokens',
            });
        }

        /// 🔥 PUSH
        const response =
            await admin.messaging()
                .sendEachForMulticast({

            tokens,

            notification: {

                title,
                body,
            },

            data: {

                type:
                    'admin_campaign',

                campaign_id:
                    campaign.id.toString(),
            },
        });

        /// 🔥 UPDATE MÉTRICAS
        await pool.query(

            `
            UPDATE notification_campaigns
            SET

                total_users = $1,

                total_sent = $2,

                total_failed = $3,

                sent_at = NOW(),

                last_executed_at = NOW(),

                repeat_current = 1

            WHERE id = $4
            `,
            [

                userIds.length,

                response.successCount,

                response.failureCount,

                campaign.id,
            ]
        );

        res.json({

            success: true,

            campaign_id:
                campaign.id,

            success_count:
                response.successCount,

            failed_count:
                response.failureCount,
        });

    } catch (err) {

        console.log(
            '❌ CREATE CAMPAIGN ERROR',
            err,
        );

        res.status(500).json({

            error:
                'Error creando campaña',
        });
    }
};

/// ======================================================
/// 🔥 HISTORIAL
/// ======================================================
exports.getCampaigns =
    async (req, res) => {

    try {

        const result =
            await pool.query(

                `
                SELECT *
                FROM notification_campaigns
                WHERE is_visible = true
                ORDER BY created_at DESC
                `
            );

        res.json(
            result.rows
        );

    } catch (err) {

        console.log(
            '❌ GET CAMPAIGNS ERROR',
            err,
        );

        res.status(500).json({

            error:
                'Error obteniendo campañas',
        });
    }
};

/// ======================================================
/// 🔥 OCULTAR CAMPAÑA
/// ======================================================
exports.hideCampaign =
    async (req, res) => {

    try {

        const { id } =
            req.params;

        await pool.query(

            `
            UPDATE notification_campaigns
            SET is_visible = false
            WHERE id = $1
            `,
            [id]
        );

        res.json({
            success: true,
        });

    } catch (err) {

        console.log(
            '❌ HIDE CAMPAIGN ERROR',
            err,
        );

        res.status(500).json({

            error:
                'Error ocultando campaña',
        });
    }
};

/// ======================================================
/// 🔥 UPDATE STATUS
/// ======================================================
exports.updateCampaignStatus =
    async (req, res) => {

    try {

        const { id } =
            req.params;

        const { status } =
            req.body;

        await pool.query(

            `
            UPDATE notification_campaigns
            SET status = $1
            WHERE id = $2
            `,
            [
                status,
                id,
            ]
        );

        res.json({
            success: true,
        });

    } catch (err) {

        console.log(
            '❌ UPDATE STATUS ERROR',
            err,
        );

        res.status(500).json({

            error:
                'Error actualizando status',
        });
    }
};

/// ======================================================
/// 🔥 DETALLE CAMPAÑA
/// ======================================================
exports.getCampaignById =
    async (req, res) => {

    try {

        const { id } =
            req.params;

        const result =
            await pool.query(

                `
                SELECT *
                FROM notification_campaigns
                WHERE id = $1
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

    } catch (err) {

        console.log(
            '❌ GET CAMPAIGN ERROR',
            err,
        );

        res.status(500).json({

            error:
                'Error obteniendo campaña',
        });
    }
};