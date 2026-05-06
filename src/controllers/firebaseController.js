const admin = require('firebase-admin');

exports.sendNotification = async (req, res) => {
  try {
    const { token, title, body, data } = req.body;

    const message = {
      token,
      notification: {
        title,
        body,
      },
      data: data || {},
    };

    const response = await admin.messaging().send(message);

    res.json({
      success: true,
      response,
    });
  } catch (e) {
    console.error("FIREBASE SEND ERROR:", e);

    res.status(500).json({
      error: e.message,
    });
  }
};