/* Independent account-creation handler.
 * Captures registration before the full app bundle so account creation remains
 * available even if an unrelated feature throws during app startup. */
(() => {
  const FORM_SELECTOR = '#register-form';

  const showError = message => {
    const target = document.querySelector('#register-error');
    if (target) target.textContent = message;
  };

  async function submitRegistration(form) {
    const button = form.querySelector('button[type="submit"]');
    if (!button || button.disabled) return;

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Creating account…';
    showError('');

    try {
      const values = Object.fromEntries(new FormData(form).entries());
      let response;
      try {
        response = await fetch('/api/auth/register', {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(values)
        });
      } catch {
        throw new Error(navigator.onLine === false
          ? 'You appear to be offline. Reconnect and try again.'
          : 'Minglora could not reach the account service. Check your connection and try again.');
      }

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Account creation failed (HTTP ' + response.status + ').');
      }
      if (result.confirmationRequired) {
        throw new Error(result.message || 'Minglora could not finish account setup. Please try again.');
      }
      if (!result.user?.id) {
        throw new Error('Minglora did not create an account session. Please try again.');
      }

      button.textContent = 'Opening Minglora…';
      // The response sets the HttpOnly session cookie. Reload so the normal
      // /api/auth/me bootstrap opens the new account from that cookie.
      window.location.replace(window.location.pathname + window.location.search);
    } catch (error) {
      showError(error?.message || 'Minglora could not create your account. Please try again.');
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = 'Create account';
    }
  }

  // Capture phase prevents app.js from issuing a duplicate registration request.
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!form || typeof form.matches !== 'function' || !form.matches(FORM_SELECTOR)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    return submitRegistration(form);
  }, true);

  document.addEventListener('invalid', event => {
    const form = event.target?.form;
    if (!form || !form.matches?.(FORM_SELECTOR)) return;
    const input = event.target;
    if (input?.name === 'email') showError('Enter a valid email address.');
    else if (input?.name === 'username') showError('Choose a username using 3–30 letters, numbers or underscores.');
    else if (input?.name === 'password') showError('Your password must contain at least 10 characters.');
  }, true);
})();
