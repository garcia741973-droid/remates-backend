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
                AND fcm_token IS NOT NULL
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
        const message = {

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

                        'content-available': 1,
                    },
                },
            },
        };

        /// 🔥 SOLO SI EXISTE IMAGEN
        if (
            imageUrl &&
            imageUrl.startsWith('http')
        ) {

            message.android.notification.imageUrl =
                imageUrl;

            message.apns.fcmOptions = {

                imageUrl,
            };
        }

        console.log('');
        console.log('==========================');
        console.log('FCM MESSAGE');
        console.log(JSON.stringify(message, null, 2));
        console.log('==========================');
        console.log('');

        const response =
            await admin.messaging()
                .sendEachForMulticast(
                    message
                );

        console.log(
            '🔥 FULL RESPONSE:',
            JSON.stringify(response),
        );

        console.log(
            '✅ PUSH SENT:',
            response.successCount,
        );

        console.log(
            '❌ PUSH FAILURES:',
            response.failureCount,
        );

        console.log(
            '❌ PUSH RESPONSES:',
            JSON.stringify(
                response.responses,
                null,
                2
            ),
        );

        for (const [index, resp] of response.responses.entries()) {

            if (!resp.success) {

                console.log(
                    '🚨 FAILED TOKEN:',
                    tokens[index]
                );

                console.log(
                    '🚨 ERROR CODE:',
                    resp.error?.code
                );

                console.log(
                    '🚨 ERROR MESSAGE:',
                    resp.error?.message
                );

                if (
                    resp.error?.code ===
                    'messaging/registration-token-not-registered'
                ) {
                    await pool.query(
                        `
                        DELETE FROM devices
                        WHERE fcm_token = $1
                        `,
                        [tokens[index]]
                    );

                    console.log(
                        '🧹 TOKEN ELIMINADO:',
                        tokens[index]
                    );
                }
            }
        }

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

/// ======================================================
/// 🏭 NOTIFICAR USUARIOS DE FRIGORÍFICO POR PERMISO
/// GUARDA EN BANDEJA + ENVÍA FCM
/// ======================================================

exports.sendSlaughterhouseOperatorNotification = async ({
    companyId,
    permissionCode,
    title,
    body,
    data = {},
    eventKey = null,
}) => {

    try {

        if (!permissionCode) {

            console.log(
                '⚠️ SLAUGHTERHOUSE NOTIFICATION WITHOUT PERMISSION CODE',
            );

            return;

        }

        // =====================================================
        // 👤 BUSCAR USUARIOS AUTORIZADOS
        // =====================================================

        const recipients =
            await pool.query(
                `
                SELECT DISTINCT u.id
                FROM slaughterhouse_user_roles sur

                JOIN slaughterhouse_roles sr
                  ON sr.id = sur.role_id
                 AND sr.company_id = sur.company_id
                 AND sr.is_active = TRUE

                JOIN slaughterhouse_role_permissions srp
                  ON srp.role_id = sr.id

                JOIN slaughterhouse_permissions sp
                  ON sp.id = srp.permission_id

                JOIN users u
                  ON u.id = sur.user_id

                JOIN user_companies uc
                  ON uc.user_id = u.id
                 AND uc.company_id = sur.company_id
                 AND uc.company_status = 'approved'

                WHERE sur.company_id = $1
                  AND sp.code = $2
                `,
                [
                    companyId,
                    permissionCode,
                ],
            );

        const recipientIds =
            recipients.rows.map(
                (row) => Number(row.id),
            );

        console.log(
            '🏭 SLAUGHTERHOUSE NOTIFICATION RECIPIENTS:',
            recipientIds,
        );

        console.log(
            '🔐 PERMISSION:',
            permissionCode,
        );

        if (!recipientIds.length) {

            console.log(
                '⚠️ NO SLAUGHTERHOUSE RECIPIENTS FOR PERMISSION',
                permissionCode,
            );

            return;

        }

        // =====================================================
        // 🔔 GUARDAR NOTIFICACIÓN PERSISTENTE
        // =====================================================

        const notificationType =
            data.type ||
            'slaughterhouse_notification';

        const insertResult =
            await pool.query(
                `
                INSERT INTO user_notifications (
                    user_id,
                    company_id,
                    type,
                    title,
                    body,
                    data,
                    event_key
                )
                SELECT
                    recipient_id,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6::jsonb,
                    $7
                FROM unnest($1::int[]) AS recipient_id

                ON CONFLICT (user_id, event_key)
                WHERE event_key IS NOT NULL
                DO NOTHING

                RETURNING user_id
                `,
                [
                    recipientIds,
                    companyId,
                    notificationType,
                    title,
                    body,
                    JSON.stringify(data),
                    eventKey,
                ],
            );

        const insertedUserIds =
            insertResult.rows.map(
                (row) => Number(row.user_id),
            );

        console.log(
            '🔔 USER NOTIFICATIONS CREATED:',
            insertedUserIds,
        );

        // =====================================================
        // ♻️ EVITAR PUSH DUPLICADO
        // =====================================================

        if (!insertedUserIds.length) {

            console.log(
                'ℹ️ NOTIFICACIÓN YA REGISTRADA · NO SE REPITE PUSH',
            );

            return;

        }

        // =====================================================
        // 📲 PUSH FCM
        // =====================================================

        await exports.sendPushNotification({
            userIds: insertedUserIds,
            title,
            body,
            data,
        });

    } catch (err) {

        console.log(
            '❌ SLAUGHTERHOUSE NOTIFICATION ERROR',
            err,
        );

    }

};