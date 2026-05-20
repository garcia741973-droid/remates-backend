const { pool } = require('../config/db');

// 🔥 obtener empresa del usuario logueado
exports.getMyCompany = async (req, res) => {
  try {
    const company_id = req.user.company_id;

    const { rows } = await pool.query(
      `
      SELECT 
        id,
        name,
        logo_url,
        primary_color,
        secondary_color,
        background_color
      FROM companies
      WHERE id = $1
      `,
      [company_id]
    );

    res.json(rows[0]);

  } catch (error) {
    console.error('ERROR COMPANY:', error);
    res.status(500).json({ error: 'Error obteniendo empresa' });
  }
};

const cloudinary = require('../config/cloudinary');

// 🔥 SUBIR LOGO
exports.uploadLogo = async (req, res) => {
  try {
    const company_id = req.user.company_id;

    if (!req.file) {
      return res.status(400).json({ error: 'No se envió archivo' });
    }

    // 🔥 subir a cloudinary
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'remates/logos' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      ).end(req.file.buffer);
    });

    // 🔄 guardar en DB
    await pool.query(
      `
      UPDATE companies
      SET logo_url = $1
      WHERE id = $2
      `,
      [result.secure_url, company_id]
    );

    res.json({
      message: 'Logo actualizado',
      logo_url: result.secure_url
    });

  } catch (error) {
    console.error('ERROR UPLOAD LOGO:', error);
    res.status(500).json({ error: 'Error subiendo logo' });
  }
};

/// 🔥 EMPRESAS REMATERAS
exports.getRemateCompanies =
  async (req, res) => {

    try {

      const result =
          await pool.query(`

        SELECT

          c.id,

          c.name,

          c.logo_url,

          c.primary_color,

          c.secondary_color,

          c.background_color,

          EXISTS (

            SELECT 1
            FROM auctions a
            WHERE

              a.company_id = c.id

              AND a.status = 'live'

          ) AS has_live

        FROM companies c

        WHERE c.is_active = true

        ORDER BY has_live DESC, c.name ASC
      `);

      res.json(
        result.rows,
      );

    } catch (e) {

      console.log(
        'GET REMATE COMPANIES ERROR:',
        e,
      );

      res.status(500).json({

        error:
          'Error obteniendo empresas',
      });
    }
  };