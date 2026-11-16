/* Minglora password visibility controls for sign-in and registration.
   Visibility changes only when the user presses the eye button. In particular,
   opening the Android keyboard or typing must not hide the password. */
(() => {
  const eyeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  const eyeOffIcon = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3 3 18 18"></path><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"></path><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a16.7 16.7 0 0 1-3 3.8"></path><path d="M6.2 6.2C3.6 8 2 12 2 12s3.6 7 10 7c1.2 0 2.3-.2 3.3-.6"></path></svg>';

  const getInput = button => {
    const inputId = button.getAttribute('aria-controls');
    const input = inputId ? document.getElementById(inputId) : null;
    return input instanceof HTMLInputElement ? input : null;
  };

  document.addEventListener('click', event => {
    const target = event.target;
    const button = target instanceof Element ? target.closest('[data-password-toggle]') : null;
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    const input = getInput(button);
    if (!input) return;

    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(reveal));
    button.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
    button.setAttribute('title', reveal ? 'Hide password' : 'Show password');
    button.innerHTML = reveal ? eyeOffIcon : eyeIcon;
  });
})();
