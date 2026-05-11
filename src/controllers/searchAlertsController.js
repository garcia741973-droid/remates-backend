const { pool } = require('../config/db');

exports.getSearchAlerts = async (
  req,
  res
) => {

  try {

    const user_id =
      req.user.user_id;

    const company_id =
      req.user.company_id;

    const result =
    await pool.query(
        `
        SELECT

        MAX(sa.id) as alert_id,

        BOOL_OR(sa.opened) as opened,

        l.id as lot_id,

        MAX(sa.score) as score,

        COUNT(sa.id) as matched_searches,

        ARRAY_AGG(sa.reasons) as reasons,

        l.class,
        l.breed,
        l.quantity,
        l.weight,
        l.base_price,
        l.department,
        l.province,
        l.municipality,
        l.images,
        l.sale_type,

        MAX(sa.created_at) as created_at,

        COALESCE(
            u.full_name,
            u.name
        ) as seller_name

        FROM search_alerts sa

        JOIN lots l
        ON l.id = sa.lot_id

        JOIN users u
        ON u.id = l.seller_id

        WHERE sa.user_id = $1
        AND sa.company_id = $2

        GROUP BY

        l.id,

        l.class,
        l.breed,
        l.quantity,
        l.weight,
        l.base_price,
        l.department,
        l.province,
        l.municipality,
        l.images,
        l.sale_type,

        u.full_name,
        u.name

        ORDER BY created_at DESC
        `,
        [
        user_id,
        company_id,
        ]
    );

    res.json(
      result.rows
    );

  } catch (error) {

    console.log(
      'ERROR GET SEARCH ALERTS:',
      error
    );

    res.status(500).json({
      error:
        'Error obteniendo alertas'
    });
  }
};

/// 🔥 MARCAR ALERTA ABIERTA
exports.markAsOpened = async (req, res) => {

  try {

    const { id } = req.params;

    await pool.query(
      `
      UPDATE search_alerts
      SET
        opened = true,
        opened_at = NOW()
      WHERE id = $1
      `,
      [id]
    );

    res.json({
      success: true,
    });

  } catch (error) {

    console.log(
      '❌ MARK OPENED ERROR:',
      error
    );

    res.status(500).json({
      error:
        'Error marcando alerta'
    });
  }
};

/// 🔔 CONTADOR ALERTAS NO LEÍDAS
exports.getUnreadCount = async (
  req,
  res
) => {

  try {

    const user_id =
      req.user.user_id;

    const company_id =
      req.user.company_id;

    const result =
      await pool.query(
        `
        SELECT COUNT(*) as total
        FROM search_alerts
        WHERE user_id = $1
        AND company_id = $2
        AND opened = false
        `,
        [
          user_id,
          company_id,
        ]
      );

    res.json({
      total:
        Number(
          result.rows[0].total
        ),
    });

  } catch (error) {

    console.log(
      '❌ GET UNREAD COUNT ERROR:',
      error
    );

    res.status(500).json({
      error:
        'Error obteniendo contador'
    });
  }
};