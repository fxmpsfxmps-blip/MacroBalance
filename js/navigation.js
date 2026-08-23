(function initializeNavigation() {
  const header = document.querySelector('[data-site-header]');
  if (!header) return;

  const toggle = header.querySelector('[data-nav-toggle]');
  const menu = header.querySelector('[data-site-nav]');

  function closeMenu() {
    if (!toggle || !menu) return;
    toggle.setAttribute('aria-expanded', 'false');
    menu.classList.remove('is-open');
  }

  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    menu?.classList.toggle('is-open', !open);
  });

  menu?.addEventListener('click', event => {
    if (event.target.closest('a, button')) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeMenu();
  });
  document.addEventListener('pointerdown', event => {
    if (!header.contains(event.target)) closeMenu();
  });

  const setAuthControls = state => {
    const signedIn = Boolean(state?.user);
    header.querySelectorAll('[data-auth="in"]').forEach(element => {
      element.hidden = !signedIn;
    });
    header.querySelectorAll('[data-auth="out"]').forEach(element => {
      element.hidden = signedIn;
    });
  };

  header.querySelector('[data-login]')?.addEventListener('click', () => {
    if (typeof window.abrirModal === 'function') window.abrirModal();
    else window.location.assign('/?login=1');
  });
  header.querySelector('[data-logout]')?.addEventListener('click', async () => {
    const button = header.querySelector('[data-logout]');
    button.disabled = true;
    try {
      if (typeof window.cerrarSesionFirebase === 'function') await window.cerrarSesionFirebase();
    } finally {
      button.disabled = false;
    }
  });
  header.querySelector('[data-account]')?.addEventListener('click', () => {
    if (typeof window.abrirModalCuenta === 'function') window.abrirModalCuenta();
    else window.location.assign('/#macros');
  });

  setAuthControls(window.macroBalanceState);
  window.addEventListener('macrobalance:auth-changed', event => setAuthControls(event.detail));
})();
