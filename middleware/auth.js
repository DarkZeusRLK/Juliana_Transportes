// middleware/auth.js
// Middleware de verificação de JWT

const jwt = require('jsonwebtoken');

function autenticar(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ erro: 'Token não fornecido' });
  }

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'chave_secreta_dev');
    req.admin = payload;
    next();
  } catch (err) {
    return res.status(401).json({ erro: 'Token inválido ou expirado' });
  }
}

module.exports = { autenticar };