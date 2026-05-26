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

                            imageUrl:
                                campaign.image_url,
                        },

                        data: {

                            type:
                                campaign.type ||
                                'announcement',

                            company_id:
                                String(campaign.company_id),

                            image_url:
                                campaign.image_url || '',
                        },
                    });

                    console.log(
                        '🔥 CAMPAIGN SENT:',
                        response.successCount,
                    );

                    const success =
                        response.successCount || 0;

                    const failed =
                        response.failureCount || 0;                    

                    /// ======================================================
                    /// 🔥 REPETICIÓN
                    /// ======================================================

                    if (
                        campaign.repeat_type &&
                        campaign.repeat_type !== 'once'
                    ) {

                        const current =
                            (campaign.repeat_current || 0) + 1;

                        /// 🔥 YA TERMINÓ
                        if (
                            current >=
                            campaign.repeat_count
                        ) {

                            await pool.query(

                                `
                                UPDATE notification_campaigns
                                SET

                                    status = 'completed',

                                    repeat_current = $1

                                WHERE id = $2
                                `,
                                [
                                    current,
                                    campaign.id,
                                ]
                            );

                            console.log(
                                `✅ CAMPAIGN COMPLETED: ${campaign.id}`
                            );

                        } else {

                        let nextDate =
                            new Date(
                                campaign.scheduled_at
                            );

                            /// 🔥 DAILY
                            if (
                                campaign.repeat_type ===
                                'daily'
                            ) {

                                nextDate.setDate(
                                    nextDate.getDate() + 1
                                );
                            }

                            /// 🔥 WEEKLY
                            else if (
                                campaign.repeat_type ===
                                'weekly'
                            ) {

                                const days =
                                    campaign.repeat_days || [];

                                const map = {

                                    sunday: 0,
                                    monday: 1,
                                    tuesday: 2,
                                    wednesday: 3,
                                    thursday: 4,
                                    friday: 5,
                                    saturday: 6,
                                };

                                let found = false;

                                const baseDate =
                                    new Date(
                                        campaign.scheduled_at
                                    );

                                for (let i = 1; i <= 7; i++) {

                                    const test =
                                        new Date(baseDate);

                                    test.setDate(
                                        test.getDate() + i
                                    );

                                    const day =
                                        test.getDay();

                                    const matches =
                                        days.some(
                                            d => map[d] === day
                                        );

                                    if (matches) {

                                        nextDate = test;

                                        found = true;

                                        break;
                                    }
                                }

                            /// 🔥 FALLBACK
                            if (!found) {

                                nextDate.setDate(
                                    nextDate.getDate() + 7
                                );
                            }

                            } // ✅ cierre weekly

                            await pool.query(

                                `
                                UPDATE notification_campaigns
                                SET

                                    scheduled_at = $1,

                                    repeat_current = $2,

                                    status = 'scheduled'

                                WHERE id = $3
                                `,
                                [

                                    nextDate,

                                    current,

                                    campaign.id,
                                ]
                            );

                            console.log(
                                `🔁 CAMPAIGN RESCHEDULED: ${campaign.id}`
                            );
                        }
                    }                    

                    /// 🔥 UPDATE CAMPAÑA
                    await pool.query(

                        `
                        UPDATE notification_campaigns
                        SET

                            total_users = $1,

                            total_sent =
                                COALESCE(total_sent,0) + $2,

                            total_failed =
                                COALESCE(total_failed,0) + $3,

                            sent_at = NOW(),

                            last_executed_at = NOW()

                        WHERE id = $4
                        `,
                        [

                            userIds.length,

                            success,

                            failed,

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

    }, 1000 * 10);
};

module.exports = {
    startNotificationScheduler,
};