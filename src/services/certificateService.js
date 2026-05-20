const PDFDocument = require('pdfkit');

const streamifier = require('streamifier');

const cloudinary = require('../config/cloudinary');

async function uploadBufferToCloudinary(
  buffer,
  filename,
) {

  return new Promise(
    (resolve, reject) => {

      const stream =
          cloudinary.uploader.upload_stream(

        {
          resource_type: 'raw',

          type: 'upload',
          access_mode: 'public',

          folder:
              'auction_certificates',

          public_id: `${filename}.pdf`,
        },

        (error, result) => {

          if (error) {

            reject(error);

          } else {

            resolve(result);
          }
        }
      );

      streamifier
          .createReadStream(buffer)
          .pipe(stream);
    }
  );
}

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

              const upload =
                  await uploadBufferToCloudinary(

                pdfBuffer,

                `certificate_sale_${sale.sale_id}`,
              );

              resolve({
                url:
                    upload.secure_url,
              });

            } catch (e) {

              reject(e);
            }
          }
        );

        /// 🔥 HEADER
        doc.fontSize(24);

        doc.text(
          'CERTIFICADO DE VENTA',
          {
            align: 'center',
          }
        );

        doc.moveDown(2);

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