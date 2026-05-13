// api/clientes.js
// CRUD completo de clientes

const express = require('express');
const router = express.Router();
const { autenticar } = require('../middleware/auth');
const { getDb } = require('../database/db');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(autenticar);

// GET /api/clientes - listar todos
router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const { busca, status } = req.query;

  let sql = 'SELECT * FROM clientes WHERE 1=1';
  const params = [];

  if (busca) {
    sql += ' AND (nome_responsavel LIKE ? OR nome_aluno LIKE ? OR telefone LIKE ?)';
    const termo = `%${busca}%`;
    params.push(termo, termo, termo);
  }

  if (status && ['ativa', 'atrasada', 'paga'].includes(status)) {
    sql += ' AND status = ?';
    params.push(status);
  }

  sql += ' ORDER BY nome_responsavel ASC';

  const clientes = await db.prepare(sql).all(...params);
  res.json({ sucesso: true, clientes });
}));

// GET /api/clientes/resumo - dashboard
router.get('/resumo', asyncHandler(async (req, res) => {
  const db = getDb();
  const total = (await db.prepare('SELECT COUNT(*) as c FROM clientes').get()).c;
  const atrasados = (await db.prepare("SELECT COUNT(*) as c FROM clientes WHERE status = 'atrasada'").get()).c;
  const pagos = (await db.prepare("SELECT COUNT(*) as c FROM clientes WHERE status = 'paga'").get()).c;
  const ativos = (await db.prepare("SELECT COUNT(*) as c FROM clientes WHERE status = 'ativa'").get()).c;
  const total_mensal = (await db.prepare('SELECT SUM(valor_mensalidade) as s FROM clientes').get()).s || 0;
  const recebido_mes = (await db.prepare("SELECT SUM(valor_mensalidade) as s FROM clientes WHERE status = 'paga'").get()).s || 0;

  res.json({
    sucesso: true,
    resumo: { total, atrasados, pagos, ativos, total_mensal, recebido_mes }
  });
}));

// GET /api/clientes/:id - buscar por id
router.get('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const cliente = await db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);

  if (!cliente) return res.status(404).json({ erro: 'Cliente nao encontrado' });
  res.json({ sucesso: true, cliente });
}));

// POST /api/clientes - criar
router.post('/', asyncHandler(async (req, res) => {
  const {
    nome_responsavel, telefone, cpf, endereco, nome_aluno,
    escola, rota, valor_mensalidade, vencimento, status, observacoes
  } = req.body;

  if (!nome_responsavel || !telefone || !cpf || !nome_aluno || !valor_mensalidade) {
    return res.status(400).json({ erro: 'Campos obrigatorios: nome_responsavel, telefone, cpf, nome_aluno, valor_mensalidade' });
  }

  const db = getDb();
  const existe = await db.prepare('SELECT id FROM clientes WHERE cpf = ?').get(cpf);

  if (existe) return res.status(409).json({ erro: 'CPF ja cadastrado' });

  const stmt = db.prepare(`
    INSERT INTO clientes
      (nome_responsavel, telefone, cpf, endereco, nome_aluno, escola, rota, valor_mensalidade, vencimento, status, observacoes)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = await stmt.run(
    nome_responsavel,
    telefone,
    cpf,
    endereco || '',
    nome_aluno,
    escola || '',
    rota || '',
    Number(valor_mensalidade),
    Number(vencimento) || 10,
    status || 'ativa',
    observacoes || ''
  );

  const cliente = await db.prepare('SELECT * FROM clientes WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ sucesso: true, cliente });
}));

// PUT /api/clientes/:id - editar
router.put('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const existente = await db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);

  if (!existente) return res.status(404).json({ erro: 'Cliente nao encontrado' });

  const campos = {
    nome_responsavel: req.body.nome_responsavel ?? existente.nome_responsavel,
    telefone: req.body.telefone ?? existente.telefone,
    cpf: req.body.cpf ?? existente.cpf,
    endereco: req.body.endereco ?? existente.endereco,
    nome_aluno: req.body.nome_aluno ?? existente.nome_aluno,
    escola: req.body.escola ?? existente.escola,
    rota: req.body.rota ?? existente.rota,
    valor_mensalidade: req.body.valor_mensalidade ?? existente.valor_mensalidade,
    vencimento: req.body.vencimento ?? existente.vencimento,
    status: req.body.status ?? existente.status,
    observacoes: req.body.observacoes ?? existente.observacoes
  };

  await db.prepare(`
    UPDATE clientes SET
      nome_responsavel=?, telefone=?, cpf=?, endereco=?, nome_aluno=?,
      escola=?, rota=?, valor_mensalidade=?, vencimento=?, status=?, observacoes=?
    WHERE id=?
  `).run(
    campos.nome_responsavel,
    campos.telefone,
    campos.cpf,
    campos.endereco,
    campos.nome_aluno,
    campos.escola,
    campos.rota,
    Number(campos.valor_mensalidade),
    Number(campos.vencimento),
    campos.status,
    campos.observacoes,
    req.params.id
  );

  const cliente = await db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  res.json({ sucesso: true, cliente });
}));

// DELETE /api/clientes/:id - excluir
router.delete('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const cliente = await db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);

  if (!cliente) return res.status(404).json({ erro: 'Cliente nao encontrado' });

  await db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
  res.json({ sucesso: true, mensagem: 'Cliente excluido com sucesso' });
}));

// PATCH /api/clientes/:id/status - atualizar so o status
router.patch('/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!['ativa', 'atrasada', 'paga'].includes(status)) {
    return res.status(400).json({ erro: 'Status invalido' });
  }

  const db = getDb();
  await db.prepare('UPDATE clientes SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ sucesso: true, mensagem: 'Status atualizado' });
}));

module.exports = router;
