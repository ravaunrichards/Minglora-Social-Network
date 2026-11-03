/* Independent sign-in recovery handler.
 * Captures the login form before app.js target listeners so login remains usable
 * even if the large application bundle fails during startup. */
(() => {
  const LOGIN_FORM_SELECTOR = '#login-form';
  const jsonRequest = async (path, payload) => {
    let response;
    try {
      response = await fetch('/api' + path, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch {
      throw new Error(navigator.onLine === false
        ? 'You appear to be offline. Reconnect and try again.'
        : 'Minglora could not reach the sign-in service. Check your connection and try again.');
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'Sign-in failed (HTTP ' + response.status + ').');
      error.status = response.status;
      throw error;
    }
    return data;
  };

  const showError = message => {
    const target = document.querySelector('#login-error');
    if (target) target.textContent = message;
  };

  const reloadIntoSession = () => {
    // A fresh document read runs the normal /auth/me bootstrap with the new HttpOnly sid cookie.
    window.location.replace(window.location.pathname + window.location.search);
  };

  const requestMfa = challengeId => new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop';
    overlay.innerHTML =
      '<section class="modal" role="dialog" aria-modal="true" aria-labelledby="auth-recovery-mfa-title">' +
        '<div class="modal-head"><h2 id="auth-recovery-mfa-title">Verify it is you</h2>' +
        '<button class="modal-close" type="button" aria-label="Close">×</button></div>' +
        '<form class="modal-body" id="auth-recovery-mfa-form">' +
          '<p>Enter the current code from your authenticator app to finish signing in.</p>' +
          '<label for="auth-recovery-mfa-code">Authenticator code</label>' +
          '<input id="auth-recovery-mfa-code" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,8}" minlength="6" maxlength="8" required>' +
          '<p class="auth-error" id="auth-recovery-mfa-error" role="alert"></p>' +
          '<button type="submit" class="primary full">Verify and sign in</button>' +
        '</form>' +
      '</section>';
    const finish = value => { overlay.remove(); resolve(value); };
    overlay.querySelector('.modal-close').addEventListener('click', () => finish(false));
    overlay.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const button = form.querySelector('button[type="submit"]');
      const error = form.querySelector('#auth-recovery-mfa-error');
      const code = String(new FormData(form).get('code') || '').replace(/\s/g, '');
      button.disabled = true;
      error.textContent = '';
      try {
        await jsonRequest('/auth/mfa/login', { challengeId, code });
        finish(true);
        reloadIntoSession();
      } catch (cause) {
        error.textContent = cause.message || 'Your sign-in verification could not be completed.';
        button.disabled = false;
      }
    });
    document.body.append(overlay);
    overlay.querySelector('#auth-recovery-mfa-code').focus();
  });

  async function submitLogin(form) {
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Signing in…';
    showError('');
    try {
      const values = new FormData(form);
      const result = await jsonRequest('/auth/login', {
        email: String(values.get('email') || '').trim(),
        password: String(values.get('password') || '')
      });
      if (result.mfaRequired) {
        const verified = await requestMfa(result.challengeId);
        if (!verified) showError('Sign-in verification was closed. Enter your details and try again.');
        return;
      }
      if (!result.user || !result.user.id) {
        throw new Error('Minglora did not create a sign-in session. Please try again.');
      }
      button.textContent = 'Opening Minglora…';
      reloadIntoSession();
    } catch (cause) {
      showError(cause.message || 'Minglora could not sign you in. Please try again.');
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = 'Log in';
    }
  }

  // Capture phase runs before app.js's form-level listener. Stop the old handler
  // from issuing a second password request.
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches(LOGIN_FORM_SELECTOR)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void submitLogin(form);
  }, true);

  // Give visible feedback when native email/password constraints prevent submit.
  document.addEventListener('invalid', event => {
    const form = event.target?.form;
    if (!form || !form.matches(LOGIN_FORM_SELECTOR)) return;
    const input = event.target;
    if (input?.name === 'email') showError('Enter the email address registered with Minglora.');
    else if (input?.name === 'password') showError('Enter your Minglora password.');
  }, true);
})();


/* Defer Supabase's single-use confirmation URL until a person clicks.
 * Email-security scanners commonly pre-open links; opening the actual
 * Supabase /verify URL consumes the one-time token before the user arrives. */
(() => {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const wrappedUrl = params.get('auth_confirmation');
  if (!wrappedUrl) return;

  // Keep the one-time URL out of browser history before rendering the handoff.
  window.history.replaceState(null, '', window.location.pathname + window.location.search);

  let confirmation;
  try {
    confirmation = new URL(wrappedUrl);
    const validTypes = new Set(['magiclink', 'recovery', 'signup', 'invite', 'email_change', 'email']);
    const type = confirmation.searchParams.get('type');
    const redirectValue = confirmation.searchParams.get('redirect_to');
    const redirect = redirectValue ? new URL(redirectValue) : null;
    const validRedirect = redirect &&
      redirect.origin === window.location.origin &&
      redirect.pathname === '/' &&
      ['', '?password-recovery=1'].includes(redirect.search) &&
      !redirect.hash && !redirect.username && !redirect.password;

    if (
      confirmation.protocol !== 'https:' ||
      confirmation.hostname !== 'gzycobgbasnqqhnympkr.supabase.co' ||
      confirmation.pathname !== '/auth/v1/verify' ||
      !confirmation.searchParams.get('token') ||
      !validTypes.has(type) ||
      !validRedirect
    ) {
      throw new Error('invalid-confirmation-url');
    }
  } catch {
    const error = document.querySelector('#login-error');
    if (error) error.textContent = 'This Minglora email link is invalid. Request a fresh link and try again.';
    return;
  }

  const type = confirmation.searchParams.get('type');
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.innerHTML =
    '<section class="modal" role="dialog" aria-modal="true" aria-labelledby="email-confirmation-title">' +
      '<div class="modal-head"><h2 id="email-confirmation-title">Continue to Minglora</h2></div>' +
      '<div class="modal-body">' +
        '<p id="email-confirmation-description">Your secure email link is ready. Press Continue to complete verification.</p>' +
        '<p class="auth-error" id="email-confirmation-error" role="alert"></p>' +
        '<button class="primary full" id="email-confirmation-continue" type="button">Continue securely</button>' +
      '</div>' +
    '</section>';

  const description = overlay.querySelector('#email-confirmation-description');
  if (type === 'recovery') {
    description.textContent = 'Continue to verify your password reset request.';
  } else if (type === 'magiclink') {
    description.textContent = 'Continue to verify your Minglora sign-in request.';
  } else if (type === 'signup') {
    description.textContent = 'Continue to confirm your Minglora email address.';
  }

  const button = overlay.querySelector('#email-confirmation-continue');
  button.addEventListener('click', () => {
    button.disabled = true;
    button.textContent = 'Opening secure verification…';
    window.location.assign(confirmation.href);
  });

  document.body.append(overlay);
  button.focus();
})();
