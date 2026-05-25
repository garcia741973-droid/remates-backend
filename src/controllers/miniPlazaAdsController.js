const { pool } = require('../config/db');

/// 🔥 CREAR PUBLICIDAD
exports.createMiniPlazaAd =
  async (req, res) => {

  try {

    const company_id =
      req.user.company_id;

    const {

      title,

      image_url,

      redirect_url,

      whatsapp_number,

      starts_at,

      ends_at,

    } = req.body;

    let finalRedirectUrl =
      redirect_url;

    if (
      whatsapp_number &&
      whatsapp_number.trim() !== ''
    ) {

      const cleanNumber =
        whatsapp_number
          .replace(/\D/g, '');

      finalRedirectUrl =
        `https://wa.me/${cleanNumber}`;
    }

    const result =
      await pool.query(

      `
      INSERT INTO mini_plaza_ads (

        company_id,

        title,

        image_url,

        finalRedirectUrl,

        starts_at,

        ends_at

      )

      VALUES (
        $1,$2,$3,$4,$5,$6
      )

      RETURNING *
      `,
      [

        company_id,

        title,

        image_url,

        redirect_url,

        starts_at,

        ends_at,
      ]
    );

    res.json(
      result.rows[0],
    );

  } catch (e) {

    console.log(
      'CREATE MINI PLAZA AD ERROR:',
      e,
    );

    res.status(500).json({

      error:
        'Error creando publicidad',
    });
  }
};

/// 🔥 OBTENER ADS EMPRESA
exports.getMiniPlazaAds =
  async (req, res) => {

  try {

    const company_id =
      req.user.company_id;

    const result =
      await pool.query(

      `
      SELECT *
      FROM mini_plaza_ads

      WHERE company_id = $1

      ORDER BY

      display_order ASC,

      created_at DESC
      `,
      [company_id]
    );

    res.json(
      result.rows,
    );

  } catch (e) {

    console.log(
      'GET MINI PLAZA ADS ERROR:',
      e,
    );

    res.status(500).json({

      error:
        'Error obteniendo ads',
    });
  }
};

/// 🔥 ADS PÚBLICOS MINI PLAZA
exports.getPublicMiniPlazaAds =
  async (req, res) => {

  try {

    const { company_id } =
      req.params;

    const result =
      await pool.query(

      `
      SELECT *

      FROM mini_plaza_ads

      WHERE company_id = $1

      AND is_active = true

      ORDER BY

      display_order ASC,

      created_at DESC
      `,
      [company_id]
    );

    res.json(
      result.rows,
    );

  } catch (e) {

    console.log(
      'PUBLIC MINI PLAZA ADS ERROR:',
      e,
    );

    res.status(500).json({

      error:
        'Error obteniendo publicidad',
    });
  }
};

/// 🔥 ACTIVAR / DESACTIVAR
exports.toggleMiniPlazaAd =
  async (req, res) => {

  try {

    const { id } =
      req.params;

    const {

      is_active,

    } = req.body;

    const result =
      await pool.query(

      `
      UPDATE mini_plaza_ads

      SET

      is_active = $1

      WHERE id = $2

      RETURNING *
      `,
      [
        is_active,
        id,
      ]
    );

    res.json(
      result.rows[0],
    );

  } catch (e) {

    console.log(
      'TOGGLE MINI PLAZA AD ERROR:',
      e,
    );

    res.status(500).json({

      error:
        'Error actualizando publicidad',
    });
  }
};

/// 🔥 DELETE
exports.deleteMiniPlazaAd =
  async (req, res) => {

  try {

    const { id } =
      req.params;

    await pool.query(

      `
      DELETE FROM mini_plaza_ads
      WHERE id = $1
      `,
      [id]
    );

    res.json({
      success: true,
    });

  } catch (e) {

    console.log(
      'DELETE MINI PLAZA AD ERROR:',
      e,
    );

    res.status(500).json({

      error:
        'Error eliminando publicidad',
    });
  }
};