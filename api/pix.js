// api/pix.js
// Geracao de PIX via Mercado Pago + webhook em Postgres/Neon

const express = require('express');
const QRCode = require('qrcode');
const { autenticar } = require('../middleware/auth');
const db = require('../database/db');

const router = express.Router();
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use(autenticar);

router.post('/gerar', asyncHandler(async (req, res) => {
  const { cliente_id } = req.body;
  if (!cliente_id) return res.status(400).json({ erro: 'cliente_id obrigatorio' });

  const clienteResult = await db.query('SELECT * FROM clientes WHERE id = $1 LIMIT 1', [cliente_id]);
  const cliente = clienteResult.rows[0];
  if (!cliente) return res.status(404).json({ erro: 'Cliente nao encontrado' });

  const accessToken = process.env.MP_ACCESS_TOKEN;

  if (!accessToken || accessToken === 'seu_access_token_do_mercado_pago') {
    return gerarPixSimulado(res, cliente);
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
        'Authorization': `Bearer ${accessToken}`,
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

    const insert = await db.query(`
      INSERT INTO pagamentos
        (cliente_id, nome_cliente, valor, status, forma_pagamento, id_transacao, id_preferencia, qrcode_base64, qrcode_copia_cola)
      VALUES ($1, $2, $3, 'pendente', 'pix', $4, $5, $6, $7)
      RETURNING id
    `, [
      cliente.id,
      cliente.nome_responsavel,
      cliente.valor_mensalidade,
      String(mpData.id),
      mpData.external_reference || '',
      qrBase64,
      pixInfo?.qr_code || ''
    ]);

    res.json({
      sucesso: true,
      pagamento_id: insert.rows[0].id,
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

async function gerarPixSimulado(res, cliente) {
  const pixCode = `00020126580014BR.GOV.BCB.PIX0136julianatr@simulacao52040000530398654${String(cliente.valor_mensalidade.toFixed(2)).padStart(5, '0')}5802BR5920Juliana Transportes6009SAO PAULO62070503***6304ABCD`;
  const qrBase64 = await QRCode.toDataURL(pixCode);

  const insert = await db.query(`
    INSERT INTO pagamentos
      (cliente_id, nome_cliente, valor, status, forma_pagamento, id_transacao, qrcode_base64, qrcode_copia_cola)
    VALUES ($1, $2, $3, 'pendente', 'pix', $4, $5, $6)
    RETURNING id
  `, [
    cliente.id,
    cliente.nome_responsavel,
    cliente.valor_mensalidade,
    `SIMULACAO_${Date.now()}`,
    qrBase64,
    pixCode
  ]);

  return res.json({
    sucesso: true,
    simulacao: true,
    pagamento_id: insert.rows[0].id,
    pix: {
      qrcode_base64: qrBase64,
      copia_cola: pixCode,
      valor: cliente.valor_mensalidade,
      descricao: `Mensalidade - ${cliente.nome_aluno} (SIMULACAO)`
    }
  });
}

async function webhookHandler(req, res) {
  res.sendStatus(200);

  try {
    const { type, data } = req.body;
    if (type !== 'payment' || !data?.id) return;

    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) return;

    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    const mpData = await mpRes.json();

    const pagamentoResult = await db.query(
      'SELECT * FROM pagamentos WHERE id_transacao = $1 LIMIT 1',
      [String(data.id)]
    );
    const pagamento = pagamentoResult.rows[0];

    const novoStatus = mpData.status === 'approved'
      ? 'pago'
      : mpData.status === 'rejected'
        ? 'falha'
        : 'pendente';

    if (pagamento) {
      await db.query(`
        UPDATE pagamentos
        SET status = $1, data_pagamento = $2, webhook_recebido = 1, webhook_data = $3
        WHERE id_transacao = $4
      `, [
        novoStatus,
        mpData.date_approved || null,
        JSON.stringify(mpData),
        String(data.id)
      ]);

      if (novoStatus === 'pago' && pagamento.cliente_id) {
        await db.query("UPDATE clientes SET status = 'paga' WHERE id = $1", [pagamento.cliente_id]);
      }
    } else {
      await db.query(`
        INSERT INTO pagamentos
          (nome_cliente, valor, status, forma_pagamento, id_transacao, webhook_recebido, webhook_data, data_pagamento)
        VALUES ($1, $2, $3, 'pix', $4, 1, $5, $6)
      `, [
        mpData.payer?.first_name || 'Desconhecido',
        mpData.transaction_amount || 0,
        novoStatus,
        String(data.id),
        JSON.stringify(mpData),
        mpData.date_approved || null
      ]);
    }

    console.log(`Webhook processado: pagamento ${data.id} -> ${novoStatus}`);
  } catch (err) {
    console.error('Erro no webhook:', err);
  }
}

module.exports = router;
module.exports.webhookHandler = webhookHandler;
