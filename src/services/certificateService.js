const PDFDocument = require('pdfkit');

const QRCode = require('qrcode');

function formatAmount(
  value,
) {

  return Number(value || 0)
      .toLocaleString(
    'en-US',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  );
}

async function generateCertificatePdf(
  sale,
) {

    return new Promise(

      async (
        resolve,
        reject,
      ) => {

      try {

        const certificateCode =
            `PG-${sale.sale_id}-${Date.now()}`;        

        const doc =
            new PDFDocument({

          size: 'A4',

          margin: 50,
        });

        const buffers = [];

        doc.on(
          'data',
          buffers.push.bind(buffers),
        );

        doc.on(
          'end',
          async () => {

            try {

              const pdfBuffer =
                  Buffer.concat(
                buffers,
              );

              resolve({

                buffer:
                    pdfBuffer,
              });

            } catch (e) {

              reject(e);
            }
          }
        );

        /// 🔥 HEADER PREMIUM

        doc.rect(
          0,
          0,
          700,
          110,
        )
        .fill('#111111');

        doc.fillColor('white');

        /// 🔥 TÍTULO
        doc.fontSize(26);

        doc.text(
          'CERTIFICADO DE VENTA',
          50,
          40,
          {
            align: 'center',
          }
        );

        /// 🔥 SUBTÍTULO
        doc.fontSize(11);

        doc.fillColor('#CCCCCC');

        doc.text(
          'Plaza Ganadera • Sistema Oficial de Remates',
          50,
          75,
          {
            align: 'center',
          }
        );

        doc.moveDown(5);

        doc.fillColor('black');

        /// 🔥 INFO REMATE BOX

        doc.roundedRect(
          50,
          140,
          500,
          90,
          10,
        )
        .stroke('#D4AF37');

        doc.fontSize(12);

        doc.fillColor('#666666');

        doc.text(
          'EMPRESA',
          70,
          160,
        );

        doc.text(
          'REMATE',
          250,
          160,
        );

        doc.text(
          'FECHA',
          430,
          160,
        );

        doc.fillColor('black');

        doc.fontSize(15);

        doc.text(
          sale.company_name,
          70,
          180,
        );

        doc.text(
          sale.auction_name,
          250,
          180,
        );

        doc.text(
          sale.sale_date,
          430,
          180,
        );

        /// 🔥 BLOQUE LOTE

        doc.roundedRect(
          50,
          260,
          500,
          230,
          12,
        )
        .fillAndStroke(
          '#FAFAFA',
          '#DDDDDD',
        );

        /// 🔥 TÍTULO LOTE
        doc.fillColor('#111111');

        doc.fontSize(22);

        doc.text(
          `LOTE #${sale.lot_number}`,
          70,
          285,
        );

        /// 🔥 INFO GENERAL
        doc.fontSize(13);

        doc.fillColor('#555555');

        doc.text(
          `Tipo: ${sale.cattle_type || '-'}`,
          70,
          325,
        );

        doc.text(
          `Raza: ${sale.breed || '-'}`,
          70,
          350,
        );

        doc.text(
          `Cantidad: ${sale.quantity || '-'}`,
          70,
          375,
        );

        doc.text(
          `Peso: ${sale.weight || '-'} kg`,
          70,
          400,
        );

        doc.text(

          `Tipo Venta: ${
            sale.sale_type === 'kilo'

              ? 'Por Kilo'

              : 'Por Bulto'
          }`,

          70,
          425,
        );

        doc.text(

          sale.sale_type === 'kilo'

              ? `Precio por Kg: Bs ${formatAmount(sale.final_price)}`

              : `Precio por Bulto: Bs ${formatAmount(sale.final_price)}`,

          70,
          450,
        );        

        /// 🔥 COMPRADOR
        doc.fillColor('#111111');

        doc.fontSize(16);

        doc.text(
          `Comprador`,
          320,
          325,
        );

        doc.fontSize(18);

        doc.text(
          sale.buyer_name || '-',
          320,
          350,
        );

        /// 🔥 PRECIO FINAL
        doc.roundedRect(
          300,
          395,
          210,
          70,
          10,
        )
        .fill('#111111');

        doc.fillColor('#D4AF37');

        doc.fontSize(14);

        doc.text(
          'MONTO TOTAL',
          320,
          412,
        );

        doc.fontSize(24);

        doc.text(
          `Bs ${formatAmount(sale.total_amount)}`,
          320,
          432,
        );

        /// 🔥 RESTORE
        doc.fillColor('black');

        /// 🔥 QR VALIDACIÓN

        const qrData =
            `
        Plaza Ganadera

        Código:
        ${certificateCode}

        Comprador:
        ${sale.buyer_name || '-'}

        Lote:
        ${sale.lot_number}

        Monto:
        Bs ${formatAmount(sale.total_amount)}
        `;

        const qrImage =
            await QRCode.toDataURL(
          qrData,
        );

        const qrBase64 =
            qrImage.replace(
          /^data:image\/png;base64,/,
          '',
        );

        const qrBuffer =
            Buffer.from(
          qrBase64,
          'base64',
        );

        doc.image(
          qrBuffer,
          70,
          530,
          {
            width: 90,
          }
        );

        /// 🔥 CÓDIGO
        doc.fillColor('#444444');

        doc.fontSize(11);

        doc.text(
          'Código de Validación',
          180,
          550,
        );

        doc.fontSize(16);

        doc.fillColor('#111111');

        doc.text(
          certificateCode,
          180,
          570,
        );        

        doc.fontSize(10);

        doc.fillColor('#777777');

        doc.text(
          'Documento generado automáticamente por Plaza Ganadera.',
          50,
          760,
          {
            align: 'center',
            width: 500,
          }
        );

        doc.end();

      } catch (e) {

        reject(e);
      }
    }
  );
}

module.exports = {

  generateCertificatePdf,
};