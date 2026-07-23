const { pool } =
    require('../config/db');


/// =======================================
/// ENVIAR COMANDO
/// =======================================

async function sendCommand({

    user_id,

    command,

    payload,

}) {

    const result =
        await pool.query(

`
INSERT INTO device_commands (

    user_id,

    command,

    payload

)

VALUES (

    $1,

    $2,

    $3

)

RETURNING *;
`,

[
    user_id,

    command,

    payload || {},
]

);

    return result.rows[0];

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

FROM device_commands

WHERE

user_id = $1

AND status = 'pending'

ORDER BY created_at ASC

LIMIT 1;
`,

[userId]

);

    if (
        result.rows.length == 0
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

    await pool.query(

`
UPDATE device_commands

SET

status='executed',

executed_at=NOW()

WHERE id=$1;
`,

[id]

);

}


module.exports = {

    sendCommand,

    getPendingCommand,

    confirmCommand,

};