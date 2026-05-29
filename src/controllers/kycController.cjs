const { pool } = require("../config/db");

const {
  createOperationEvent,
} = require('../services/operationEventsService');

const {

  sendAdminNotification,

  sendUserNotification,

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

    res.json({
      kyc: result.rows[0]
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

    const result = await pool.query(
      `INSERT INTO user_kyc (
        user_id, full_name, document_number, document_type, phone,
        country, city, address, nit, client_type
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (user_id)
      DO UPDATE SET
        full_name = COALESCE(EXCLUDED.full_name, user_kyc.full_name),
        document_number = COALESCE(EXCLUDED.document_number, user_kyc.document_number),
        document_type = COALESCE(EXCLUDED.document_type, user_kyc.document_type),
        phone = COALESCE(EXCLUDED.phone, user_kyc.phone),
        country = COALESCE(EXCLUDED.country, user_kyc.country),
        city = COALESCE(EXCLUDED.city, user_kyc.city),
        address = COALESCE(EXCLUDED.address, user_kyc.address),
        nit = COALESCE(EXCLUDED.nit, user_kyc.nit),
        client_type = COALESCE(EXCLUDED.client_type, user_kyc.client_type),
        updated_at = now()
      RETURNING *`,
      [
        userId, full_name, document_number, document_type, phone,
        country, city, address, nit, client_type
      ]
    );

    // 🔥 GLOBAL
    await pool.query(
      `UPDATE users 
       SET kyc_status = 'incomplete'
       WHERE id = $1`,
      [userId]
    );

    res.json(result.rows[0]);

  } catch (err) {
    console.error("❌ UPDATE KYC ERROR:", err);
    res.status(500).json({
      error: "Error actualizando KYC",
      detail: err.message
    });
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
  try {
    const userId = req.user.user_id;

    await pool.query(
      `UPDATE user_kyc
       SET submitted_at = now()
       WHERE user_id = $1`,
      [userId]
    );

    // 🔥 GLOBAL
    await pool.query(
      `UPDATE users
       SET kyc_status = 'submitted'
       WHERE id = $1`,
      [userId]
    );

    res.json({ ok: true });

  } catch (err) {
    console.error("SUBMIT KYC ERROR:", err);
    res.status(500).json({ error: "Error enviando KYC" });
  }
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
  try {
    const userId = req.params.userId;

    await pool.query(
      `UPDATE users
       SET kyc_status = 'approved',
           kyc_level = 2,
           kyc_verified_at = now()
       WHERE id = $1`,
      [userId]
    );

    await pool.query(
      `UPDATE user_kyc
       SET reviewed_at = now()
       WHERE user_id = $1`,
      [userId]
    );

    /// 🔥 EVENTO OPERATIVO
    await createOperationEvent({

      type: 'kyc_approved',

      title:
          '✅ Usuario verificado KYC',

      message:
          `Usuario ${userId} fue aprobado y ya puede operar`,

      priority: 'high',

      data: {

        user_id:
            userId,
      },
    });

    /// 🔥 PUSH SUPER ADMIN
    await sendAdminNotification({

      title:
          '✅ Usuario verificado',

      body:
          `Usuario ${userId} aprobado en KYC`,

      data: {

        type: 'kyc_approved',

        user_id:
            userId.toString(),
      },
    });

/// 🔥 PUSH USUARIO
await sendUserNotification({

    userId,

    title:
        '✅ KYC aprobado',

    body:
        'Tu identidad fue verificada. Ya puedes participar en remates.',

    data: {

        type: 'kyc_approved',
    },
});


    res.json({ ok: true });

  } catch (err) {
    console.error("APPROVE ERROR:", err);
    res.status(500).json({ error: "Error aprobando KYC" });
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
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    await pool.query(
      `UPDATE users
       SET kyc_status = 'rejected'
       WHERE id = $1`,
      [userId]
    );

    await pool.query(
      `UPDATE user_kyc
       SET rejection_reason = $1,
           reviewed_at = now()
       WHERE user_id = $2`,
      [reason, userId]
    );

    /// 🔥 PUSH USUARIO

    console.log(
      '🚀 ENVIANDO PUSH REJECT',
    );

    await sendUserNotification({

        userId,

        title:
            '⚠️ KYC rechazado',

        body:
            'Tu verificación requiere correcciones. Revisa los detalles y vuelve a enviarla.',

        data: {

            type: 'kyc_rejected',
        },
    });

    res.json({ ok: true });

  } catch (err) {
    console.error("REJECT ERROR:", err);
    res.status(500).json({ error: "Error rechazando KYC" });
  }
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