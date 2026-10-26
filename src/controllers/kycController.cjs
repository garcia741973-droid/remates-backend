const { pool } = require("../config/db");

const {
  createOperationEvent,
} = require('../services/operationEventsService');

const {

  sendAdminNotification,

  sendUserNotification,

  sendCompanyAdminNotification,

} = require('../services/notificationService');

//
// 🧠 1. GET KYC
//
const getMyKyc = async (req, res) => {
  try {
    const userId = req.user.user_id;

    let result = await pool.query(
      "SELECT * FROM user_kyc WHERE user_id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      const insert = await pool.query(
        `INSERT INTO user_kyc (user_id, created_at)
         VALUES ($1, now())
         RETURNING *`,
        [userId]
      );

      result = insert;
    }

    const userRes = await pool.query(
      `
      SELECT
        kyc_status,
        seller_status
      FROM users
      WHERE id = $1
      `,
      [userId]
    );

    res.json({

      kyc: result.rows[0],

      kyc_status:
          userRes.rows[0]?.kyc_status,

      seller_status:
          userRes.rows[0]?.seller_status,
    });

  } catch (err) {
    console.error("GET KYC ERROR:", err);
    res.status(500).json({ error: "Error obteniendo KYC" });
  }
};

//
// 🧠 2. UPDATE DATA
//

const updateKyc = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.user_id;

    const {
      full_name,
      document_number,
      document_type,
      phone,
      country,
      city,
      address,
      nit,
      client_type
    } = req.body;

    const clean = (value) =>
      typeof value === 'string' ? value.trim() : '';

    const name = clean(full_name);
    const documentNumber = clean(document_number);
    const documentType = clean(document_type);
    const phoneValue = clean(phone);
    const countryValue = clean(country);
    const cityValue = clean(city);
    const clientType = clean(client_type);

    if (
      !name ||
      !documentNumber ||
      !documentType ||
      !countryValue ||
      !cityValue ||
      !clientType
    ) {
      return res.status(400).json({
        error: 'Completa los datos personales obligatorios'
      });
    }

    // Validar número real, no solo prefijo +591.
    const phoneDigits = phoneValue.replace(/\D/g, '');

    if (phoneDigits.length < 8 || phoneDigits.length > 15) {
      return res.status(400).json({
        error: 'Ingresa un teléfono válido con código de país'
      });
    }

    await client.query('BEGIN');

    const userResult = await client.query(
      `SELECT id, email, kyc_status
       FROM users
       WHERE id = $1
       FOR UPDATE`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }

    const user = userResult.rows[0];
    const email = String(user.email || '').trim();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        error: 'Debes tener un correo electrónico válido'
      });
    }

    const result = await client.query(
      `INSERT INTO user_kyc (
        user_id,
        full_name,
        document_number,
        document_type,
        phone,
        country,
        city,
        address,
        nit,
        client_type
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (user_id)
      DO UPDATE SET
        full_name = EXCLUDED.full_name,
        document_number = EXCLUDED.document_number,
        document_type = EXCLUDED.document_type,
        phone = EXCLUDED.phone,
        country = EXCLUDED.country,
        city = EXCLUDED.city,
        address = EXCLUDED.address,
        nit = EXCLUDED.nit,
        client_type = EXCLUDED.client_type,
        updated_at = now()
      RETURNING *`,
      [
        userId,
        name,
        documentNumber,
        documentType,
        phoneValue,
        countryValue,
        cityValue,
        clean(address) || null,
        clean(nit) || null,
        clientType
      ]
    );

    // Sincronizar los contactos usados en negociación.
    // Preservar estados existentes; nunca aprobar aquí.
    await client.query(
      `UPDATE users
       SET full_name = $2,
           phone = $3
       WHERE id = $1`,
      [userId, name, phoneValue]
    );

    // No alterar kyc_status.
    // La aprobación y el rechazo siguen siendo administrativos.

    await client.query('COMMIT');

    return res.json(result.rows[0]);

  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('KYC ROLLBACK ERROR:', rollbackError);
    }

    console.error('UPDATE KYC ERROR:', err);

    return res.status(500).json({
      error: 'Error actualizando KYC'
    });

  } finally {
    client.release();
  }
};


//
// 🧠 3. DOCUMENTOS
//
const uploadDocuments = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const { document_front_url, document_back_url } = req.body;

    await pool.query(
      `UPDATE user_kyc
       SET document_front_url = $1,
           document_back_url = $2,
           updated_at = now()
       WHERE user_id = $3`,
      [document_front_url, document_back_url, userId]
    );

    res.json({ ok: true });

  } catch (err) {
    console.error("UPLOAD DOCS ERROR:", err);
    res.status(500).json({ error: "Error subiendo documentos" });
  }
};

//
// 🧠 4. VIDEO
//
const uploadVideo = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const { video_url } = req.body;

    await pool.query(
      `UPDATE user_kyc
       SET video_url = $1,
           updated_at = now()
       WHERE user_id = $2`,
      [video_url, userId]
    );

    res.json({ ok: true });

  } catch (err) {
    console.error("UPLOAD VIDEO ERROR:", err);
    res.status(500).json({ error: "Error subiendo video" });
  }
};

//
// 🧠 5. SUBMIT
//

const submitKyc = async (req, res) => {
  const userId = req.user.user_id;
  const companyId = req.user.company_id;

  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Consultar el estado real y los datos esenciales.
    const result = await client.query(
      `
      SELECT
        u.email,
        u.kyc_status,
        k.full_name,
        k.document_number,
        k.document_type,
        k.phone,
        k.country,
        k.city,
        k.client_type,
        k.submitted_at
      FROM users u
      LEFT JOIN user_kyc k
        ON k.user_id = u.id
      WHERE u.id = $1
      FOR UPDATE OF u
      `,
      [userId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }

    const user = result.rows[0];

    // Nunca quitar una aprobación existente.
    if (user.kyc_status === 'approved') {
      await client.query('ROLLBACK');

      return res.json({
        ok: true,
        status: 'approved',
        message: 'Tu cuenta ya está aprobada'
      });
    }

    const clean = (value) =>
      String(value ?? '').trim();

    const email = clean(user.email);
    const phone = clean(user.phone);
    const phoneDigits = phone.replace(/\D/g, '');

    const missing = [];

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      missing.push('correo electrónico válido');
    }

    if (!clean(user.full_name)) {
      missing.push('nombre completo');
    }

    if (!clean(user.document_number)) {
      missing.push('número de documento');
    }

    if (!clean(user.document_type)) {
      missing.push('tipo de documento');
    }

    if (phoneDigits.length < 8 || phoneDigits.length > 15) {
      missing.push('teléfono válido');
    }

    if (!clean(user.country)) {
      missing.push('país');
    }

    if (!clean(user.city)) {
      missing.push('ciudad');
    }

    if (!clean(user.client_type)) {
      missing.push('tipo de cliente');
    }

    if (missing.length > 0) {
      await client.query('ROLLBACK');

      return res.status(400).json({
        error: 'Faltan datos obligatorios',
        missing
      });
    }

    // Evitar múltiples envíos de una solicitud pendiente.
    if (
      user.kyc_status === 'submitted' &&
      user.submitted_at != null
    ) {
      await client.query('ROLLBACK');

      return res.json({
        ok: true,
        status: 'submitted',
        message: 'Tu solicitud ya está en revisión'
      });
    }

    // Documentos y video son opcionales.
    // No modificar sus valores existentes.
    await client.query(
      `
      UPDATE user_kyc
      SET submitted_at = NOW(),
          rejection_reason = NULL,
          reviewed_at = NULL,
          updated_at = NOW()
      WHERE user_id = $1
      `,
      [userId]
    );

    await client.query(
      `
      UPDATE users
      SET kyc_status = 'submitted'
      WHERE id = $1
      `,
      [userId]
    );

    await client.query('COMMIT');

  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('KYC ROLLBACK ERROR:', rollbackError);
      }
    }

    console.error('SUBMIT KYC ERROR:', err);

    return res.status(500).json({
      error: 'Error enviando KYC'
    });

  } finally {
    if (client) client.release();
  }

  // Notificaciones fuera de la transacción.
  try {
    if (Number(companyId) === 1) {
      await sendAdminNotification({
        title: '📋 Nuevo KYC Plaza Ganadera',
        body: `Usuario ${userId} envió su solicitud para revisión`,
        data: {
          type: 'kyc_submitted',
          user_id: String(userId)
        }
      });
    } else {
      await sendCompanyAdminNotification({
        companyId,
        title: '📋 Nuevo KYC enviado',
        body: `Usuario ${userId} envió su solicitud para revisión`,
        data: {
          type: 'kyc_submitted',
          user_id: String(userId)
        }
      });
    }
  } catch (notificationError) {
    console.error(
      'KYC NOTIFICATION ERROR:',
      notificationError
    );
  }

  return res.json({
    ok: true,
    status: 'submitted'
  });
};

//
// 🧠 ADMIN: PENDING
//
const getPendingKyc = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT 
        u.id,
        u.email,
        u.kyc_status,
        k.*
      FROM user_companies uc
      JOIN users u
        ON u.id = uc.user_id
      JOIN user_kyc k
        ON k.user_id = u.id
      WHERE uc.company_id = $1
        AND u.role = 'client'
        AND k.submitted_at IS NOT NULL
        AND (u.kyc_status IS NULL OR u.kyc_status != 'approved')
      ORDER BY k.submitted_at DESC
      `,
      [req.user.company_id]
    );

    res.json(result.rows);

  } catch (err) {
    console.error("GET PENDING ERROR:", err);
    res.status(500).json({ error: "Error obteniendo pendientes" });
  }
};

//
// 🧠 ADMIN: APPROVE
//

const approveKyc = async (req, res) => {
  const userId = req.params.userId;
  const companyId = req.user.company_id;

  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Bloquear al usuario durante la aprobación.
    const userResult = await client.query(
      `
      SELECT id, kyc_status
      FROM users
      WHERE id = $1
      FOR UPDATE
      `,
      [userId]
    );

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }

    // Solo aprobar usuarios vinculados a nuestra empresa.
    const accessCheck = await client.query(
      `
      SELECT 1
      FROM user_companies
      WHERE user_id = $1
        AND company_id = $2
      LIMIT 1
      `,
      [userId, companyId]
    );

    if (accessCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: 'No puedes aprobar usuarios de otra empresa'
      });
    }

    // Conservar una aprobación anterior.
    if (userResult.rows[0].kyc_status === 'approved') {
      await client.query('ROLLBACK');
      return res.json({
        ok: true,
        already_approved: true
      });
    }

    // Comprobar que existe un registro KYC.
    const kycResult = await client.query(
      `
      SELECT user_id
      FROM user_kyc
      WHERE user_id = $1
      `,
      [userId]
    );

    if (kycResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'El usuario no tiene información KYC'
      });
    }

    // Aprobar KYC sin exigir fotografías ni video.
    await client.query(
      `
      UPDATE users u
      SET
        full_name = k.full_name,
        document_number = k.document_number,
        document_type = k.document_type,
        phone = k.phone,
        kyc_status = 'approved',
        kyc_level = 2,
        kyc_verified_at = NOW()
      FROM user_kyc k
      WHERE u.id = $1
        AND k.user_id = u.id
      `,
      [userId]
    );

    await client.query(
      `
      UPDATE user_kyc
      SET reviewed_at = NOW()
      WHERE user_id = $1
      `,
      [userId]
    );

    // Solo Plaza Ganadera habilita automáticamente
    // la condición de vendedor de Plaza Ganadera.
    let sellerApproved = false;

    if (Number(companyId) === 1) {
      const sellerResult = await client.query(
        `
        UPDATE users
        SET seller_status = 'approved'
        WHERE id = $1
          AND seller_status = 'none'
        RETURNING id
        `,
        [userId]
      );

      sellerApproved = sellerResult.rowCount > 0;
    }

    await client.query('COMMIT');

    // La aprobación ya quedó confirmada.
    // Las notificaciones no deben revertirla.
    if (sellerApproved) {
      try {
        await sendUserNotification({
          userId,
          title: '🐄 Vendedor aprobado',
          body: 'Tu identidad fue aprobada y ya puedes publicar ganado en Plaza Ganadera.',
          data: {
            type: 'seller_approved'
          }
        });
      } catch (error) {
        console.error('SELLER NOTIFICATION ERROR:', error);
      }
    }

    try {
      await createOperationEvent({
        type: 'kyc_approved',
        title: '✅ Usuario verificado KYC',
        message: `Usuario ${userId} fue aprobado y ya puede operar`,
        priority: 'high',
        data: {
          user_id: userId
        }
      });
    } catch (error) {
      console.error('KYC OPERATION EVENT ERROR:', error);
    }

    try {
      await sendAdminNotification({
        title: '✅ Usuario verificado',
        body: `Usuario ${userId} aprobado en KYC`,
        data: {
          type: 'kyc_approved',
          user_id: String(userId)
        }
      });
    } catch (error) {
      console.error('KYC ADMIN NOTIFICATION ERROR:', error);
    }

    try {
      await sendUserNotification({
        userId,
        title: '✅ KYC aprobado',
        body: 'Tu identidad fue aprobada. Ingresa con tu cuenta para continuar.',
        data: {
          type: 'kyc_approved'
        }
      });
    } catch (error) {
      console.error('KYC USER NOTIFICATION ERROR:', error);
    }

    return res.json({ ok: true });

  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('KYC ROLLBACK ERROR:', rollbackError);
      }
    }

    console.error('APPROVE ERROR:', err);

    return res.status(500).json({
      error: 'Error aprobando KYC'
    });

  } finally {
    if (client) client.release();
  }
};


//
// 🧠 ADMIN: GET KYC POR USER
//
const getKycByUser = async (req, res) => {
  try {
    if (
      req.user.role !== 'super_admin' &&
      req.user.role !== 'admin'
    ) {

      return res.status(403).json({
        error: "No autorizado"
      });
    }

    const { userId } = req.params;

    const companyId = req.user.company_id;

    const accessCheck = await pool.query(
      `
      SELECT 1
      FROM user_companies
      WHERE user_id = $1
        AND company_id = $2
      LIMIT 1
      `,
      [userId, companyId]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({
        error: 'No puedes consultar usuarios de otra empresa'
      });
    }

    const result = await pool.query(
      `SELECT * FROM user_kyc WHERE user_id = $1`,
      [userId]
    );

    res.json(result.rows[0] || null);

  } catch (err) {
    console.error("GET KYC BY USER ERROR:", err);
    res.status(500).json({ error: "Error obteniendo KYC" });
  }
};

//
// 🧠 ADMIN: REJECT
//

const rejectKyc = async (req, res) => {
  const { userId } = req.params;
  const companyId = req.user.company_id;
  const reason = String(req.body.reason || '').trim();

  if (!reason) {
    return res.status(400).json({
      error: 'Debes indicar el motivo del rechazo'
    });
  }

  let client;

  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // Bloquear el registro para evitar cambios simultáneos.
    const userResult = await client.query(
      `
      SELECT id, kyc_status
      FROM users
      WHERE id = $1
      FOR UPDATE
      `,
      [userId]
    );

    if (userResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'Usuario no encontrado'
      });
    }

    // El administrador solo puede gestionar su empresa.
    const accessCheck = await client.query(
      `
      SELECT 1
      FROM user_companies
      WHERE user_id = $1
        AND company_id = $2
      LIMIT 1
      `,
      [userId, companyId]
    );

    if (accessCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        error: 'No puedes rechazar usuarios de otra empresa'
      });
    }

    // Nunca rechazar un KYC que ya está aprobado.
    if (userResult.rows[0].kyc_status === 'approved') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'El usuario ya tiene su KYC aprobado'
      });
    }

    // Confirmar que existe información KYC.
    const kycResult = await client.query(
      `
      SELECT user_id
      FROM user_kyc
      WHERE user_id = $1
      `,
      [userId]
    );

    if (kycResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'El usuario no tiene registro KYC'
      });
    }

    // Guardar rechazo y motivo en una sola transacción.
    await client.query(
      `
      UPDATE users
      SET kyc_status = 'rejected'
      WHERE id = $1
      `,
      [userId]
    );

    await client.query(
      `
      UPDATE user_kyc
      SET rejection_reason = $1,
          reviewed_at = NOW(),
          submitted_at = NULL
      WHERE user_id = $2
      `,
      [reason, userId]
    );

    await client.query('COMMIT');

  } catch (err) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('KYC ROLLBACK ERROR:', rollbackError);
      }
    }

    console.error('REJECT ERROR:', err);
    return res.status(500).json({
      error: 'Error rechazando KYC'
    });

  } finally {
    if (client) client.release();
  }

  // Notificar sin poner en riesgo el rechazo ya guardado.
  try {
    await sendUserNotification({
      userId,
      title: '⚠️ KYC rechazado',
      body: 'Tu verificación requiere correcciones. Revisa los detalles y vuelve a enviarla.',
      data: {
        type: 'kyc_rejected'
      }
    });
  } catch (notificationError) {
    console.error(
      'KYC REJECT NOTIFICATION ERROR:',
      notificationError
    );
  }

  return res.json({ ok: true });
};


module.exports = {
  getMyKyc,
  updateKyc,
  uploadDocuments,
  uploadVideo,
  submitKyc,
  getPendingKyc,
  approveKyc,
  rejectKyc,
  getKycByUser
};