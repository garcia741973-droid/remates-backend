const jwt = require('jsonwebtoken');

exports.requireAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 🔥 INYECTAMOS DATOS CLAVE
    req.user = decoded;

    next();

  } catch (error) {
    console.error(error);
    return res.status(401).json({ error: 'Token inválido' });
  }
};