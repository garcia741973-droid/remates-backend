const { pool } = require('../config/db');

/// 🔥 CREAR REVIEW
exports.createReview = async (req, res) => {
  try {

    const buyer_id = req.user.user_id;

    const {
      negotiation_id,
      rating,
      comment
    } = req.body;

    /// 🔥 VALIDAR RATING
    if (
      !rating ||
      rating < 1 ||
      rating > 5
    ) {

      return res.status(400).json({
        error: 'Rating inválido'
      });
    }

    /// 🔥 OBTENER NEGOCIACIÓN
    const negRes = await pool.query(
      `
      SELECT *
      FROM negotiations
      WHERE id = $1
      `,
      [negotiation_id]
    );

    if (negRes.rows.length === 0) {

      return res.status(404).json({
        error: 'Negociación no encontrada'
      });
    }

    const negotiation = negRes.rows[0];

    /// 🔥 VALIDAR COMPRADOR
    if (
      negotiation.buyer_id !== buyer_id
    ) {

      return res.status(403).json({
        error: 'Solo el comprador puede calificar'
      });
    }

    /// 🔥 VALIDAR CONTACTOS DESBLOQUEADOS
    if (
      negotiation.status !== 'contacts_unlocked'
    ) {

      return res.status(400).json({
        error: 'La negociación aún no finalizó'
      });
    }

    /// 🔥 EVITAR DUPLICADOS
    const existing = await pool.query(
      `
      SELECT id
      FROM seller_reviews
      WHERE negotiation_id = $1
      `,
      [negotiation_id]
    );

    if (existing.rows.length > 0) {

      return res.status(400).json({
        error: 'Ya calificaste esta negociación'
      });
    }

    /// 🔥 CREAR REVIEW
    await pool.query(
      `
      INSERT INTO seller_reviews
      (
        lot_id,
        negotiation_id,
        seller_id,
        buyer_id,
        rating,
        comment
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      `,
      [
        negotiation.lot_id,
        negotiation.id,
        negotiation.seller_id,
        negotiation.buyer_id,
        rating,
        comment || null
      ]
    );

    /// 🔥 RECALCULAR SELLER
    const ratingRes = await pool.query(
      `
      SELECT

        ROUND(AVG(rating)::numeric, 2)
          as avg_rating,

        COUNT(*) as total

      FROM seller_reviews

      WHERE seller_id = $1
      `,
      [negotiation.seller_id]
    );

    const avg =
      ratingRes.rows[0].avg_rating || 0;

    const total =
      ratingRes.rows[0].total || 0;

    /// 🔥 ACTUALIZAR USER
    await pool.query(
      `
      UPDATE users
      SET
        seller_rating_avg = $1,
        seller_rating_count = $2,
        successful_sales_count = successful_sales_count + 1
      WHERE id = $3
      `,
      [
        avg,
        total,
        negotiation.seller_id
      ]
    );

    /// 🔥 ACTUALIZAR COMPRADOR
    await pool.query(
      `
      UPDATE users
      SET
        successful_purchases_count =
          successful_purchases_count + 1
      WHERE id = $1
      `,
      [negotiation.buyer_id]
    );

    res.json({

      success: true,

      seller_rating_avg: avg,

      seller_rating_count: total,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      error: 'Error creando review'
    });
  }
};