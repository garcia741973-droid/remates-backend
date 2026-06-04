const { pool } = require('../config/db');

const {
  createOperationEvent,
} = require('../services/operationEventsService');

const {
  sendAdminNotification,
} = require('../services/notificationService');

exports.createAuction = async (req, res) => {

  try {

    const company_id =
        req.user.company_id;

    const {

      name,

      scheduled_at,

      auction_type = 'live',

    } = req.body;

    const { rows } =
        await pool.query(

      `
      INSERT INTO auctions (

        company_id,

        name,

        scheduled_at,

        auction_type

      )

      VALUES (

        $1,$2,$3,$4

      )

      RETURNING *
      `,
      [

        company_id,

        name,

        scheduled_at,

        auction_type,
      ]
    );

    res.json(
      rows[0],
    );

  } catch (error) {

    console.error(
      'ERROR CREATE AUCTION:',
      error,
    );

    res.status(500).json({

      error:
          'Error creando remate',
    });
  }
};

exports.setCurrentLot = async (req, res) => {
  try {
    const { auction_id, lot_id } = req.body;

    // 🔥 VALIDAR REMATE
    const auctionResult = await pool.query(
      `
      SELECT status, company_id
      FROM auctions
      WHERE id = $1
      `,
      [auction_id]
    );

    const auction = auctionResult.rows[0];

    if (!auction) {
      return res.status(404).json({ error: 'Remate no existe' });
    }

    // 🔥 SOLO SI ESTÁ EN VIVO
    if (auction.status !== 'live') {
      return res.status(400).json({ error: 'El remate no está en vivo' });
    }

    // 🔥 VALIDAR EMPRESA (seguridad básica)
    if (auction.company_id !== req.user.company_id) {
      return res.status(403).json({ error: 'No autorizado' });
    }    

    // 🔥 validar que el lote pertenece al remate
    const check = await pool.query(
      `
    SELECT *
    FROM auction_live_lots
    WHERE auction_id = $1
    AND id = $2
      `,
      [auction_id, lot_id]
    );

    if (check.rows.length === 0) {
      return res.status(400).json({ error: 'Lote no pertenece a este remate' });
    }

    // 🔥 iniciar puja desde precio apertura
    await pool.query(
      `
      UPDATE auction_live_lots
      SET current_price = opening_price
      WHERE id = $1
      `,
      [lot_id]
    );

    // 🔄 actualizar lote activo
    await pool.query(
      `
      UPDATE auctions
      SET current_lot_id = $1
      WHERE id = $2
      `,
      [lot_id, auction_id]
    );

    // ⚡ emitir a todos
    const io = req.app.get('io');

    io.to(`auction_${auction_id}`).emit('lotChanged', {
      auction_id,
      lot_id
    });

    res.json({ message: 'Lote activado correctamente' });

  } catch (error) {
    console.error('ERROR SET CURRENT LOT:', error);
    res.status(500).json({ error: 'Error actualizando lote actual' });
  }
};

    exports.getAuctionById = async (req, res) => {
      try {
    const { id } = req.params;

    const auctionResult = await pool.query(
    `
    SELECT *
    FROM auctions
    WHERE id = $1
    `,
    [id]
    );

    const auction = auctionResult.rows[0];

    if (!auction) {
      return res.status(404).json({ error: 'Remate no encontrado' });
    }

    let currentLot = null;

    // 🔥 Traer lote actual si existe
    if (auction.current_lot_id) {
      const lotResult = await pool.query(
        `
        SELECT *
        FROM auction_live_lots
        WHERE id = $1
        `,
        [auction.current_lot_id]
      );

      currentLot = lotResult.rows[0] || null;
    }

    // 🎯 RESPUESTA LIMPIA
    res.json({

      id: auction.id,

      name: auction.name,

      status: auction.status,

      scheduled_at:
          auction.scheduled_at,

      started_at:
          auction.started_at,

      ended_at:
          auction.ended_at,

      current_lot_id:
          auction.current_lot_id,

      current_lot:
          currentLot,
    });

  } catch (error) {
    console.error('ERROR GET AUCTION:', error);
    res.status(500).json({ error: 'Error obteniendo remate' });
  }
};

exports.getAuctions = async (req, res) => {
  try {
    const company_id = req.user.company_id;

    const result = await pool.query(
      `
      SELECT *
      FROM auctions
      WHERE company_id = $1
      ORDER BY id DESC
      `,
      [company_id]
    );

    res.json(result.rows);

  } catch (error) {
    console.error('ERROR GET AUCTIONS:', error);
    res.status(500).json({ error: 'Error obteniendo remates' });
  }
};

exports.startAuction = async (req, res) => {
  try {
    const { auction_id } = req.body;

    // 🔥 validar que existe
    const result = await pool.query(
      `SELECT company_id, status FROM auctions WHERE id = $1`,
      [auction_id]
    );

    const auction = result.rows[0];

    if (!auction) {
      return res.status(404).json({ error: 'Remate no existe' });
    }

    // 🔥 seguridad empresa
    if (auction.company_id !== req.user.company_id) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    // 🔥 ya está en vivo
    if (auction.status === 'live') {
      return res.json({ message: 'Remate ya está en vivo' });
    }

    /// 🔥 VALIDAR SI YA EXISTE
    /// OTRO REMATE EN VIVO
    const liveCheck =
        await pool.query(

      `
      SELECT id, name
      FROM auctions
      WHERE

        company_id = $1

        AND status = 'live'

        AND id != $2

      LIMIT 1
      `,

      [
        req.user.company_id,
        auction_id,
      ],
    );

    if (
      liveCheck.rows.length > 0
    ) {

      return res.status(400).json({

        error:
          `Ya existe un remate en vivo: ${liveCheck.rows[0].name}`,
      });
    }

    // 🔥 activar remate
    await pool.query(
      `UPDATE auctions SET status = 'live' WHERE id = $1`,
      [auction_id]
    );

    /// 🔥 EVENTO OPERATIVO
    await createOperationEvent({

      type: 'auction_started',

      title:
          '📺 Remate iniciado',

      message:
          `El remate ${auction_id} inició transmisión en vivo`,

      priority: 'high',

      data: {

        auction_id,
      },
    });

    /// 🔥 PUSH SUPER ADMIN
    await sendAdminNotification({

      title:
          '📺 Remate iniciado',

      body:
          `El remate ${auction_id} ya está en vivo`,

      data: {

        type: 'auction_started',

        auction_id:
            auction_id.toString(),
      },
    });
    
    /// 🔥 AVISAR A TODA LA APP
    const io =
        req.app.get('io');

    io.emit(

      'auctionStarted',

      {

        auction_id,

        company_id:
            req.user.company_id,
      },
    );    

    res.json({ message: 'Remate iniciado correctamente' });

  } catch (error) {
    console.error('ERROR START AUCTION:', error);
    res.status(500).json({ error: 'Error iniciando remate' });
  }
};

exports.closeAuction = async (req, res) => {

  try {

    const { auction_id } =
        req.body;

    /// 🔥 VALIDAR REMATE
    const result =
        await pool.query(

      `
      SELECT company_id, status
      FROM auctions
      WHERE id = $1
      `,
      [auction_id]
    );

    const auction =
        result.rows[0];

    if (!auction) {

      return res.status(404).json({

        error:
          'Remate no existe',
      });
    }

    /// 🔥 SEGURIDAD EMPRESA
    if (

      auction.company_id !==
      req.user.company_id
    ) {

      return res.status(403).json({

        error:
          'No autorizado',
      });
    }

    /// 🔥 YA CERRADO
    if (
      auction.status === 'closed'
    ) {

      return res.json({

        message:
          'Remate ya cerrado',
      });
    }

    /// 🔥 LIMPIAR LOTES LIVE
    await pool.query(

      `
      UPDATE auction_live_lots
      SET status = 'queued'
      WHERE auction_id = $1
      AND status = 'live'
      `,
      [auction_id]
    );

    /// 🔥 CERRAR REMATE
    await pool.query(

      `
      UPDATE auctions
      SET

        status = 'closed',

        ended_at = NOW(),

        current_lot_id = NULL

      WHERE id = $1
      `,
      [auction_id]
    );

    /// 🔥 SOCKET
    const io =
        req.app.get('io');

    io.to(
      `auction_${auction_id}`
    ).emit(

      'auctionClosed',

      {

        auction_id,
      }
    );

    /// 🔥 AVISO GLOBAL
    io.emit(

      'auctionClosedGlobal',

      {

        auction_id,

        company_id:
            req.user.company_id,
      },
    );

    /// 🔥 EVENTO OPERATIVO
    await createOperationEvent({

      type:
          'auction_closed',

      title:
          '🔴 Remate finalizado',

      message:
          `El remate ${auction_id} finalizó`,

      priority:
          'high',

      data: {

        auction_id,
      },
    });

    /// 🔥 PUSH ADMIN
    await sendAdminNotification({

      title:
          '🔴 Remate finalizado',

      body:
          `El remate ${auction_id} fue cerrado`,

      data: {

        type:
            'auction_closed',

        auction_id:
            auction_id.toString(),
      },
    });

    res.json({

      success: true,
    });

  } catch (error) {

    console.error(
      'ERROR CLOSE AUCTION:',
      error,
    );

    res.status(500).json({

      error:
          'Error cerrando remate',
    });
  }
};

/// 🔥 REPORTES REMATES
exports.getAuctionReports =
  async (req, res) => {

  try {

    const company_id =
        req.user.company_id;

    const {

      from,

      to,

    } = req.query;

    let query = `
      SELECT

        a.id,

        a.name,

        a.status,

        a.scheduled_at,

        a.started_at,

        a.ended_at,

        COUNT(l.id) AS total_lots,

        COUNT(
          CASE
            WHEN l.status = 'sold'
            THEN 1
          END
        ) AS sold_lots,

        COUNT(
          CASE
            WHEN l.status = 'passed'
            THEN 1
          END
        ) AS passed_lots,

        COALESCE(
          SUM(
            CASE
              WHEN l.status = 'sold'
              THEN l.final_price
              ELSE 0
            END
          ),
          0
        ) AS total_sold_amount

      FROM auctions a

      LEFT JOIN auction_live_lots l
      ON l.auction_id = a.id

      WHERE a.company_id = $1
    `;

    const params = [company_id];

    /// 🔥 FILTRO FECHAS
    if (from) {

      query += `
        AND DATE(
          a.scheduled_at
        ) >= $2
      `;

      params.push(from);
    }

    if (to) {

      query += `
        AND DATE(
          a.scheduled_at
        ) <= $${params.length + 1}
      `;

      params.push(to);
    }

    query += `
      GROUP BY a.id

      ORDER BY
      a.scheduled_at DESC
    `;

    const result =
        await pool.query(
      query,
      params,
    );

    res.json(
      result.rows,
    );

  } catch (e) {

    console.log(
      'GET AUCTION REPORTS ERROR:',
      e,
    );

    res.status(500).json({

      error:
          'Error obteniendo reportes',
    });
  }
};

/// 🔥 OBTENER REMATE LIVE ACTUAL
exports.getCurrentLiveAuction =
  async (req, res) => {

    try {

      const result =
        await pool.query(`
          SELECT

            a.*,

            c.name AS company_name,

            c.logo_url,

            c.primary_color,

            c.secondary_color,

            c.background_color,

            c.lobby_banner_url,

            c.mini_plaza_background_url            

          FROM auctions a

          LEFT JOIN companies c
          ON c.id = a.company_id

          WHERE a.status = 'live'

          ORDER BY a.created_at DESC

          LIMIT 1
        `);

      if (
        result.rows.length === 0
      ) {

        return res.status(404).json({
          error:
            'No hay remate live',
        });
      }

      res.json(
        result.rows[0]
      );

    } catch (e) {

      console.log(e);

      res.status(500).json({
        error:
          'Error getting live auction',
      });
    }
  };

/// 🔥 REMATES LIVE GLOBAL
exports.getLiveAuctions =
  async (req, res) => {

    try {

      const result =
          await pool.query(`

        SELECT

          a.id,

          a.name,

          a.status,

          a.started_at,

          c.name AS company_name,

          c.logo_url

        FROM auctions a

        INNER JOIN companies c
        ON c.id = a.company_id

        WHERE a.status = 'live'

        ORDER BY a.started_at DESC
      `);

      res.json(
        result.rows,
      );

    } catch (e) {

      console.log(
        'GET LIVE AUCTIONS ERROR:',
        e,
      );

      res.status(500).json({

        error:
          'Error obteniendo remates live',
      });
    }
  };
  
/// 🔥 REMATE LIVE DE MI EMPRESA
exports.getMyLiveAuction =
  async (req, res) => {

    try {

      const company_id =
          req.user.company_id;

      const result =
          await pool.query(

        `
        SELECT

          a.*,

          c.name AS company_name,

          c.logo_url,

          c.primary_color,

          c.secondary_color,

          c.background_color,

          c.lobby_banner_url,

          c.mini_plaza_background_url

        FROM auctions a

        LEFT JOIN companies c
        ON c.id = a.company_id

        WHERE

          a.company_id = $1

          AND a.status = 'live'

        ORDER BY a.id DESC

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