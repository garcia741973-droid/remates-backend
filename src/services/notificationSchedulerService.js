const { pool } =
    require('../config/db');

const admin =
    require('firebase-admin');

/// ======================================================
/// 🔥 EJECUTAR CAMPAÑAS PROGRAMADAS
/// ======================================================
const startNotificationScheduler =
    () => {

    setInterval(async () => {

        try {

            console.log(
                '⏰ CHECKING SCHEDULED NOTIFICATIONS...',
            );

            const pending =
                await pool.query(

                    `
                    SELECT

                        sn.id as schedule_id,

                        sn.campaign_id,

                        nc.*

                    FROM scheduled_notifications sn

                    JOIN notification_campaigns nc
                        ON nc.id = sn.campaign_id

                    WHERE

                        sn.executed = false

                        AND sn.scheduled_for <= NOW()
                    `
                );

            for (const campaign of pending.rows) {

                try {

                    console.log(
                        '🚀 EXECUTING CAMPAIGN:',
                        campaign.id,
                    );

                    let usersQuery = '';
                    let values = [];

                    /// 🔥 TODOS
                    if (
                        campaign.target_type === 'all'
                    ) {

                        usersQuery = `
                            SELECT id
                            FROM users
                        `;
                    }

                    /// 🔥 POR ROL
                    else if (
                        campaign.target_type === 'role'
                    ) {

                        usersQuery = `
                            SELECT DISTINCT user_id as id
                            FROM user_companies
                            WHERE role = $1
                        `;

                        values.push(
                            campaign.target_value,
                        );
                    }

                    /// 🔥 EMPRESA
                    else if (
                        campaign.target_type === 'company'
                    ) {

                        const parts =
                            campaign.target_value
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
                        campaign.target_type === 'user'
                    ) {

                        usersQuery = `
                            SELECT id
                            FROM users
                            WHERE id = $1
                        `;

                        values.push(
                            campaign.target_value,
                        );
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

                        console.log(
                            '⚠️ NO USERS FOUND',
                        );

                        continue;
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

                        console.log(
                            '⚠️ NO TOKENS FOUND',
                        );

                        continue;
                    }

                    /// 🔥 PUSH
                    const response =
                        await admin.messaging()
                            .sendEachForMulticast({

                        tokens,

                        notification: {

                            title:
                                campaign.title,

                            body:
                                campaign.body,
                        },

                        data: {

                            type:
                                campaign.type ||
                                'announcement',
                        },
                    });

                    console.log(
                        '🔥 CAMPAIGN SENT:',
                        response.successCount,
                    );

                    /// 🔥 UPDATE CAMPAÑA
                    await pool.query(

                        `
                        UPDATE notification_campaigns
                        SET

                            total_users = $1,

                            success_count = $2,

                            failed_count = $3,

                            status = 'sent',

                            sent_at = NOW()

                        WHERE id = $4
                        `,
                        [

                            userIds.length,

                            response.successCount,

                            response.failureCount,

                            campaign.id,
                        ]
                    );

                    /// 🔥 MARCAR EJECUTADA
                    await pool.query(

                        `
                        UPDATE scheduled_notifications
                        SET

                            executed = true,

                            executed_at = NOW()

                        WHERE id = $1
                        `,
                        [
                            campaign.schedule_id,
                        ]
                    );

                } catch (err) {

                    console.log(
                        '❌ CAMPAIGN EXECUTION ERROR',
                        err,
                    );
                }
            }

        } catch (err) {

            console.log(
                '❌ SCHEDULER ERROR',
                err,
            );
        }

    }, 1000 * 60);
};

module.exports = {
    startNotificationScheduler,
};