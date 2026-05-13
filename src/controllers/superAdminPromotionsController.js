const pool = require('../db');

/// 🔥 LISTAR PROMOCIONES
exports.getPromotions = async (req, res) => {

  try {

    const {
      status,
      sponsor,
      visible,
    } = req.query;

    let query = `
      SELECT
        pr.*,

        c.name AS company_name,

        pp.name AS plan_name

      FROM promotion_requests pr

      LEFT JOIN companies c
        ON c.id = pr.company_id

      LEFT JOIN promotion_plans pp
        ON pp.id = pr.promotion_plan_id

      WHERE pr.entity_type = 'advertising'
    `;

    const values = [];

    /// 🔥 STATUS
    if (status) {

      values.push(status);

      query += `
        AND pr.status = $${values.length}
      `;
    }

    /// 🔥 SPONSOR
    if (sponsor !== undefined) {

      values.push(sponsor === 'true');

      query += `
        AND pr.sponsor = $${values.length}
      `;
    }

    /// 🔥 VISIBLE
    if (visible !== undefined) {

      values.push(visible === 'true');

      query += `
        AND pr.is_visible = $${values.length}
      `;
    }

    query += `
      ORDER BY
        pr.priority DESC,
        pr.created_at DESC
    `;

    const result =
        await pool.query(
      query,
      values,
    );

    res.json(result.rows);

  } catch (e) {

    console.log(
      '❌ SUPER ADMIN PROMOTIONS ERROR',
      e,
    );

    res.status(500).json({

      error:
          'Error obteniendo promociones',
    });
  }
};

/// 🔥 APROBAR
exports.approvePromotion = async (
  req,
  res,
) => {

  try {

    const { id } = req.params;

    await pool.query(`
      UPDATE promotion_requests
      SET
        status = 'approved',
        approved_at = NOW()
      WHERE id = $1
    `, [id]);

    res.json({
      success: true,
    });

  } catch (e) {

    console.log(e);

    res.status(500).json({
      error: 'Error approving',
    });
  }
};

/// 🔥 OCULTAR / MOSTRAR
exports.toggleVisibility = async (
  req,
  res,
) => {

  try {

    const { id } = req.params;

    const { is_visible } =
        req.body;

    await pool.query(`
      UPDATE promotion_requests
      SET is_visible = $1
      WHERE id = $2
    `, [
      is_visible,
      id,
    ]);

    res.json({
      success: true,
    });

  } catch (e) {

    console.log(e);

    res.status(500).json({
      error:
          'Error visibility',
    });
  }
};