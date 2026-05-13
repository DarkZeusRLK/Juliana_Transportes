// theme.js - Alternancia de tema claro/escuro

(function () {
  const STORAGE_KEY = 'jt_tema';

  function renderButton(button, theme) {
    if (!button) return;

    const isDark = theme === 'dark';
    button.setAttribute('aria-pressed', String(isDark));
    button.setAttribute('title', isDark ? 'Ativar modo claro' : 'Ativar modo escuro');
    button.innerHTML = `
      <span class="theme-toggle-icon" aria-hidden="true">${isDark ? '☀' : '☾'}</span>
      <span class="theme-toggle-text">${isDark ? 'Modo claro' : 'Modo escuro'}</span>
    `;
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
    renderButton(document.getElementById('themeToggle'), theme);
  }

  const savedTheme = localStorage.getItem(STORAGE_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(savedTheme || (prefersDark ? 'dark' : 'light'));

  document.addEventListener('DOMContentLoaded', () => {
    const button = document.getElementById('themeToggle');
    renderButton(button, document.documentElement.getAttribute('data-theme') || 'light');

    if (button) {
      button.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        applyTheme(current === 'dark' ? 'light' : 'dark');
      });
    }
  });
})();
