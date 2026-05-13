// api/pix.js
// Geracao de PIX via Mercado Pago + webhook

const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { autenticar } = require('../middleware/auth');
const { getDb } = require('../database/db');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(autenticar);

// POST /api/pix/gerar - gera cobranca PIX para um cliente
router.post('/gerar', asyncHandler(async (req, res) => {
  const { cliente_id } = req.body;
  if (!cliente_id) return res.status(400).json({ erro: 'cliente_id obrigatorio' });

  const db = getDb();
  const cliente = await db.prepare('SELECT * FROM clientes WHERE id = ?').get(cliente_id);
  if (!cliente) return res.status(404).json({ erro: 'Cliente nao encontrado' });

  const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

  if (!ACCESS_TOKEN || ACCESS_TOKEN === 'seu_access_token_do_mercado_pago') {
    return gerarPixSimulado(res, db, cliente);
  }

  try {
    const body = {
      transaction_amount: Number(cliente.valor_mensalidade),
      description: `Mensalidade - ${cliente.nome_aluno} - Juliana Transportes`,
      payment_method_id: 'pix',
      payer: {
        email: 'pagador@julianatransportes.com.br',
        first_name: cliente.nome_responsavel.split(' ')[0],
        last_name: cliente.nome_responsavel.split(' ').slice(1).join(' ') || 'Responsavel',
        identification: { type: 'CPF', number: cliente.cpf.replace(/\D/g, '') }
      },
      notification_url: `${process.env.BASE_URL}/webhook/mercadopago`,
      external_reference: `cliente_${cliente.id}_${Date.now()}`
    };

    const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'X-Idempotency-Key': `jt_${cliente_id}_${Date.now()}`
      },
      body: JSON.stringify(body)
    });

    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      console.error('MP Error:', mpData);
      return res.status(502).json({ erro: 'Erro ao gerar PIX no Mercado Pago', detalhes: mpData });
    }

    const pixInfo = mpData.point_of_interaction?.transaction_data;
    const qrBase64 = await QRCode.toDataURL(pixInfo?.qr_code || 'PIX_MOCK');

    const result = await db.prepare(`
      INSERT INTO pagamentos
        (cliente_id, nome_cliente, valor, status, forma_pagamento, id_transacao, id_preferencia, qrcode_base64, qrcode_copia_cola)
      VALUES (?, ?, ?, 'pendente', 'pix', ?, ?, ?, ?)
    `).run(
      cliente.id,
      cliente.nome_responsavel,
      cliente.valor_mensalidade,
      String(mpData.id),
      mpData.external_reference || '',
      qrBase64,
      pixInfo?.qr_code || ''
    );

    res.json({
      sucesso: true,
      pagamento_id: result.lastInsertRowid,
      pix: {
        qrcode_base64: qrBase64,
        copia_cola: pixInfo?.qr_code,
        valor: cliente.valor_mensalidade,
        descricao: body.description,
        mp_id: mpData.id
      }
    });
  } catch (err) {
    console.error('Erro PIX:', err);
    res.status(500).json({ erro: 'Erro ao processar PIX' });
  }
}));

async function gerarPixSimulado(res, db, cliente) {
  const pixCode = `00020126580014BR.GOV.BCB.PIX0136julianatr@simulacao52040000530398654${String(cliente.valor_mensalidade.toFixed(2)).padStart(5, '0')}5802BR5920Juliana Transportes6009SAO PAULO62070503***6304ABCD`;
  const qrBase64 = await QRCode.toDataURL(pixCode);

  const result = await db.prepare(`
    INSERT INTO pagamentos
      (cliente_id, nome_cliente, valor, status, forma_pagamento, id_transacao, qrcode_base64, qrcode_copia_cola)
    VALUES (?, ?, ?, 'pendente', 'pix', ?, ?, ?)
  `).run(
    cliente.id,
    cliente.nome_responsavel,
    cliente.valor_mensalidade,
    `SIMULACAO_${Date.now()}`,
    qrBase64,
    pixCode
  );

  return res.json({
    sucesso: true,
    simulacao: true,
    pagamento_id: result.lastInsertRowid,
    pix: {
      qrcode_base64: qrBase64,
      copia_cola: pixCode,
      valor: cliente.valor_mensalidade,
      descricao: `Mensalidade - ${cliente.nome_aluno} (SIMULACAO)`
    }
  });
}

// Webhook do Mercado Pago (funcao exportada separadamente para o server.js)
async function webhookHandler(req, res) {
  res.sendStatus(200);

  try {
    const { type, data } = req.body;
    if (type !== 'payment' || !data?.id) return;

    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    if (!ACCESS_TOKEN) return;

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
      headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}` }
    });
    const mpData = await mpRes.json();

    const db = getDb();
    const pagamento = await db.prepare(
      'SELECT * FROM pagamentos WHERE id_transacao = ?'
    ).get(String(data.id));

    const novoStatus = mpData.status === 'approved'
      ? 'pago'
      : mpData.status === 'rejected'
        ? 'falha'
        : 'pendente';

    if (pagamento) {
      await db.prepare(`
        UPDATE pagamentos SET
          status = ?, data_pagamento = ?, webhook_recebido = 1, webhook_data = ?
        WHERE id_transacao = ?
      `).run(
        novoStatus,
        mpData.date_approved || null,
        JSON.stringify(mpData),
        String(data.id)
      );

      if (novoStatus === 'pago' && pagamento.cliente_id) {
        await db.prepare("UPDATE clientes SET status = 'paga' WHERE id = ?")
          .run(pagamento.cliente_id);
      }
    } else {
      await db.prepare(`
        INSERT INTO pagamentos
          (nome_cliente, valor, status, forma_pagamento, id_transacao, webhook_recebido, webhook_data, data_pagamento)
        VALUES (?, ?, ?, 'pix', ?, 1, ?, ?)
      `).run(
        mpData.payer?.first_name || 'Desconhecido',
        mpData.transaction_amount || 0,
        novoStatus,
        String(data.id),
        JSON.stringify(mpData),
        mpData.date_approved || null
      );
    }

    console.log(`Webhook processado: pagamento ${data.id} -> ${novoStatus}`);
  } catch (err) {
    console.error('Erro no webhook:', err);
  }
}

module.exports = router;
module.exports.webhookHandler = webhookHandler;
