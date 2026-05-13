// api/pix.js
// Geracao de PIX via Mercado Pago + webhook em Postgres/Neon

const express = require('express');
const QRCode = require('qrcode');
const { autenticar } = require('../middleware/auth');
const db = require('../database/db');

const router = express.Router();

const asyncHandler = (fn) =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

router.use(autenticar);

// ─────────────────────────────────────────────────────────────
// GERAR PIX
// ─────────────────────────────────────────────────────────────
router.post('/gerar', asyncHandler(async (req, res) => {

  const { cliente_id } = req.body;

  if (!cliente_id) {
    return res.status(400).json({
      erro: 'cliente_id obrigatorio'
    });
  }

  // Buscar cliente
  const clienteResult = await db.query(
    'SELECT * FROM clientes WHERE id = $1 LIMIT 1',
    [cliente_id]
  );

  const cliente = clienteResult.rows[0];

  if (!cliente) {
    return res.status(404).json({
      erro: 'Cliente nao encontrado'
    });
  }

  // ─────────────────────────────────────────────────────────
  // VALIDACOES SEGURAS
  // ─────────────────────────────────────────────────────────

  const nomeResponsavel = String(
    cliente.nome_responsavel || 'Responsavel'
  ).trim();

  const nomeAluno = String(
    cliente.nome_aluno || 'Aluno'
  ).trim();

  const cpfLimpo = String(
    cliente.cpf || ''
  ).replace(/\D/g, '');

  const valorMensalidade = Number(
    cliente.valor_mensalidade
  );

  if (!cpfLimpo || cpfLimpo.length < 11) {
    return res.status(400).json({
      erro: 'Cliente sem CPF valido'
    });
  }

  if (isNaN(valorMensalidade) || valorMensalidade <= 0) {
    return res.status(400).json({
      erro: 'Valor da mensalidade invalido'
    });
  }

  // Token Mercado Pago
  const accessToken = process.env.MP_ACCESS_TOKEN;

  // ─────────────────────────────────────────────────────────
  // MODO SIMULACAO
  // ─────────────────────────────────────────────────────────
  if (
    !accessToken ||
    accessToken === 'seu_access_token_do_mercado_pago'
  ) {
    return gerarPixSimulado(
      res,
      cliente,
      valorMensalidade,
      nomeAluno
    );
  }

  // ─────────────────────────────────────────────────────────
  // PIX REAL
  // ─────────────────────────────────────────────────────────
  try {

    const partesNome = nomeResponsavel.split(' ');

    const firstName = partesNome[0] || 'Responsavel';

    const lastName =
      partesNome.slice(1).join(' ') || 'Cliente';

    const body = {
      transaction_amount: valorMensalidade,

      description:
        `Mensalidade - ${nomeAluno} - Juliana Transportes`,

      payment_method_id: 'pix',

      payer: {
        email: 'pagador@julianatransportes.com.br',

        first_name: firstName,

        last_name: lastName,

        identification: {
          type: 'CPF',
          number: cpfLimpo
        }
      },

      notification_url:
        `${process.env.BASE_URL}/webhook/mercadopago`,

      external_reference:
        `cliente_${cliente.id}_${Date.now()}`
    };

    const mpRes = await fetch(
      'https://api.mercadopago.com/v1/payments',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',

          'Authorization':
            `Bearer ${accessToken}`,

          'X-Idempotency-Key':
            `jt_${cliente.id}_${Date.now()}`
        },

        body: JSON.stringify(body)
      }
    );

    const mpData = await mpRes.json();

    // Erro Mercado Pago
    if (!mpRes.ok) {

      console.error('Erro Mercado Pago:', mpData);

      return res.status(502).json({
        erro: 'Erro ao gerar PIX no Mercado Pago',
        detalhes: mpData
      });
    }

    const pixInfo =
      mpData.point_of_interaction?.transaction_data;

    const copiaCola =
      pixInfo?.qr_code || '';

    const qrBase64 = await QRCode.toDataURL(
      copiaCola || 'PIX_MOCK'
    );

    // Salvar pagamento
    const insert = await db.query(`
      INSERT INTO pagamentos
      (
        cliente_id,
        nome_cliente,
        valor,
        status,
        forma_pagamento,
        id_transacao,
        id_preferencia,
        qrcode_base64,
        qrcode_copia_cola
      )
      VALUES
      (
        $1, $2, $3,
        'pendente',
        'pix',
        $4, $5, $6, $7
      )
      RETURNING id
    `, [
      cliente.id,
      nomeResponsavel,
      valorMensalidade,
      String(mpData.id),
      mpData.external_reference || '',
      qrBase64,
      copiaCola
    ]);

    return res.json({
      sucesso: true,

      pagamento_id: insert.rows[0].id,

      pix: {
        qrcode_base64: qrBase64,
        copia_cola: copiaCola,
        valor: valorMensalidade,

        descricao:
          `Mensalidade - ${nomeAluno}`,

        mp_id: mpData.id
      }
    });

  } catch (err) {

    console.error('Erro PIX:', err);

    return res.status(500).json({
      erro: 'Erro ao processar PIX'
    });
  }
}));

// ─────────────────────────────────────────────────────────────
// PIX SIMULADO
// ─────────────────────────────────────────────────────────────
async function gerarPixSimulado(
  res,
  cliente,
  valorMensalidade,
  nomeAluno
) {

  try {

    const valorFormatado =
      Number(valorMensalidade).toFixed(2);

    const pixCode =
      `00020126580014BR.GOV.BCB.PIX0136julianatr@simulacao52040000530398654${String(valorFormatado).padStart(5, '0')}5802BR5920Juliana Transportes6009SAO PAULO62070503***6304ABCD`;

    const qrBase64 =
      await QRCode.toDataURL(pixCode);

    const insert = await db.query(`
      INSERT INTO pagamentos
      (
        cliente_id,
        nome_cliente,
        valor,
        status,
        forma_pagamento,
        id_transacao,
        qrcode_base64,
        qrcode_copia_cola
      )
      VALUES
      (
        $1, $2, $3,
        'pendente',
        'pix',
        $4, $5, $6
      )
      RETURNING id
    `, [
      cliente.id,
      cliente.nome_responsavel,
      valorMensalidade,
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
        valor: valorMensalidade,

        descricao:
          `Mensalidade - ${nomeAluno} (SIMULACAO)`
      }
    });

  } catch (err) {

    console.error('Erro PIX simulacao:', err);

    return res.status(500).json({
      erro: 'Erro ao gerar PIX simulado'
    });
  }
}

// ─────────────────────────────────────────────────────────────
// WEBHOOK MERCADO PAGO
// ─────────────────────────────────────────────────────────────
async function webhookHandler(req, res) {

  // Responde imediatamente
  res.sendStatus(200);

  try {

    const { type, data } = req.body;

    if (type !== 'payment' || !data?.id) {
      return;
    }

    const accessToken =
      process.env.MP_ACCESS_TOKEN;

    if (!accessToken) {
      return;
    }

    // Buscar pagamento no MP
    const mpRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${data.id}`,
      {
        headers: {
          'Authorization':
            `Bearer ${accessToken}`
        }
      }
    );

    const mpData = await mpRes.json();

    // Buscar pagamento local
    const pagamentoResult = await db.query(
      `
      SELECT *
      FROM pagamentos
      WHERE id_transacao = $1
      LIMIT 1
      `,
      [String(data.id)]
    );

    const pagamento = pagamentoResult.rows[0];

    // Status local
    const novoStatus =
      mpData.status === 'approved'
        ? 'pago'
        : mpData.status === 'rejected'
          ? 'falha'
          : 'pendente';

    // ─────────────────────────────────────────────────────────
    // Atualizar existente
    // ─────────────────────────────────────────────────────────
    if (pagamento) {

      await db.query(`
        UPDATE pagamentos
        SET
          status = $1,
          data_pagamento = $2,
          webhook_recebido = true,
          webhook_data = $3
        WHERE id_transacao = $4
      `, [
        novoStatus,
        mpData.date_approved || null,
        JSON.stringify(mpData),
        String(data.id)
      ]);

      // Atualizar cliente
      if (
        novoStatus === 'pago' &&
        pagamento.cliente_id
      ) {

        await db.query(`
          UPDATE clientes
          SET status = 'paga'
          WHERE id = $1
        `, [
          pagamento.cliente_id
        ]);
      }

    } else {

      // ───────────────────────────────────────────────────────
      // Inserir pagamento órfão
      // ───────────────────────────────────────────────────────
      await db.query(`
        INSERT INTO pagamentos
        (
          nome_cliente,
          valor,
          status,
          forma_pagamento,
          id_transacao,
          webhook_recebido,
          webhook_data,
          data_pagamento
        )
        VALUES
        (
          $1, $2, $3,
          'pix',
          $4,
          true,
          $5,
          $6
        )
      `, [
        mpData.payer?.first_name || 'Desconhecido',
        Number(mpData.transaction_amount || 0),
        novoStatus,
        String(data.id),
        JSON.stringify(mpData),
        mpData.date_approved || null
      ]);
    }

    console.log(
      `Webhook processado: ${data.id} -> ${novoStatus}`
    );

  } catch (err) {

    console.error(
      'Erro no webhook Mercado Pago:',
      err
    );
  }
}

module.exports = router;
module.exports.webhookHandler = webhookHandler;