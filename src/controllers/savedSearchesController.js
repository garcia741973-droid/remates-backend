const { pool } = require('../config/db');

/// 🔍 MIS BÚSQUEDAS
exports.getSavedSearches = async (
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

        ss.*,

        COUNT(sa.id) as alerts_count,

        MAX(sa.created_at) as last_alert_at

        FROM saved_searches ss

        LEFT JOIN search_alerts sa
        ON sa.saved_search_id = ss.id

        WHERE ss.user_id = $1
        AND ss.company_id = $2

        GROUP BY ss.id

        ORDER BY ss.created_at DESC`,
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
      'ERROR GET SAVED SEARCHES:',
      error
    );

    res.status(500).json({
      error:
        'Error obteniendo búsquedas'
    });
  }
};

/// 🔥 TOGGLE ALERTA
exports.toggleSavedSearch = async (
  req,
  res
) => {

  try {

    const user_id =
      req.user.user_id;

    const { id } =
      req.params;

    /// 🔍 BUSCAR
    const search =
      await pool.query(
        `
        SELECT *
        FROM saved_searches
        WHERE id = $1
        AND user_id = $2
        `,
        [
          id,
          user_id,
        ]
      );

    if (
      search.rows.length === 0
    ) {

      return res.status(404).json({
        error:
          'Búsqueda no encontrada'
      });
    }

    const current =
      search.rows[0];

    /// 🔥 TOGGLE
    const updated =
      await pool.query(
        `
        UPDATE saved_searches

        SET alerts_enabled = $1

        WHERE id = $2

        RETURNING *
        `,
        [
          !current.alerts_enabled,
          id,
        ]
      );

    res.json(
      updated.rows[0]
    );

  } catch (error) {

    console.log(
      'ERROR TOGGLE SEARCH:',
      error
    );

    res.status(500).json({
      error:
        'Error cambiando alerta'
    });
  }
};

/// 🗑️ ELIMINAR BÚSQUEDA
exports.deleteSavedSearch = async (
  req,
  res
) => {

  try {

    const user_id =
      req.user.user_id;

    const { id } =
      req.params;

    /// 🔍 VALIDAR
    const search =
      await pool.query(
        `
        SELECT *
        FROM saved_searches

        WHERE id = $1
        AND user_id = $2
        `,
        [
          id,
          user_id,
        ]
      );

    if (
      search.rows.length === 0
    ) {

      return res.status(404).json({
        error:
          'Búsqueda no encontrada'
      });
    }

    /// 🗑️ DELETE
    await pool.query(
      `
      DELETE FROM saved_searches
      WHERE id = $1
      `,
      [id]
    );

    res.json({
      success: true
    });

  } catch (error) {

    console.log(
      'ERROR DELETE SEARCH:',
      error
    );

    res.status(500).json({
      error:
        'Error eliminando búsqueda'
    });
  }
};

/// 🔥 ALERTAS DE UNA BÚSQUEDA
exports.getSavedSearchAlerts =
  async (
    req,
    res
  ) => {

    try {

      const user_id =
        req.user.user_id;

      const company_id =
        req.user.company_id;

      const { id } =
        req.params;

      const result =
        await pool.query(
          `
          SELECT

            sa.id as alert_id,

            sa.source,

            sa.opened,

            sa.score,

            sa.reasons,

            sa.created_at,

            COALESCE(
              p.id,
              a.id
            ) as lot_id,

            COALESCE(
              p.class,
              a.cattle_type
            ) as class,

            COALESCE(
              p.breed,
              a.breed
            ) as breed,

            COALESCE(
              p.department,
              a.department
            ) as department,

            COALESCE(
              p.province,
              a.province
            ) as province,

            COALESCE(
              p.municipality,
              a.municipality
            ) as municipality,

            COALESCE(
              p.quantity,
              a.quantity
            ) as quantity,

            COALESCE(
              p.weight,
              a.weight
            ) as weight,

            COALESCE(
              p.sale_type,
              a.sale_type
            ) as sale_type,

            COALESCE(
              p.current_price,
              a.current_price
            ) as current_price,

            COALESCE(
              p.images,
              a.images
            ) as images

          FROM search_alerts sa

          LEFT JOIN lots p
            ON sa.source = 'plaza'
            AND p.id = sa.lot_id

          LEFT JOIN auction_live_lots a
            ON sa.source = 'auction'
            AND a.id = sa.lot_id

          WHERE
            sa.saved_search_id = $1
            AND sa.user_id = $2
            AND sa.company_id = $3
            AND COALESCE(sa.hidden, false) = false

          ORDER BY sa.created_at DESC
          `,
          [
            id,
            user_id,
            company_id,
          ]
        );

      res.json(
        result.rows
      );

    } catch (error) {

      console.log(
        'ERROR GET SAVED SEARCH ALERTS:',
        error
      );

      res.status(500).json({
        error:
          'Error obteniendo oportunidades'
      });
    }
  };