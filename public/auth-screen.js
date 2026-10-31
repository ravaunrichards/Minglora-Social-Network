/* Minglora login / create-account screen switcher. */
(() => {
  const screen = document.getElementById('auth-screen');
  const loginPanel = document.getElementById('login-panel');
  const registerPanel = document.getElementById('register-panel');
  if (!screen || !loginPanel || !registerPanel) return;

  const setMode = mode => {
    const registering = mode === 'register';
    loginPanel.classList.toggle('hidden', registering);
    registerPanel.classList.toggle('hidden', !registering);
    loginPanel.setAttribute('aria-hidden', String(registering));
    registerPanel.setAttribute('aria-hidden', String(!registering));
  };

  document.addEventListener('click', event => {
    const control = event.target.closest?.('[data-auth-mode]');
    if (!control) return;
    event.preventDefault();
    setMode(control.dataset.authMode === 'register' ? 'register' : 'login');
  });

  const syncScreenVisibility = () => {
    const visible = !screen.classList.contains('hidden');
    document.body.classList.toggle('auth-mode', visible);
    if (visible) setMode('login');
  };

  new MutationObserver(syncScreenVisibility).observe(screen, {
    attributes: true,
    attributeFilter: ['class']
  });
  syncScreenVisibility();
})();
