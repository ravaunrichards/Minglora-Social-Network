import crypto from 'node:crypto';

const DEFAULT_APP_ORIGIN = 'https://minglora-social-network.onrender.com';
const PROVIDERS = {
  gmail: {
    clientId: env => env.GOOGLE_CLIENT_ID,
    clientSecret: env => env.GOOGLE_CLIENT_SECRET,
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    scopes: [
      'openid', 'email', 'profile',
      'https://www.googleapis.com/auth/gmail.send'
    ]
  },
  outlook: {
    clientId: env => env.MICROSOFT_CLIENT_ID,
    clientSecret: env => env.MICROSOFT_CLIENT_SECRET,
    authorizationEndpoint: env => 'https://login.microsoftonline.com/' +
      encodeURIComponent(env.MICROSOFT_TENANT_ID || 'common') + '/oauth2/v2.0/authorize',
    tokenEndpoint: env => 'https://login.microsoftonline.com/' +
      encodeURIComponent(env.MICROSOFT_TENANT_ID || 'common') + '/oauth2/v2.0/token',
    scopes: ['openid', 'profile', 'email', 'offline_access', 'User.Read', 'Mail.Read', 'Mail.Send']
  }
};

function providerConfig(provider, env = process.env) {
  if (!Object.hasOwn(PROVIDERS, provider)) return null;
  const definition = PROVIDERS[provider];
  const value = key => typeof definition[key] === 'function' ? definition[key](env) : definition[key];
  const origin = String(env.APP_ORIGIN || DEFAULT_APP_ORIGIN).trim().replace(/\/+$/, '');
  let parsedOrigin;
  try { parsedOrigin = new URL(origin); } catch { return null; }
  if (parsedOrigin.protocol !== 'https:' && parsedOrigin.hostname !== 'localhost') return null;
  const clientId = String(value('clientId') || '').trim();
  const clientSecret = String(value('clientSecret') || '').trim();
  const redirectUri = origin + '/api/mailharbor/oauth/' + provider + '/callback';
  return {
    provider, clientId, clientSecret,
    authorizationEndpoint: value('authorizationEndpoint'),
    tokenEndpoint: value('tokenEndpoint'),
    scopes: definition.scopes,
    redirectUri,
    configured: Boolean(clientId && clientSecret)
  };
}

export function getMailHarborOAuthStatus(env = process.env, db = {}) {
  const output = {};
  for (const provider of ['gmail', 'outlook']) {
    const config = providerConfig(provider, env);
    const accounts = Array.isArray(db.mailExternalAccounts) ? db.mailExternalAccounts : [];
    output[provider] = {
      configured: Boolean(config?.configured),
      connected: accounts.some(item => item.provider === provider && item.status === 'connected'),
      callbackUrl: config?.redirectUri || (String(env.APP_ORIGIN || DEFAULT_APP_ORIGIN).replace(/\/+$/, '') +
        '/api/mailharbor/oauth/' + provider + '/callback'),
      canSend: true,
      canSync: provider === 'outlook',
      note: provider === 'gmail'
        ? 'Gmail send is supported. Inbox sync needs restricted Google Gmail API access and a separate security assessment for a server-side public application.'
        : 'Outlook inbox sync and sending use delegated Microsoft Graph permissions.'
    };
  }
  return output;
}

function encryptionKey() {
  const secret = String(process.env.MAILHARBOR_OAUTH_ENCRYPTION_KEY || process.env.SESSION_SECRET || '').trim();
  if (secret.length < 32) throw Object.assign(new Error('MailHarbor secure token storage is not configured. Set a 32-character server-side encryption secret.'), { status: 503 });
  return crypto.createHash('sha256').update('minglora-mailharbor-oauth-v1|' + secret).digest();
}

function sealTokens(tokens) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(tokens), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

function openTokens(sealed) {
  try {
    const bytes = Buffer.from(String(sealed || ''), 'base64url');
    if (bytes.length < 29) throw new Error('Invalid token envelope');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
  } catch {
    throw Object.assign(new Error('A connected mailbox credential could not be unlocked. Reconnect that account.'), { status: 503 });
  }
}

function ensureCollections(db) {
  if (!Array.isArray(db.mailOAuthStates)) db.mailOAuthStates = [];
  if (!Array.isArray(db.mailExternalAccounts)) db.mailExternalAccounts = [];
}

function safeAccount(account) {
  return {
    id: account.id, provider: account.provider, email: account.email,
    displayName: account.displayName, status: account.status,
    isDefault: account.isDefault === true, connectedAt: account.connectedAt,
    lastSyncedAt: account.lastSyncedAt || null,
    lastError: account.lastError || null,
    canSend: true,
    canSync: account.provider === 'outlook'
  };
}

async function readProviderJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = String(payload.error_description || payload.error?.message || payload.error || payload.message ||
      ('Provider request failed (' + response.status + ')')).slice(0, 500);
    throw Object.assign(new Error(error), { status: response.status });
  }
  return payload;
}

async function tokenRequest(config, params) {
  const response = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(20000)
  });
  return readProviderJson(response);
}

function safeProviderError(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || 'The mail provider request failed.')
    .replace(/access_token|refresh_token|client_secret/gi, 'credential').slice(0, 350);
  return Object.assign(new Error(message), Number.isInteger(status) && status ? { status } : {});
}

export async function startMailHarborOAuth({ provider, memberId, db, saveStore }) {
  ensureCollections(db);
  const config = providerConfig(provider);
  if (!config?.configured) throw Object.assign(new Error('This provider is not configured yet. Minglora still needs its private OAuth client ID and client secret.'), { status: 503 });
  encryptionKey();
  const state = crypto.randomBytes(32).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const createdAt = Date.now();
  db.mailOAuthStates = db.mailOAuthStates.filter(item => Date.parse(item.expiresAt || 0) > createdAt);
  db.mailOAuthStates.push({
    id: crypto.createHash('sha256').update(state).digest('hex'),
    provider, memberId: String(memberId), verifier, redirectUri: config.redirectUri,
    createdAt: new Date(createdAt).toISOString(),
    expiresAt: new Date(createdAt + 10 * 60 * 1000).toISOString()
  });
  await saveStore();
  const authorizationEndpoint = typeof config.authorizationEndpoint === 'function'
    ? config.authorizationEndpoint() : config.authorizationEndpoint;
  const url = new URL(authorizationEndpoint);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    response_mode: 'query',
    scope: config.scopes.join(' '),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...(provider === 'gmail' ? { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' } : { prompt: 'select_account' })
  }).toString();
  return { authorizationUrl: url.toString() };
}

export async function completeMailHarborOAuth({ provider, memberId, code, state, providerError, db, saveStore }) {
  ensureCollections(db);
  if (providerError) throw Object.assign(new Error(providerError === 'access_denied'
    ? 'You cancelled the mailbox connection. No account was connected.'
    : 'The email provider declined the authorization request.'), { status: 400 });
  const stateHash = crypto.createHash('sha256').update(String(state || '')).digest('hex');
  const stateIndex = db.mailOAuthStates.findIndex(item =>
    item.id === stateHash && item.provider === provider && item.memberId === String(memberId) &&
    Date.parse(item.expiresAt || 0) > Date.now()
  );
  if (stateIndex < 0) throw Object.assign(new Error('This mailbox authorization expired or did not match your Minglora session. Start the connection again.'), { status: 403 });
  const stateRecord = db.mailOAuthStates[stateIndex];
  db.mailOAuthStates.splice(stateIndex, 1);
  await saveStore();
  const config = providerConfig(provider);
  if (!config?.configured) throw Object.assign(new Error('This provider is not configured on Minglora yet.'), { status: 503 });
  const tokenData = await tokenRequest(config, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'authorization_code',
    code: String(code || ''),
    redirect_uri: stateRecord.redirectUri,
    code_verifier: stateRecord.verifier
  });
  if (!tokenData.access_token) throw Object.assign(new Error('The email provider did not return an access token.'), { status: 502 });
  const profileUrl = provider === 'gmail'
    ? 'https://openidconnect.googleapis.com/v1/userinfo'
    : 'https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName';
  const profileResponse = await fetch(profileUrl, {
    headers: { Authorization: 'Bearer ' + tokenData.access_token, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000)
  });
  const profile = await readProviderJson(profileResponse);
  const email = String(provider === 'gmail' ? profile.email : (profile.mail || profile.userPrincipalName) || '').trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw Object.assign(new Error('The provider account did not return a valid email address.'), { status: 502 });
  }
  const now = new Date().toISOString();
  let account = db.mailExternalAccounts.find(item =>
    item.memberId === String(memberId) && item.provider === provider && item.email === email
  );
  const previousTokens = account?.tokensSealed ? openTokens(account.tokensSealed) : {};
  const tokens = {
    access_token: String(tokenData.access_token),
    refresh_token: String(tokenData.refresh_token || previousTokens.refresh_token || ''),
    token_type: String(tokenData.token_type || 'Bearer'),
    expiresAt: Date.now() + Math.max(60, Number(tokenData.expires_in || 3600)) * 1000,
    scope: String(tokenData.scope || previousTokens.scope || '')
  };
  if (!tokens.refresh_token && !previousTokens.refresh_token) {
    throw Object.assign(new Error('The provider did not grant offline access. Reconnect and approve the requested access so MailHarbor can refresh the connection.'), { status: 502 });
  }
  if (!account) {
    account = {
      id: crypto.randomUUID(), memberId: String(memberId), provider, email,
      displayName: String(profile.name || profile.displayName || email).slice(0, 160),
      createdAt: now, isDefault: !db.mailExternalAccounts.some(item => item.memberId === String(memberId) && item.status === 'connected')
    };
    db.mailExternalAccounts.push(account);
  }
  account.displayName = String(profile.name || profile.displayName || account.displayName || email).slice(0, 160);
  account.tokensSealed = sealTokens(tokens);
  account.tokenExpiresAt = new Date(tokens.expiresAt).toISOString();
  account.status = 'connected';
  account.lastError = null;
  account.updatedAt = now;
  await saveStore();
  return safeAccount(account);
}

export function listMailHarborOAuthAccounts(db, memberId) {
  ensureCollections(db);
  return db.mailExternalAccounts.filter(item =>
    item.memberId === String(memberId) && item.status === 'connected'
  ).map(safeAccount);
}

function findAccount(db, memberId, accountId) {
  ensureCollections(db);
  const account = db.mailExternalAccounts.find(item =>
    item.id === String(accountId) && item.memberId === String(memberId) && item.status === 'connected'
  );
  if (!account) throw Object.assign(new Error('Connected email account not found.'), { status: 404 });
  return account;
}

async function getAccessToken(account, saveStore) {
  const tokens = openTokens(account.tokensSealed);
  if (tokens.access_token && Number(tokens.expiresAt || 0) > Date.now() + 90000) return tokens.access_token;
  if (!tokens.refresh_token) throw Object.assign(new Error('Reconnect this email account to restore access.'), { status: 401 });
  const config = providerConfig(account.provider);
  if (!config?.configured) throw Object.assign(new Error('The provider OAuth client is not configured on Minglora.'), { status: 503 });
  const refreshed = await tokenRequest(config, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    ...(account.provider === 'outlook' ? { scope: config.scopes.join(' ') } : {})
  });
  tokens.access_token = String(refreshed.access_token || '');
  if (!tokens.access_token) throw Object.assign(new Error('The provider did not return a refreshed access token.'), { status: 502 });
  tokens.refresh_token = String(refreshed.refresh_token || tokens.refresh_token);
  tokens.expiresAt = Date.now() + Math.max(60, Number(refreshed.expires_in || 3600)) * 1000;
  tokens.token_type = String(refreshed.token_type || tokens.token_type || 'Bearer');
  account.tokensSealed = sealTokens(tokens);
  account.tokenExpiresAt = new Date(tokens.expiresAt).toISOString();
  account.updatedAt = new Date().toISOString();
  await saveStore();
  return tokens.access_token;
}

async function providerApi(account, path, options, saveStore) {
  let accessToken = await getAccessToken(account, saveStore);
  let response = await fetch(path, {
    ...options,
    headers: { ...(options?.headers || {}), Authorization: 'Bearer ' + accessToken, Accept: 'application/json' },
    signal: AbortSignal.timeout(25000)
  });
  if (response.status === 401) {
    const tokens = openTokens(account.tokensSealed);
    tokens.expiresAt = 0;
    account.tokensSealed = sealTokens(tokens);
    await saveStore();
    accessToken = await getAccessToken(account, saveStore);
    response = await fetch(path, {
      ...options,
      headers: { ...(options?.headers || {}), Authorization: 'Bearer ' + accessToken, Accept: 'application/json' },
      signal: AbortSignal.timeout(25000)
    });
  }
  return response;
}

function decodeBase64Url(value) {
  return Buffer.from(String(value || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function stripHtml(value) {
  return String(value || '').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>').replace(/&#39;/gi, "'").replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ').trim();
}

function gmailBody(payload) {
  if (!payload) return '';
  const parts = Array.isArray(payload.parts) ? payload.parts : [];
  if (payload.mimeType === 'text/plain' && payload.body?.data) return decodeBase64Url(payload.body.data);
  const plain = parts.find(item => item.mimeType === 'text/plain' && item.body?.data);
  if (plain) return decodeBase64Url(plain.body.data);
  const nested = parts.map(gmailBody).find(Boolean);
  if (nested) return nested;
  if (payload.body?.data) return stripHtml(decodeBase64Url(payload.body.data));
  return '';
}

function headerValue(headers, name) {
  return String((headers || []).find(item => String(item.name).toLowerCase() === name.toLowerCase())?.value || '');
}

export async function syncMailHarborOAuthAccount({ db, memberId, accountId, saveStore, makeMessageId }) {
  const account = findAccount(db, memberId, accountId);
  let normalized = [];
  try {
    if (account.provider === 'gmail') {
      throw Object.assign(new Error('Gmail inbox sync is not enabled on the $0 MailHarbor path. Google classifies Gmail inbox-reading scopes as restricted and requires a server-side security assessment for public production use. Gmail sending remains available.'), { status: 403 });
    } else if (account.provider === 'outlook') {
      const endpointUrl = new URL('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages');
      const graphParams = {
        '$top': '10',
        '$orderby': 'receivedDateTime desc',
        '$select': 'id,internetMessageId,subject,from,toRecipients,ccRecipients,body,receivedDateTime,isRead'
      };
      const lastSynced = Date.parse(account.lastSyncedAt || '');
      if (Number.isFinite(lastSynced) && lastSynced > 0) {
        graphParams['$filter'] = 'receivedDateTime gt ' + new Date(lastSynced - 60000).toISOString();
      }
      endpointUrl.search = new URLSearchParams(graphParams).toString();
      const endpoint = endpointUrl.toString();
      const response = await providerApi(account, endpoint, { method: 'GET' }, saveStore);
      const data = await readProviderJson(response);
      normalized = await Promise.all((data.value || []).slice(0, 10).map(async item => {
        let attachments = [];
        if (item.hasAttachments === true) {
          const attachmentUrl = 'https://graph.microsoft.com/v1.0/me/messages/' +
            encodeURIComponent(item.id) + '/attachments?$select=id,name,contentType,size,contentBytes';
          const attachmentResponse = await providerApi(account, attachmentUrl, { method: 'GET' }, saveStore);
          const attachmentData = await readProviderJson(attachmentResponse);
          let totalBytes = 0;
          attachments = (attachmentData.value || [])
            .filter(file => String(file['@odata.type'] || '').endsWith('fileAttachment'))
            .map(file => {
              const size = Math.max(0, Number(file.size || 0));
              const contentBase64 = typeof file.contentBytes === 'string' &&
                size <= 1500000 && totalBytes + size <= 4000000 ? file.contentBytes : '';
              if (contentBase64) totalBytes += size;
              return {
                id: String(file.id || ''),
                filename: String(file.name || 'attachment').replace(/[\/\\\r\n]/g, '_').slice(0, 200),
                contentType: String(file.contentType || 'application/octet-stream').slice(0, 120),
                size, contentBase64
              };
            });
        }
        return {
          providerId: String(item.internetMessageId || item.id),
          sender: String(item.from?.emailAddress?.address || ''),
          senderName: String(item.from?.emailAddress?.name || ''),
          recipients: {
            to: (item.toRecipients || []).map(recipient => recipient.emailAddress?.address).filter(Boolean),
            cc: (item.ccRecipients || []).map(recipient => recipient.emailAddress?.address).filter(Boolean),
            bcc: []
          },
          subject: String(item.subject || '').slice(0, 998),
          body: item.body?.contentType === 'html' ? stripHtml(item.body.content) : String(item.body?.content || ''),
          createdAt: item.receivedDateTime || new Date().toISOString(),
          isRead: item.isRead === true,
          attachments
        };
      }));
    }
  } catch (error) {
    account.lastError = safeProviderError(error).message;
    account.updatedAt = new Date().toISOString();
    await saveStore().catch(() => {});
    throw safeProviderError(error);
  }
  const now = new Date().toISOString();
  let stored = 0;
  for (const message of normalized) {
    const duplicate = db.mailMessages.some(item =>
      String(item.owner_id) === String(memberId) &&
      String(item.external_account_id || '') === account.id &&
      String(item.external_message_id || '') === message.providerId
    );
    if (duplicate) continue;
    db.mailMessages.push({
      id: makeMessageId(db), owner_id: String(memberId),
      sender_email: message.sender, sender_name: message.senderName || message.sender,
      reply_to: message.sender, recipients: message.recipients,
      subject: message.subject || '(no subject)', body_text: message.body,
      folder: 'inbox', is_read: message.isRead, is_starred: false,
      delivery_status: 'received', delivery_channel: account.provider,
      external_account_id: account.id, external_message_id: message.providerId,
      attachments: message.attachments || [],
      last_error: null, created_at: message.createdAt, received_at: message.createdAt
    });
    stored += 1;
  }
  account.lastSyncedAt = now;
  account.lastError = null;
  account.updatedAt = now;
  await saveStore();
  return { imported: stored, checked: normalized.length, account: safeAccount(account) };
}

function cleanHeader(value) {
  return String(value || '').replace(/[\r\n<>]/g, '').trim().slice(0, 998);
}

export async function sendMailHarborOAuthMessage({ db, memberId, accountId, message, saveStore }) {
  const account = findAccount(db, memberId, accountId);
  const recipients = message.externalDelivery || {};
  const to = (recipients.to || []).filter(Boolean);
  const cc = (recipients.cc || []).filter(Boolean);
  const bcc = (recipients.bcc || []).filter(Boolean);
  if (!to.length && !cc.length && !bcc.length) throw Object.assign(new Error('At least one external recipient is required.'), { status: 400 });
  try {
    if (account.provider === 'gmail') {
      const boundary = 'minglora-' + crypto.randomBytes(18).toString('hex');
      const attachments = Array.isArray(message.attachments) ? message.attachments : [];
      const headers = [
        'From: ' + cleanHeader(account.displayName || account.email) + ' <' + cleanHeader(account.email) + '>',
        ...(to.length ? ['To: ' + to.map(cleanHeader).join(', ')] : []),
        ...(cc.length ? ['Cc: ' + cc.map(cleanHeader).join(', ')] : []),
        ...(bcc.length ? ['Bcc: ' + bcc.map(cleanHeader).join(', ')] : []),
        'Subject: ' + cleanHeader(message.subject || ''),
        'MIME-Version: 1.0',
        'Content-Type: multipart/mixed; boundary="' + boundary + '"'
      ];
      const bodyParts = [
        '--' + boundary + '\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n' +
          (Buffer.from(String(message.body_text || ''), 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') || '') +
          '\r\n'
      ];
      for (const attachment of attachments) {
        if (!attachment.contentBase64) continue;
        const filename = String(attachment.filename || 'attachment').replace(/[\r\n"]/g, '_').slice(0, 180);
        const contentType = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(String(attachment.contentType || ''))
          ? attachment.contentType : 'application/octet-stream';
        const base64 = String(attachment.contentBase64).replace(/[^A-Za-z0-9+/=]/g, '');
        bodyParts.push(
          '--' + boundary + '\r\nContent-Type: ' + contentType + '; name="' + filename + '"\r\n' +
          'Content-Disposition: attachment; filename="' + filename + '"\r\n' +
          'Content-Transfer-Encoding: base64\r\n\r\n' +
          (base64.match(/.{1,76}/g)?.join('\r\n') || '') + '\r\n'
        );
      }
      bodyParts.push('--' + boundary + '--\r\n');
      const raw = headers.join('\r\n') + '\r\n\r\n' + bodyParts.join('');
      const encoded = Buffer.from(raw, 'utf8').toString('base64url');
      const response = await providerApi(account,
        'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: encoded }) },
        saveStore);
      const result = await readProviderJson(response);
      return { id: String(result.id || 'gmail-' + crypto.randomUUID()), provider: 'gmail' };
    }
    if (account.provider === 'outlook') {
      const makeRecipients = list => list.map(address => ({ emailAddress: { address } }));
      const response = await providerApi(account,
        'https://graph.microsoft.com/v1.0/me/sendMail',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              subject: String(message.subject || ''),
              body: { contentType: 'Text', content: String(message.body_text || '') },
              toRecipients: makeRecipients(to), ccRecipients: makeRecipients(cc), bccRecipients: makeRecipients(bcc),
              attachments: (Array.isArray(message.attachments) ? message.attachments : [])
                .filter(file => file.contentBase64)
                .map(file => ({
                  '@odata.type': '#microsoft.graph.fileAttachment',
                  name: String(file.filename || 'attachment').replace(/[\r\n]/g, '_').slice(0, 180),
                  contentType: String(file.contentType || 'application/octet-stream'),
                  contentBytes: String(file.contentBase64)
                }))
            },
            saveToSentItems: true
          })
        }, saveStore);
      if (!response.ok && response.status !== 202) await readProviderJson(response);
      return { id: 'outlook-' + crypto.randomUUID(), provider: 'outlook' };
    }
    throw Object.assign(new Error('This connected provider cannot send messages yet.'), { status: 400 });
  } catch (error) {
    const safe = safeProviderError(error);
    account.lastError = safe.message;
    account.updatedAt = new Date().toISOString();
    await saveStore().catch(() => {});
    throw safe;
  }
}

export async function disconnectMailHarborOAuthAccount({ db, memberId, accountId, saveStore }) {
  const account = findAccount(db, memberId, accountId);
  const before = structuredClone(db.mailExternalAccounts);
  const beforeMessages = structuredClone(db.mailMessages || []);
  db.mailExternalAccounts = db.mailExternalAccounts.filter(item => item.id !== account.id);
  for (const message of db.mailMessages || []) {
    if (String(message.external_account_id || '') === account.id) {
      message.external_account_id = null;
      message.external_account_disconnected = true;
    }
  }
  const remaining = db.mailExternalAccounts.filter(item => item.memberId === String(memberId) && item.status === 'connected');
  if (remaining.length && !remaining.some(item => item.isDefault)) remaining[0].isDefault = true;
  try { await saveStore(); }
  catch (error) {
    db.mailExternalAccounts = before;
    if (Array.isArray(db.mailMessages)) db.mailMessages.splice(0, db.mailMessages.length, ...beforeMessages);
    throw error;
  }
  return { disconnected: true };
}
