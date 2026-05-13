// clientes.js

document.addEventListener('DOMContentLoaded', () => {
  let clienteParaExcluir = null;

  // ── Dashboard ───────────────────────────────────────────────
  async function carregarResumo() {
    try {
      const res = await apiFetch('/clientes/resumo');
      const { resumo } = await res.json();
      document.getElementById('dashTotal').textContent     = resumo.total;
      document.getElementById('dashPagos').textContent     = resumo.pagos;
      document.getElementById('dashAtrasados').textContent = resumo.atrasados;
      document.getElementById('dashMensal').textContent    = formatarMoeda(resumo.total_mensal);
    } catch (e) { console.error(e); }
  }

  // ── Listar ─────────────────────────────────────────────────
  async function carregarClientes(busca = '', status = '') {
    const lista = document.getElementById('clientesLista');
    lista.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

    try {
      const p = new URLSearchParams();
      if (busca)  p.set('busca', busca);
      if (status) p.set('status', status);

      const res = await apiFetch(`/clientes?${p}`);
      const { clientes } = await res.json();

      if (!clientes.length) {
        lista.innerHTML = `
          <div class="empty-state">
            <div class="icon">👤</div>
            <h3>Nenhum cliente encontrado</h3>
            <p>Clique em "Cadastrar Cliente" para adicionar o primeiro.</p>
          </div>`;
        return;
      }

      lista.innerHTML = clientes.map(renderClienteCard).join('');
      adicionarEventosCards();
    } catch (e) {
      lista.innerHTML = `<div class="empty-state"><div class="icon">⚠️</div><h3>Erro ao carregar</h3></div>`;
    }
  }

  // ── Render do card — visual fiel à imagem ─────────────────
  function renderClienteCard(c) {
    const statusLabel = {
      ativa:    'Mensalidade Ativa',
      paga:     'Mensalidade Paga',
      atrasada: 'Mensalidade Inativa'
    }[c.status] || c.status;

    return `
      <div class="cliente-card" data-id="${c.id}" role="listitem">

        <!-- Cabeçalho clicável -->
        <div class="cliente-card-header"
             role="button"
             tabindex="0"
             aria-expanded="false"
             aria-label="Expandir dados de ${c.nome_responsavel}">
          <div class="avatar">${iniciais(c.nome_responsavel)}</div>
          <div class="cliente-info">
            <div class="cliente-nome">${c.nome_responsavel}</div>
            <div class="cliente-telefone">Tel: ${c.telefone}</div>
          </div>
          <span class="badge badge-${c.status}" style="margin-left:8px;">${statusLabel}</span>
          <div class="ver-mais-btn" aria-hidden="true">
            <span id="label-${c.id}">${'Ver mais'}</span>
            <span class="ver-mais-seta"></span>
          </div>
        </div>

        <!-- Corpo expansível -->
        <div class="cliente-card-body">

          <div class="cliente-detalhes">
            <div class="detalhe-linha"><strong>CPF:</strong> ${c.cpf}</div>
            <div class="detalhe-linha"><strong>Endereço:</strong> ${c.endereco || '—'}</div>
            <div class="detalhe-linha"><strong>Nome do Filho:</strong> ${c.nome_aluno}</div>
            <div class="detalhe-linha"><strong>Escola:</strong> ${c.escola || '—'}</div>
            <div class="detalhe-linha"><strong>Rota:</strong> ${c.rota || '—'}</div>
            <div class="detalhe-linha"><strong>Valor da Mensalidade:</strong> ${formatarMoeda(c.valor_mensalidade)}</div>
            <div class="detalhe-linha"><strong>Período:</strong> Vence dia ${c.vencimento} de cada mês</div>
            ${c.observacoes ? `<div class="detalhe-linha"><strong>Observações:</strong> ${c.observacoes}</div>` : ''}
          </div>

          <div class="cliente-acoes">
            <button class="btn btn-danger btn-deletar" data-id="${c.id}" aria-label="Excluir ${c.nome_responsavel}">
              🗑️ Deletar
            </button>
            <button class="btn btn-warning btn-editar" data-id="${c.id}" aria-label="Editar ${c.nome_responsavel}">
              ✏️ Alterar
            </button>
            <button class="btn btn-pix btn-pix-gerar" data-id="${c.id}" aria-label="Gerar PIX para ${c.nome_responsavel}">
              💠 Gerar PIX
            </button>
          </div>
        </div>

      </div>`;
  }

  // ── Eventos dos cards ───────────────────────────────────────
  function adicionarEventosCards() {
    // Expandir / recolher
    document.querySelectorAll('.cliente-card-header').forEach(header => {
      const ativar = () => {
        const card = header.closest('.cliente-card');
        const expandido = card.classList.toggle('expandido');
        header.setAttribute('aria-expanded', expandido);
        const id = card.dataset.id;
        const label = document.getElementById(`label-${id}`);
        if (label) label.textContent = expandido ? 'Ver menos' : 'Ver mais';
      };
      header.addEventListener('click', ativar);
      header.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ativar(); }
      });
    });

    // Editar
    document.querySelectorAll('.btn-editar').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); abrirEdicao(btn.dataset.id); });
    });

    // Deletar
    document.querySelectorAll('.btn-deletar').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        clienteParaExcluir = btn.dataset.id;
        abrirModal('modalConfirmar');
      });
    });

    // PIX
    document.querySelectorAll('.btn-pix-gerar').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); gerarPix(btn.dataset.id); });
    });
  }

  // ── Abrir cadastro ──────────────────────────────────────────
  document.getElementById('btnAbrirCadastro').addEventListener('click', () => {
    document.getElementById('formCliente').reset();
    document.getElementById('clienteId').value = '';
    document.getElementById('modalClienteTitulo').textContent = 'Cadastrar Cliente';
    document.getElementById('salvarCliente').textContent = 'Cadastrar';
    abrirModal('modalCliente');
  });

  document.getElementById('fecharModalCliente').addEventListener('click', () => fecharModal('modalCliente'));
  document.getElementById('cancelarCliente').addEventListener('click', () => fecharModal('modalCliente'));

  // ── Salvar (criar ou editar) ────────────────────────────────
  document.getElementById('formCliente').addEventListener('submit', async e => {
    e.preventDefault();
    const id = document.getElementById('clienteId').value;
    const telefone = document.getElementById('telefone').value.trim();
    const corpo = {
      nome_responsavel:  document.getElementById('nomeResponsavel').value.trim(),
      telefone,
      cpf:               document.getElementById('cpf').value.trim(),
      endereco:          document.getElementById('endereco').value.trim(),
      nome_aluno:        document.getElementById('nomeAluno').value.trim(),
      escola:            document.getElementById('escola').value.trim(),
      rota:              document.getElementById('rota').value.trim(),
      valor_mensalidade: parseFloat(document.getElementById('valorMensalidade').value),
      vencimento:        parseInt(document.getElementById('vencimento').value),
      status:            document.getElementById('status').value,
      observacoes:       document.getElementById('observacoes').value.trim()
    };

    const btn = document.getElementById('salvarCliente');
    btn.disabled = true; btn.textContent = 'Salvando...';

    if (!/^\+55 \(\d{2}\) \d{5}-\d{4}$/.test(telefone)) {
      toast('Preencha o telefone no formato +55 (DD) xxxxx-xxxx', 'erro');
      btn.disabled = false;
      btn.textContent = id ? 'Salvar' : 'Cadastrar';
      return;
    }

    try {
      const res = await apiFetch(
        id ? `/clientes/${id}` : '/clientes',
        { method: id ? 'PUT' : 'POST', body: JSON.stringify(corpo) }
      );
      const data = await res.json();
      if (!res.ok) { toast(data.erro || 'Erro ao salvar', 'erro'); return; }
      toast(id ? 'Cliente atualizado!' : 'Cliente cadastrado!', 'sucesso');
      fecharModal('modalCliente');
      carregarClientes();
      carregarResumo();
    } catch { toast('Erro de conexão', 'erro'); }
    finally {
      btn.disabled = false;
      btn.textContent = id ? 'Salvar' : 'Cadastrar';
    }
  });

  // ── Editar ──────────────────────────────────────────────────
  async function abrirEdicao(id) {
    try {
      const res = await apiFetch(`/clientes/${id}`);
      const { cliente: c } = await res.json();
      document.getElementById('clienteId').value          = c.id;
      document.getElementById('nomeResponsavel').value    = c.nome_responsavel;
      document.getElementById('telefone').value           = c.telefone;
      document.getElementById('telefone').dispatchEvent(new Event('input'));
      document.getElementById('cpf').value               = c.cpf;
      document.getElementById('endereco').value           = c.endereco || '';
      document.getElementById('nomeAluno').value          = c.nome_aluno;
      document.getElementById('escola').value             = c.escola || '';
      document.getElementById('rota').value               = c.rota || '';
      document.getElementById('valorMensalidade').value   = c.valor_mensalidade;
      document.getElementById('vencimento').value         = c.vencimento;
      document.getElementById('status').value             = c.status;
      document.getElementById('observacoes').value        = c.observacoes || '';
      document.getElementById('modalClienteTitulo').textContent = 'Editar Cliente';
      document.getElementById('salvarCliente').textContent      = 'Salvar alterações';
      abrirModal('modalCliente');
    } catch { toast('Erro ao carregar cliente', 'erro'); }
  }

  // ── Excluir ─────────────────────────────────────────────────
  document.getElementById('fecharModalConfirmar').addEventListener('click', () => fecharModal('modalConfirmar'));
  document.getElementById('cancelarExcluir').addEventListener('click', () => fecharModal('modalConfirmar'));
  document.getElementById('confirmarExcluir').addEventListener('click', async () => {
    if (!clienteParaExcluir) return;
    try {
      const res = await apiFetch(`/clientes/${clienteParaExcluir}`, { method: 'DELETE' });
      if (res.ok) {
        toast('Cliente excluído com sucesso', 'sucesso');
        fecharModal('modalConfirmar');
        clienteParaExcluir = null;
        carregarClientes(); carregarResumo();
      } else toast('Erro ao excluir', 'erro');
    } catch { toast('Erro de conexão', 'erro'); }
  });

  // ── PIX ─────────────────────────────────────────────────────
  async function gerarPix(clienteId) {
    document.getElementById('pixConteudo').innerHTML = '<div class="loader"><div class="spinner"></div></div>';
    abrirModal('modalPix');
    try {
      const res = await apiFetch('/pix/gerar', {
        method: 'POST', body: JSON.stringify({ cliente_id: clienteId })
      });
      const data = await res.json();
      if (!res.ok) {
        document.getElementById('pixConteudo').innerHTML = `<p style="color:var(--vermelho);">${data.erro}</p>`;
        return;
      }
      const { pix, simulacao } = data;
      document.getElementById('pixConteudo').innerHTML = `
        ${simulacao ? `<div style="background:#fef9c3;color:#854d0e;border-radius:8px;padding:8px 12px;margin-bottom:16px;font-size:0.8rem;font-weight:600;">
          ⚠️ MODO SIMULAÇÃO — Configure o Mercado Pago para cobranças reais
        </div>` : ''}
        <p style="font-size:0.9rem;color:var(--text-secondary);margin-bottom:4px;">${pix.descricao}</p>
        <p style="font-size:1.6rem;font-weight:800;color:#16a34a;margin-bottom:20px;">${formatarMoeda(pix.valor)}</p>
        <img src="${pix.qrcode_base64}" alt="QR Code PIX"
          style="width:200px;height:200px;margin:0 auto 20px;border-radius:12px;border:2px solid var(--border);">
        <p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:8px;">Código Copia e Cola:</p>
        <div style="background:var(--bg-page);border-radius:8px;padding:11px;font-size:0.72rem;
          word-break:break-all;color:var(--text-secondary);margin-bottom:16px;border:1px solid var(--border);">
          ${pix.copia_cola}
        </div>
        <button class="btn btn-primary btn-full"
          onclick="navigator.clipboard.writeText('${pix.copia_cola}').then(()=>toast('Código copiado!','sucesso'))">
          📋 Copiar código PIX
        </button>`;
    } catch {
      document.getElementById('pixConteudo').innerHTML = '<p style="color:var(--vermelho);">Erro ao gerar PIX</p>';
    }
  }

  document.getElementById('fecharModalPix').addEventListener('click', () => fecharModal('modalPix'));

  // ── Busca e filtros ─────────────────────────────────────────
  let timer;
  document.getElementById('campoBusca').addEventListener('input', e => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      carregarClientes(e.target.value, document.getElementById('filtroStatus').value);
    }, 320);
  });
  document.getElementById('filtroStatus').addEventListener('change', e => {
    carregarClientes(document.getElementById('campoBusca').value, e.target.value);
  });

  // ── Init ────────────────────────────────────────────────────
  carregarResumo();
  carregarClientes();
});
