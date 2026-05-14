const admin = require('firebase-admin');

let serviceAccount;

try {

  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT no existe en Render'
    );
  }

  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT.trim();

  /// 🔥 SI VIENE COMO BASE64
  if (!raw.startsWith('{')) {

    const decoded =
      Buffer.from(raw, 'base64').toString('utf8');

    serviceAccount =
      JSON.parse(decoded);

  } else {

    /// 🔥 SI VIENE COMO JSON NORMAL
    serviceAccount =
      JSON.parse(raw);
  }

  if (!admin.apps.length) {

    admin.initializeApp({
      credential:
        admin.credential.cert(serviceAccount),
    });
  }

  console.log(
    '🔥 Firebase Admin inicializado correctamente',
  );

} catch (error) {

  console.error(
    '❌ FIREBASE INIT ERROR:',
    error.message,
  );

  throw error;
}

module.exports = admin;