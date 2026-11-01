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
let mailSettingsState = { signature: '', checkForNewMailSeconds: 20, markReadOnOpen: true, showMessagePreview: true, compactView: false };
let mailPollingTimer = null;
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
  accounts: 'Connected accounts',
  settings: 'Mail settings'
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

function mailboxDisplayAddress() {
  const email = String(currentUser?.email || '');
  if (email.toLowerCase().endsWith('.invalid')) {
    const username = email.split('@')[0];
    return username ? '@' + username + ' (Minglora only)' : 'Minglora mailbox';
  }
  return email;
}

function updateCapabilityText() {
  const outbound = Boolean(mailStatus.outboundEmailConfigured);
  const internal = Boolean(mailStatus.internalMessagingEnabled);
  const inbound = Boolean(mailStatus.inboundEmailConfigured);
  const canCompose = outbound || internal;
  $('auth-capability').textContent = currentUser?.email
    ? 'Your Minglora mailbox: ' + mailboxDisplayAddress() + (internal ? ' · Send to members using @username.' : ' · Mail service status verified.')
    : 'Mailbox status is checked against the live Minglora service.';
  $('compose').disabled = !canCompose;
  $('send').disabled = !canCompose;
  $('service-banner').classList.toggle('is-hidden', outbound && inbound);
  if (internal && !outbound && !inbound) {
    $('service-banner').textContent = 'MailHarbor is active inside Minglora: internal sending and receiving are enabled. External Internet email is not connected yet.';
  } else if (!outbound) {
    $('service-banner').textContent = 'External sending is awaiting a verified MailHarbor sender domain and delivery provider.';
  } else if (!inbound) {
    $('service-banner').textContent = 'External sending is configured. External receiving is awaiting inbound routing, signed webhook verification and matching MX records.';
  }
}

function showAuth() {
  stopRealtime();
  $('auth-shell').classList.remove('is-hidden');
  $('mail-app').classList.add('is-hidden');
}

function startMailPolling() {
  if (mailPollingTimer) window.clearInterval(mailPollingTimer);
  const seconds = [15, 20, 30, 60].includes(Number(mailSettingsState.checkForNewMailSeconds))
    ? Number(mailSettingsState.checkForNewMailSeconds) : 20;
  mailPollingTimer = window.setInterval(() => {
    if (document.visibilityState !== 'hidden' && currentUser && !['accounts', 'settings'].includes(currentFolder)) {
      loadMessages().catch(() => {});
    }
  }, seconds * 1000);
}

function showMailbox() {
  $('auth-shell').classList.add('is-hidden');
  $('mail-app').classList.remove('is-hidden');
  $('signed-email').textContent = mailboxDisplayAddress();
  updateCapabilityText();
  startMailPolling();
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
  if (mailPollingTimer) window.clearInterval(mailPollingTimer);
  mailPollingTimer = null;
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
  if (currentFolder === 'settings') { await renderSettings(); return; }
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
  const resend = connections.resend || {};
  const resendConnected = resend.connected === true;
  $('messages').innerHTML =
    '<section class="provider-overview"><div class="provider-overview-icon">' + mailIcon('mailharbor') + '</div><div><strong>Minglora Mailbox</strong><p>' + escapeHtml(mailboxDisplayAddress()) + '</p></div><span class="provider-state active">Active</span></section>' +
    '<div class="provider-section-heading"><div><h2>MailHarbor delivery provider</h2><p>Outbound and inbound Internet mail through the verified MailHarbor domain.</p></div></div>' +
    '<div class="provider-grid"><article class="provider-card"><div class="provider-card-icon">' + mailIcon('delivery') + '</div><div class="provider-card-copy"><h3>Resend delivery</h3><p>External sending, receiving and signed delivery receipts.</p><span class="provider-state ' + (resendConnected ? 'active' : 'pending') + '">' + (resendConnected ? 'Connected' : 'Awaiting API key and verified domain') + '</span></div></article></div>' +
    '<div class="provider-section-heading"><div><h2>External mailbox sync</h2><p>Third-party accounts connect separately through each provider’s OAuth authorization.</p></div></div>' +
    '<div class="provider-grid">' + providers.map(provider => {
      const state = connections[provider.key] || {};
      const connected = state.connected === true;
      const configured = state.configured === true;
      const label = connected ? 'Connected' : configured ? 'Ready for authorization' : 'Not connected';
      return '<article class="provider-card"><div class="provider-card-icon">' + mailIcon('external-link') + '</div><div class="provider-card-copy"><h3>' + provider.name + '</h3><p>' + provider.description + '</p><span class="provider-state ' + (connected ? 'active' : 'pending') + '">' + label + '</span></div><button type="button" class="secondary provider-connect" disabled title="Provider OAuth credentials and authorization callback are not configured">Unavailable</button></article>';
    }).join('') + '</div>' +
    '<p class="provider-notice" role="note">Gmail, Yahoo, Outlook and iCloud are not being represented as connected. Their account data will only sync after the required provider credentials, callback routes, scopes and your explicit authorization are in place.</p>';
}

async function renderSettings(settings, feedback = '') {
  const data = settings ? { settings } : await request('/settings');
  mailSettingsState = { ...data.settings };
  $('heading').textContent = 'MailHarbor settings';
  $('subheading').textContent = 'Manage your mailbox identity, writing and inbox behaviour.';
  $('count').textContent = 'Settings';
  $('toolbar').classList.add('is-hidden');
  $('folders').querySelectorAll('[data-folder]').forEach(button => button.classList.toggle('active', button.dataset.folder === 'settings'));
  $('mail-app').classList.toggle('compact-mail', mailSettingsState.compactView === true);
  const checked = key => mailSettingsState[key] === true ? ' checked' : '';
  $('messages').innerHTML =
    '<form id="mail-settings-form" class="mail-settings">' +
      '<section class="mail-settings-card"><div class="mail-settings-heading">' + mailIcon('profile') + '<div><h2>Mailbox identity</h2><p>Your address is linked to your signed-in Minglora member.</p></div></div>' +
        '<label class="mail-setting-field">Mailbox address<input value="' + escapeHtml(currentUser?.email || '') + '" readonly></label>' +
        '<label class="mail-setting-field">Display name<input id="mail-display-name" maxlength="120" value="' + escapeHtml(mailSettingsState.displayName || currentUser?.name || '') + '" required></label>' +
      '</section>' +
      '<section class="mail-settings-card"><div class="mail-settings-heading">' + mailIcon('compose') + '<div><h2>Writing preferences</h2><p>Your signature is added to new messages; you can edit it before sending.</p></div></div>' +
        '<label class="mail-setting-field">Email signature<textarea id="mail-signature" maxlength="5000" rows="5" placeholder="Your name and contact details">' + escapeHtml(mailSettingsState.signature || '') + '</textarea></label>' +
      '</section>' +
      '<section class="mail-settings-card"><div class="mail-settings-heading">' + mailIcon('inbox') + '<div><h2>Inbox behaviour</h2><p>Control refresh and message display.</p></div></div>' +
        '<label class="mail-setting-field">Check for new mail<select id="mail-refresh-seconds">' +
          [15, 20, 30, 60].map(seconds => '<option value="' + seconds + '"' + (Number(mailSettingsState.checkForNewMailSeconds) === seconds ? ' selected' : '') + '>' + seconds + ' seconds</option>').join('') +
        '</select></label>' +
        '<label class="mail-setting-toggle"><input id="mail-mark-read" type="checkbox"' + checked('markReadOnOpen') + '> Mark messages as read when opened</label>' +
        '<label class="mail-setting-toggle"><input id="mail-show-preview" type="checkbox"' + checked('showMessagePreview') + '> Show message previews in the list</label>' +
        '<label class="mail-setting-toggle"><input id="mail-compact-view" type="checkbox"' + checked('compactView') + '> Use compact message rows</label>' +
      '</section>' +
      '<section class="mail-settings-card mail-settings-status"><div class="mail-settings-heading">' + mailIcon('delivery') + '<div><h2>Mail service status</h2><p>Capability state reported by the live MailHarbor API.</p></div></div>' +
        '<div class="mail-capability-row"><span>Internal sending</span><strong class="provider-state active">Active</strong></div>' +
        '<div class="mail-capability-row"><span>Internal receiving</span><strong class="provider-state active">Active</strong></div>' +
        '<div class="mail-capability-row"><span>Mailbox persistence</span><strong class="provider-state active">Minglora state store</strong></div>' +
        '<div class="mail-capability-row"><span>External sending</span><strong class="provider-state ' + (mailStatus.outboundEmailConfigured ? 'active' : 'pending') + '">' + (mailStatus.outboundEmailConfigured ? 'Connected' : 'Awaiting provider/domain') + '</strong></div>' +
        '<div class="mail-capability-row"><span>External receiving</span><strong class="provider-state ' + (mailStatus.inboundEmailConfigured ? 'active' : 'pending') + '">' + (mailStatus.inboundEmailConfigured ? 'Connected' : 'Awaiting MX/inbound route') + '</strong></div>' +
        '<p class="provider-notice">External mail requires a verified Minglora mail domain, authenticated outbound delivery, inbound MX/webhook routing and real provider credentials.</p>' +
      '</section>' +
      '<div class="mail-settings-actions"><span id="mail-settings-feedback" class="feedback" role="status">' + escapeHtml(feedback) + '</span><button class="primary" type="submit">Save MailHarbor settings</button></div>' +
    '</form>';
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
      : (message.sender_name ? message.sender_name + ' · ' : '') + message.sender_email;
    const status = message.delivery_channel === 'minglora_internal' && message.delivery_status === 'delivered'
      ? '<span class="delivery sent">Delivered internally</span>'
      : message.delivery_channel === 'resend' && message.delivery_status === 'delivered'
        ? '<span class="delivery sent">Delivered externally</span>'
        : message.delivery_status === 'queued' ? '<span class="delivery queued">Queued for delivery</span>'
        : message.delivery_status === 'failed' || message.delivery_status === 'bounced'
          ? '<span class="delivery failed">' + (message.delivery_status === 'bounced' ? 'Bounced' : 'Failed') + '</span>'
          : message.delivery_status === 'received' ? '<span class="delivery sent">Received</span>'
          : message.delivery_status === 'sent' && message.delivery_channel === 'resend'
            ? '<span class="delivery queued">Accepted by provider</span>'
            : message.delivery_status === 'sent' ? '<span class="delivery sent">Sent</span>' : '';
    const preview = mailSettingsState.showMessagePreview === false ? '' : '<span>' + escapeHtml(message.body_text || '') + '</span>';
    return '<article class="message' + unread + '" data-id="' + id + '">' +
      '<input class="select-message" type="checkbox" aria-label="Select message"' + checked + '>' +
      '<button class="star' + starred + '" data-star="' + id + '" type="button" aria-label="Toggle star">' + mailIcon('star') + '</button>' +
      '<div class="sender">' + escapeHtml(sender) + '</div>' +
      '<div class="summary"><strong>' + escapeHtml(message.subject || '(no subject)') + '</strong>' + preview + status + '</div>' +
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
    $('detail-from').textContent = (message.sender_name ? message.sender_name + ' · ' : '') + (message.sender_email || '');
    const recipients = message.recipients || {};
    $('detail-to').textContent = [...(recipients.to || []), ...(recipients.cc || [])].join(', ');
    $('detail-status').textContent = message.delivery_status || '';
    $('detail-body').textContent = message.body_text || '';
    $('detail-error').textContent = message.last_error || '';
    $('detail-error').classList.toggle('is-hidden', !message.last_error);
    $('message-view').showModal();
    if (!message.is_read && mailSettingsState.markReadOnOpen !== false) {
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
    const savedSettings = await request('/settings');
    mailSettingsState = { ...savedSettings.settings };
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

$('messages').addEventListener('submit', async (event) => {
  if (!event.target.matches('#mail-settings-form')) return;
  event.preventDefault();
  const button = event.target.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    const result = await request('/settings', {
      method: 'PATCH',
      body: {
        displayName: $('mail-display-name').value,
        signature: $('mail-signature').value,
        checkForNewMailSeconds: Number($('mail-refresh-seconds').value),
        markReadOnOpen: $('mail-mark-read').checked,
        showMessagePreview: $('mail-show-preview').checked,
        compactView: $('mail-compact-view').checked
      }
    });
    await renderSettings(result.settings, 'Your MailHarbor settings have been saved.');
    startMailPolling();
  } catch (error) {
    const feedback = $('mail-settings-feedback');
    if (feedback) setFeedback(feedback, error.message, true);
  } finally {
    const currentButton = event.target.querySelector('button[type="submit"]');
    if (currentButton) currentButton.disabled = false;
  }
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
  const signature = String(mailSettingsState.signature || '').trim();
  $('body').value = signature ? '\n\n--\n' + signature : '';
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
    $('signed-email').textContent = mailboxDisplayAddress();
    updateCapabilityText();
    window.alert('Your MailHarbor address is now ' + mailboxDisplayAddress());
  } catch (error) { window.alert(error.message); }
});
$('signout').addEventListener('click', () => stopRealtime());

$('menu').addEventListener('click', () => $('sidebar').classList.toggle('open'));

init();
