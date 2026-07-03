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

              Debes determinar si parece auténtico o presenta señales de fraude.

              Datos oficiales del receptor:

              Banco: ${process.env.PAYMENT_BANK}
              Cuenta: ${process.env.PAYMENT_ACCOUNT}
              Titular: ${process.env.PAYMENT_HOLDER}

              Debes extraer:

              - monto_detectado
              - banco
              - referencia
              - nombre_emisor
              - fecha
              - hora
              - cuenta_destino
              - titular_destino

              Valida:

              1. Si el comprobante está completo o parece recortado.
              2. Si hay signos de edición o manipulación digital.
              3. Si la información visible es suficiente para validar.
              4. Si el monto coincide o supera el monto esperado.
              5. Si la cuenta destino coincide exactamente.
              6. Si el titular destino coincide.
              7. Si el comprobante parece reciente y coherente.

              Responde SOLO JSON:

              {
                "monto_detectado": number,
                "banco": string,
                "referencia": string,
                "nombre_emisor": string,
                "fecha": "YYYY-MM-DD",
                "hora": "HH:mm",
                "cuenta_destino": string,
                "titular_destino": string,
                "pago_valido": true,
                "comprobante_completo": true,
                "cuenta_correcta": true,
                "titular_correcto": true,
                "posible_manipulacion": false,
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

        const cleanContent =
        content
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();

        console.log(
        '🤖 RAW AI RESPONSE:',
        content
        );

        console.log(
        '🧹 CLEAN AI RESPONSE:',
        cleanContent
        );

        return JSON.parse(
        cleanContent
        );

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