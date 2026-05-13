// api/auth.js
// Rotas de autenticacao administrativa em Postgres/Neon

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { autenticar } = require('../middleware/auth');

const router = express.Router();
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.post('/login', asyncHandler(async (req, res) => {
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    return res.status(400).json({ erro: 'Usuario e senha sao obrigatorios' });
  }

  const result = await db.query('SELECT * FROM admin WHERE usuario = $1 LIMIT 1', [usuario]);
  const admin = result.rows[0];

  if (!admin) {
    return res.status(401).json({ erro: 'Credenciais invalidas' });
  }

  const senhaCorreta = bcrypt.compareSync(senha, admin.senha_hash);
  if (!senhaCorreta) {
    return res.status(401).json({ erro: 'Credenciais invalidas' });
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

router.post('/trocar-senha', autenticar, asyncHandler(async (req, res) => {
  const { senha_atual, senha_nova } = req.body;

  if (!senha_atual || !senha_nova || senha_nova.length < 6) {
    return res.status(400).json({ erro: 'Senha nova deve ter ao menos 6 caracteres' });
  }

  const result = await db.query('SELECT * FROM admin WHERE id = $1 LIMIT 1', [req.admin.id]);
  const admin = result.rows[0];

  if (!admin) {
    return res.status(404).json({ erro: 'Administrador nao encontrado' });
  }

  if (!bcrypt.compareSync(senha_atual, admin.senha_hash)) {
    return res.status(401).json({ erro: 'Senha atual incorreta' });
  }

  const novoHash = bcrypt.hashSync(senha_nova, 10);
  await db.query('UPDATE admin SET senha_hash = $1 WHERE id = $2', [novoHash, req.admin.id]);

  res.json({ sucesso: true, mensagem: 'Senha alterada com sucesso' });
}));

module.exports = router;
