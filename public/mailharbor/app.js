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
let mailAccounts = [];
let mailProviders = {};
let pendingAttachments = [];
let activeMessage = null;
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
  const oauthEnabled = mailStatus.oauthOutboundEnabled === true;
  const canCompose = outbound || oauthEnabled || internal;
  $('auth-capability').textContent = currentUser?.email
    ? 'Your Minglora mailbox: ' + mailboxDisplayAddress() + (internal ? ' · Send to members using @username.' : ' · Mail service status verified.')
    : 'Mailbox status is checked against the live Minglora service.';
  $('compose').disabled = !canCompose;
  $('send').disabled = !canCompose;
  $('service-banner').classList.toggle('is-hidden', (outbound && inbound) || (oauthEnabled && mailStatus.oauthInboundEnabled));
  if (internal && !outbound && !oauthEnabled && !inbound) {
    $('service-banner').textContent = 'MailHarbor is active inside Minglora: internal sending and receiving are enabled. Connect Gmail or Outlook for external mail.';
  } else if (!outbound && !oauthEnabled) {
    $('service-banner').textContent = 'External sending is awaiting a connected Gmail/Outlook account or a verified MailHarbor sender domain.';
  } else if (!inbound && !oauthEnabled) {
    $('service-banner').textContent = 'External sending is configured. External receiving is awaiting inbound routing or a connected Gmail/Outlook mailbox.';
  }
}

function showAuth() {
  stopRealtime();
  $('auth-shell').classList.remove('is-hidden');
  $('mail-app').classList.add('is-hidden');
}

let lastExternalSyncAt = 0;
async function syncConnectedAccountsQuietly(force = false) {
  if (!mailAccounts.some(account => account.canSync) || document.visibilityState === 'hidden') return;
  const current = Date.now();
  if (!force && current - lastExternalSyncAt < 60000) return;
  lastExternalSyncAt = current;
  await Promise.allSettled(mailAccounts.filter(account => account.canSync).map(account =>
    request('/accounts/' + encodeURIComponent(account.id) + '/sync', { method: 'POST', body: {} })
  ));
}

function startMailPolling() {
  if (mailPollingTimer) window.clearInterval(mailPollingTimer);
  const seconds = [15, 20, 30, 60].includes(Number(mailSettingsState.checkForNewMailSeconds))
    ? Number(mailSettingsState.checkForNewMailSeconds) : 20;
  mailPollingTimer = window.setInterval(() => {
    if (document.visibilityState !== 'hidden' && currentUser && !['accounts', 'settings'].includes(currentFolder)) {
      syncConnectedAccountsQuietly().finally(() => loadMessages().catch(() => {}));
    }
  }, seconds * 1000);
  syncConnectedAccountsQuietly(true).then(() => {
    if (currentFolder !== 'accounts' && currentFolder !== 'settings') loadMessages().catch(() => {});
  }).catch(() => {});
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
  if (currentFolder === 'accounts') { await renderConnectedAccounts(); return; }
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


async function loadConnectedAccounts() {
  const result = await request('/accounts');
  mailAccounts = result.accounts || [];
  mailProviders = result.providers || {};
  mailStatus.externalProviders = {
    ...(mailStatus.externalProviders || {}),
    gmail: mailProviders.gmail || { configured: false, connected: false },
    outlook: mailProviders.outlook || { configured: false, connected: false }
  };
  mailStatus.oauthOutboundEnabled = mailAccounts.length > 0;
  mailStatus.oauthInboundEnabled = mailAccounts.some(account => account.canSync === true);
  updateCapabilityText();
  return result;
}

async function renderConnectedAccounts(feedback = '') {
  const result = await loadConnectedAccounts();
  const providers = [
    { key: 'gmail', name: 'Gmail', description: 'Connect Gmail to send from your address. Inbox sync is excluded from the zero-cost server integration because Google classifies inbox-reading scopes as restricted.' },
    { key: 'outlook', name: 'Outlook', description: 'Connect Outlook or Microsoft 365. MailHarbor can sync your inbox and send from your address.' },
    { key: 'yahoo', name: 'Yahoo Mail', description: 'Yahoo account sync is not implemented in this version.' },
    { key: 'icloud', name: 'iCloud Mail', description: 'iCloud account sync is not implemented in this version.' }
  ];
  $('heading').textContent = 'Connected accounts';
  $('subheading').textContent = 'Connect an existing mailbox. MailHarbor never sees your provider password.';
  $('count').textContent = mailAccounts.length + (mailAccounts.length === 1 ? ' connected account' : ' connected accounts');
  $('toolbar').classList.add('is-hidden');
  $('folders').querySelectorAll('[data-folder]').forEach(button => button.classList.toggle('active', button.dataset.folder === 'accounts'));
  const resend = result.resend || mailStatus.externalProviders?.resend || {};
  const resendConnected = resend.connected === true;
  const connectedCards = mailAccounts.map(account =>
    '<article class="provider-card"><div class="provider-card-icon">' + mailIcon('external-link') + '</div>' +
    '<div class="provider-card-copy"><h3>' + escapeHtml(account.provider === 'gmail' ? 'Gmail' : 'Outlook') + '</h3>' +
    '<p>' + escapeHtml(account.email) + (account.isDefault ? ' · Default sender' : '') + '</p>' +
    '<span class="provider-state active">Connected</span>' +
    (account.lastSyncedAt ? '<p>Last synced: ' + escapeHtml(formatDate(account.lastSyncedAt)) + '</p>' : '') +
    (account.lastError ? '<p class="provider-notice">' + escapeHtml(account.lastError) + '</p>' : '') +
    (account.canSync ? '<div class="provider-actions"><button type="button" class="secondary" data-oauth-sync="' + escapeHtml(account.id) + '">Sync inbox</button>' :
      '<p class="provider-notice">Sending is available. Inbox sync is not enabled on the zero-cost Gmail integration.</p>') +
    '<div class="provider-actions"><button type="button" class="secondary" data-oauth-disconnect="' + escapeHtml(account.id) + '">Disconnect</button></div></div></article>'
  ).join('');
  const providerCards = providers.map(provider => {
    const state = mailProviders[provider.key] || {};
    const connected = mailAccounts.some(account => account.provider === provider.key);
    if (connected || provider.key === 'gmail' && mailAccounts.some(account => account.provider === 'gmail') ||
        provider.key === 'outlook' && mailAccounts.some(account => account.provider === 'outlook')) return '';
    const enabled = ['gmail', 'outlook'].includes(provider.key) && state.configured === true;
    const label = enabled ? 'Ready to connect' : ['gmail', 'outlook'].includes(provider.key) ? 'OAuth setup required' : 'Not available yet';
    const button = enabled
      ? '<button type="button" class="secondary provider-connect" data-oauth-connect="' + provider.key + '">Connect ' + provider.name + '</button>'
      : '<button type="button" class="secondary provider-connect" disabled>' + (['gmail', 'outlook'].includes(provider.key) ? 'Setup required' : 'Unavailable') + '</button>';
    const callback = state.callbackUrl
      ? '<p class="provider-callback">Callback URL: <code>' + escapeHtml(state.callbackUrl) + '</code></p>' : '';
    return '<article class="provider-card"><div class="provider-card-icon">' + mailIcon('external-link') + '</div>' +
      '<div class="provider-card-copy"><h3>' + provider.name + '</h3><p>' + provider.description + '</p>' +
      '<span class="provider-state pending">' + label + '</span>' + callback + button + '</div></article>';
  }).join('');
  $('messages').innerHTML =
    '<section class="provider-overview"><div class="provider-overview-icon">' + mailIcon('mailharbor') + '</div><div><strong>Minglora Mailbox</strong><p>' + escapeHtml(mailboxDisplayAddress()) + '</p></div><span class="provider-state active">Active</span></section>' +
    '<div class="provider-section-heading"><div><h2>MailHarbor delivery provider</h2><p>Optional server-side sending through a verified MailHarbor domain.</p></div></div>' +
    '<div class="provider-grid"><article class="provider-card"><div class="provider-card-icon">' + mailIcon('delivery') + '</div><div class="provider-card-copy"><h3>Resend delivery</h3><p>Domain-based external sending and inbound routes.</p><span class="provider-state ' + (resendConnected ? 'active' : 'pending') + '">' + (resendConnected ? 'Connected' : 'Not configured') + '</span></div></article></div>' +
    '<div class="provider-section-heading"><div><h2>Your external mailboxes</h2><p>Connected accounts use your approval and can be disconnected at any time.</p></div></div>' +
    (connectedCards ? '<div class="provider-grid">' + connectedCards + '</div>' : '<p class="provider-notice">No external accounts connected yet.</p>') +
    '<div class="provider-section-heading"><div><h2>Connect an account</h2><p>Gmail sending and Outlook sending/inbox sync require private application credentials. Google inbox sync is excluded from the $0 setup; see the notes on this page.</p></div></div>' +
    '<div class="provider-grid">' + providerCards + '</div>' +
    '<p class="provider-notice" role="status">' + escapeHtml(feedback) + '</p>' +
    '<p class="provider-notice" role="note">Gmail and Outlook use encrypted server-side OAuth tokens. MailHarbor does not ask for or store your provider password. Yahoo and iCloud are not yet integrated.</p>';
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
        '<label class="mail-setting-field">Mailbox address<input value="' + escapeHtml(mailboxDisplayAddress()) + '" readonly></label>' +
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
      : ['gmail', 'outlook'].includes(message.delivery_channel) && message.delivery_status === 'sent'
        ? '<span class="delivery queued">Accepted by ' + escapeHtml(message.delivery_channel === 'gmail' ? 'Gmail' : 'Outlook') + '</span>'
      : ['gmail', 'outlook'].includes(message.delivery_channel) && message.delivery_status === 'failed'
        ? '<span class="delivery failed">External send failed</span>'
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
      pendingAttachments = Array.isArray(message.attachments) ? message.attachments : [];
      $('attachments').value = '';
      renderComposeAttachments();
      populateFromAccountSelect();
      $('to').value = (message.recipients?.to || []).join(', ');
      $('cc').value = (message.recipients?.cc || []).join(', ');
      $('bcc').value = (message.recipients?.bcc || []).join(', ');
      $('subject').value = message.subject || '';
      $('body').value = message.body_text || '';
      setFeedback($('compose-feedback'), 'Editing saved draft.');
      $('composer').showModal();
      return;
    }
    activeMessage = message;
    $('detail-subject').textContent = message.subject || '(no subject)';
    renderDetailAttachments(message.attachments || []);

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


async function selectedFileAttachments() {
  const files = Array.from($('attachments')?.files || []);
  if (pendingAttachments.length + files.length > 5) throw new Error('Attach up to 5 files per message.');
  const knownBytes = pendingAttachments.reduce((sum, item) => sum + Number(item.size || 0), 0);
  const newBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (knownBytes + newBytes > 4000000) throw new Error('The combined attachment size must be 4 MB or smaller.');
  if (files.some(file => file.size > 1500000)) throw new Error('Each attachment must be 1.5 MB or smaller.');
  return Promise.all(files.map(file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected attachment.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const separator = result.indexOf(',');
      if (separator < 0) return reject(new Error('Could not encode the selected attachment.'));
      resolve({
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
        contentBase64: result.slice(separator + 1)
      });
    };
    reader.readAsDataURL(file);
  })));
}

function renderComposeAttachments() {
  const input = $('attachments');
  const selectedFiles = Array.from(input?.files || []);
  const items = [...pendingAttachments, ...selectedFiles.map(file => ({ filename: file.name, size: file.size }))];
  $('compose-attachments').innerHTML = items.length
    ? '<div class="attachment-chip-list">' + items.map(item =>
        '<span class="attachment-chip">' + mailIcon('compose') + '<span>' + escapeHtml(item.filename || 'Attachment') +
        '</span><small>' + Math.max(0, Math.round(Number(item.size || 0) / 1024)) + ' KB</small></span>'
      ).join('') + '</div>'
    : '';
}

function renderDetailAttachments(attachments) {
  const items = Array.isArray(attachments) ? attachments : [];
  const container = $('detail-attachments');
  if (!items.length) {
    container.innerHTML = '';
    container.classList.add('is-hidden');
    return;
  }
  container.classList.remove('is-hidden');
  container.innerHTML = '<strong>Attachments</strong><div class="attachment-chip-list">' + items.map(item => {
    const filename = escapeHtml(item.filename || 'Attachment');
    const size = Math.max(0, Number(item.size || 0));
    return item.contentBase64
      ? '<a class="attachment-chip attachment-download" download="' + filename + '" href="data:application/octet-stream;base64,' + item.contentBase64 + '">' +
        mailIcon('compose') + '<span>' + filename + '</span><small>' + Math.round(size / 1024) + ' KB · Download</small></a>'
      : '<span class="attachment-chip">' + mailIcon('compose') + '<span>' + filename + '</span><small>' +
        Math.round(size / 1024) + ' KB · Not downloadable</small></span>';
  }).join('') + '</div>';
}

async function composePayload() {
  const newlySelected = await selectedFileAttachments();
  const attachments = [...pendingAttachments, ...newlySelected].filter(item => item.contentBase64);
  const payload = {
    to: $('to').value,
    cc: $('cc').value,
    bcc: $('bcc').value,
    subject: $('subject').value,
    body: $('body').value,
    fromAccountId: $('from-account')?.value || ''
  };
  if (attachments.length) payload.attachments = attachments;
  return payload;
}

function resetComposerState() {
  pendingAttachments = [];
  $('attachments').value = '';
  renderComposeAttachments();
  currentDraftId = null;
}

function composeFromMessage(mode) {
  if (!activeMessage) return;
  const message = activeMessage;
  resetComposerState();
  $('compose-form').reset();
  populateFromAccountSelect();
  const recipients = message.recipients || {};
  if (mode === 'reply') {
    const target = message.folder === 'sent'
      ? ((recipients.to || [])[0] || '')
      : (message.sender_email || '');
    $('to').value = target;
    const original = String(message.subject || '');
    $('subject').value = /^re:\s*/i.test(original) ? original : 'Re: ' + original;
    $('body').value = '\n\nOn ' + formatDate(message.created_at) + ', ' + (message.sender_email || 'the sender') + ' wrote:\n' +
      String(message.body_text || '').split('\n').map(line => '> ' + line).join('\n');
  } else {
    $('to').value = '';
    const original = String(message.subject || '');
    $('subject').value = /^fwd?:\s*/i.test(original) ? original : 'Fwd: ' + original;
    $('body').value = '\n\n---------- Forwarded message ----------\nFrom: ' + (message.sender_email || '') +
      '\nDate: ' + formatDate(message.created_at) + '\nSubject: ' + original + '\n\n' + String(message.body_text || '');
    pendingAttachments = (message.attachments || []).filter(item => item.contentBase64);
  }
  renderComposeAttachments();
  $('message-view').close();
  setFeedback($('compose-feedback'), mode === 'reply' ? 'Replying to message.' : 'Forwarding message and available attachments.');
  $('composer').showModal();
}

async function saveDraft() {
  const button = $('save-draft');
  button.disabled = true;
  setFeedback($('compose-feedback'), 'Saving draft…');
  try {
    const payload = await composePayload();
    const result = currentDraftId
      ? await request('/messages/' + encodeURIComponent(currentDraftId), { method: 'PATCH', body: payload })
      : await request('/drafts', { method: 'POST', body: payload });
    currentDraftId = Number(result.message?.id || currentDraftId);
    $('composer').close();
    $('compose-form').reset();
    resetComposerState();
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
    await loadConnectedAccounts();
    const callbackParams = new URLSearchParams(window.location.search);
    const oauthResult = callbackParams.get('oauth');
    const oauthMessage = callbackParams.get('message') || '';
    if (oauthResult) {
      currentFolder = 'accounts';
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    showMailbox();
    await loadMessages();
    if (oauthResult === 'connected') await renderConnectedAccounts('Your external mailbox is connected.');
    if (oauthResult === 'error') await renderConnectedAccounts('Connection failed: ' + oauthMessage);
  } catch (error) {
    showAuth();
    $('auth-feedback').textContent = error.status === 401
      ? 'Sign in to Minglora first, then reopen MailHarbor.'
      : error.message;
    $('auth-capability').textContent = 'MailHarbor connects through your existing Minglora account and checks its mailbox service live.';
  }
}

function populateFromAccountSelect() {
  const select = $('from-account');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">Use default sending account</option>' +
    mailAccounts.map(account => '<option value="' + escapeHtml(account.id) + '">' +
      escapeHtml(account.provider === 'gmail' ? 'Gmail' : 'Outlook') + ' · ' + escapeHtml(account.email) + '</option>').join('');
  if (mailAccounts.some(account => account.id === current)) select.value = current;
  else {
    const defaultAccount = mailAccounts.find(account => account.isDefault) || mailAccounts[0];
    if (defaultAccount) select.value = defaultAccount.id;
  }
}

$('messages').addEventListener('click', async (event) => {
  const connect = event.target.closest('[data-oauth-connect]');
  if (connect) {
    const provider = connect.dataset.oauthConnect;
    connect.disabled = true;
    try {
      const result = await request('/oauth/' + encodeURIComponent(provider) + '/start', { method: 'POST', body: {} });
      const popup = window.open(result.authorizationUrl, 'mailharbor-oauth', 'popup,width=640,height=760');
      if (!popup) window.top.location.assign(result.authorizationUrl);
    } catch (error) {
      await renderConnectedAccounts(error.message);
    }
    return;
  }
  const sync = event.target.closest('[data-oauth-sync]');
  if (sync) {
    sync.disabled = true;
    try {
      const result = await request('/accounts/' + encodeURIComponent(sync.dataset.oauthSync) + '/sync', { method: 'POST', body: {} });
      await renderConnectedAccounts('Synced ' + result.checked + ' messages; imported ' + result.imported + '.');
    } catch (error) {
      await renderConnectedAccounts(error.message);
    }
    return;
  }
  const disconnect = event.target.closest('[data-oauth-disconnect]');
  if (disconnect) {
    if (!window.confirm('Disconnect this mailbox from MailHarbor? Messages already synced will remain in Minglora.')) return;
    disconnect.disabled = true;
    try {
      await request('/accounts/' + encodeURIComponent(disconnect.dataset.oauthDisconnect), { method: 'DELETE' });
      await renderConnectedAccounts('The external mailbox was disconnected.');
    } catch (error) {
      await renderConnectedAccounts(error.message);
    }
  }
});

window.addEventListener('message', async event => {
  if (event.origin !== window.location.origin || !event.data || event.data.type !== 'mailharbor-oauth-result') return;
  currentFolder = 'accounts';
  const status = event.data.status === 'connected'
    ? 'Your ' + (event.data.provider === 'gmail' ? 'Gmail' : 'Outlook') + ' account is connected.'
    : 'Connection failed: ' + String(event.data.message || 'The provider authorization did not complete.');
  await renderConnectedAccounts(status).catch(error => window.alert(error.message));
});

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
  $('compose-form').reset();
  resetComposerState();
  populateFromAccountSelect();
  const signature = String(mailSettingsState.signature || '').trim();
  $('body').value = signature ? '\n\n--\n' + signature : '';
  setFeedback($('compose-feedback'), '');
  $('composer').showModal();
});
$('attachments').addEventListener('change', () => {
  renderComposeAttachments();
  const files = Array.from($('attachments').files || []);
  if (pendingAttachments.length + files.length > 5 || files.some(file => file.size > 1500000) ||
      pendingAttachments.reduce((sum, item) => sum + Number(item.size || 0), 0) + files.reduce((sum, file) => sum + file.size, 0) > 4000000) {
    $('attachments').value = '';
    renderComposeAttachments();
    setFeedback($('compose-feedback'), 'The attachment limit is 5 files, 1.5 MB each and 4 MB total.', true);
  } else setFeedback($('compose-feedback'), files.length ? files.length + ' attachment(s) selected.' : '');
});
$('reply-message').addEventListener('click', () => composeFromMessage('reply'));
$('forward-message').addEventListener('click', () => composeFromMessage('forward'));
$('save-draft').addEventListener('click', saveDraft);
$('close-compose').addEventListener('click', () => $('composer').close());
$('close-detail').addEventListener('click', () => $('message-view').close());

$('compose-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!mailStatus.outboundEmailConfigured && !mailStatus.oauthOutboundEnabled && !mailStatus.internalMessagingEnabled) {
    setFeedback($('compose-feedback'), 'Mail delivery is not enabled. No message was sent.', true);
    return;
  }
  const internalOnly = Boolean(mailStatus.internalMessagingEnabled &&
    !mailStatus.outboundEmailConfigured && !mailStatus.oauthOutboundEnabled);
  $('send').disabled = true;
  setFeedback($('compose-feedback'), 'Preparing message and attachments…');
  try {
    const payload = await composePayload();
    payload.draftId = currentDraftId;
    setFeedback($('compose-feedback'), internalOnly ? 'Delivering inside Minglora…' : 'Queueing message…');
    const result = await request('/messages', { method: 'POST', body: payload });
    $('composer').close();
    $('compose-form').reset();
    resetComposerState();
    currentFolder = 'sent';
    await loadMessages();
    window.alert(internalOnly
      ? 'Message delivered to Minglora member mailboxes. External email was not sent. Message ID: ' + result.message.id
      : 'Message queued. It will show as accepted only after the connected mail provider accepts it. Message ID: ' + result.message.id);
  } catch (error) {
    setFeedback($('compose-feedback'), error.message, true);
  } finally {
    $('send').disabled = !(mailStatus.outboundEmailConfigured || mailStatus.oauthOutboundEnabled || mailStatus.internalMessagingEnabled);
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
