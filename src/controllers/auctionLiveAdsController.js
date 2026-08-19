const {
  pool,
} = require('../config/db');

/// 🔥 LISTAR PUBLICIDAD DEL REMATE
exports.getAuctionLiveAds =
  async (req, res) => {

  try {

    const {
      auctionId,
    } = req.params;

    /// 🔒 VALIDAR REMATE Y EMPRESA
    const auctionResult =
        await pool.query(

      `
      SELECT
        id,
        company_id
      FROM auctions
      WHERE id = $1
      `,
      [auctionId]
    );

    const auction =
        auctionResult.rows[0];

    if (!auction) {

      return res.status(404).json({

        error:
          'Remate no encontrado',
      });
    }

    if (
      auction.company_id !==
      req.user.company_id
    ) {

      return res.status(403).json({

        error:
          'No autorizado',
      });
    }

    const result =
        await pool.query(

      `
      SELECT
        id,
        company_id,
        auction_id,
        title,
        image_url,
        display_seconds,
        display_order,
        is_active,
        created_at

      FROM auction_live_ads

      WHERE auction_id = $1

      ORDER BY
        display_order ASC,
        id ASC
      `,
      [auctionId]
    );

    res.json(
      result.rows,
    );

  } catch (error) {

    console.error(
      'GET AUCTION LIVE ADS ERROR:',
      error,
    );

    res.status(500).json({

      error:
        'Error obteniendo publicidad del remate',
    });
  }
};


/// 🔥 CREAR PUBLICIDAD LIVE
exports.createAuctionLiveAd =
  async (req, res) => {

  try {

    if (
      req.user.role !== 'admin'
    ) {

      return res.status(403).json({

        error:
          'No autorizado',
      });
    }

    const {

      auction_id,

      title,

      image_url,

      display_seconds = 10,

      display_order = 0,

    } = req.body;

    if (
      !auction_id ||
      !image_url
    ) {

      return res.status(400).json({

        error:
          'auction_id e image_url son requeridos',
      });
    }

    if (
      Number(display_seconds) <= 0
    ) {

      return res.status(400).json({

        error:
          'display_seconds debe ser mayor a 0',
      });
    }

    /// 🔒 VALIDAR REMATE
    const auctionResult =
        await pool.query(

      `
      SELECT
        id,
        company_id,
        status
      FROM auctions
      WHERE id = $1
      `,
      [auction_id]
    );

    const auction =
        auctionResult.rows[0];

    if (!auction) {

      return res.status(404).json({

        error:
          'Remate no encontrado',
      });
    }

    /// 🔒 VALIDAR EMPRESA
    if (
      auction.company_id !==
      req.user.company_id
    ) {

      return res.status(403).json({

        error:
          'No autorizado',
      });
    }

    /// 🔥 CREAR
    const result =
        await pool.query(

      `
      INSERT INTO auction_live_ads (

        company_id,

        auction_id,

        title,

        image_url,

        display_seconds,

        display_order,

        is_active

      )

      VALUES (

        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        true

      )

      RETURNING *
      `,
      [

        req.user.company_id,

        auction_id,

        title || null,

        image_url,

        Number(
          display_seconds
        ),

        Number(
          display_order
        ),
      ]
    );

    res.json(
      result.rows[0],
    );

  } catch (error) {

    console.error(
      'CREATE AUCTION LIVE AD ERROR:',
      error,
    );

    res.status(500).json({

      error:
        'Error creando publicidad del remate',
    });
  }
};

/// 🔥 EDITAR PUBLICIDAD LIVE
exports.updateAuctionLiveAd =
  async (req, res) => {

  try {

    if (
      req.user.role !== 'admin'
    ) {

      return res.status(403).json({

        error:
          'No autorizado',
      });
    }

    const {
      id,
    } = req.params;

    const {

      title,

      image_url,

      display_seconds,

      display_order,

    } = req.body;

    /// 🔒 BUSCAR AD
    const adResult =
        await pool.query(

      `
      SELECT
        id,
        company_id,
        auction_id

      FROM auction_live_ads

      WHERE id = $1
      `,
      [id]
    );

    const ad =
        adResult.rows[0];

    if (!ad) {

      return res.status(404).json({

        error:
          'Publicidad no encontrada',
      });
    }

    /// 🔒 VALIDAR EMPRESA
    if (
      ad.company_id !==
      req.user.company_id
    ) {

      return res.status(403).json({

        error:
          'No autorizado',
      });
    }

    if (
      display_seconds != null &&
      Number(display_seconds) <= 0
    ) {

      return res.status(400).json({

        error:
          'display_seconds debe ser mayor a 0',
      });
    }

    const result =
        await pool.query(

      `
      UPDATE auction_live_ads

      SET

        title =
          COALESCE(
            $1,
            title
          ),

        image_url =
          COALESCE(
            $2,
            image_url
          ),

        display_seconds =
          COALESCE(
            $3,
            display_seconds
          ),

        display_order =
          COALESCE(
            $4,
            display_order
          )

      WHERE id = $5

      RETURNING *
      `,
      [

        title ?? null,

        image_url ?? null,

        display_seconds != null
            ? Number(display_seconds)
            : null,

        display_order != null
            ? Number(display_order)
            : null,

        id,
      ]
    );

    res.json(
      result.rows[0],
    );

  } catch (error) {

    console.error(
      'UPDATE AUCTION LIVE AD ERROR:',
      error,
    );

    res.status(500).json({

      error:
        'Error actualizando publicidad del remate',
    });
  }
};


/// 🔥 ACTIVAR / DESACTIVAR PUBLICIDAD
exports.toggleAuctionLiveAd =
  async (req, res) => {

  try {

    if (
      req.user.role !== 'admin'
    ) {

      return res.status(403).json({

        error:
          'No autorizado',
      });
    }

    const {
      id,
    } = req.params;

    /// 🔒 BUSCAR AD
    const adResult =
        await pool.query(

      `
      SELECT
        id,
        company_id,
        is_active

      FROM auction_live_ads

      WHERE id = $1
      `,
      [id]
    );

    const ad =
        adResult.rows[0];

    if (!ad) {

      return res.status(404).json({

        error:
          'Publicidad no encontrada',
      });
    }

    /// 🔒 VALIDAR EMPRESA
    if (
      ad.company_id !==
      req.user.company_id
    ) {

      return res.status(403).json({

        error:
          'No autorizado',
      });
    }

    const result =
        await pool.query(

      `
      UPDATE auction_live_ads

      SET
        is_active =
          NOT is_active

      WHERE id = $1

      RETURNING *
      `,
      [id]
    );

    res.json(
      result.rows[0],
    );

  } catch (error) {

    console.error(
      'TOGGLE AUCTION LIVE AD ERROR:',
      error,
    );

    res.status(500).json({

      error:
        'Error cambiando estado de publicidad',
    });
  }
};