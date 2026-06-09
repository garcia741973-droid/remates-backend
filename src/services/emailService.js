const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({

  host: process.env.SMTP_HOST,

  port: Number(process.env.SMTP_PORT),

  secure: process.env.SMTP_SECURE === 'true',

  auth: {

    user: process.env.SMTP_USER,

    pass: process.env.SMTP_PASS,
  },
});

async function sendResetCode(
  email,
  code,
) {

  await transporter.sendMail({

    from: `"Plaza Ganadera" <${process.env.SMTP_USER}>`,

    to: email,

    subject: 'Código de recuperación',

    html: `
      <div style="font-family:Arial">

        <h2>Plaza Ganadera</h2>

        <p>Tu código de recuperación es:</p>

        <h1>${code}</h1>

        <p>
          Este código expira en 10 minutos.
        </p>

      </div>
    `,
  });
}

module.exports = {
  sendResetCode,
};