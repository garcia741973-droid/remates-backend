const express = require('express');

const router = express.Router();

router.get('/callback', (req, res) => {
  const {
    error,
    error_description: errorDescription,
  } = req.query;

  if (error) {
    console.error(
      '❌ META WHATSAPP CALLBACK ERROR',
      {
        error,
        errorDescription,
      }
    );

    return res.status(400).send(
      'No se pudo completar la conexión con WhatsApp.'
    );
  }

  console.log(
    '✅ META WHATSAPP CALLBACK RECIBIDO',
    {
      hasCode: Boolean(req.query.code),
      queryKeys: Object.keys(req.query),
    }
  );

  return res.status(200).send(
    'Conexión con WhatsApp recibida correctamente. Ya puedes cerrar esta ventana.'
  );
});

module.exports = router;
