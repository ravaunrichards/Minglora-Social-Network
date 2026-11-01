'use strict';

const API_BASE = '/api/mailharbor';
const ICON_SPRITE = '/assets/icons/navigation-3d.svg?v=20261101-mailharbor-3d-1';
const $ = (id) => document.getElementById(id);
function mailIcon(id, className = 'mail-3d-icon') {
  return '<svg class="' + className + '" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><use href="' + ICON_SPRITE + '#' + id + '"></use></svg>';
}
let token = '';
let currentUser = null;
let currentFolder = 'inbox';
let messageList = [];
let selected = new Set();
let currentDraftId = null;
let mailStatus = { outboundEmailConfigured: false, inboundEmailConfigured: false };
let authMode = 'login';
let searchTimer = null;
let realtimeSocket = null;
let realtimeReconnectTimer = null;
let realtimeRetryDelay = 1000;
let realtimeStopped = true;
let realtimeRefreshTimer = null;

const folderNames = {
  inbox: 'Inbox',
  starred: 'Starred',
  sent: 'Sent',
  drafts: 'Drafts',
  spam: 'Spam',
  trash: 'Trash',
  archive: 'Archive',
  accounts: 'Connected accounts'
};

function setFeedback(element, message, isError = false) {
  element.textContent = message || '';
  element.classList.toggle('error', Boolean(isError));
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  // Minglora authenticates this request with its existing HttpOnly session cookie.
  const response = await fetch(API_BASE + path, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    credentials: 'same-origin'
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed (' + response.status + ').');
    error.status = response.status;
    throw error;
  }
  return data;
}

function setAuthMode(mode) {
  authMode = mode;
  const registering = mode === 'register';
  $('auth-title').textContent = registering ? 'Create your account' : 'Welcome back';
  $('auth-copy').textContent = registering ? 'Set up your MailHarbor account.' : 'Sign in to open your mailbox.';
  $('auth-submit').textContent = registering ? 'Create account' : 'Sign in';
  $('mode-copy').textContent = registering ? 'Already have an account?' : 'New to MailHarbor?';
  $('mode-toggle').textContent = registering ? 'Sign in' : 'Create an account';
  $('name-field').classList.toggle('is-hidden', !registering);
  $('display-name').required = registering;
  $('auth-password').autocomplete = registering ? 'new-password' : 'current-password';
  $('auth-feedback').textContent = '';
}

function updateCapabilityText() {
  const outbound = Boolean(mailStatus.outboundEmailConfigured);
  const internal = Boolean(mailStatus.internalMessagingEnabled);
  const inbound = Boolean(mailStatus.inboundEmailConfigured);
  const canCompose = outbound || internal;
  $('auth-capability').textContent = currentUser?.email
    ? 'Your Minglora mailbox: ' + currentUser.email + (internal ? ' · Member-to-member mail is active.' : ' · Mail service status verified.')
    : 'Mailbox status is checked against the live Minglora service.';
  $('compose').disabled = !canCompose;
  $('send').disabled = !canCompose;
  $('service-banner').classList.toggle('is-hidden', outbound && inbound);
  if (internal && !outbound) {
    $('service-banner').textContent = 'MailHarbor is active inside Minglora. Messages to Minglora member mailboxes are delivered internally. External email sending and receiving are not enabled yet.';
  } else if (!outbound) {
    $('service-banner').textContent = 'External sending is awaiting a verified sender domain and provider setup.';
  } else if (!inbound) {
    $('service-banner').textContent = 'External sending is configured. External receiving is awaiting an inbound provider, signed webhook and matching MX records.';
  }
}

function showAuth() {
  stopRealtime();
  $('auth-shell').classList.remove('is-hidden');
  $('mail-app').classList.add('is-hidden');
}

function showMailbox() {
  $('auth-shell').classList.add('is-hidden');
  $('mail-app').classList.remove('is-hidden');
  $('signed-email').textContent = currentUser.email;
  updateCapabilityText();
  if (mailStatus.realtimeUrl) {
    realtimeStopped = false;
    connectRealtime();
  }
}

function scheduleRealtimeReconnect() {
  if (realtimeStopped || !currentUser || !mailStatus.realtimeUrl || realtimeReconnectTimer) return;
  const delay = realtimeRetryDelay;
  realtimeRetryDelay = Math.min(30000, realtimeRetryDelay * 2);
  realtimeReconnectTimer = setTimeout(() => {
    realtimeReconnectTimer = null;
    connectRealtime();
  }, delay);
}

async function connectRealtime() {
  if (realtimeStopped || !currentUser || !mailStatus.realtimeUrl || realtimeSocket) return;
  try {
    const auth = await request('/realtime/ticket', { method: 'POST', body: {} });
    if (realtimeStopped || !token) return;
    const socket = new WebSocket(mailStatus.realtimeUrl);
    realtimeSocket = socket;
    socket.addEventListener('open', () => {
      if (realtimeSocket === socket) socket.send(JSON.stringify({ type: 'authenticate', ticket: auth.ticket }));
    });
    socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch (_error) { return; }
      if (message.type === 'ready') {
        realtimeRetryDelay = 1000;
      } else if (message.type === 'mail.message.changed' && !realtimeStopped) {
        clearTimeout(realtimeRefreshTimer);
        realtimeRefreshTimer = setTimeout(() => loadMessages().catch(() => {}), 120);
      }
    });
    socket.addEventListener('close', () => {
      if (realtimeSocket === socket) realtimeSocket = null;
      scheduleRealtimeReconnect();
    });
    socket.addEventListener('error', () => socket.close());
  } catch (_error) {
    scheduleRealtimeReconnect();
  }
}

function stopRealtime() {
  realtimeStopped = true;
  clearTimeout(realtimeReconnectTimer);
  clearTimeout(realtimeRefreshTimer);
  realtimeReconnectTimer = null;
  realtimeRefreshTimer = null;
  if (realtimeSocket) {
    const socket = realtimeSocket;
    realtimeSocket = null;
    try { socket.close(1000, 'Signed out'); } catch (_error) {}
  }
}

async function loadMessages() {
  if (currentFolder === 'accounts') { renderConnectedAccounts(); return; }
  const query = new URLSearchParams({ folder: currentFolder });
  const search = $('search').value.trim();
  if (search) query.set('search', search);
  const result = await request('/messages?' + query.toString());
  messageList = result.messages || [];
  selected.clear();
  renderMessages();
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}


function renderConnectedAccounts() {
  const providers = [
    { key: 'gmail', name: 'Gmail', description: 'Google mailbox sync through user-approved OAuth.' },
    { key: 'yahoo', name: 'Yahoo Mail', description: 'Yahoo mailbox sync through user-approved OAuth.' },
    { key: 'outlook', name: 'Outlook', description: 'Microsoft mailbox sync through Microsoft identity.' },
    { key: 'icloud', name: 'iCloud Mail', description: 'Apple mail access through supported account authorization.' }
  ];
  const connections = mailStatus.externalProviders || {};
  $('heading').textContent = 'Connected accounts';
  $('subheading').textContent = 'See which mail providers are connected to your Minglora mailbox.';
  $('count').textContent = '1 active mailbox';
  $('toolbar').classList.add('is-hidden');
  $('folders').querySelectorAll('[data-folder]').forEach(button => button.classList.toggle('active', button.dataset.folder === 'accounts'));
  $('messages').innerHTML =
    '<section class="provider-overview"><div class="provider-overview-icon">' + mailIcon('mailharbor') + '</div><div><strong>Minglora Mailbox</strong><p>' + escapeHtml(currentUser?.email || '') + '</p></div><span class="provider-state active">Active</span></section>' +
    '<div class="provider-section-heading"><div><h2>External email accounts</h2><p>Connect other mailboxes after secure provider authorization is configured.</p></div></div>' +
    '<div class="provider-grid">' + providers.map(provider => {
      const state = connections[provider.key] || {};
      const connected = state.connected === true;
      const configured = state.configured === true;
      const label = connected ? 'Connected' : configured ? 'Ready for authorization' : 'Not connected';
      return '<article class="provider-card"><div class="provider-card-icon">' + mailIcon('external-link') + '</div><div class="provider-card-copy"><h3>' + provider.name + '</h3><p>' + provider.description + '</p><span class="provider-state ' + (connected ? 'active' : 'pending') + '">' + label + '</span></div><button type="button" class="secondary provider-connect" disabled title="Provider OAuth credentials and authorization callback are not configured">Unavailable</button></article>';
    }).join('') + '</div>' +
    '<p class="provider-notice" role="note">Gmail, Yahoo, Outlook and iCloud are not being represented as connected. Their account data will only sync after the required provider credentials, callback routes, scopes and your explicit authorization are in place.</p>';
}

function renderMessages() {
  $('toolbar').classList.remove('is-hidden');
  $('spam').classList.toggle('is-hidden', currentFolder === 'spam' || currentFolder === 'trash');
  $('restore').classList.toggle('is-hidden', !['spam', 'trash', 'archive'].includes(currentFolder));
  $('heading').textContent = folderNames[currentFolder] || 'Inbox';
  $('subheading').textContent = currentFolder === 'inbox' ? 'Your mail, all in one place.' : 'Messages in ' + folderNames[currentFolder].toLowerCase() + '.';
  $('folders').querySelectorAll('[data-folder]').forEach((button) => {
    button.classList.toggle('active', button.dataset.folder === currentFolder);
  });
  $('count').textContent = messageList.length + (messageList.length === 1 ? ' message' : ' messages');

  if (!messageList.length) {
    $('messages').innerHTML = '<div class="empty"><span class="empty-mark">' + mailIcon(currentFolder === 'sent' ? 'sent' : currentFolder === 'drafts' ? 'drafts' : currentFolder === 'spam' ? 'spam' : currentFolder === 'trash' ? 'trash' : 'inbox') + '</span><strong>This folder is empty</strong><p>Messages sent to your Minglora mailbox by other members will appear here.</p></div>';
    return;
  }

  $('messages').innerHTML = messageList.map((message) => {
    const id = Number(message.id);
    const checked = selected.has(id) ? ' checked' : '';
    const unread = message.is_read ? '' : ' unread';
    const starred = message.is_starred ? ' on' : '';
    const sender = currentFolder === 'sent'
      ? 'To: ' + ((message.recipients && message.recipients.to) || []).join(', ')
      : message.sender_email;
    const status = message.delivery_channel === 'minglora_internal' && message.delivery_status === 'sent'
      ? '<span class="delivery sent">Delivered internally</span>'
      : message.delivery_status === 'queued' ? '<span class="delivery queued">Queued</span>'
      : message.delivery_status === 'failed' ? '<span class="delivery failed">Failed</span>'
      : message.delivery_status === 'sent' ? '<span class="delivery sent">Sent</span>' : '';
    return '<article class="message' + unread + '" data-id="' + id + '">' +
      '<input class="select-message" type="checkbox" aria-label="Select message"' + checked + '>' +
      '<button class="star' + starred + '" data-star="' + id + '" type="button" aria-label="Toggle star">' + mailIcon('star') + '</button>' +
      '<div class="sender">' + escapeHtml(sender) + '</div>' +
      '<div class="summary"><strong>' + escapeHtml(message.subject || '(no subject)') + '</strong><span>' + escapeHtml(message.body_text || '') + '</span>' + status + '</div>' +
      '<time class="time">' + escapeHtml(formatDate(message.created_at)) + '</time>' +
      '</article>';
  }).join('');
}

async function openMessage(id) {
  try {
    const result = await request('/messages/' + encodeURIComponent(id));
    const message = result.message;
    if (message.folder === 'drafts') {
      currentDraftId = Number(message.id);
      $('to').value = (message.recipients?.to || []).join(', ');
      $('cc').value = (message.recipients?.cc || []).join(', ');
      $('bcc').value = (message.recipients?.bcc || []).join(', ');
      $('subject').value = message.subject || '';
      $('body').value = message.body_text || '';
      setFeedback($('compose-feedback'), 'Editing saved draft.');
      $('composer').showModal();
      return;
    }
    $('detail-subject').textContent = message.subject || '(no subject)';
    $('detail-date').textContent = formatDate(message.created_at);
    $('detail-from').textContent = message.sender_email || '';
    const recipients = message.recipients || {};
    $('detail-to').textContent = [...(recipients.to || []), ...(recipients.cc || [])].join(', ');
    $('detail-status').textContent = message.delivery_status || '';
    $('detail-body').textContent = message.body_text || '';
    $('detail-error').textContent = message.last_error || '';
    $('detail-error').classList.toggle('is-hidden', !message.last_error);
    $('message-view').showModal();
    if (!message.is_read) {
      await request('/messages/' + id, { method: 'PATCH', body: { isRead: true } });
      await loadMessages();
    }
  } catch (error) {
    setFeedback($('compose-feedback'), error.message, true);
  }
}

async function mutateSelected(action) {
  const ids = [...selected];
  if (!ids.length) return;
  try {
    await Promise.all(ids.map((id) => {
      if (action === 'delete') return request('/messages/' + id, { method: 'DELETE' });
      const patch = action === 'read' ? { isRead: true } : action === 'spam' ? { folder: 'spam' } : action === 'restore' ? { folder: 'inbox' } : { folder: 'archive' };
      return request('/messages/' + id, { method: 'PATCH', body: patch });
    }));
    await loadMessages();
  } catch (error) {
    window.alert(error.message);
  }
}


function composePayload() {
  return {
    to: $('to').value,
    cc: $('cc').value,
    bcc: $('bcc').value,
    subject: $('subject').value,
    body: $('body').value
  };
}

async function saveDraft() {
  const button = $('save-draft');
  button.disabled = true;
  setFeedback($('compose-feedback'), 'Saving draft…');
  try {
    const payload = composePayload();
    const result = currentDraftId
      ? await request('/messages/' + encodeURIComponent(currentDraftId), { method: 'PATCH', body: payload })
      : await request('/drafts', { method: 'POST', body: payload });
    currentDraftId = Number(result.message?.id || currentDraftId);
    $('composer').close();
    $('compose-form').reset();
    currentDraftId = null;
    currentFolder = 'drafts';
    await loadMessages();
  } catch (error) {
    setFeedback($('compose-feedback'), error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function init() {
  try {
    mailStatus = await request('/status');
    if (mailStatus.mailDomain) $('to').placeholder = 'member@' + mailStatus.mailDomain;
    const result = await request('/me');
    currentUser = result.user;
    showMailbox();
    await loadMessages();
  } catch (error) {
    showAuth();
    $('auth-feedback').textContent = error.status === 401
      ? 'Sign in to Minglora first, then reopen MailHarbor.'
      : error.message;
    $('auth-capability').textContent = 'MailHarbor connects through your existing Minglora account and checks its mailbox service live.';
  }
}

$('folders').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-folder]');
  if (!button) return;
  currentFolder = button.dataset.folder;
  $('sidebar').classList.remove('open');
  try { await loadMessages(); } catch (error) { window.alert(error.message); }
});

$('messages').addEventListener('click', async (event) => {
  const star = event.target.closest('[data-star]');
  if (star) {
    const id = Number(star.dataset.star);
    const message = messageList.find((item) => Number(item.id) === id);
    if (!message) return;
    try {
      await request('/messages/' + id, { method: 'PATCH', body: { isStarred: !message.is_starred } });
      await loadMessages();
    } catch (error) { window.alert(error.message); }
    return;
  }
  const article = event.target.closest('.message');
  if (!article) return;
  if (event.target.classList.contains('select-message')) {
    const id = Number(article.dataset.id);
    if (event.target.checked) selected.add(id);
    else selected.delete(id);
    return;
  }
  await openMessage(article.dataset.id);
});

$('search').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadMessages().catch((error) => window.alert(error.message)), 250);
});
$('refresh').addEventListener('click', () => loadMessages().catch((error) => window.alert(error.message)));
$('markread').addEventListener('click', () => mutateSelected('read'));
$('archive').addEventListener('click', () => mutateSelected('archive'));
$('spam').addEventListener('click', () => mutateSelected('spam'));
$('restore').addEventListener('click', () => mutateSelected('restore'));
$('delete').addEventListener('click', () => mutateSelected('delete'));
$('compose').addEventListener('click', () => {
  currentDraftId = null;
  $('compose-form').reset();
  setFeedback($('compose-feedback'), '');
  $('composer').showModal();
});
$('save-draft').addEventListener('click', saveDraft);
$('close-compose').addEventListener('click', () => $('composer').close());
$('close-detail').addEventListener('click', () => $('message-view').close());

$('compose-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!mailStatus.outboundEmailConfigured && !mailStatus.internalMessagingEnabled) {
    setFeedback($('compose-feedback'), 'Mail delivery is not enabled. No message was sent.', true);
    return;
  }
  const internalOnly = Boolean(mailStatus.internalMessagingEnabled && !mailStatus.outboundEmailConfigured);
  $('send').disabled = true;
  setFeedback($('compose-feedback'), internalOnly ? 'Delivering inside Minglora…' : 'Queueing message…');
  try {
    const result = await request('/messages', {
      method: 'POST',
      body: {
        to: $('to').value,
        cc: $('cc').value,
        bcc: $('bcc').value,
        subject: $('subject').value,
        body: $('body').value,
        draftId: currentDraftId
      }
    });
    $('composer').close();
    $('compose-form').reset();
    currentDraftId = null;
    currentFolder = 'sent';
    await loadMessages();
    window.alert(internalOnly
      ? 'Message delivered to Minglora member mailboxes. External email was not sent. Message ID: ' + result.message.id
      : 'Message queued. It will show as sent only after the mail provider accepts it. Message ID: ' + result.message.id);
  } catch (error) {
    setFeedback($('compose-feedback'), error.message, true);
  } finally {
    $('send').disabled = !(mailStatus.outboundEmailConfigured || mailStatus.internalMessagingEnabled);
  }
});

$('manage-address').addEventListener('click', async () => {
  const current = String(currentUser?.email || '').split('@')[0];
  const username = window.prompt('Choose your MailHarbor email name:', current);
  if (!username || username.trim().toLowerCase() === current.toLowerCase()) return;
  try {
    const result = await request('/account/address', { method: 'PATCH', body: { username: username.trim() } });
    currentUser.email = result.user.email;
    $('signed-email').textContent = currentUser.email;
    updateCapabilityText();
    window.alert('Your MailHarbor address is now ' + currentUser.email);
  } catch (error) { window.alert(error.message); }
});
$('signout').addEventListener('click', () => stopRealtime());

$('menu').addEventListener('click', () => $('sidebar').classList.toggle('open'));

init();
