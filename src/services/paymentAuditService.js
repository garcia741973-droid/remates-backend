const crypto = require('crypto');

const buildPaymentAudit = ({
  aiResult,
  proofImageUrl,
}) => {
  return {
    detected_amount:
      aiResult.monto_detectado ?? null,

    detected_bank:
      aiResult.banco ?? null,

    detected_reference:
      aiResult.referencia ?? null,

    detected_sender:
      aiResult.nombre_emisor ?? null,

    detected_date:
      aiResult.fecha ?? null,

    detected_time:
      aiResult.hora ?? null,

    destination_account:
      aiResult.cuenta_destino ?? null,

    destination_holder:
      aiResult.titular_destino ?? null,

    account_match:
      aiResult.cuenta_correcta ?? false,

    holder_match:
      aiResult.titular_correcto ?? false,

    proof_complete:
      aiResult.comprobante_completo ?? false,

    possible_manipulation:
      aiResult.posible_manipulacion ?? false,

    payment_valid:
      aiResult.pago_valido ?? false,

    ai_verified:
      aiResult.pago_valido ?? false,

    ai_confidence:
      aiResult.confianza ?? 0,

    ai_notes:
      aiResult.notas ?? null,

    ai_model:
      'gpt-4.1',

    ai_json:
      aiResult,

    proof_hash:
      crypto
        .createHash('sha256')
        .update(proofImageUrl || '')
        .digest('hex'),
  };
};

module.exports = {
  buildPaymentAudit,
};