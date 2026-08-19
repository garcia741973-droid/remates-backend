const {
  pool,
} = require('../config/db');

let adRotationInterval = null;

let adRotationRunning = false;


/// 📢 OBTENER PRIMER ANUNCIO ACTIVO
async function getFirstActiveAd(
  auctionId,
) {

  const result =
      await pool.query(

    `
    SELECT
      id,
      auction_id,
      title,
      image_url,
      display_seconds,
      display_order

    FROM auction_live_ads

    WHERE
      auction_id = $1
      AND is_active = true

    ORDER BY
      display_order ASC,
      id ASC

    LIMIT 1
    `,

    [auctionId],
  );

  return result.rows[0] || null;
}


/// 📢 OBTENER SIGUIENTE ANUNCIO
async function getNextActiveAd(
  auctionId,
  currentAdId,
) {

  const currentResult =
      await pool.query(

    `
    SELECT
      display_order,
      id

    FROM auction_live_ads

    WHERE
      id = $1
      AND auction_id = $2
    `,

    [
      currentAdId,
      auctionId,
    ],
  );

  const current =
      currentResult.rows[0];

  if (!current) {

    return getFirstActiveAd(
      auctionId,
    );
  }

  /// 🔥 BUSCAR EL SIGUIENTE
  const nextResult =
      await pool.query(

    `
    SELECT
      id,
      auction_id,
      title,
      image_url,
      display_seconds,
      display_order

    FROM auction_live_ads

    WHERE
      auction_id = $1

      AND is_active = true

      AND (
        display_order > $2

        OR (
          display_order = $2
          AND id > $3
        )
      )

    ORDER BY
      display_order ASC,
      id ASC

    LIMIT 1
    `,

    [
      auctionId,
      current.display_order,
      current.id,
    ],
  );

  if (
    nextResult.rows.length > 0
  ) {

    return nextResult.rows[0];
  }

  /// 🔁 SI ERA EL ÚLTIMO,
  /// VOLVER AL PRIMERO
  return getFirstActiveAd(
    auctionId,
  );
}


/// 📢 INICIAR PAUSA PUBLICITARIA
async function startAdBreak(
  auctionId,
  io,
) {

  try {

    /// 🔥 VER SETTINGS
    const settingsResult =
        await pool.query(

      `
      SELECT
        ads_enabled

      FROM auction_stream_settings

      WHERE auction_id = $1
      `,

      [auctionId],
    );

    const settings =
        settingsResult.rows[0];

    console.log(
    '📢 START AD BREAK DEBUG =>',
    {
        auction_id:
            auctionId,

        rows:
            settingsResult.rows,

        settings:
            settings,

        ads_enabled:
            settings?.ads_enabled,

        ads_enabled_type:
            typeof settings?.ads_enabled,
    },
    );

    if (!settings) {

    console.log(
        `❌ NO EXISTEN STREAM SETTINGS REMATE ${auctionId}`,
    );

    return;
    }

    if (
    settings.ads_enabled !== true
    ) {

    console.log(
        `📢 ADS DESACTIVADOS REMATE ${auctionId}`,
        {
        value:
            settings.ads_enabled,

        type:
            typeof settings.ads_enabled,
        },
    );

    return;
    }

    console.log(
    `✅ ADS HABILITADOS REMATE ${auctionId}`,
    );

    const ad =
        await getFirstActiveAd(
      auctionId,
    );

    if (!ad) {

      console.log(
        `📢 SIN ADS ACTIVOS REMATE ${auctionId}`,
      );

      return;
    }

    await pool.query(

      `
      UPDATE auction_stream_settings

      SET
        active_ad_id = $1,
        ad_started_at = NOW(),
        updated_at = NOW()

      WHERE auction_id = $2
      `,

      [
        ad.id,
        auctionId,
      ],
    );

    console.log(
      `📢 AD START REMATE ${auctionId} => ${ad.id}`,
    );

    io.to(
      `auction_${auctionId}`,
    ).emit(
      'liveAdChanged',
      {

        auction_id:
            auctionId,

        ad,
      },
    );

  } catch (error) {

    console.error(
      'START AD BREAK ERROR:',
      error,
    );
  }
}


/// 🛑 DETENER PAUSA PUBLICITARIA
async function stopAdBreak(
  auctionId,
  io,
  reason = 'new_lot',
) {

  try {

    await pool.query(

      `
      UPDATE auction_stream_settings

      SET
        active_ad_id = NULL,
        ad_started_at = NULL,
        updated_at = NOW()

      WHERE auction_id = $1
      `,

      [auctionId],
    );

    io.to(
      `auction_${auctionId}`,
    ).emit(
      'liveAdStopped',
      {

        auction_id:
            auctionId,

        reason,
      },
    );

    console.log(
      `📢 AD STOP REMATE ${auctionId} => ${reason}`,
    );

  } catch (error) {

    console.error(
      'STOP AD BREAK ERROR:',
      error,
    );
  }
}


/// 🔄 SERVICIO DE ROTACIÓN
function startAuctionLiveAdsService(
  io,
) {

  if (adRotationInterval) {

    return;
  }

  console.log(
    '📢 AUCTION LIVE ADS SERVICE INICIADO',
  );

  adRotationInterval =
      setInterval(
    async () => {

      if (adRotationRunning) {

        return;
      }

      adRotationRunning = true;

      try {

        /// 🔥 REMATES EN PAUSA PUBLICITARIA
        const result =
            await pool.query(

          `
          SELECT
            s.auction_id,
            s.active_ad_id,
            s.ad_started_at,
            ad.display_seconds

          FROM auction_stream_settings s

          INNER JOIN auctions a
            ON a.id = s.auction_id

          INNER JOIN auction_live_ads ad
            ON ad.id = s.active_ad_id

          WHERE
            a.status = 'live'

            AND a.current_lot_id IS NULL

            AND s.ads_enabled = true

            AND s.active_ad_id IS NOT NULL

            AND s.ad_started_at IS NOT NULL

            AND s.ad_started_at
              <=
              NOW()
              -
              (
                ad.display_seconds
                * INTERVAL '1 second'
              )
          `,
        );

        for (
          const row
          of result.rows
        ) {

          const nextAd =
              await getNextActiveAd(

            row.auction_id,

            row.active_ad_id,
          );

          if (!nextAd) {

            continue;
          }

          await pool.query(

            `
            UPDATE auction_stream_settings

            SET
              active_ad_id = $1,
              ad_started_at = NOW(),
              updated_at = NOW()

            WHERE
              auction_id = $2

              AND active_ad_id = $3
            `,

            [
              nextAd.id,
              row.auction_id,
              row.active_ad_id,
            ],
          );

          console.log(
            `📢 NEXT AD REMATE ${row.auction_id} => ${nextAd.id}`,
          );

          io.to(
            `auction_${row.auction_id}`,
          ).emit(
            'liveAdChanged',
            {

              auction_id:
                  row.auction_id,

              ad:
                  nextAd,
            },
          );
        }

      } catch (error) {

        console.error(
          'AUCTION LIVE ADS SERVICE ERROR:',
          error,
        );

      } finally {

        adRotationRunning =
            false;
      }

    },

    1000,
  );
}


module.exports = {

  startAdBreak,

  stopAdBreak,

  startAuctionLiveAdsService,
};