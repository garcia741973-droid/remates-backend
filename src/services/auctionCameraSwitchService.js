const {
  pool,
} = require('../config/db');

let cameraSwitchInterval = null;

let cameraSwitchRunning = false;

const startAuctionCameraSwitchService = (
  io,
) => {

  /// 🔒 EVITAR INICIAR DOS VECES
  if (cameraSwitchInterval) {

    console.log(
      '⚠️ CAMERA SWITCH SERVICE '
      + 'YA ESTÁ ACTIVO',
    );

    return;
  }

  console.log(
    '🎥 CAMERA SWITCH SERVICE '
    + 'INICIADO',
  );

  cameraSwitchInterval =
      setInterval(
    async () => {

      /// 🔒 EVITAR QUE UNA VUELTA
      /// SE MONTE ENCIMA DE OTRA
      if (cameraSwitchRunning) {
        return;
      }

      cameraSwitchRunning = true;

      try {

        /// 🔥 CAMBIAR SOLAMENTE
        /// LOS REMATES QUE YA CUMPLIERON
        /// SU TIEMPO
        const result =
            await pool.query(
          `
          UPDATE auction_stream_settings s

          SET
            active_camera =
              CASE

                WHEN s.active_camera =
                  'camera_1'
                THEN 'camera_2'

                ELSE 'camera_1'

              END,

            camera_last_switched_at =
              NOW(),

            updated_at =
              NOW()

          FROM auctions a

          WHERE
            a.id = s.auction_id

            AND a.status = 'live'

            AND s.camera_count = 2

            AND s.camera_mode = 'auto'

            AND (
              s.camera_last_switched_at
                IS NULL

              OR

              s.camera_last_switched_at
                <=
                NOW()
                -
                (
                  s.camera_switch_seconds
                  * INTERVAL '1 second'
                )
            )

          RETURNING

            s.auction_id,

            s.active_camera,

            s.camera_switch_seconds
          `,
        );

        /// 🔥 AVISAR A LOS CLIENTES
        for (
          const row
          of result.rows
        ) {

          console.log(
            `🎥 AUTO CAMERA SWITCH `
            + `REMATE ${row.auction_id} `
            + `=> ${row.active_camera}`,
          );

          io.to(
            `auction_${row.auction_id}`,
          ).emit(
            'activeCameraChanged',
            {

              auction_id:
                  row.auction_id,

              active_camera:
                  row.active_camera,

              automatic:
                  true,
            },
          );
        }

      } catch (error) {

        console.error(
          '❌ CAMERA SWITCH SERVICE ERROR:',
          error,
        );

      } finally {

        cameraSwitchRunning = false;
      }

    },

    /// 🔥 REVISAR CADA SEGUNDO
    1000,
  );
};

module.exports = {

  startAuctionCameraSwitchService,
};