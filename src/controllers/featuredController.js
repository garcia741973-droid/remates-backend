const { pool } = require('../config/db');

/// 🔥 SUBIR COMPROBANTE PREMIUM
exports.uploadFeaturedProof = async (
  req,
  res
) => {

  try {

    const user_id =
      req.user.user_id;

    const { id } =
      req.params;

    const {
      payment_proof_url
    } = req.body;

    /// 🔴 VALIDAR URL
    if (!payment_proof_url) {

      return res.status(400).json({
        error:
          'Debes subir comprobante'
      });
    }

    /// 🔍 BUSCAR SOLICITUD
    const requestRes =
      await pool.query(
        `
        SELECT *
        FROM featured_requests
        WHERE id = $1
        LIMIT 1
        `,
        [id]
      );

    if (
      requestRes.rows.length === 0
    ) {

      return res.status(404).json({
        error:
          'Solicitud no encontrada'
      });
    }

    const request =
      requestRes.rows[0];

    /// 🔴 VALIDAR DUEÑO
    if (
      request.user_id !== user_id
    ) {

      return res.status(403).json({
        error:
          'No autorizado'
      });
    }

    /// 🔴 VALIDAR STATUS
    if (
      request.status !==
      'pending_payment'
    ) {

      return res.status(400).json({
        error:
          'La solicitud ya fue procesada'
      });
    }

    /// 🔥 UPDATE
    const { rows } =
      await pool.query(
        `
        UPDATE featured_requests
        SET

          payment_proof_url = $1,

          status = 'payment_uploaded'

        WHERE id = $2

        RETURNING *
        `,
        [
          payment_proof_url,
          id
        ]
      );

    console.log(
      '⭐ FEATURED PROOF UPLOADED:',
      id
    );

    res.json(rows[0]);

  } catch (error) {

    console.error(
      'ERROR UPLOAD FEATURED PROOF:',
      error
    );

    res.status(500).json({
      error:
        'Error subiendo comprobante'
    });
  }
};