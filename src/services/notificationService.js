const admin = require('../firebase');
const { pool } = require('../config/db');

/// ======================================================
/// 🔥 ENVIAR PUSH DIRECTO
/// ======================================================
exports.sendPushNotification = async ({
    userIds = [],
    title,
    body,
    data = {},
}) => {

    try {

        if (!userIds.length) {

            console.log(
                '⚠️ NO USER IDS',
            );

            return;
        }

        /// 🔥 OBTENER TOKENS
        const tokensResult =
            await pool.query(

                `
                SELECT DISTINCT fcm_token
                FROM devices
                WHERE user_id = ANY($1)
                `,
                [userIds],
            );

        const tokens =
            tokensResult.rows.map(
                (r) => r.fcm_token,
            );

        console.log(
            '📲 TOKENS FOUND:',
            tokens.length,
        );

        if (!tokens.length) {

            console.log(
                '⚠️ NO TOKENS FOUND',
            );

            return;
        }

        /// 🚀 PUSH
        const response =
            await admin.messaging()
                .sendEachForMulticast({

                    tokens,

                    notification: {
                        title,
                        body,
                    },

                    data: Object.keys(data)
                        .reduce((acc, key) => {

                            acc[key] =
                                String(data[key]);

                            return acc;

                        }, {}),

                    android: {

                        priority: 'high',

                        notification: {

                            channelId:
                                'high_importance_channel',

                            sound: 'default',
                        },
                    },

                    apns: {

                        headers: {
                            'apns-priority': '10',
                        },

                        payload: {

                            aps: {

                                sound: 'default',

                                badge: 1,

                                contentAvailable: true,
                            },
                        },
                    },
                });

        console.log(
            '🔥 PUSH SENT:',
            response.successCount,
        );

    } catch (err) {

        console.log(
            '❌ PUSH ERROR',
            err,
        );
    }
};


/// ======================================================
/// 🔥 NOTIFICAR ADMINS
/// ======================================================
exports.sendAdminNotification = async ({
    title,
    body,
    data = {},
}) => {

    try {

        /// 🔥 SUPER ADMINS
        const superAdmins =
            await pool.query(

                `
                SELECT id
                FROM users
                WHERE role = 'super_admin'
                `
            );

        const adminIds =
            superAdmins.rows.map(
                (r) => r.id,
            );

        console.log(
            '👑 SUPER ADMINS:',
            adminIds,
        );

        if (!adminIds.length) return;

        await exports.sendPushNotification({

            userIds: adminIds,

            title,
            body,
            data,
        });

    } catch (err) {

        console.log(
            '❌ ADMIN NOTIFICATION ERROR',
            err,
        );
    }
};