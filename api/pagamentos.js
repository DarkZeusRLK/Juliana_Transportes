// api/pagamentos.js
// Log e gestao de pagamentos em Postgres/Neon

const express = require('express');
const router = express.Router();
const { autenticar } = require('../middleware/auth');
const db = require('../database/db');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(autenticar);

router.get('/', asyncHandler(async (req, res) => {
  const { status, cliente_id } = req.query;

  let sql = 'SELECT * FROM pagamentos WHERE 1=1';
  const params = [];

  if (status) {
    params.push(status);
    sql += ` AND status = $${params.length}`;
  }

  if (cliente_id) {
    params.push(cliente_id);
    sql += ` AND cliente_id = $${params.length}`;
  }

  sql += ' ORDER BY data_criacao DESC';

  const result = await db.query(sql, params);
  res.json({ sucesso: true, pagamentos: result.rows });
}));

router.get('/resumo', asyncHandler(async (req, res) => {
  const totalPago = await db.query("SELECT SUM(valor) as s FROM pagamentos WHERE status='pago'");
  const totalPendente = await db.query("SELECT SUM(valor) as s FROM pagamentos WHERE status='pendente'");
  const qtdPago = await db.query("SELECT COUNT(*) as c FROM pagamentos WHERE status='pago'");
  const qtdPendente = await db.query("SELECT COUNT(*) as c FROM pagamentos WHERE status='pendente'");
  const qtdFalha = await db.query("SELECT COUNT(*) as c FROM pagamentos WHERE status='falha'");

  res.json({
    sucesso: true,
    resumo: {
      total_pago: parseFloat(totalPago.rows[0].s || 0),
      total_pendente: parseFloat(totalPendente.rows[0].s || 0),
      qtd_pago: parseInt(qtdPago.rows[0].c, 10),
      qtd_pendente: parseInt(qtdPendente.rows[0].c, 10),
      qtd_falha: parseInt(qtdFalha.rows[0].c, 10)
    }
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const result = await db.query('SELECT * FROM pagamentos WHERE id = $1 LIMIT 1', [req.params.id]);
  const pagamento = result.rows[0];

  if (!pagamento) return res.status(404).json({ erro: 'Pagamento nao encontrado' });
  res.json({ sucesso: true, pagamento });
}));

router.post('/', asyncHandler(async (req, res) => {
  const { cliente_id, valor, forma_pagamento } = req.body;

  if (!valor) return res.status(400).json({ erro: 'Valor obrigatorio' });

  let nomeCliente = 'Avulso';
  if (cliente_id) {
    const cliente = await db.query('SELECT nome_responsavel FROM clientes WHERE id = $1 LIMIT 1', [cliente_id]);
    if (cliente.rows[0]) nomeCliente = cliente.rows[0].nome_responsavel;
  }

  const result = await db.query(`
    INSERT INTO pagamentos (cliente_id, nome_cliente, valor, forma_pagamento, status)
    VALUES ($1, $2, $3, $4, 'pendente')
    RETURNING *
  `, [cliente_id || null, nomeCliente, Number(valor), forma_pagamento || 'pix']);

  res.status(201).json({ sucesso: true, pagamento: result.rows[0] });
}));

router.patch('/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body;

  if (!['pendente', 'pago', 'falha'].includes(status)) {
    return res.status(400).json({ erro: 'Status invalido' });
  }

  const dataPagamento = status === 'pago' ? new Date().toISOString() : null;

  const result = await db.query(`
    UPDATE pagamentos
    SET status = $1, data_pagamento = $2
    WHERE id = $3
    RETURNING id
  `, [status, dataPagamento, req.params.id]);

  if (result.rowCount === 0) {
    return res.status(404).json({ erro: 'Pagamento nao encontrado' });
  }

  res.json({ sucesso: true, mensagem: 'Status atualizado' });
}));

module.exports = router;
