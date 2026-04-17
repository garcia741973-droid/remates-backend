const { AccessToken } = require('livekit-server-sdk');

exports.getLivekitToken = async (req, res) => {
  try {
    const user = req.user;
    const { room } = req.body;

    if (!room) {
      return res.status(400).json({ error: 'Room requerido' });
    }

    const at = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity: String(user.user_id),
        name: user.role,
      }
    );

    at.addGrant({
      room: room,
      roomJoin: true,
      canPublish: user.role !== 'client',
      canSubscribe: true,
    });

    const token = await at.toJwt();

    res.json({ token });

  } catch (error) {
    console.error('LIVEKIT ERROR:', error);
    res.status(500).json({ error: 'Error generando token' });
  }
};