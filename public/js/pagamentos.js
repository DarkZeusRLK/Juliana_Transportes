// pagamentos.js — Tela de pagamentos

document.addEventListener('DOMContentLoaded', () => {
  let filtroAtual = '';

  // ─── Carregar resumo ────────────────────────────────────────
  async function carregarResumo() {
    try {
      const res = await apiFetch('/pagamentos/resumo');
      const { resumo } = await res.json();
      document.getElementById('totalRecebido').textContent  = formatarMoeda(resumo.total_pago);
      document.getElementById('totalPendente').textContent  = formatarMoeda(resumo.total_pendente);
      document.getElementById('qtdPago').textContent        = `${resumo.qtd_pago} pagamentos`;
      document.getElementById('qtdPendente').textContent    = `${resumo.qtd_pendente} pendentes`;
      document.getElementById('qtdFalha').textContent       = resumo.qtd_falha;
    } catch (e) { console.error('Erro resumo pagamentos:', e); }
  }

  // ─── Carregar pagamentos ────────────────────────────────────
  async function carregarPagamentos(status = '') {
    const lista = document.getElementById('pagamentosLista');
    lista.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);

      const res = await apiFetch(`/pagamentos?${params}`);
      const { pagamentos } = await res.json();

      if (!pagamentos.length) {
        lista.innerHTML = `
          <div class="empty-state">
            <div class="icon">💳</div>
            <h3>Nenhum pagamento encontrado</h3>
            <p>Os pagamentos aparecerão aqui quando gerados via PIX.</p>
          </div>`;
        return;
      }

      lista.innerHTML = pagamentos.map(renderPagamentoCard).join('');
      adicionarEventosPagamentos();
    } catch (e) {
      lista.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><h3>Erro ao carregar pagamentos</h3></div>';
    }
  }

  function renderPagamentoCard(p) {
    const icons = { pago: '✅', pendente: '⏳', falha: '❌' };
    const data = p.data_pagamento ? formatarData(p.data_pagamento) : formatarData(p.data_criacao);
    return `
      <div class="pagamento-card" data-id="${p.id}" role="button" tabindex="0" aria-label="Ver detalhes do pagamento de ${p.nome_cliente}">
        <div class="pagamento-icon">${icons[p.status] || '💳'}</div>
        <div class="pagamento-info">
          <div class="pagamento-nome">${p.nome_cliente}</div>
          <div class="pagamento-meta">
            ${data}
            ${p.webhook_recebido ? '<span class="webhook-badge">🔔 Webhook</span>' : ''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <div class="pagamento-valor">${formatarMoeda(p.valor)}</div>
          <span class="badge badge-${p.status}">${labelPagamento(p.status)}</span>
        </div>
      </div>`;
  }

  function labelPagamento(s) {
    return { pago: 'Pago', pendente: 'Pendente', falha: 'Falha' }[s] || s;
  }

  function adicionarEventosPagamentos() {
    document.querySelectorAll('.pagamento-card').forEach(card => {
      card.addEventListener('click', () => abrirDetalhe(card.dataset.id));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') abrirDetalhe(card.dataset.id);
      });
    });
  }

  // ─── Detalhes do pagamento ──────────────────────────────────
  async function abrirDetalhe(id) {
    abrirModal('modalPagamento');
    document.getElementById('pagamentoDetalhes').innerHTML = '<div class="loader"><div class="spinner"></div></div>';

    try {
      const res = await apiFetch(`/pagamentos/${id}`);
      const { pagamento: p } = await res.json();

      const webhookData = p.webhook_data ? JSON.parse(p.webhook_data) : null;

      document.getElementById('pagamentoDetalhes').innerHTML = `
        <div style="display:grid;gap:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="badge badge-${p.status}" style="font-size:0.9rem;padding:6px 14px;">${labelPagamento(p.status)}</span>
            <strong style="font-size:1.3rem;color:var(--verde);">${formatarMoeda(p.valor)}</strong>
          </div>
          ${renderDetalhe('Cliente', p.nome_cliente)}
          ${renderDetalhe('Forma de pagamento', p.forma_pagamento?.toUpperCase() || 'PIX')}
          ${renderDetalhe('ID da transação', p.id_transacao || '—')}
          ${renderDetalhe('Data de criação', formatarData(p.data_criacao))}
          ${p.data_pagamento ? renderDetalhe('Data do pagamento', formatarData(p.data_pagamento)) : ''}
          ${p.webhook_recebido ? '<div style="background:var(--pix-100);color:#0e5b26;border-radius:8px;padding:10px 14px;font-size:0.85rem;font-weight:600;">✅ Confirmado via Webhook Mercado Pago</div>' : ''}
          ${p.qrcode_base64 ? `<img src="${p.qrcode_base64}" alt="QR Code" style="width:160px;margin:0 auto;border-radius:12px;border:2px solid var(--border);">` : ''}
          ${p.qrcode_copia_cola ? `
            <div>
              <p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:6px;">Código PIX:</p>
              <div style="background:var(--bg-subtle);border-radius:8px;padding:10px;font-size:0.72rem;word-break:break-all;color:var(--text-secondary);border:1px solid var(--border);">${p.qrcode_copia_cola}</div>
              <button class="btn btn-ghost btn-sm" style="margin-top:8px;width:100%;" onclick="navigator.clipboard.writeText('${p.qrcode_copia_cola}').then(()=>toast('Copiado!','sucesso'))">📋 Copiar</button>
            </div>` : ''}
          <div style="display:flex;gap:8px;padding-top:8px;">
            ${p.status !== 'pago' ? `<button class="btn btn-success btn-sm" style="flex:1" onclick="atualizarStatusPag(${p.id},'pago')">✅ Marcar pago</button>` : ''}
            ${p.status !== 'falha' ? `<button class="btn btn-danger btn-sm" style="flex:1" onclick="atualizarStatusPag(${p.id},'falha')">❌ Marcar falha</button>` : ''}
          </div>
        </div>`;
    } catch (e) {
      document.getElementById('pagamentoDetalhes').innerHTML = '<p style="color:var(--vermelho);">Erro ao carregar detalhes</p>';
    }
  }

  function renderDetalhe(label, valor) {
    return `
      <div style="display:flex;justify-content:space-between;border-bottom:1px solid var(--border);padding-bottom:8px;">
        <span style="font-size:0.8rem;color:var(--text-muted);">${label}</span>
        <span style="font-size:0.85rem;font-weight:600;color:var(--text-primary);">${valor}</span>
      </div>`;
  }

  // ─── Atualizar status (chamado de dentro do modal) ──────────
  window.atualizarStatusPag = async function(id, status) {
    try {
      const res = await apiFetch(`/pagamentos/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        toast('Status atualizado!', 'sucesso');
        fecharModal('modalPagamento');
        carregarPagamentos(filtroAtual);
        carregarResumo();
      } else { toast('Erro ao atualizar', 'erro'); }
    } catch (e) { toast('Erro de conexão', 'erro'); }
  };

  // ─── Fechar modal ───────────────────────────────────────────
  document.getElementById('fecharModalPagamento').addEventListener('click', () => fecharModal('modalPagamento'));

  // ─── Filtros ────────────────────────────────────────────────
  document.querySelectorAll('.filtro-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('ativo'));
      btn.classList.add('ativo');
      filtroAtual = btn.dataset.filtro;
      carregarPagamentos(filtroAtual);
    });
  });

  // ─── Iniciar ────────────────────────────────────────────────
  carregarResumo();
  carregarPagamentos();
});
