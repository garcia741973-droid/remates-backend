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