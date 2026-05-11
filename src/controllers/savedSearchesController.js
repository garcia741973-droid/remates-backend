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
        SELECT *

        FROM saved_searches

        WHERE user_id = $1
        AND company_id = $2

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