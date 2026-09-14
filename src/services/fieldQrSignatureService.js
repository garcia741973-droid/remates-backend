const crypto = require('crypto');

const QR_VERSION = 2;
const QR_TYPE =
  'slaughterhouse_field_authorization';

function getPrivateKey() {
  const privateKeyB64 =
    process.env.FIELD_QR_PRIVATE_KEY_B64;

  if (!privateKeyB64) {
    throw new Error(
      'FIELD_QR_PRIVATE_KEY_B64 no está configurada'
    );
  }

  const privatePem = Buffer.from(
    privateKeyB64,
    'base64'
  );

  return crypto.createPrivateKey(
    privatePem
  );
}

function getKeyId() {
  const keyId =
    process.env.FIELD_QR_KEY_ID;

  if (!keyId) {
    throw new Error(
      'FIELD_QR_KEY_ID no está configurada'
    );
  }

  return keyId;
}

function createSignedFieldQrPayload({
  companyId,
  purchaseLotId,
  authorizationNumber,
  publicCode,
  token,
  sellerPersonId,
  expiresAt,
}) {
  const keyId = getKeyId();

  const signedData = {
    version: QR_VERSION,

    type: QR_TYPE,

    key_id: keyId,

    company_id:
      Number(companyId),

    purchase_lot_id:
      Number(purchaseLotId),

    authorization_number:
      Number(authorizationNumber),

    public_code:
      String(publicCode),

    token:
      String(token),

    seller_person_id:
      sellerPersonId !== null &&
      sellerPersonId !== undefined
        ? Number(sellerPersonId)
        : null,

    purpose:
      'field_load_close',

    expires_at:
      expiresAt instanceof Date
        ? expiresAt.toISOString()
        : String(expiresAt),
  };

  const signedJson =
    JSON.stringify(signedData);

  const payloadB64 =
    Buffer.from(
      signedJson,
      'utf8'
    ).toString('base64url');

  const signature =
    crypto.sign(
      null,
      Buffer.from(
        payloadB64,
        'utf8'
      ),
      getPrivateKey()
    ).toString('base64url');

  const qrPayloadObject = {
    version: QR_VERSION,

    type: QR_TYPE,

    key_id: keyId,

    payload_b64:
      payloadB64,

    signature,
  };

  return {
    qrPayloadObject,

    qrPayload:
      JSON.stringify(
        qrPayloadObject
      ),

    signedData,
  };
}

function verifySignedFieldQrPayload(
  qrPayload
) {
  let outer;

  try {
    outer =
      JSON.parse(
        qrPayload
      );
  } catch {
    throw new Error(
      'El QR no contiene un JSON válido'
    );
  }

  if (
    outer?.version !==
      QR_VERSION ||
    outer?.type !==
      QR_TYPE
  ) {
    throw new Error(
      'Tipo o versión de QR inválidos'
    );
  }

  const keyId =
    getKeyId();

  if (
    outer?.key_id !==
      keyId
  ) {
    throw new Error(
      'La clave firmante del QR no es válida'
    );
  }

  if (
    typeof outer.payload_b64 !==
      'string' ||
    !outer.payload_b64 ||
    typeof outer.signature !==
      'string' ||
    !outer.signature
  ) {
    throw new Error(
      'El QR firmado está incompleto'
    );
  }

  const privateKey =
    getPrivateKey();

  const publicKey =
    crypto.createPublicKey(
      privateKey
    );

  const signatureValid =
    crypto.verify(
      null,
      Buffer.from(
        outer.payload_b64,
        'utf8'
      ),
      publicKey,
      Buffer.from(
        outer.signature,
        'base64url'
      )
    );

  if (!signatureValid) {
    throw new Error(
      'La firma digital del QR no es válida'
    );
  }

  let signedData;

  try {
    signedData =
      JSON.parse(
        Buffer.from(
          outer.payload_b64,
          'base64url'
        ).toString('utf8')
      );
  } catch {
    throw new Error(
      'El contenido firmado del QR no es válido'
    );
  }

  if (
    signedData?.version !==
      QR_VERSION ||
    signedData?.type !==
      QR_TYPE ||
    signedData?.key_id !==
      keyId
  ) {
    throw new Error(
      'El contenido firmado del QR no coincide'
    );
  }

  if (
    signedData.version !==
      outer.version ||
    signedData.type !==
      outer.type ||
    signedData.key_id !==
      outer.key_id
  ) {
    throw new Error(
      'El encabezado del QR fue alterado'
    );
  }

  return {
    outer,
    signedData,
  };
}

module.exports = {
  QR_VERSION,
  QR_TYPE,
  createSignedFieldQrPayload,
  verifySignedFieldQrPayload,
};