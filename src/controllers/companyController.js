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
        background_color,
        remates_pro_enabled
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

            c.hero_video_url,

            c.lobby_banner_url,

            c.mini_plaza_background_url,

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

/// 🔥 SUBIR BANNER LOBBY
exports.uploadLobbyBanner =
  async (req, res) => {

    try {

      const { company_id } =
          req.params;

      if (!req.file) {

        return res.status(400).json({

          error:
            'No se envió archivo',
        });
      }

      const result =
          await new Promise(

        (resolve, reject) => {

          cloudinary.uploader.upload_stream(

            {

              folder:
                'remates/lobby_banners',
            },

            (error, result) => {

              if (error)
                reject(error);

              else
                resolve(result);
            }

          ).end(req.file.buffer);
        }
      );

      await pool.query(

        `
        UPDATE companies
        SET lobby_banner_url = $1
        WHERE id = $2
        `,

        [
          result.secure_url,
          company_id,
        ],
      );

      res.json({

        success: true,

        lobby_banner_url:
            result.secure_url,
      });

    } catch (e) {

      console.log(
        'UPLOAD LOBBY BANNER ERROR:',
        e,
      );

      res.status(500).json({

        error:
          'Error subiendo banner',
      });
    }
  };


/// 🔥 SUBIR FONDO MINI PLAZA
exports.uploadMiniPlazaBackground =
  async (req, res) => {

    try {

      const { company_id } =
          req.params;

      if (!req.file) {

        return res.status(400).json({

          error:
            'No se envió archivo',
        });
      }

      const result =
          await new Promise(

        (resolve, reject) => {

          cloudinary.uploader.upload_stream(

            {

              folder:
                'remates/mini_plazas',
            },

            (error, result) => {

              if (error)
                reject(error);

              else
                resolve(result);
            }

          ).end(req.file.buffer);
        }
      );

      await pool.query(

        `
        UPDATE companies
        SET mini_plaza_background_url = $1
        WHERE id = $2
        `,

        [
          result.secure_url,
          company_id,
        ],
      );

      res.json({

        success: true,

        mini_plaza_background_url:
            result.secure_url,
      });

    } catch (e) {

      console.log(
        'UPLOAD MINI PLAZA ERROR:',
        e,
      );

      res.status(500).json({

        error:
          'Error subiendo fondo',
      });
    }
  };
  
/// 🔥 GUARDAR HERO VIDEO URL
exports.uploadHeroVideo =
  async (req, res) => {

    try {

      const { company_id } =
          req.params;

      const {
        video_url,
      } = req.body;

      if (!video_url) {

        return res.status(400).json({

          error:
            'No se envió video_url',
        });
      }

      await pool.query(

        `
        UPDATE companies
        SET hero_video_url = $1
        WHERE id = $2
        `,

        [
          video_url,
          company_id,
        ],
      );

      res.json({

        success: true,

        hero_video_url:
            video_url,
      });

    } catch (e) {

      console.log(
        'UPLOAD HERO VIDEO ERROR:',
        e,
      );

      res.status(500).json({

        error:
          'Error guardando hero video',
      });
    }
  };

/// 🔥 OBTENER EMPRESA POR ID
exports.getCompanyById = async (req, res) => {

  try {

    const { company_id } =
        req.params;

    const result =
        await pool.query(

      `
        SELECT

          id,

          id AS company_id,

          name AS company_name,

          logo_url,

          hero_video_url,

          lobby_banner_url,

          mini_plaza_background_url,

          primary_color,

          secondary_color,

          background_color,

        EXISTS (

          SELECT 1
          FROM auctions a
          WHERE

            a.company_id = companies.id

            AND a.status = 'live'

        ) AS has_live

      FROM companies

      WHERE id = $1
      `,
      [company_id]
    );

    if (
      result.rows.length === 0
    ) {

      return res.status(404).json({

        error:
          'Empresa no encontrada',
      });
    }

    res.json(
      result.rows[0],
    );

  } catch (e) {

    console.log(
      'GET COMPANY BY ID ERROR:',
      e,
    );

    res.status(500).json({

      error:
        'Error obteniendo empresa',
    });
  }
};  