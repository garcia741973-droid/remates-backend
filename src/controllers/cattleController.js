const { pool } =
  require('../config/db');

/// 🐄 CATEGORÍAS
exports.getCategories =
  async (req, res) => {

    try {

      const result =
        await pool.query(
          `
          SELECT
            id,
            name
          FROM cattle_categories
          WHERE is_active = true
          ORDER BY
            display_order,
            name
          `
        );

      res.json(
        result.rows
      );

    } catch (error) {

      console.log(
        'GET CATEGORIES ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error obteniendo categorías'
      });
    }
  };

/// 🐄 RAZAS
exports.getBreeds =
  async (req, res) => {

    try {

      const result =
        await pool.query(
          `
          SELECT
            id,
            name
          FROM cattle_breeds
          WHERE is_active = true
          ORDER BY
            display_order,
            name
          `
        );

      res.json(
        result.rows
      );

    } catch (error) {

      console.log(
        'GET BREEDS ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error obteniendo razas'
      });
    }
  };