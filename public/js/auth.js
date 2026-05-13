// auth.js — Autenticação e proteção de rotas

const API = '/api';

// ─── Helpers de token ───────────────────────────────────────

function getToken() {
  return localStorage.getItem('jt_token');
}

function setToken(token) {
  localStorage.setItem('jt_token', token);
}

function removerToken() {
  localStorage.removeItem('jt_token');
  localStorage.removeItem('jt_usuario');
}

function logout() {
  removerToken();
  window.location.href = '/index.html';
}

// ─── Proteção de páginas do painel ───────────────────────────

(function protegerPagina() {
  const paginasProtegidas = ['painel.html', 'pagamentos.html'];
  const paginaAtual = window.location.pathname.split('/').pop();

  if (paginasProtegidas.includes(paginaAtual)) {
    if (!getToken()) {
      window.location.href = '/index.html';
    }
  }

  // Se já logado e tentando acessar login, vai pro painel
  if (paginaAtual === 'index.html' || paginaAtual === '') {
    if (getToken()) {
      window.location.href = '/painel.html';
    }
  }
})();

// ─── Formulário de login ─────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btnLogin = document.getElementById('btnLogin');
    const erroDiv = document.getElementById('loginError');

    const usuario = document.getElementById('usuario').value.trim();
    const senha = document.getElementById('senha').value;

    if (!usuario || !senha) {
      mostrarErroLogin('Preencha todos os campos.');
      return;
    }

    btnLogin.disabled = true;
    btnLogin.textContent = 'Entrando...';
    erroDiv.classList.remove('visivel');

    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha })
      });

      const data = await res.json();

      if (!res.ok) {
        mostrarErroLogin(data.erro || 'Credenciais inválidas.');
        return;
      }

      setToken(data.token);
      localStorage.setItem('jt_usuario', data.usuario);
      window.location.href = '/painel.html';

    } catch (err) {
      mostrarErroLogin('Erro de conexão. Tente novamente.');
    } finally {
      btnLogin.disabled = false;
      btnLogin.textContent = 'Entrar';
    }
  });

  function mostrarErroLogin(msg) {
    const erroDiv = document.getElementById('loginError');
    erroDiv.textContent = msg;
    erroDiv.classList.add('visivel');
  }
});

// ─── Botões de logout ────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const btns = [
    document.getElementById('sidebarLogout'),
    document.getElementById('mobileLogout')
  ];
  btns.forEach(btn => {
    if (btn) btn.addEventListener('click', logout);
  });
});

// ─── Helper global: fetch autenticado ────────────────────────

async function apiFetch(url, opcoes = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(opcoes.headers || {})
  };

  const res = await fetch(`${API}${url}`, { ...opcoes, headers });

  if (res.status === 401) {
    logout();
    throw new Error('Sessão expirada');
  }

  return res;
}