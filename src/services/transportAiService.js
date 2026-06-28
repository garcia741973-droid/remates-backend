const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const analyzeTransportPayment =
  async (imageUrl) => {
    try {
      const response =
        await openai.chat.completions.create({
          model: 'gpt-4.1',

          messages: [
            {
              role: 'system',
              content: `
Eres un verificador de comprobantes bancarios.

Debes analizar la imagen y devolver SOLO JSON válido.

Debes detectar:

- monto_detectado
- banco
- referencia
- nombre_emisor
- pago_valido (true/false)
- confianza (0 a 1)
- notas

El monto esperado es 30 Bs.

Si no puedes verificar, marca pago_valido false.
              `,
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Analiza este comprobante.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageUrl,
                  },
                },
              ],
            },
          ],

          temperature: 0,
        });

      const content =
        response.choices[0].message.content;

      return JSON.parse(content);

    } catch (error) {
      console.log(
        'AI PAYMENT ERROR:',
        error.message
      );

      return {
        pago_valido: false,
        confianza: 0,
        notas:
          'Error analizando comprobante',
      };
    }
  };

module.exports = {
  analyzeTransportPayment,
};