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

/// 🏛️ ADMIN DEPARTAMENTOS
exports.getAdminDepartments =
  async (req, res) => {

    try {

      const { countryId } =
        req.params;

      const result =
        await pool.query(
          `
          SELECT *
          FROM departments
          WHERE country_id = $1
          ORDER BY
            display_order,
            name
          `,
          [countryId]
        );

      res.json(
        result.rows
      );

    } catch (error) {

      console.log(
        'GET ADMIN DEPARTMENTS ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error obteniendo departamentos'
      });
    }
  };

/// 🏛️ CREAR DEPARTAMENTO
exports.createDepartment =
  async (req, res) => {

    try {

      const {
        country_id,
        name,
      } = req.body;

      const result =
        await pool.query(
          `
          INSERT INTO departments
          (
            country_id,
            name
          )
          VALUES
          (
            $1,
            $2
          )
          RETURNING *
          `,
          [
            country_id,
            name.trim(),
          ]
        );

      res.json(
        result.rows[0]
      );

    } catch (error) {

      console.log(
        'CREATE DEPARTMENT ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error creando departamento'
      });
    }
  };

/// 🏛️ EDITAR DEPARTAMENTO
exports.updateDepartment =
  async (req, res) => {

    try {

      const { id } =
        req.params;

      const { name } =
        req.body;

      const result =
        await pool.query(
          `
          UPDATE departments
          SET name = $1
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
        'UPDATE DEPARTMENT ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error actualizando departamento'
      });
    }
  };

/// 🏛️ ACTIVAR / DESACTIVAR
exports.toggleDepartmentStatus =
  async (req, res) => {

    try {

      const { id } =
        req.params;

      const result =
        await pool.query(
          `
          UPDATE departments
          SET is_active =
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
        'TOGGLE DEPARTMENT ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error cambiando estado'
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

/// 🗺️ ADMIN PROVINCIAS
exports.getAdminProvinces =
  async (req, res) => {

    try {

      const {
        departmentId
      } = req.params;

      const result =
        await pool.query(
          `
          SELECT *
          FROM provinces
          WHERE department_id = $1
          ORDER BY
            display_order,
            name
          `,
          [departmentId]
        );

      res.json(
        result.rows
      );

    } catch (error) {

      console.log(
        'GET ADMIN PROVINCES ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error obteniendo provincias'
      });
    }
  };

/// 🗺️ CREAR PROVINCIA
exports.createProvince =
  async (req, res) => {

    try {

      const {
        department_id,
        name,
      } = req.body;

      const result =
        await pool.query(
          `
          INSERT INTO provinces
          (
            department_id,
            name
          )
          VALUES
          (
            $1,
            $2
          )
          RETURNING *
          `,
          [
            department_id,
            name.trim(),
          ]
        );

      res.json(
        result.rows[0]
      );

    } catch (error) {

      console.log(
        'CREATE PROVINCE ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error creando provincia'
      });
    }
  };

/// 🗺️ EDITAR PROVINCIA
exports.updateProvince =
  async (req, res) => {

    try {

      const { id } =
        req.params;

      const { name } =
        req.body;

      const result =
        await pool.query(
          `
          UPDATE provinces
          SET name = $1
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
        'UPDATE PROVINCE ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error actualizando provincia'
      });
    }
  };

/// 🗺️ ACTIVAR / DESACTIVAR
exports.toggleProvinceStatus =
  async (req, res) => {

    try {

      const { id } =
        req.params;

      const result =
        await pool.query(
          `
          UPDATE provinces
          SET is_active =
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
        'TOGGLE PROVINCE ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error cambiando estado'
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

/// 🏘️ ADMIN MUNICIPIOS
exports.getAdminMunicipalities =
  async (req, res) => {

    try {

      const {
        provinceId
      } = req.params;

      const result =
        await pool.query(
          `
          SELECT *
          FROM municipalities
          WHERE province_id = $1
          ORDER BY
            display_order,
            name
          `,
          [provinceId]
        );

      res.json(
        result.rows
      );

    } catch (error) {

      console.log(
        'GET ADMIN MUNICIPALITIES ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error obteniendo municipios'
      });
    }
  };

/// 🏘️ CREAR MUNICIPIO
exports.createMunicipality =
  async (req, res) => {

    try {

      const {
        province_id,
        name,
      } = req.body;

      const result =
        await pool.query(
          `
          INSERT INTO municipalities
          (
            province_id,
            name
          )
          VALUES
          (
            $1,
            $2
          )
          RETURNING *
          `,
          [
            province_id,
            name.trim(),
          ]
        );

      res.json(
        result.rows[0]
      );

    } catch (error) {

      console.log(
        'CREATE MUNICIPALITY ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error creando municipio'
      });
    }
  };

/// 🏘️ EDITAR MUNICIPIO
exports.updateMunicipality =
  async (req, res) => {

    try {

      const { id } =
        req.params;

      const { name } =
        req.body;

      const result =
        await pool.query(
          `
          UPDATE municipalities
          SET name = $1
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
        'UPDATE MUNICIPALITY ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error actualizando municipio'
      });
    }
  };

/// 🏘️ ACTIVAR / DESACTIVAR
exports.toggleMunicipalityStatus =
  async (req, res) => {

    try {

      const { id } =
        req.params;

      const result =
        await pool.query(
          `
          UPDATE municipalities
          SET is_active =
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
        'TOGGLE MUNICIPALITY ERROR:',
        error
      );

      res.status(500).json({
        error:
          'Error cambiando estado'
      });
    }
  };  