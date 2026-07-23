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

    return result.rows;

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

    return result.rows;

}


/// =======================================
/// RESOLVER
/// =======================================

async function resolveRequest(
    id,
) {

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

}


module.exports = {

    createSupportRequest,

    getUserRequests,

    getOpenRequests,

    resolveRequest,

};