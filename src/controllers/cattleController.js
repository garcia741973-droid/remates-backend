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

/// 🐄 CREAR CATEGORÍA
exports.createCategory =
  async (req, res) => {

    try {

      const {
        name,
      } = req.body;

      if (!name) {
        return res.status(400).json({
          error: 'Nombre requerido',
        });
      }

      const result =
        await pool.query(
          `
          INSERT INTO cattle_categories
          (
            name
          )
          VALUES
          (
            $1
          )
          RETURNING *
          `,
          [
            name.trim(),
          ]
        );

      res.json(
        result.rows[0]
      );

    } catch (error) {

      console.log(
        'CREATE CATEGORY ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error creando categoría'
      });
    }
  };  

/// 🐄 EDITAR CATEGORÍA
exports.updateCategory =
  async (req, res) => {

    try {

      const {
        id,
      } = req.params;

      const {
        name,
      } = req.body;

      const result =
        await pool.query(
          `
          UPDATE cattle_categories
          SET
            name = $1
          WHERE id = $2
          RETURNING *
          `,
          [
            name.trim(),
            id,
          ]
        );

      res.json(
        result.rows[0]
      );

    } catch (error) {

      console.log(
        'UPDATE CATEGORY ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error actualizando categoría'
      });
    }
  };

/// 🐄 ACTIVAR / DESACTIVAR
exports.toggleCategoryStatus =
  async (req, res) => {

    try {

      const {
        id,
      } = req.params;

      const result =
        await pool.query(
          `
          UPDATE cattle_categories
          SET
            is_active =
              NOT is_active
          WHERE id = $1
          RETURNING *
          `,
          [id]
        );

      res.json(
        result.rows[0]
      );

    } catch (error) {

      console.log(
        'TOGGLE CATEGORY ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error cambiando estado'
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

/// 🧬 CREAR RAZA
exports.createBreed =
  async (req, res) => {

    try {

      const {
        name,
      } = req.body;

      if (!name) {
        return res.status(400).json({
          error: 'Nombre requerido',
        });
      }

      const result =
        await pool.query(
          `
          INSERT INTO cattle_breeds
          (
            name
          )
          VALUES
          (
            $1
          )
          RETURNING *
          `,
          [
            name.trim(),
          ]
        );

      res.json(
        result.rows[0]
      );

    } catch (error) {

      console.log(
        'CREATE BREED ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error creando raza'
      });
    }
  };
  
/// 🧬 EDITAR RAZA
exports.updateBreed =
  async (req, res) => {

    try {

      const {
        id,
      } = req.params;

      const {
        name,
      } = req.body;

      const result =
        await pool.query(
          `
          UPDATE cattle_breeds
          SET
            name = $1
          WHERE id = $2
          RETURNING *
          `,
          [
            name.trim(),
            id,
          ]
        );

      res.json(
        result.rows[0]
      );

    } catch (error) {

      console.log(
        'UPDATE BREED ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error actualizando raza'
      });
    }
  };
  
/// 🧬 ACTIVAR / DESACTIVAR
exports.toggleBreedStatus =
  async (req, res) => {

    try {

      const {
        id,
      } = req.params;

      const result =
        await pool.query(
          `
          UPDATE cattle_breeds
          SET
            is_active =
              NOT is_active
          WHERE id = $1
          RETURNING *
          `,
          [id]
        );

      res.json(
        result.rows[0]
      );

    } catch (error) {

      console.log(
        'TOGGLE BREED ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error cambiando estado'
      });
    }
  };  