const admin = require('firebase-admin');
const { pool } = require('../config/db');

const {
    createOperationEvent,
} = require('./operationEventsService');

/// ======================================================
/// 🔥 ENVIAR PUSH DIRECTO
/// ======================================================
exports.sendPushNotification = async ({
    userIds = [],
    title,
    body,
    imageUrl = null,
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

        console.log(
            '📲 TOKENS:',
            tokens,
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

                                imageUrl:
                                    imageUrl,
                            },
                        },

                        apns: {

                            headers: {
                                'apns-priority': '10',
                            },

                            fcmOptions: {

                                imageUrl:
                                    imageUrl,
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
            '🔥 FULL RESPONSE:',
            JSON.stringify(response),
        );

        console.log(
            '🔥 PUSH SENT:',
            response.successCount,
        );

        /// 🔥 EVENTO OPERATIVO
        await createOperationEvent({

            type: 'push_sent',

            title: '📲 Push enviado',

            message:
                `${response.successCount} push enviados`,

            data: {

                users: userIds,

                title,
                body,
            },
        });        

    } catch (err) {

        console.log(
            '❌ PUSH ERROR',
            err,
        );

        await createOperationEvent({

            type: 'push_error',

            title:
                '❌ Error push notification',

            message:
                err.message,

            priority: 'high',
        });

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

/// ======================================================
/// 🔥 NOTIFICAR USUARIO
/// ======================================================
exports.sendUserNotification = async ({
    userId,
    title,
    body,
    data = {},
}) => {

    try {

        if (!userId) {

            console.log(
                '⚠️ USER ID REQUIRED',
            );

            return;
        }

        await exports.sendPushNotification({

            userIds: [userId],

            title,
            body,
            data,
        });

    } catch (err) {

        console.log(
            '❌ USER NOTIFICATION ERROR',
            err,
        );
    }
};

/// ======================================================
/// 🔥 NOTIFICAR ADMIN DE EMPRESA
/// ======================================================
exports.sendCompanyAdminNotification = async ({
    companyId,
    title,
    body,
    data = {},
}) => {

    try {

        const admins =
            await pool.query(

                `
                SELECT DISTINCT u.id
                FROM user_companies uc
                JOIN users u
                  ON u.id = uc.user_id
                WHERE uc.company_id = $1
                AND uc.role = 'admin'
                `,
                [companyId],
            );

        const adminIds =
            admins.rows.map(
                (r) => r.id,
            );

        console.log(
            '🏢 COMPANY ADMINS:',
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
            '❌ COMPANY ADMIN NOTIFICATION ERROR',
            err,
        );
    }
};