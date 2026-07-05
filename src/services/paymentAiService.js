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
              Analiza este comprobante de pago boliviano.

              Puede ser:
              - transferencia bancaria
              - QR bancario
              - Yape
              - Tigo Money
              - comprobante móvil oficial

              Debes validar autenticidad y coincidencia del receptor.

              Debes determinar si parece auténtico o presenta señales de fraude.

              Datos oficiales del receptor:

              Banco: ${process.env.PAYMENT_BANK}
              Cuenta: ${process.env.PAYMENT_ACCOUNT}
              Titular: ${process.env.PAYMENT_HOLDER}

              REGLA CRÍTICA:

              Nunca inventes datos.

              Si la imagen NO es claramente un comprobante bancario real o no contiene información suficiente y legible:

              - pago_valido = false
              - confianza = 0
              - comprobante_completo = false
              - posible_manipulacion = true

              Y en "notas" explica por qué.

              Si no puedes leer un dato, devuelve null.

              Nunca supongas banco, referencia, nombres, cuentas o montos.
              Nunca completes información faltante con estimaciones.

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

              0. Primero determina si la imagen realmente corresponde a un comprobante bancario.
              1. Si el comprobante está completo o parece recortado.
              2. Si hay signos de edición o manipulación digital.
              3. Si la información visible es suficiente para validar.
              4. Si el monto coincide o supera el monto esperado.
              5. Si la cuenta destino coincide exactamente.
              6. Si el titular destino coincide.
              7. Si la fecha y hora parecen recientes y coherentes.
              8. Si el diseño visual parece consistente con un comprobante bancario real.
              9. Si hay tipografías extrañas, textos superpuestos, logos alterados o estructuras poco naturales.
              10. Si hay mensajes ambiguos como "solo referencia", "simulación", "ejemplo", "vista previa" o similares.
              11. Si el comprobante parece generado artificialmente o reconstruido digitalmente.

              IMPORTANTE:

              Aunque monto, cuenta y titular coincidan, si detectas señales visuales sospechosas debes marcar:

              "posible_manipulacion": true

              y reducir la confianza.

              Si la imagen no parece un comprobante bancario real, responde:

              "pago_valido": false
              "confianza": 0

              y explica claramente el motivo.

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
                    `Monto esperado: ${expectedAmount} Bs.
                  Fecha actual del sistema: ${new Date().toISOString().split('T')[0]}`,
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