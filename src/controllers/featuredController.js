const { pool } = require('../config/db');
const {
  sendAdminNotification,
} = require(
  '../services/notificationService'
);

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

      /// 🔥 PUSH SUPER ADMIN
      await sendAdminNotification({

        title:
          'Nuevo pago destacado 💰',

        body:
          'Un usuario subió comprobante para lote destacado',

        data: {

          type:
            'featured_payment',

          featured_request_id:
            id,
        },
      });

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

/// ⭐ OBTENER SOLICITUDES PREMIUM
exports.getFeaturedRequests = async (
  req,
  res
) => {

  try {

    const { rows } =
      await pool.query(
        `
        SELECT

          fr.*,

          l.lot_number,

          l.images,

          l.class,

          l.breed,

          l.quantity,

          COALESCE(
            u.full_name,
            u.name
          ) as seller_name

        FROM featured_requests fr

        JOIN lots l
          ON l.id = fr.lot_id

        JOIN users u
          ON u.id = fr.user_id

        ORDER BY fr.created_at DESC
        `
      );

    res.json(rows);

  } catch (error) {

    console.error(
      'ERROR GET FEATURED REQUESTS:',
      error
    );

    res.status(500).json({
      error:
        'Error obteniendo solicitudes'
    });
  }
};

/// ✅ APROBAR PREMIUM
exports.approveFeaturedRequest =
  async (
    req,
    res
  ) => {

  try {

    const { id } =
      req.params;

    /// 🔍 BUSCAR
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

    /// 🔴 VALIDAR STATUS
    if (
      request.status !==
      'payment_uploaded'
    ) {

      return res.status(400).json({
        error:
          'La solicitud no está lista'
      });
    }

    /// 🔥 ACTIVAR DESTACADO
    await pool.query(
      `
      UPDATE lots
      SET

        featured = true,

        featured_until =
          NOW() +
          ($1 || ' days')::interval

      WHERE id = $2
      `,
      [
        request.days,
        request.lot_id
      ]
    );

    /// 🔥 APROBAR REQUEST
    const { rows } =
      await pool.query(
        `
        UPDATE featured_requests
        SET

          status = 'approved',

          approved_at = NOW()

        WHERE id = $1

        RETURNING *
        `,
        [id]
      );

    console.log(
      '⭐ FEATURED APPROVED:',
      id
    );

    res.json(rows[0]);

  } catch (error) {

    console.error(
      'ERROR APPROVE FEATURED:',
      error
    );

    res.status(500).json({
      error:
        'Error aprobando destacado'
    });
  }
};

/// ❌ RECHAZAR PREMIUM
exports.rejectFeaturedRequest =
  async (
    req,
    res
  ) => {

  try {

    const { id } =
      req.params;

    const { rows } =
      await pool.query(
        `
        UPDATE featured_requests
        SET

          status = 'rejected',

          rejected_at = NOW()

        WHERE id = $1

        RETURNING *
        `,
        [id]
      );

    console.log(
      '❌ FEATURED REJECTED:',
      id
    );

    res.json(rows[0]);

  } catch (error) {

    console.error(
      'ERROR REJECT FEATURED:',
      error
    );

    res.status(500).json({
      error:
        'Error rechazando solicitud'
    });
  }
};