// api/pagamentos.js
// Log e gestao de pagamentos

const express = require('express');
const router = express.Router();
const { autenticar } = require('../middleware/auth');
const { getDb } = require('../database/db');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(autenticar);

// GET /api/pagamentos - listar todos
router.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const { status, cliente_id } = req.query;

  let sql = 'SELECT * FROM pagamentos WHERE 1=1';
  const params = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }

  if (cliente_id) {
    sql += ' AND cliente_id = ?';
    params.push(cliente_id);
  }

  sql += ' ORDER BY data_criacao DESC';

  const pagamentos = await db.prepare(sql).all(...params);
  res.json({ sucesso: true, pagamentos });
}));

// GET /api/pagamentos/resumo
router.get('/resumo', asyncHandler(async (req, res) => {
  const db = getDb();
  const total_pago = (await db.prepare("SELECT SUM(valor) as s FROM pagamentos WHERE status='pago'").get()).s || 0;
  const total_pendente = (await db.prepare("SELECT SUM(valor) as s FROM pagamentos WHERE status='pendente'").get()).s || 0;
  const qtd_pago = (await db.prepare("SELECT COUNT(*) as c FROM pagamentos WHERE status='pago'").get()).c;
  const qtd_pendente = (await db.prepare("SELECT COUNT(*) as c FROM pagamentos WHERE status='pendente'").get()).c;
  const qtd_falha = (await db.prepare("SELECT COUNT(*) as c FROM pagamentos WHERE status='falha'").get()).c;

  res.json({ sucesso: true, resumo: { total_pago, total_pendente, qtd_pago, qtd_pendente, qtd_falha } });
}));

// GET /api/pagamentos/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const pag = await db.prepare('SELECT * FROM pagamentos WHERE id = ?').get(req.params.id);

  if (!pag) return res.status(404).json({ erro: 'Pagamento nao encontrado' });
  res.json({ sucesso: true, pagamento: pag });
}));

// POST /api/pagamentos - criar pagamento manual
router.post('/', asyncHandler(async (req, res) => {
  const { cliente_id, valor, forma_pagamento } = req.body;
  if (!valor) return res.status(400).json({ erro: 'Valor obrigatorio' });

  const db = getDb();
  let nome_cliente = 'Avulso';

  if (cliente_id) {
    const cliente = await db.prepare('SELECT nome_responsavel FROM clientes WHERE id = ?').get(cliente_id);
    if (cliente) nome_cliente = cliente.nome_responsavel;
  }

  const result = await db.prepare(`
    INSERT INTO pagamentos (cliente_id, nome_cliente, valor, forma_pagamento, status)
    VALUES (?, ?, ?, ?, 'pendente')
  `).run(cliente_id || null, nome_cliente, Number(valor), forma_pagamento || 'pix');

  const pagamento = await db.prepare('SELECT * FROM pagamentos WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ sucesso: true, pagamento });
}));

// PATCH /api/pagamentos/:id/status
router.patch('/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!['pendente', 'pago', 'falha'].includes(status)) {
    return res.status(400).json({ erro: 'Status invalido' });
  }

  const db = getDb();
  const data_pagamento = status === 'pago' ? new Date().toISOString() : null;

  await db.prepare('UPDATE pagamentos SET status = ?, data_pagamento = ? WHERE id = ?')
    .run(status, data_pagamento, req.params.id);

  res.json({ sucesso: true, mensagem: 'Status atualizado' });
}));

module.exports = router;
