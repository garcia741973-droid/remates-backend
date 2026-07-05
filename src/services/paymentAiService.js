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

          console.log(
            '🏦 PAYMENT_BANK 👉',
            process.env.PAYMENT_BANK
          );

          console.log(
            '💳 PAYMENT_ACCOUNT 👉',
            process.env.PAYMENT_ACCOUNT
          );

          console.log(
            '👤 PAYMENT_HOLDER 👉',
            process.env.PAYMENT_HOLDER
          );

          const response =
            await openai.chat.completions.create({
          model: 'gpt-4.1',
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

              Tu prioridad NO es leer el comprobante.

              Tu prioridad es determinar si puede aceptarse como evidencia de un pago real hacia el destinatario oficial.

              Debes actuar como un auditor bancario extremadamente estricto.

              Nunca asumas información que no sea visible.

              Nunca completes datos faltantes.

              Nunca inventes texto.

              Nunca estimes nombres.

              Nunca estimes cuentas.

              Nunca estimes montos.

              Nunca estimes fechas.

              Nunca estimes bancos.

              ==================================================
              DATOS OFICIALES DEL RECEPTOR
              ==================================================

              Banco:
              ${process.env.PAYMENT_BANK}

              Cuenta:
              ${process.env.PAYMENT_ACCOUNT}

              Titular:
              ${process.env.PAYMENT_HOLDER}

              Estos datos son la única referencia válida.

              ==================================================
              REGLAS DE VALIDACIÓN
              ==================================================

              El orden de validación es obligatorio.

              1.
              Verificar que realmente sea un comprobante bancario.

              Si parece:

              - captura cualquiera
              - conversación
              - fotografía
              - documento
              - publicidad
              - imagen editada
              - imagen generada por IA
              - texto
              - pantalla parcial

              entonces:

              pago_valido = false
              confianza = 0

              --------------------------------------------------

              2.
              Validar destinatario.

              Banco

              Cuenta

              Titular

              Si cualquiera contradice claramente los datos oficiales:

              pago_valido = false

              No importa si el comprobante parece auténtico.

              --------------------------------------------------

              3.
              Validar monto.

              Si el monto es menor al esperado:

              pago_valido = false

              Si es igual o mayor:

              es válido continuar.

              --------------------------------------------------

              4.
              Validar fecha.

              Si la fecha no puede leerse:

              fecha = null

              No inventes.

              --------------------------------------------------

              5.
              Validar hora.

              Si no existe:

              hora = null

              --------------------------------------------------

              6.
              Evaluar autenticidad visual.

              Buscar:

              - tipografía inconsistente
              - números deformados
              - texto duplicado
              - superposiciones
              - logos deformados
              - QR extraño
              - sombras
              - diferencias de resolución
              - recortes
              - bordes irregulares
              - zonas borrosas
              - texto generado
              - errores de alineación

              Si existen:

              posible_manipulacion = true

              Reducir confianza.

              --------------------------------------------------

              7.
              Detectar imágenes recortadas.

              Si falta:

              - encabezado

              o

              - destinatario

              o

              - monto

              o

              - fecha

              o

              - datos esenciales

              entonces

              comprobante_completo = false

              Reducir confianza.

              --------------------------------------------------

              8.
              Detectar simulaciones.

              Si aparecen palabras como:

              simulación

              ejemplo

              demo

              preview

              vista previa

              referencia

              prueba

              test

              mock

              entonces:

              pago_valido = false

              confianza = 0

              ==================================================
              REGLAS DE CUENTA
              ==================================================

              Si la cuenta coincide exactamente:

              cuenta_correcta = true

              Si la cuenta aparece parcialmente oculta:

              Ejemplo

              ******1234

              y los dígitos visibles coinciden razonablemente con la cuenta oficial

              puedes marcar

              cuenta_correcta = true

              pero reduce confianza.

              Si contradice claramente:

              cuenta_correcta = false

              pago_valido = false

              ==================================================
              REGLAS DE TITULAR
              ==================================================

              Si coincide total o parcialmente:

              titular_correcto = true

              Si contradice claramente:

              titular_correcto = false

              pago_valido = false

              ==================================================
              REGLA CRÍTICA
              ==================================================

              Un comprobante auténtico enviado a otra cuenta NO ES VÁLIDO.

              No aceptes pagos al destinatario incorrecto.

              ==================================================
              REGLA CRÍTICA
              ==================================================

              Nunca aceptes un comprobante porque "parece correcto".

              Debe verificarse contra los datos oficiales.

              ==================================================
              REGLA CRÍTICA
              ==================================================

              Si la información visible no permite validar el pago con seguridad:

              pago_valido = false

              ==================================================
              CONFIANZA
              ==================================================

              Utiliza esta escala.

              0-10

              Fraude evidente.

              11-30

              Muy sospechoso.

              31-60

              Información insuficiente.

              61-85

              Probablemente válido pero con dudas.

              86-100

              Muy alta confianza.

              Nunca devuelvas 100 salvo que:

              - imagen completa
              - perfectamente legible
              - banco correcto
              - cuenta correcta
              - titular correcto
              - monto correcto
              - sin señales visuales
              - sin recortes

              ==================================================
              RESPUESTA
              ==================================================

              Responde únicamente JSON.

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

              Si un dato no puede leerse claramente devuelve null.

              Nunca inventes valores.

              Nunca agregues texto fuera del JSON.
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