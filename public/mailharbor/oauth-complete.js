'use strict';

(() => {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status') === 'connected' ? 'connected' : 'error';
  const provider = params.get('provider') === 'gmail' ? 'gmail' : 'outlook';
  const message = params.get('message') || '';
  const title = document.getElementById('oauth-title');
  const copy = document.getElementById('oauth-copy');
  if (status === 'connected') {
    title.textContent = 'Account connected';
    copy.textContent = 'Your ' + (provider === 'gmail' ? 'Gmail' : 'Outlook') + ' account is connected. You can close this window.';
  } else {
    title.textContent = 'Connection not completed';
    copy.textContent = message || 'The provider connection could not be completed. Return to MailHarbor and try again.';
  }
  const payload = { type: 'mailharbor-oauth-result', status, provider, message };
  if (window.opener && !window.opener.closed) {
    try { window.opener.postMessage(payload, window.location.origin); } catch (_error) {}
    window.setTimeout(() => window.close(), 900);
  } else {
    const fallback = new URL('/mailharbor/index.html', window.location.origin);
    fallback.searchParams.set('oauth', status);
    fallback.searchParams.set('provider', provider);
    if (message) fallback.searchParams.set('message', message);
    document.getElementById('oauth-return').href = fallback.toString();
  }
})();
