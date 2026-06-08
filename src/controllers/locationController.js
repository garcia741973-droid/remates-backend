const { pool } =
  require('../config/db');

/// 🌎 PAÍSES
exports.getCountries =
  async (req, res) => {

    try {

      const result =
        await pool.query(
          `
          SELECT
            id,
            name,
            code
          FROM countries
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
        'GET COUNTRIES ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error obteniendo países'
      });
    }
  };

/// 🌎 ADMIN PAÍSES
exports.getAdminCountries =
  async (req, res) => {

    try {

      const result =
        await pool.query(
          `
          SELECT
            *
          FROM countries
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
        'GET ADMIN COUNTRIES ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error obteniendo países'
      });
    }
  };

/// 🌎 CREAR PAÍS
exports.createCountry =
  async (req, res) => {

    try {

      const {
        name,
        code,
      } = req.body;

      if (!name) {

        return res.status(400).json({
          error:
            'Nombre requerido',
        });
      }

      const result =
        await pool.query(
          `
          INSERT INTO countries
          (
            name,
            code
          )
          VALUES
          (
            $1,
            $2
          )
          RETURNING *
          `,
          [
            name.trim(),
            code?.trim() ?? null,
          ]
        );

      res.json(
        result.rows[0]
      );

    } catch (error) {

      console.log(
        'CREATE COUNTRY ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error creando país'
      });
    }
  };
  
/// 🌎 EDITAR PAÍS
exports.updateCountry =
  async (req, res) => {

    try {

      const {
        id,
      } = req.params;

      const {
        name,
        code,
      } = req.body;

      const result =
        await pool.query(
          `
          UPDATE countries
          SET
            name = $1,
            code = $2
          WHERE id = $3
          RETURNING *
          `,
          [
            name.trim(),
            code?.trim() ?? null,
            id,
          ]
        );

      res.json(
        result.rows[0]
      );

    } catch (error) {

      console.log(
        'UPDATE COUNTRY ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error actualizando país'
      });
    }
  };  

/// 🌎 ACTIVAR / DESACTIVAR
exports.toggleCountryStatus =
  async (req, res) => {

    try {

      const {
        id,
      } = req.params;

      const result =
        await pool.query(
          `
          UPDATE countries
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
        'TOGGLE COUNTRY ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error cambiando estado'
      });
    }
  };

/// 🏛️ DEPARTAMENTOS
exports.getDepartments =
  async (req, res) => {

    try {

      const {
        countryId
      } = req.params;

      const result =
        await pool.query(
          `
          SELECT
            id,
            name
          FROM departments
          WHERE
            country_id = $1
            AND is_active = true
          ORDER BY
            display_order,
            name
          `,
          [
            countryId
          ]
        );

      res.json(
        result.rows
      );

    } catch (error) {

      console.log(
        'GET DEPARTMENTS ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error obteniendo departamentos'
      });
    }
  };

/// 🗺️ PROVINCIAS
exports.getProvinces =
  async (req, res) => {

    try {

      const {
        departmentId
      } = req.params;

      const result =
        await pool.query(
          `
          SELECT
            id,
            name
          FROM provinces
          WHERE
            department_id = $1
            AND is_active = true
          ORDER BY
            display_order,
            name
          `,
          [
            departmentId
          ]
        );

      res.json(
        result.rows
      );

    } catch (error) {

      console.log(
        'GET PROVINCES ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error obteniendo provincias'
      });
    }
  };

/// 🏘️ MUNICIPIOS
exports.getMunicipalities =
  async (req, res) => {

    try {

      const {
        provinceId
      } = req.params;

      const result =
        await pool.query(
          `
          SELECT
            id,
            name
          FROM municipalities
          WHERE
            province_id = $1
            AND is_active = true
          ORDER BY
            display_order,
            name
          `,
          [
            provinceId
          ]
        );

      res.json(
        result.rows
      );

    } catch (error) {

      console.log(
        'GET MUNICIPALITIES ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error obteniendo municipios'
      });
    }
  };