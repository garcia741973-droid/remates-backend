const { pool } = require('../config/db');

const {

  generateCertificatePdf,

} = require(
  '../services/certificateService'
);

exports.generateCertificate =
    async (
  req,
  res,
) => {

  const client =
      await pool.connect();

  try {

    const { id } =
        req.params;

    /// 🔥 BUSCAR VENTA
    const result =
        await client.query(

      `
      SELECT

        s.id AS sale_id,

        s.final_price,

        s.total_amount,

        s.sale_type,

        s.created_at,

        a.name AS auction_name,

        c.name AS company_name,

        l.lot_number,

        l.cattle_type,

        l.breed,

        l.quantity,

        l.weight,

        u.full_name AS buyer_name

      FROM auction_sales s

      JOIN auctions a
        ON a.id = s.auction_id

      JOIN companies c
        ON c.id = a.company_id

      JOIN auction_live_lots l
        ON l.id = s.lot_id

      LEFT JOIN users u
        ON u.id = s.buyer_user_id

      WHERE s.id = $1
      `,
      [id]
    );

    const sale =
        result.rows[0];

    if (!sale) {

      return res.status(404).json({

        error:
            'Venta no encontrada',
      });
    }

    /// 🔥 FORMATEAR FECHA
    sale.sale_date =

        new Date(
          sale.created_at,
        ).toLocaleString(
          'es-BO',
        );

    /// 🔥 GENERAR PDF
    const pdf =
        await generateCertificatePdf(
      sale,
    );

    /// 🔥 MARCAR GENERADO
    await client.query(

      `
      UPDATE auction_sales
      SET

        certificate_generated = true,

        certificate_generated_at = NOW(),

        certificate_generated_by = $1

      WHERE id = $2
      `,
      [

        req.user.user_id,

        id,
      ]
    );

    /// 🔥 RESPUESTA PDF DIRECTA
    res.setHeader(
      'Content-Type',
      'application/pdf'
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename=certificado_venta_${id}.pdf`
    );

    return res.send(
      pdf.buffer
    );

  } catch (e) {

    console.log(
      'CERTIFICATE ERROR 👉',
      e,
    );

    res.status(500).json({

      error:
          'Error generando certificado',
    });

  } finally {

    client.release();
  }
};