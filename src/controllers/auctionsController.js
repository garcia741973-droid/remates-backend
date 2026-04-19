const { pool } = require('../config/db');

exports.createAuction = async (req, res) => {
  try {
    const company_id = req.user.company_id;

    const { name, scheduled_at } = req.body;

    const { rows } = await pool.query(
      `
      INSERT INTO auctions (company_id, name, scheduled_at)
      VALUES ($1,$2,$3)
      RETURNING *
      `,
      [company_id, name, scheduled_at]
    );

    res.json(rows[0]);

  } catch (error) {
    console.error('ERROR CREATE AUCTION:', error);
    res.status(500).json({ error: 'Error creando remate' });
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
      SELECT * FROM auction_lots
      WHERE auction_id = $1 AND lot_id = $2
      `,
      [auction_id, lot_id]
    );

    if (check.rows.length === 0) {
      return res.status(400).json({ error: 'Lote no pertenece a este remate' });
    }

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
    const company_id = req.user.company_id;
    const { id } = req.params;

    // 🔍 Obtener remate
    const auctionResult = await pool.query(
      `
      SELECT * FROM auctions
      WHERE id = $1 AND company_id = $2
      `,
      [id, company_id]
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
        FROM lots
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
      scheduled_at: auction.scheduled_at,
      current_lot_id: auction.current_lot_id,
      current_lot: currentLot
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

    // 🔥 activar remate
    await pool.query(
      `UPDATE auctions SET status = 'live' WHERE id = $1`,
      [auction_id]
    );

    res.json({ message: 'Remate iniciado correctamente' });

  } catch (error) {
    console.error('ERROR START AUCTION:', error);
    res.status(500).json({ error: 'Error iniciando remate' });
  }
};

