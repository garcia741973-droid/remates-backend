const { AccessToken } = require('livekit-server-sdk');

exports.getLivekitToken = async (req, res) => {
  try {
    const user = req.user;
    const { auctionId } = req.body;

    if (!auctionId) {
      return res.status(400).json({ error: 'auctionId requerido' });
    }

    // 🔥 VALIDACIÓN REMATE
    const auctionResult = await pool.query(`
      SELECT id, status
      FROM auctions
      WHERE id = $1
    `, [auctionId]);

    if (!auctionResult.rows.length) {
      return res.status(404).json({ error: 'Remate no existe' });
    }

    const auction = auctionResult.rows[0];

    if (auction.status !== 'live') {
      return res.status(400).json({ error: 'Remate no está en vivo' });
    }

    // 🔥 OPCIONAL: bloquear rechazados
    if (user.kyc_level === 'rejected') {
      return res.status(403).json({ error: 'Usuario no autorizado' });
    }

    // 🔥 ROOM CONTROLADA
    const room = `auction_${auctionId}`;

    // 🔥 ROLES
    const isBroadcaster = user.role !== 'client';

    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity: `user_${user.user_id}_${Date.now()}`,
        name: user.name || `User ${user.user_id}`,
        metadata: JSON.stringify({
          user_id: user.user_id,
          auctionId,
          role: isBroadcaster ? 'broadcaster' : 'viewer',
        }),
        ttl: '6h',
      }
    );

    at.addGrant({
      room,
      roomJoin: true,
      canPublish: isBroadcaster,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    res.json({
      url: process.env.LIVEKIT_URL,
      token,
      room,
      role: isBroadcaster ? 'broadcaster' : 'viewer',
    });

  } catch (error) {
    console.error('LIVEKIT ERROR:', error);
    res.status(500).json({ error: 'Error generando token' });
  }
};