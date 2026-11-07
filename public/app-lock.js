(() => {
  'use strict';

  const PREFIX = 'minglora:app-lock:v1:';
  const ITERATIONS = 180000;
  const encoder = new TextEncoder();
  let activeUser = null;
  let overlay = null;
  let lastActivityAt = Date.now();
  let hiddenAt = 0;
  let checkLoopStarted = false;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));

  const storageKey = userId => PREFIX + String(userId || '');
  const readSettings = userId => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey(userId)) || 'null');
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  };
  const writeSettings = (userId, value) => localStorage.setItem(storageKey(userId), JSON.stringify(value));
  const bytesToBase64 = bytes => btoa(Array.from(bytes, value => String.fromCharCode(value)).join(''));
  const base64ToBytes = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));

  async function derivePinHash(pin, salt, iterations = ITERATIONS) {
    if (!window.crypto?.subtle) throw new Error('Secure PIN storage requires a modern browser on HTTPS.');
    const material = await window.crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await window.crypto.subtle.deriveBits({
      name: 'PBKDF2',
      salt: base64ToBytes(salt),
      iterations,
      hash: 'SHA-256'
    }, material, 256);
    return bytesToBase64(new Uint8Array(bits));
  }

  async function getSignedInUser() {
    const response = await fetch('/api/auth/me', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error('Sign in to manage your Minglora App Lock.');
    const payload = await response.json();
    const user = payload.user || payload;
    if (!user?.id) throw new Error('Your signed-in Minglora account could not be identified.');
    return user;
  }

  function closeOverlay() {
    overlay?.remove();
    overlay = null;
  }

  function mountOverlay(markup, locked = false) {
    closeOverlay();
    overlay = document.createElement('div');
    overlay.className = 'minglora-app-lock-backdrop' + (locked ? ' is-locked' : '');
    overlay.innerHTML = markup;
    document.body.appendChild(overlay);
    return overlay;
  }

  function iconMarkup() {
    return '<svg viewBox="0 0 64 64" aria-hidden="true" class="minglora-app-lock-icon"><use href="/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#lock"></use></svg>';
  }

  function pinFormMarkup(title, description, submitLabel, includeConfirm = true) {
    return '<section class="minglora-app-lock-card" role="dialog" aria-modal="true" aria-labelledby="minglora-app-lock-title">' +
      '<div class="minglora-app-lock-symbol">' + iconMarkup() + '</div>' +
      '<span class="minglora-app-lock-eyebrow">MINGLORA PRIVACY</span>' +
      '<h2 id="minglora-app-lock-title">' + escapeHtml(title) + '</h2>' +
      '<p class="minglora-app-lock-description">' + escapeHtml(description) + '</p>' +
      '<form id="minglora-app-lock-form" class="minglora-app-lock-form">' +
        '<label>PIN<input name="pin" type="password" inputmode="numeric" autocomplete="new-password" minlength="6" maxlength="12" pattern="[0-9]{6,12}" required placeholder="6–12 digits"></label>' +
        (includeConfirm ? '<label>Confirm PIN<input name="confirmPin" type="password" inputmode="numeric" autocomplete="new-password" minlength="6" maxlength="12" pattern="[0-9]{6,12}" required placeholder="Enter the PIN again"></label>' : '') +
        '<p class="minglora-app-lock-error" id="minglora-app-lock-error" role="alert"></p>' +
        '<button class="minglora-app-lock-primary" type="submit">' + escapeHtml(submitLabel) + '</button>' +
      '</form>' +
      '<p class="minglora-app-lock-note">This is a local app privacy lock for this device. It does not replace your phone’s screen lock or your Minglora account password.</p>' +
    '</section>';
  }

  async function configurePin(isChanging = false) {
    if (!activeUser) activeUser = await getSignedInUser();
    mountOverlay(pinFormMarkup(
      isChanging ? 'Change your App Lock PIN' : 'Set up your App Lock',
      isChanging ? 'Choose a new PIN for this device.' : 'Create a PIN to lock Minglora when you leave the app or choose Lock now.',
      isChanging ? 'Save new PIN' : 'Enable App Lock',
      true
    ));
    const form = overlay.querySelector('#minglora-app-lock-form');
    const error = overlay.querySelector('#minglora-app-lock-error');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const pin = String(form.elements.pin.value || '');
      const confirmation = String(form.elements.confirmPin.value || '');
      if (!/^[0-9]{6,12}$/.test(pin)) {
        error.textContent = 'Use a PIN containing 6 to 12 digits.';
        return;
      }
      if (pin !== confirmation) {
        error.textContent = 'The PIN entries do not match.';
        return;
      }
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      button.textContent = 'Saving securely…';
      try {
        const salt = bytesToBase64(window.crypto.getRandomValues(new Uint8Array(16)));
        const hash = await derivePinHash(pin, salt);
        const previous = readSettings(activeUser.id) || {};
        const settings = {
          enabled: true,
          salt,
          hash,
          iterations: ITERATIONS,
          autoLockMinutes: Number.isInteger(previous.autoLockMinutes) ? previous.autoLockMinutes : 5,
          failedAttempts: 0,
          blockedUntil: 0,
          updatedAt: new Date().toISOString()
        };
        writeSettings(activeUser.id, settings);
        lockNow();
      } catch (cause) {
        error.textContent = cause.message || 'The App Lock PIN could not be saved.';
        button.disabled = false;
        button.textContent = isChanging ? 'Save new PIN' : 'Enable App Lock';
      }
    });
    form.elements.pin.focus();
  }

  function openManager() {
    const settings = readSettings(activeUser.id);
    const enabled = Boolean(settings?.enabled && settings.hash && settings.salt);
    const autoLockMinutes = Number.isInteger(settings?.autoLockMinutes) ? settings.autoLockMinutes : 5;
    const markup = '<section class="minglora-app-lock-card minglora-app-lock-manager" role="dialog" aria-modal="true" aria-labelledby="minglora-app-lock-title">' +
      '<div class="minglora-app-lock-manager-head"><div class="minglora-app-lock-symbol">' + iconMarkup() + '</div><button type="button" class="minglora-app-lock-close" data-lock-close aria-label="Close">×</button></div>' +
      '<span class="minglora-app-lock-eyebrow">MINGLORA PRIVACY</span><h2 id="minglora-app-lock-title">Lock Screen</h2>' +
      '<p class="minglora-app-lock-description">Protect Minglora on this device with your own PIN.</p>' +
      (enabled
        ? '<div class="minglora-app-lock-status"><span class="minglora-app-lock-status-dot"></span><span><strong>App Lock is enabled</strong><small>Saved on this device for ' + escapeHtml(activeUser.name || activeUser.username || 'your account') + '.</small></span></div>' +
          '<label class="minglora-app-lock-select-label" for="minglora-app-lock-timeout">Automatically lock after inactivity</label>' +
          '<select id="minglora-app-lock-timeout"><option value="0"' + (autoLockMinutes === 0 ? ' selected' : '') + '>Only when I choose Lock now</option><option value="1"' + (autoLockMinutes === 1 ? ' selected' : '') + '>1 minute</option><option value="5"' + (autoLockMinutes === 5 ? ' selected' : '') + '>5 minutes</option><option value="15"' + (autoLockMinutes === 15 ? ' selected' : '') + '>15 minutes</option></select>' +
          '<div class="minglora-app-lock-actions"><button type="button" class="minglora-app-lock-primary" data-lock-now>Lock now</button><button type="button" class="minglora-app-lock-secondary" data-lock-change>Change PIN</button><button type="button" class="minglora-app-lock-danger" data-lock-disable>Turn off App Lock</button></div>'
        : '<div class="minglora-app-lock-status is-disabled"><span class="minglora-app-lock-status-dot"></span><span><strong>App Lock is off</strong><small>Set a PIN to enable the on-device privacy screen.</small></span></div>' +
          '<button type="button" class="minglora-app-lock-primary" data-lock-setup>Set up App Lock</button>') +
      '<p class="minglora-app-lock-note">Your PIN hash and lock preference stay in this browser/device for this account. They do not sync to other devices and this feature cannot lock the phone’s operating system.</p>' +
    '</section>';
    const layer = mountOverlay(markup);
    layer.querySelector('[data-lock-close]')?.addEventListener('click', closeOverlay);
    layer.querySelector('[data-lock-setup]')?.addEventListener('click', () => void configurePin(false));
    layer.querySelector('[data-lock-change]')?.addEventListener('click', () => void configurePin(true));
    layer.querySelector('[data-lock-now]')?.addEventListener('click', lockNow);
    layer.querySelector('[data-lock-disable]')?.addEventListener('click', () => {
      if (!window.confirm('Turn off the Minglora App Lock on this device?')) return;
      localStorage.removeItem(storageKey(activeUser.id));
      closeOverlay();
    });
    layer.querySelector('#minglora-app-lock-timeout')?.addEventListener('change', event => {
      const latest = readSettings(activeUser.id);
      if (!latest?.enabled) return;
      latest.autoLockMinutes = Number(event.target.value);
      latest.updatedAt = new Date().toISOString();
      writeSettings(activeUser.id, latest);
      lastActivityAt = Date.now();
    });
  }

  function lockNow() {
    if (!activeUser) return;
    const settings = readSettings(activeUser.id);
    if (!settings?.enabled) return;
    mountOverlay(pinFormMarkup(
      'Minglora is locked',
      'Enter your App Lock PIN to continue to your account.',
      'Unlock Minglora',
      false
    ), true);
    const form = overlay.querySelector('#minglora-app-lock-form');
    const error = overlay.querySelector('#minglora-app-lock-error');
    const submit = form.querySelector('button[type="submit"]');
    const blockedUntil = Number(settings.blockedUntil || 0);
    if (blockedUntil > Date.now()) {
      error.textContent = 'Too many attempts. Try again in ' + Math.ceil((blockedUntil - Date.now()) / 1000) + ' seconds.';
      submit.disabled = true;
    }
    form.elements.pin.setAttribute('autocomplete', 'current-password');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const pin = String(form.elements.pin.value || '');
      if (!/^[0-9]{6,12}$/.test(pin)) {
        error.textContent = 'Enter your 6–12 digit PIN.';
        return;
      }
      const latest = readSettings(activeUser.id);
      if (!latest?.enabled) {
        closeOverlay();
        return;
      }
      if (Number(latest.blockedUntil || 0) > Date.now()) {
        error.textContent = 'Too many attempts. Try again in ' + Math.ceil((latest.blockedUntil - Date.now()) / 1000) + ' seconds.';
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Checking PIN…';
      try {
        const hash = await derivePinHash(pin, latest.salt, latest.iterations || ITERATIONS);
        if (hash !== latest.hash) {
          latest.failedAttempts = Number(latest.failedAttempts || 0) + 1;
          if (latest.failedAttempts >= 5) {
            const penalty = Math.min(300000, 30000 * Math.pow(2, Math.floor((latest.failedAttempts - 5) / 5)));
            latest.blockedUntil = Date.now() + penalty;
          }
          writeSettings(activeUser.id, latest);
          error.textContent = latest.blockedUntil > Date.now()
            ? 'Too many attempts. Try again in ' + Math.ceil((latest.blockedUntil - Date.now()) / 1000) + ' seconds.'
            : 'That PIN is not correct. Please try again.';
          submit.disabled = latest.blockedUntil > Date.now();
          submit.textContent = 'Unlock Minglora';
          form.elements.pin.value = '';
          form.elements.pin.focus();
          return;
        }
        latest.failedAttempts = 0;
        latest.blockedUntil = 0;
        writeSettings(activeUser.id, latest);
        closeOverlay();
        lastActivityAt = Date.now();
      } catch (cause) {
        error.textContent = cause.message || 'Minglora could not verify the PIN.';
        submit.disabled = false;
        submit.textContent = 'Unlock Minglora';
      }
    });
    form.elements.pin.focus();
  }

  async function open() {
    try {
      activeUser = await getSignedInUser();
      openManager();
    } catch (cause) {
      window.alert(cause.message || 'Sign in to use the Minglora App Lock.');
    }
  }

  function checkAutoLock() {
    if (!activeUser || overlay) return;
    const settings = readSettings(activeUser.id);
    if (!settings?.enabled || !Number.isInteger(settings.autoLockMinutes) || settings.autoLockMinutes <= 0) return;
    const duration = settings.autoLockMinutes * 60 * 1000;
    const idleFor = Date.now() - lastActivityAt;
    const backgroundFor = hiddenAt ? Date.now() - hiddenAt : 0;
    if (idleFor >= duration || backgroundFor >= duration) lockNow();
  }

  function startAutoLockMonitor() {
    if (checkLoopStarted) return;
    checkLoopStarted = true;
    ['pointerdown', 'keydown', 'touchstart', 'mousemove', 'scroll'].forEach(name => {
      window.addEventListener(name, () => { lastActivityAt = Date.now(); }, { passive: true });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (!hiddenAt) hiddenAt = Date.now();
      } else {
        if (hiddenAt) {
          checkAutoLock();
          hiddenAt = 0;
        }
        lastActivityAt = Date.now();
      }
    });
    window.setInterval(checkAutoLock, 15000);
  }

  async function bootstrap() {
    startAutoLockMonitor();
    try {
      activeUser = await getSignedInUser();
      const settings = readSettings(activeUser.id);
      if (settings?.enabled) lockNow();
    } catch {
      activeUser = null;
    }
  }

  window.MingloraAppLock = Object.freeze({ open, lockNow });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void bootstrap(), { once: true });
  } else {
    void bootstrap();
  }
})();