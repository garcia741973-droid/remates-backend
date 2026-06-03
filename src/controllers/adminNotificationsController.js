const { pool } = require('../config/db');

const {
    sendPushNotification,
} = require('../services/notificationService');

/// ======================================================
/// 🔥 ENVIAR NOTIFICACIÓN ADMIN
/// ======================================================
exports.sendNotification = async (
    req,
    res,
) => {

    try {

        const {
            title,
            body,
            image_url,

            type = 'announcement',

            target_type,
            target_value,
        } = req.body;

        let usersQuery = '';
        let values = [];

        /// 🌎 TODOS
        if (target_type === 'all') {

            usersQuery = `
                SELECT id
                FROM users
            `;
        }

        /// 👤 POR ROL
        else if (target_type === 'role') {

            usersQuery = `
                SELECT id
                FROM users
                WHERE role = $1
            `;

            values.push(target_value);
        }

        /// 🏢 POR EMPRESA
        else if (
            target_type === 'company'
        ) {

            const parts =
                target_value
                    ? target_value
                        .toString()
                        .split('|')
                    : [];

            const companyId =
                parts[0];

            const companyRole =
                parts[1];

            if (!companyId) {

                return res.status(400).json({

                    error:
                        'Empresa inválida',
                });
            }

            /// 🔥 EMPRESA + ROL
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

            }

            /// 🔥 TODOS EMPRESA
            else {

                usersQuery = `
                    SELECT DISTINCT user_id as id
                    FROM user_companies
                    WHERE company_id = $1
                `;

                values.push(companyId);
            }
        }

        /// 🎯 USUARIO INDIVIDUAL
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

        else {

            return res.status(400).json({
                error:
                    'target_type inválido',
            });
        }

        /// 🔥 OBTENER USUARIOS
        const usersResult =
            await pool.query(
                usersQuery,
                values,
            );

        const userIds =
            usersResult.rows.map(
                (u) => u.id,
            );

        let campaignId = null;

        /// 🔥 HISTORIAL
        const history =
            await pool.query(

                `
                INSERT INTO admin_notifications (

                    title,
                    body,

                    image_url,

                    type,

                    target_type,
                    target_value,

                    sent_by,

                    total_users,

                    success_count,

                    created_at
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
                    NOW()
                )

                RETURNING *
                `,
                [
                    title,
                    body,

                    image_url,

                    type,

                    target_type,
                    target_value,

                    req.user.user_id,

                    userIds.length,

                    userIds.length,
                ]
            );

            campaignId =
                history.rows[0].id;
                
        /// 🔥 ENVIAR PUSH
        await sendPushNotification({

            userIds,

            title,
            body,

            imageUrl:
                image_url,

            data: {

                type:
                    'admin_campaign',

                campaign_id:
                    campaignId,
            },
        });                

        res.json({

            success: true,

            notification:
                history.rows[0],
        });

    } catch (err) {

        console.log(
            '❌ SEND ADMIN NOTIFICATION ERROR',
            err,
        );

        res.status(500).json({
            error:
                'Error enviando notificación',
        });
    }
};


/// ======================================================
/// 🔥 HISTORIAL
/// ======================================================
exports.getNotifications =
    async (req, res) => {

    try {

        const result =
            await pool.query(

                `
                SELECT *
                FROM admin_notifications
                ORDER BY created_at DESC
                LIMIT 100
                `
            );

        res.json(
            result.rows,
        );

    } catch (err) {

        console.log(
            '❌ GET ADMIN NOTIFICATIONS ERROR',
            err,
        );

        res.status(500).json({
            error:
                'Error obteniendo historial',
        });
    }
};
