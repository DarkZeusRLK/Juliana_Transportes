// api/clientes.js - Versão Neon/Postgres
const express = require('express');
const router = express.Router();
const { autenticar } = require('../middleware/auth');
const db = require('../database/db'); // Importando o pool que criamos

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(autenticar);

// GET /api/clientes - listar todos
router.get('/', asyncHandler(async (req, res) => {
    const { busca, status } = req.query;
    let sql = 'SELECT * FROM clientes WHERE 1=1';
    const params = [];

    if (busca) {
        // No Postgres usamos ILIKE para busca case-insensitive (ignora maiúsculas/minúsculas)
        params.push(`%${busca}%`);
        sql += ` AND (nome_responsavel ILIKE $${params.length} OR nome_aluno ILIKE $${params.length} OR telefone ILIKE $${params.length})`;
    }

    if (status && ['ativa', 'atrasada', 'paga'].includes(status)) {
        params.push(status);
        sql += ` AND status = $${params.length}`;
    }

    sql += ' ORDER BY nome_responsavel ASC';

    const result = await db.query(sql, params);
    res.json({ sucesso: true, clientes: result.rows });
}));

// GET /api/clientes/resumo - dashboard
router.get('/resumo', asyncHandler(async (req, res) => {
    // No Postgres, executamos as queries e pegamos result.rows[0]
    const total = await db.query('SELECT COUNT(*) as c FROM clientes');
    const atrasados = await db.query("SELECT COUNT(*) as c FROM clientes WHERE status = 'atrasada'");
    const pagos = await db.query("SELECT COUNT(*) as c FROM clientes WHERE status = 'paga'");
    const ativos = await db.query("SELECT COUNT(*) as c FROM clientes WHERE status = 'ativa'");
    const mensal = await db.query('SELECT SUM(valor_mensalidade) as s FROM clientes');
    const recebido = await db.query("SELECT SUM(valor_mensalidade) as s FROM clientes WHERE status = 'paga'");

    res.json({
        sucesso: true,
        resumo: {
            total: parseInt(total.rows[0].c),
            atrasados: parseInt(atrasados.rows[0].c),
            pagos: parseInt(pagos.rows[0].c),
            ativos: parseInt(ativos.rows[0].c),
            total_mensal: parseFloat(mensal.rows[0].s || 0),
            recebido_mes: parseFloat(recebido.rows[0].s || 0)
        }
    });
}));

// GET /api/clientes/:id - buscar por id
router.get('/:id', asyncHandler(async (req, res) => {
    const result = await db.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ erro: 'Cliente nao encontrado' });
    res.json({ sucesso: true, cliente: result.rows[0] });
}));

// POST /api/clientes - criar
router.post('/', asyncHandler(async (req, res) => {
    const {
        nome_responsavel, telefone, cpf, endereco, nome_aluno,
        escola, rota, valor_mensalidade, vencimento, status, observacoes
    } = req.body;

    if (!nome_responsavel || !telefone || !cpf || !nome_aluno || !valor_mensalidade) {
        return res.status(400).json({ erro: 'Campos obrigatorios!' });
    }

    const existe = await db.query('SELECT id FROM clientes WHERE cpf = $1', [cpf]);
    if (existe.rows.length > 0) return res.status(409).json({ erro: 'CPF ja cadastrado' });

    const sql = `
        INSERT INTO clientes
            (nome_responsavel, telefone, cpf, endereco, nome_aluno, escola, rota, valor_mensalidade, vencimento, status, observacoes)
        VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
    `;

    const result = await db.query(sql, [
        nome_responsavel, telefone, cpf, endereco || '', nome_aluno,
        escola || '', rota || '', Number(valor_mensalidade),
        Number(vencimento) || 10, status || 'ativa', observacoes || ''
    ]);

    res.status(201).json({ sucesso: true, cliente: result.rows[0] });
}));

// PUT /api/clientes/:id - editar
router.put('/:id', asyncHandler(async (req, res) => {
    const check = await db.query('SELECT * FROM clientes WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ erro: 'Cliente nao encontrado' });

    const existente = check.rows[0];
    const c = { ...existente, ...req.body };

    const sql = `
        UPDATE clientes SET
            nome_responsavel=$1, telefone=$2, cpf=$3, endereco=$4, nome_aluno=$5,
            escola=$6, rota=$7, valor_mensalidade=$8, vencimento=$9, status=$10, observacoes=$11
        WHERE id=$12
        RETURNING *
    `;

    const result = await db.query(sql, [
        c.nome_responsavel, c.telefone, c.cpf, c.endereco, c.nome_aluno,
        c.escola, c.rota, Number(c.valor_mensalidade), Number(c.vencimento),
        c.status, c.observacoes, req.params.id
    ]);

    res.json({ sucesso: true, cliente: result.rows[0] });
}));

// DELETE /api/clientes/:id - excluir
router.delete('/:id', asyncHandler(async (req, res) => {
    const result = await db.query('DELETE FROM clientes WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) return res.status(404).json({ erro: 'Cliente nao encontrado' });
    res.json({ sucesso: true, mensagem: 'Cliente excluido com sucesso' });
}));

module.exports = router;