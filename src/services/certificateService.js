const PDFDocument = require('pdfkit');


async function generateCertificatePdf(
  sale,
) {

  return new Promise(
    (resolve, reject) => {

      try {

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

        /// 🔥 INFO REMATE
        doc.fontSize(14);

        doc.text(
          `Empresa: ${sale.company_name}`,
        );

        doc.text(
          `Remate: ${sale.auction_name}`,
        );

        doc.text(
          `Fecha: ${sale.sale_date}`,
        );

        doc.moveDown();

        /// 🔥 LOTE
        doc.fontSize(18);

        doc.text(
          `Lote #${sale.lot_number}`,
        );

        doc.moveDown();

        doc.fontSize(14);

        doc.text(
          `Tipo: ${sale.cattle_type || '-'}`,
        );

        doc.text(
          `Raza: ${sale.breed || '-'}`,
        );

        doc.text(
          `Cantidad: ${sale.quantity || '-'}`,
        );

        doc.text(
          `Peso: ${sale.weight || '-'} kg`,
        );

        doc.moveDown();

        /// 🔥 VENTA
        doc.fontSize(16);

        doc.text(
          `Comprador: ${sale.buyer_name || '-'}`,
        );

        doc.text(
          `Precio Final: Bs ${sale.final_price}`,
        );

        doc.text(
          `Monto Total: Bs ${sale.total_amount}`,
        );

        doc.text(
          `Tipo Venta: ${sale.sale_type}`,
        );

        doc.moveDown(3);

        doc.fontSize(12);

        doc.text(
          'Documento generado automáticamente por Plaza Ganadera.',
          {
            align: 'center',
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