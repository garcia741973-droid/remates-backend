/// 🔥 REMATE LIVE DE MI EMPRESA
exports.getMyLiveAuction =
  async (req, res) => {

    try {

      const company_id =
          req.user.company_id;

      const result =
          await pool.query(

        `
        SELECT *

        FROM auctions

        WHERE

          company_id = $1

          AND status = 'live'

        ORDER BY id DESC

        LIMIT 1
        `,
        [company_id]
      );

      if (
        result.rows.length === 0
      ) {

        return res.status(404).json({

          error:
            'No hay remate live',
        });
      }

      res.json(
        result.rows[0],
      );

    } catch (e) {

      console.log(
        'GET MY LIVE AUCTION ERROR:',
        e,
      );

      res.status(500).json({

        error:
          'Error obteniendo remate live',
      });
    }
  };

// ============================================================
// MINI PLAZA - CONFIGURACIÓN PÚBLICA
// ============================================================

exports.getMiniPlazaPublicConfig =
  async (req, res) => {

  try {

    const company_id =
      Number(req.params.company_id);

    if (
      !Number.isInteger(company_id) ||
      company_id <= 0
    ) {

      return res.status(400).json({
        error: 'Empresa inválida',
      });
    }

    const result =
      await pool.query(
        `
        SELECT
          id,
          name,
          COALESCE(
            mini_plaza_analytics_enabled,
            TRUE
          ) AS mini_plaza_analytics_enabled
        FROM companies
        WHERE id = $1
        `,
        [company_id]
      );

    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({
        error: 'Empresa no encontrada',
      });
    }

    res.json(
      result.rows[0]
    );

  } catch (error) {

    console.error(
      'GET MINI PLAZA PUBLIC CONFIG ERROR:',
      error
    );

    res.status(500).json({
      error:
        'Error obteniendo configuración Mini Plaza',
    });
  }
};


// ============================================================
// MINI PLAZA - CONFIGURACIÓN DE MI EMPRESA
// ============================================================

exports.getMyMiniPlazaConfig =
  async (req, res) => {

  try {

    const company_id =
      req.user.company_id;

    const result =
      await pool.query(
        `
        SELECT
          id,
          name,
          COALESCE(
            mini_plaza_analytics_enabled,
            TRUE
          ) AS mini_plaza_analytics_enabled
        FROM companies
        WHERE id = $1
        `,
        [company_id]
      );

    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({
        error: 'Empresa no encontrada',
      });
    }

    res.json(
      result.rows[0]
    );

  } catch (error) {

    console.error(
      'GET MY MINI PLAZA CONFIG ERROR:',
      error
    );

    res.status(500).json({
      error:
        'Error obteniendo configuración Mini Plaza',
    });
  }
};


// ============================================================
// MINI PLAZA - ACTUALIZAR ESTADÍSTICAS
// SOLO ADMIN DE LA EMPRESA
// ============================================================

exports.updateMiniPlazaConfig =
  async (req, res) => {

  try {

    if (
      req.user.role !== 'admin'
    ) {

      return res.status(403).json({
        error: 'No autorizado',
      });
    }

    const company_id =
      req.user.company_id;

    const {
      mini_plaza_analytics_enabled,
    } = req.body;

    if (
      typeof mini_plaza_analytics_enabled !==
      'boolean'
    ) {

      return res.status(400).json({
        error:
          'mini_plaza_analytics_enabled debe ser boolean',
      });
    }

    const result =
      await pool.query(
        `
        UPDATE companies

        SET
          mini_plaza_analytics_enabled = $1

        WHERE id = $2

        RETURNING
          id,
          name,
          mini_plaza_analytics_enabled
        `,
        [
          mini_plaza_analytics_enabled,
          company_id,
        ]
      );

    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({
        error: 'Empresa no encontrada',
      });
    }

    // 🔥 AVISAR A CLIENTES ABIERTOS
    const io =
      req.app.get('io');

    if (io) {

      io.emit(
        'miniPlazaConfigUpdated',
        {
          company_id,
          mini_plaza_analytics_enabled,
        }
      );
    }

    res.json({
      success: true,
      company:
        result.rows[0],
    });

  } catch (error) {

    console.error(
      'UPDATE MINI PLAZA CONFIG ERROR:',
      error
    );

    res.status(500).json({
      error:
        'Error actualizando configuración Mini Plaza',
    });
  }
};

// ============================================================
// MINI PLAZA - CONFIGURACIÓN PÚBLICA
// ============================================================

exports.getMiniPlazaPublicConfig =
  async (req, res) => {

  try {

    const company_id =
      Number(req.params.company_id);

    if (
      !Number.isInteger(company_id) ||
      company_id <= 0
    ) {

      return res.status(400).json({
        error: 'Empresa inválida',
      });
    }

    const result =
      await pool.query(
        `
        SELECT
          id,
          name,
          COALESCE(
            mini_plaza_analytics_enabled,
            TRUE
          ) AS mini_plaza_analytics_enabled
        FROM companies
        WHERE id = $1
        `,
        [company_id]
      );

    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({
        error: 'Empresa no encontrada',
      });
    }

    res.json(
      result.rows[0]
    );

  } catch (error) {

    console.error(
      'GET MINI PLAZA PUBLIC CONFIG ERROR:',
      error
    );

    res.status(500).json({
      error:
        'Error obteniendo configuración Mini Plaza',
    });
  }
};


// ============================================================
// MINI PLAZA - CONFIGURACIÓN DE MI EMPRESA
// ============================================================

exports.getMyMiniPlazaConfig =
  async (req, res) => {

  try {

    const company_id =
      req.user.company_id;

    const result =
      await pool.query(
        `
        SELECT
          id,
          name,
          COALESCE(
            mini_plaza_analytics_enabled,
            TRUE
          ) AS mini_plaza_analytics_enabled
        FROM companies
        WHERE id = $1
        `,
        [company_id]
      );

    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({
        error: 'Empresa no encontrada',
      });
    }

    res.json(
      result.rows[0]
    );

  } catch (error) {

    console.error(
      'GET MY MINI PLAZA CONFIG ERROR:',
      error
    );

    res.status(500).json({
      error:
        'Error obteniendo configuración Mini Plaza',
    });
  }
};


// ============================================================
// MINI PLAZA - ACTUALIZAR CONFIGURACIÓN
// SOLO ADMIN DE LA EMPRESA
// ============================================================

exports.updateMiniPlazaConfig =
  async (req, res) => {

  try {

    if (
      req.user.role !== 'admin'
    ) {

      return res.status(403).json({
        error: 'No autorizado',
      });
    }

    const company_id =
      req.user.company_id;

    const {
      mini_plaza_analytics_enabled,
    } = req.body;

    if (
      typeof mini_plaza_analytics_enabled !==
      'boolean'
    ) {

      return res.status(400).json({
        error:
          'mini_plaza_analytics_enabled debe ser boolean',
      });
    }

    const result =
      await pool.query(
        `
        UPDATE companies

        SET
          mini_plaza_analytics_enabled = $1

        WHERE id = $2

        RETURNING
          id,
          name,
          mini_plaza_analytics_enabled
        `,
        [
          mini_plaza_analytics_enabled,
          company_id,
        ]
      );

    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({
        error: 'Empresa no encontrada',
      });
    }

    const io =
      req.app.get('io');

    if (io) {

      io.emit(
        'miniPlazaConfigUpdated',
        {
          company_id,
          mini_plaza_analytics_enabled,
        }
      );
    }

    res.json({
      success: true,
      company:
        result.rows[0],
    });

  } catch (error) {

    console.error(
      'UPDATE MINI PLAZA CONFIG ERROR:',
      error
    );

    res.status(500).json({
      error:
        'Error actualizando configuración Mini Plaza',
    });
  }
};