const { AccessToken } =
  require('livekit-server-sdk');

const { pool } =
  require('../config/db');

exports.getLivekitToken =
  async (req, res) => {

  try {

    const user =
        req.user;

    const {

      auctionId,

      cameraRole,

    } = req.body;

    if (!auctionId) {

      return res.status(400).json({

        error:
          'auctionId requerido',
      });
    }

    /// 🔒 VALIDAR CAMERA ROLE
    if (
      cameraRole != null &&
      cameraRole !== 'camera_1' &&
      cameraRole !== 'camera_2'
    ) {

      return res.status(400).json({

        error:
          'cameraRole inválido',
      });
    }

    /// 🔥 VALIDAR REMATE
    const auctionResult =
        await pool.query(

      `
      SELECT
        id,
        status
      FROM auctions
      WHERE id = $1
      `,

      [auctionId]
    );

    if (
      !auctionResult.rows.length
    ) {

      return res.status(404).json({

        error:
          'Remate no existe',
      });
    }

    const auction =
        auctionResult.rows[0];

    if (
      auction.status !== 'live'
    ) {

      return res.status(400).json({

        error:
          'Remate no está en vivo',
      });
    }

    /// 🔥 OBTENER ROL REAL
    const roleResult =
        await pool.query(

      `
      SELECT role
      FROM user_companies
      WHERE
        user_id = $1
        AND company_id = $2
      `,

      [
        user.user_id,
        user.company_id,
      ]
    );

    const role =
        roleResult.rows[0]?.role;

    if (!role) {

      return res.status(403).json({

        error:
          'Usuario sin rol en empresa',
      });
    }

    /// 🔥 SOLO STREAMER TRANSMITE
    const isBroadcaster =
        role === 'streamer';

    /// 🔥 IDENTIDAD LIVEKIT
    let participantIdentity =
        `user_${user.user_id}`;

    let participantMetadata = {

      user_id:
          user.user_id,

      auctionId,

      role,
    };

    /// 🔥 STREAMER:
    /// IDENTIFICAR CÁMARA
    if (isBroadcaster) {

      const effectiveCameraRole =
          cameraRole ||
          'camera_1';

      participantIdentity =
          `user_${user.user_id}_${effectiveCameraRole}`;

      participantMetadata = {

        ...participantMetadata,

        camera_role:
            effectiveCameraRole,
      };
    }

    /// 🔥 ROOM
    const room =
        `auction_${auctionId}`;

    const at =
        new AccessToken(

      process.env
          .LIVEKIT_API_KEY,

      process.env
          .LIVEKIT_API_SECRET,

      {

        identity:
            participantIdentity,

        name:
            user.name ||
            `User ${user.user_id}`,

        metadata:
            JSON.stringify(
              participantMetadata,
            ),

        ttl:
            '6h',
      }
    );

    at.addGrant({

      room,

      roomJoin:
          true,

      canPublish:
          isBroadcaster,

      canSubscribe:
          true,
    });

    const token =
        await at.toJwt();

    res.json({

      url:
          process.env
              .LIVEKIT_URL,

      token,

      room,

      role:
          isBroadcaster
              ? 'broadcaster'
              : 'viewer',

      camera_role:
          isBroadcaster
              ? (
                  cameraRole ||
                  'camera_1'
                )
              : null,
    });

  } catch (error) {

    console.error(
      'LIVEKIT ERROR:',
      error,
    );

    res.status(500).json({

      error:
        'Error generando token',
    });
  }
};