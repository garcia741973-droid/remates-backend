const admin = require('firebase-admin');

const { pool } =
    require('../config/db');

const {
    sendUserNotification,
} = require('./notificationService');


/// =======================================
/// HELPERS
/// =======================================

const COMMAND_LABELS = {

    restart_sync:
        '🔄 Reiniciar sincronización',

    clear_hive:
        '🧹 Limpiar Hive',

    clear_cache:
        '🗑 Limpiar caché',

    resend_pending:
        '📤 Reenviar pendientes',

    diagnostic:
        '📍 Solicitar diagnóstico',

    restart_app:
        '📲 Reiniciar aplicación',

};


/// =======================================
/// ENVIAR COMANDO
/// =======================================

async function sendCommand({

    support_id,

    command,

    payload,

}) {

    /// 🔥 BUSCAR CASO

    const support =
        await pool.query(

            `
            SELECT

                id,

                user_id,

                conversation_id,

                status

            FROM support_requests

            WHERE id = $1

            LIMIT 1;
            `,

            [support_id]

        );

    if (
        support.rows.length === 0
    ) {

        throw new Error(
            'Caso de soporte no encontrado.'
        );

    }

    const supportData =
        support.rows[0];

    if (

        supportData.status !== 'open'

    ) {

        throw new Error(

            'El caso de soporte ya fue resuelto.'

        );

    }

    /// 🔥 INSERTAR COMANDO

    const inserted =
        await pool.query(

            `
            INSERT INTO support_device_commands (

                support_id,

                user_id,

                command,

                payload,

                status

            )

            VALUES (

                $1,

                $2,

                $3,

                $4,

                'pending'

            )

            RETURNING *;
            `,

            [
                supportData.id,

                supportData.user_id,

                command,

                payload || {},

            ]

        );

    const deviceCommand =
        inserted.rows[0];

    /// 🔥 MENSAJE FIRESTORE

    await admin

        .firestore()

        .collection(
            'support_conversations',
        )

        .doc(
            supportData.conversation_id,
        )

        .collection(
            'messages',
        )

        .add({

            sender_id: 0,

            sender_name:
                'Sistema',

            system: true,

            support_id:
                supportData.id,

            command,

            message:

            `${COMMAND_LABELS[command] || command}

            La orden fue enviada correctamente al dispositivo.

            ⏳ Esperando confirmación...`,

            created_at:
                admin.firestore.FieldValue.serverTimestamp(),

        });

    /// 🔥 PUSH

    await sendUserNotification({

        userId:
            supportData.user_id,

        title:
            'Centro de Resolución',

        body:
            COMMAND_LABELS[command] ||
            command,

        data: {

            type: 'support_command',

            command: String(command),

            command_id: String(deviceCommand.id),

        },

    });

    return deviceCommand;

}
/// =======================================
/// OBTENER COMANDO PENDIENTE
/// =======================================

async function getPendingCommand(
    userId,
) {

    const result =
        await pool.query(

            `
            SELECT *

            FROM support_device_commands

            WHERE

            user_id = $1

            AND status = 'pending'

            ORDER BY created_at ASC

            LIMIT 1;
            `,

            [userId]

        );

    if (
        result.rows.length === 0
    ) {

        return null;

    }

    return result.rows[0];

}


/// =======================================
/// CONFIRMAR EJECUCIÓN
/// =======================================

async function confirmCommand(
    id,
) {

    /// 🔥 ACTUALIZAR SQL

    const updated =
        await pool.query(

            `
            UPDATE support_device_commands

            SET

            status='executed',

            executed_at=NOW()

            WHERE id=$1

            AND status='pending'

            RETURNING *;
            `,

            [id]

        );

    if (
        updated.rows.length === 0
    ) {

        return;

    }

    const command =
        updated.rows[0];

    /// 🔥 BUSCAR CONVERSACIÓN

    const support =
        await pool.query(

            `
            SELECT
                conversation_id
            FROM support_requests
            WHERE id = $1
            LIMIT 1;
            `,

            [
                command.support_id,
            ]

        );

    if (
        support.rows.length === 0
    ) {

        return;

    }

    const conversationId =
        support.rows[0]
            .conversation_id;

    /// 🔥 MENSAJE FIRESTORE

    await admin

        .firestore()

        .collection(
            'support_conversations',
        )

        .doc(
            conversationId,
        )

        .collection(
            'messages',
        )

        .add({

            sender_id: 0,

            sender_name:
                'Sistema',

            system: true,

            support_id:
                command.support_id,

            command:
                command.command,

            message:

                `✅ ${COMMAND_LABELS[command.command] || command.command}

                La acción fue ejecutada correctamente por el dispositivo.`,

            created_at:
                admin.firestore.FieldValue.serverTimestamp(),

        });

}


/// =======================================
/// EXPORTS
/// =======================================

module.exports = {

    sendCommand,

    getPendingCommand,

    confirmCommand,

};