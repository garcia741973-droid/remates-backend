const { pool } =
    require('../config/db');


/// =======================================
/// CREAR CONVERSACIÓN
/// =======================================

const crypto = require('crypto');

async function createSupportRequest({

    userId,

    module,

    subject,

}) {

    /// =======================================
    /// ¿YA EXISTE UN CASO ABIERTO?
    /// =======================================

    const existing =
        await pool.query(

`
SELECT *

FROM support_requests

WHERE user_id = $1

AND module = $2

AND status = 'open'

LIMIT 1;
`,

[
    userId,
    module,
]

);

    if (existing.rows.length > 0) {

        return existing.rows[0];

    }

    /// =======================================
    /// CREAR NUEVO CASO
    /// =======================================

    const conversationId =
        'support_' +
        crypto.randomUUID();

    const result =
        await pool.query(

`
INSERT INTO support_requests (

    conversation_id,

    user_id,

    module,

    subject

)

VALUES (

    $1,

    $2,

    $3,

    $4

)

RETURNING *;
`,

[
    conversationId,
    userId,
    module,
    subject,
]

);

    return result.rows[0];

}


/// =======================================
/// CONVERSACIONES USUARIO
/// =======================================

async function getUserRequests(
    userId,
) {

    const result =
        await pool.query(

`
SELECT *

FROM support_requests

WHERE user_id = $1

ORDER BY created_at DESC;
`,

[userId]

);

    const firestore =
        admin.firestore();

    finalResult = [];

    for (const row of result.rows) {

        const conversation =
            await firestore

                .collection(
                    'support_conversations',
                )

                .doc(
                    row.conversation_id,
                )

                .get();

        row.unread_user =

            conversation.exists

                ? conversation.data().unread_user ?? 0

                : 0;

        finalResult.push(row);

    }

    return finalResult;

}


/// =======================================
/// ABIERTAS
/// =======================================

async function getOpenRequests() {

    const result =
        await pool.query(

`
SELECT

support_requests.*,

users.full_name,

users.phone

FROM support_requests

JOIN users

ON users.id =
support_requests.user_id

WHERE status='open'

ORDER BY created_at ASC;
`
);

    const firestore =
        admin.firestore();

    const support = [];

    for (const row of result.rows) {

        const conversation =
            await firestore

                .collection(
                    'support_conversations',
                )

                .doc(
                    row.conversation_id,
                )

                .get();

        row.unread_support =

            conversation.exists

                ? conversation.data().unread_support ?? 0

                : 0;

        support.push(row);

    }

    return support;

}


/// =======================================
/// RESOLVER
/// =======================================

const admin =
    require('firebase-admin');

const {

    sendAdminNotification,

    sendUserNotification,

} = require('./notificationService');

async function resolveRequest(
    id,
) {

    /// 🔥 OBTENER CONVERSACIÓN

    const support =
        await pool.query(

`
SELECT
    conversation_id
FROM support_requests
WHERE id = $1
LIMIT 1;
`,

[id]

);

    if (
        support.rows.length === 0
    ) {

        return;
    }

    const conversationId =
        support.rows[0].conversation_id;

    /// 🔥 ACTUALIZAR SQL

    await pool.query(

`
UPDATE support_requests

SET

status='resolved',

resolved_at=NOW()

WHERE id=$1;
`,

[id]

);

    /// 🔥 MENSAJE AUTOMÁTICO

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

            message:
                '✅ Este caso fue resuelto por nuestro equipo de soporte.\n\nGracias por utilizar Plaza Ganadera.',

            created_at:
                admin.firestore.FieldValue.serverTimestamp(),

        });

    /// 🔥 CAMBIAR ESTADO FIRESTORE

    await admin
        .firestore()

        .collection(
            'support_conversations',
        )

        .doc(
            conversationId,
        )

        .update({

            status: 'resolved',

            resolved_at:
                admin.firestore.FieldValue.serverTimestamp(),

        });

}

async function sendDiagnostic({

    support_id,

    message,

}) {

    const support =
        await pool.query(

`
SELECT

conversation_id

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
            'Caso no encontrado.'
        );

    }

    await admin

        .firestore()

        .collection(
            'support_conversations',
        )

        .doc(
            support.rows[0]
                .conversation_id,
        )

        .collection(
            'messages',
        )

        .add({

            sender_id: 0,

            sender_name:
                'Sistema',

            system: true,

            message,

            created_at:
                admin.firestore.FieldValue.serverTimestamp(),

        });

}

/// =======================================
/// ENVIAR MENSAJE
/// =======================================

async function sendMessage({

    support_id,

    sender_id,

    sender_name,

    system = false,

    message,

    isSupport,

}) {

    const support =
        await pool.query(

`
SELECT

conversation_id,

user_id,

module

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
            'Caso no encontrado.'
        );

    }

    const conversation =
        support.rows[0];

    /// 🔥 OBTENER NOMBRE DEL REMITENTE

    const sender =
        await pool.query(

    `
    SELECT full_name

    FROM users

    WHERE id = $1

    LIMIT 1;
    `,

    [sender_id]

    );

    const realSenderName =

        sender.rows.length > 0

            ? sender.rows[0].full_name

            : 'Usuario';

    /// 🔥 Guardar mensaje

    await admin
        .firestore()

        .collection(
            'support_conversations',
        )

        .doc(
            conversation.conversation_id,
        )

        .collection(
            'messages',
        )

        .add({

            sender_id,

            sender_name:
                realSenderName,

            system,

            message,

            created_at:
                admin.firestore.FieldValue.serverTimestamp(),

        });

    /// 🔥 Actualizar conversación

    finalData = {

        last_message: message,

        last_sender: sender_id,

        updated_at:
            admin.firestore.FieldValue.serverTimestamp(),

    };

    if (isSupport) {

        finalData.unread_support = 0;

        finalData.unread_user =
            admin.firestore.FieldValue.increment(1);

    } else {

        finalData.unread_user = 0;

        finalData.unread_support =
            admin.firestore.FieldValue.increment(1);

    }

    await admin
        .firestore()
        .collection('support_conversations')
        .doc(conversation.conversation_id)
        .set(
            finalData,
            {
                merge: true,
            },
        );

    /// =======================================
    /// PUSH
    /// =======================================

    if (isSupport) {

        await sendUserNotification({

            userId:
                conversation.user_id,

            title:
                'Centro de Resolución',

            body:
                message,

            data: {

                type:
                    'support',

                support_id,

                conversation_id:
                    conversation.conversation_id,

                module:
                    conversation.module,

            },

        });

    }

    else {

        await sendAdminNotification({

            title:
                'Nuevo mensaje de soporte',

            body:
                message,

            data: {

                type:
                    'support',

                support_id,

                conversation_id:
                    conversation.conversation_id,

                module:
                    conversation.module,

            },

        });

    }

}

/// =======================================
/// MARCAR MENSAJES COMO LEÍDOS
/// =======================================

async function markConversationRead({

    support_id,

    isSupport,

}) {

    const support =
        await pool.query(

`
SELECT conversation_id

FROM support_requests

WHERE id = $1

LIMIT 1;
`,

[support_id]

);

    if (support.rows.length === 0) {

        return;

    }

    const data = {};

    if (isSupport) {

        data.unread_support = 0;

    } else {

        data.unread_user = 0;

    }

    await admin
        .firestore()
        .collection(
            'support_conversations',
        )
        .doc(
            support.rows[0].conversation_id,
        )
        .set(
            data,
            {
                merge: true,
            },
        );

}

module.exports = {

    createSupportRequest,

    getUserRequests,

    getOpenRequests,

    resolveRequest,

    sendDiagnostic,

    sendMessage,

    markConversationRead,

};