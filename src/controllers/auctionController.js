/// 🔥 REMATE LIVE DE MI EMPRESA
exports.getMyLiveAuction =
  async (req, res) => {

    try {

      const company_id =
          req.user.company_id;

      const result =
          await pool.query(

        `
        SELECT *

        FROM auctions

        WHERE

          company_id = $1

          AND status = 'live'

        ORDER BY id DESC

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