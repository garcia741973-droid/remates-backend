const { pool } = require("../config/db");

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

    // 🔥 SI NO EXISTE → CREAR BASE
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

    console.log("🟡 UPDATE KYC USER:", userId);
    console.log("🟡 UPDATE KYC BODY:", req.body);

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

    // 🔥 UPDATE USERS (PROTEGIDO)
    try {
      await pool.query(
        `UPDATE users 
         SET kyc_status = 'incomplete'
         WHERE id = $1`,
        [userId]
      );
    } catch (e) {
      console.error("⚠️ WARNING updating users.kyc_status:", e.message);
    }

    // 🔥 LIMPIAR RECHAZO CUANDO USUARIO CORRIGE
    try {
      await pool.query(
        `UPDATE user_kyc
        SET rejection_reason = null
        WHERE user_id = $1`,
        [userId]
      );
    } catch (e) {
      console.error("⚠️ WARNING limpiando rejection_reason:", e.message);
    }

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
      `SELECT u.id, u.email, u.kyc_status, k.*
       FROM users u
       JOIN user_kyc k ON u.id = k.user_id
       WHERE u.kyc_status = 'submitted'
       ORDER BY k.submitted_at DESC`
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

    console.log("✅ APROBANDO USER:", userId);

    // 🔥 UPDATE USERS
    const updateUser = await pool.query(
      `UPDATE users
       SET kyc_level = 2,
           kyc_status = 'approved',
           kyc_verified_at = now()
       WHERE id = $1`,
      [userId]
    );

    console.log("🟢 UPDATE USERS:", updateUser.rowCount);

    // 🔥 UPDATE KYC
    const updateKyc = await pool.query(
      `UPDATE user_kyc
       SET reviewed_at = now()
       WHERE user_id = $1`,
      [userId]
    );

    console.log("🟢 UPDATE KYC:", updateKyc.rowCount);

    res.json({ ok: true });

  } catch (err) {
    console.error("APPROVE ERROR:", err);
    res.status(500).json({ error: "Error aprobando KYC" });
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
  rejectKyc
};