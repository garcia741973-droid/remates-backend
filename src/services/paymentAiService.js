const OpenAI = require('openai');

const openai =
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

const analyzePaymentProof =
  async ({
    proofImageUrl,
    expectedAmount,
  }) => {
    try {
      const response =
        await openai.chat.completions.create({
          model: 'gpt-4.1-mini',
          messages: [
            {
              role: 'system',
              content: `
Analiza este comprobante bancario boliviano.

Debes extraer:

- monto_detectado
- banco
- referencia
- nombre_emisor
- fecha
- hora

Compara contra monto esperado.

Responde SOLO JSON:

{
  "monto_detectado": number,
  "banco": string,
  "referencia": string,
  "nombre_emisor": string,
  "fecha": "YYYY-MM-DD",
  "hora": "HH:mm",
  "pago_valido": true/false,
  "confianza": number,
  "notas": string
}
              `,
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text:
                    `Monto esperado: ${expectedAmount} Bs`,
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: proofImageUrl,
                  },
                },
              ],
            },
          ],
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
  analyzePaymentProof,
};