// api/auth.js
// Rota de autenticação administrativa

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database/db');
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    return res.status(400).json({ erro: 'Usuário e senha são obrigatórios' });
  }

  const db = getDb();
  const admin = await db.prepare('SELECT * FROM admin WHERE usuario = ?').get(usuario);

  if (!admin) {
    return res.status(401).json({ erro: 'Credenciais inválidas' });
  }

  const senhaCorreta = bcrypt.compareSync(senha, admin.senha_hash);
  if (!senhaCorreta) {
    return res.status(401).json({ erro: 'Credenciais inválidas' });
  }

  const token = jwt.sign(
    { id: admin.id, usuario: admin.usuario },
    process.env.JWT_SECRET || 'chave_secreta_dev',
    { expiresIn: '12h' }
  );

  res.json({
    sucesso: true,
    token,
    usuario: admin.usuario,
    expira: '12h'
  });
}));

// POST /api/auth/trocar-senha
router.post('/trocar-senha', require('../middleware/auth').autenticar, asyncHandler(async (req, res) => {
  const { senha_atual, senha_nova } = req.body;

  if (!senha_atual || !senha_nova || senha_nova.length < 6) {
    return res.status(400).json({ erro: 'Senha nova deve ter ao menos 6 caracteres' });
  }

  const db = getDb();
  const admin = await db.prepare('SELECT * FROM admin WHERE id = ?').get(req.admin.id);

  if (!bcrypt.compareSync(senha_atual, admin.senha_hash)) {
    return res.status(401).json({ erro: 'Senha atual incorreta' });
  }

  const novoHash = bcrypt.hashSync(senha_nova, 10);
  await db.prepare('UPDATE admin SET senha_hash = ? WHERE id = ?').run(novoHash, req.admin.id);

  res.json({ sucesso: true, mensagem: 'Senha alterada com sucesso' });
}));

module.exports = router;
