// nav.js - Navegacao e utilitarios globais

function toast(mensagem, tipo = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { sucesso: '✅', erro: '❌', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.innerHTML = `<span>${icons[tipo] || 'ℹ️'}</span><span>${mensagem}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    el.style.transition = '0.3s ease';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

function formatarMoeda(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarData(str) {
  if (!str) return '—';
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function iniciais(nome) {
  if (!nome) return '?';
  const partes = nome.trim().split(' ');
  if (partes.length === 1) return partes[0][0].toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function abrirModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('ativo');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      const input = modal.querySelector('input, select, textarea, button');
      if (input) input.focus();
    }, 350);
  }
}

function fecharModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('ativo');
    document.body.style.overflow = '';
  }
}

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('ativo');
    document.body.style.overflow = '';
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.ativo').forEach((m) => {
      m.classList.remove('ativo');
      document.body.style.overflow = '';
    });
  }
});

function mascararCPF(input) {
  input.addEventListener('input', () => {
    let v = input.value.replace(/\D/g, '').slice(0, 11);
    if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, '$1.$2.$3-$4');
    else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{0,3})/, '$1.$2.$3');
    else if (v.length > 3) v = v.replace(/(\d{3})(\d{0,3})/, '$1.$2');
    input.value = v;
  });
}

function formatarTelefoneBrasil(valor) {
  const valorNormalizado = String(valor || '');

  // Remove tudo que não for número
  let digits = valorNormalizado.replace(/\D/g, '');

  // Remove o 55 caso já exista
  if (
    valorNormalizado.trim().startsWith('+55') &&
    digits.startsWith('55')
  ) {
    digits = digits.slice(2);
  }

  // Limita para DDD + celular (11 dígitos)
  digits = digits.slice(0, 11);

  const ddd = digits.slice(0, 2);
  const numero = digits.slice(2);

  let formatado = '+55 ';

  // DDD
  if (ddd) {
    formatado += `(${ddd}`;

    if (ddd.length === 2) {
      formatado += ') ';
    }
  }

  // Número
  if (numero.length > 0) {
    if (numero.length <= 5) {
      formatado += numero;
    } else {
      formatado += `${numero.slice(0, 5)}-${numero.slice(5, 9)}`;
    }
  }

  return formatado;
}

function mascararTelefone(input) {
  const aplicar = () => {
    input.value = formatarTelefoneBrasil(input.value);
  };

  input.addEventListener('focus', () => {
    if (!input.value.trim()) {
      input.value = '+55 ';
    } else {
      aplicar();
    }
  });

  input.addEventListener('input', aplicar);

  input.addEventListener('keydown', (e) => {
    const inicio = input.selectionStart ?? 0;
    if ((e.key === 'Backspace' && inicio <= 4) || (e.key === 'Delete' && inicio < 4)) {
      e.preventDefault();
    }
  });

  input.addEventListener('blur', () => {
    if (input.value.trim() === '+55') {
      input.value = '+55 ';
    }
  });

  aplicar();
}

document.addEventListener('DOMContentLoaded', () => {
  const cpfInput = document.getElementById('cpf');
  const telefoneInput = document.getElementById('telefone');

  if (cpfInput) mascararCPF(cpfInput);
  if (telefoneInput) mascararTelefone(telefoneInput);
});
