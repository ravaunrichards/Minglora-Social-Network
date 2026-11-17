import { createHmac, timingSafeEqual } from 'node:crypto';

const RESEND_API = 'https://api.resend.com';
const EMAIL_PATTERN = /^[^\s@<>]+@[a-z0-9.-]+\.[a-z]{2,63}$/iu;
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const MAX_SUBJECT = 200;
const MAX_BODY = 24000;

const clean = value => String(value ?? '').trim();
const bounded = (value, max) => clean(value).slice(0, max);

export function normalizeAIEmailAddress(value) {
  const address = clean(value).toLowerCase();
  if (address.length > 320 || !EMAIL_PATTERN.test(address)) {
    throw Object.assign(new Error('Enter a valid email address.'), { status: 400 });
  }
  return address;
}

export function normalizeAIEmailDomain(value) {
  const domain = clean(value).replace(/^@/, '').toLowerCase().replace(/\.$/, '');
  if (!DOMAIN_PATTERN.test(domain)) {
    throw Object.assign(new Error('Configure a valid verified email domain for Minglora AI mailboxes.'), { status: 503 });
  }
  return domain;
}

export function getAIEmailConfig(env = process.env) {
  const provider = bounded(env.MINGLORA_AI_EMAIL_PROVIDER || env.EMAIL_PROVIDER || 'none', 30).toLowerCase();
  const apiKey = clean(env.RESEND_API_KEY);
  const webhookSecret = clean(env.RESEND_WEBHOOK_SECRET);
  const webhookUrl = bounded(env.MINGLORA_AI_EMAIL_WEBHOOK_URL, 500);
  const domain = clean(env.MINGLORA_AI_EMAIL_DOMAIN).toLowerCase();
  const validDomain = DOMAIN_PATTERN.test(domain);
  let validWebhookUrl = false;
  try {
    const parsed = new URL(webhookUrl);
    validWebhookUrl = parsed.protocol === 'https:' &&
      parsed.pathname === '/api/ai-network/email/webhook' &&
      !parsed.search && !parsed.hash && !parsed.username && !parsed.password;
  } catch { /* An unset or invalid endpoint remains unconfigured. */ }
  const fromName = bounded(env.MINGLORA_AI_EMAIL_FROM_NAME || 'Minglora AI', 80);
  return {
    provider,
    configured: provider === 'resend' && Boolean(apiKey) && validDomain && Boolean(webhookSecret) && validWebhookUrl,
    sendingConfigured: provider === 'resend' && Boolean(apiKey) && validDomain,
    receivingConfigured: provider === 'resend' && Boolean(apiKey) && validDomain && Boolean(webhookSecret) && validWebhookUrl,
    webhookConfigured: Boolean(webhookSecret) && validWebhookUrl,
    webhookUrl: validWebhookUrl ? webhookUrl : null,
    domain: validDomain ? domain : null,
    fromName,
    // Secret values are deliberately never returned by status/reporting APIs.
    hasApiKey: Boolean(apiKey),
    hasWebhookSecret: Boolean(webhookSecret)
  };
}

async function resendRequest(path, { apiKey, method = 'GET', body, idempotencyKey, fetchImpl = fetch, timeoutMs = 10000 } = {}) {
  if (!apiKey) throw Object.assign(new Error('Minglora AI email provider credentials are not configured.'), { status: 503 });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { Authorization: 'Bearer ' + apiKey, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const response = await fetchImpl(RESEND_API + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = bounded(payload?.message || payload?.error || 'The Resend email provider rejected the request.', 220);
      const error = new Error(message);
      error.status = response.status === 401 || response.status === 403 ? 503 : 502;
      error.providerStatus = response.status;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') throw Object.assign(new Error('The email provider request timed out. Retry using the same message request ID.'), { status: 503 });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function inspectResendDomain({ env = process.env, fetchImpl = fetch } = {}) {
  const config = getAIEmailConfig(env);
  if (config.provider !== 'resend' || !config.hasApiKey || !config.domain) {
    return {
      provider: config.provider, configured: false, domain: config.domain,
      verified: false, sendingEnabled: false, receivingEnabled: false,
      webhookConfigured: config.webhookConfigured,
      note: 'Set the Resend provider, API key and Minglora AI email domain in the private server environment.'
    };
  }
  try {
    const response = await resendRequest('/domains?limit=100', { apiKey: env.RESEND_API_KEY, fetchImpl });
    const records = Array.isArray(response?.data) ? response.data : [];
    const match = records.find(item => clean(item?.name).toLowerCase() === config.domain);
    const verified = Boolean(match && String(match.status || '').toLowerCase() === 'verified');
    const sendingEnabled = Boolean(verified && String(match?.capabilities?.sending || '').toLowerCase() === 'enabled');
    const receivingEnabled = Boolean(verified && String(match?.capabilities?.receiving || '').toLowerCase() === 'enabled');
    let webhookMatch = null;
    if (sendingEnabled && receivingEnabled && config.webhookConfigured) {
      let after = '';
      for (let page = 0; page < 5; page += 1) {
        const query = new URLSearchParams({ limit: '100' });
        if (after) query.set('after', after);
        const webhookPage = await resendRequest('/webhooks?' + query.toString(), { apiKey: env.RESEND_API_KEY, fetchImpl });
        const webhooks = Array.isArray(webhookPage?.data) ? webhookPage.data : [];
        webhookMatch = webhookMatch || webhooks.find(item =>
          clean(item?.endpoint) === config.webhookUrl &&
          String(item?.status || '').toLowerCase() === 'enabled' &&
          Array.isArray(item?.events) && item.events.includes('email.received')
        ) || null;
        if (webhookMatch || webhookPage?.has_more !== true || !webhooks.length) break;
        after = String(webhooks[webhooks.length - 1]?.id || '');
        if (!after) break;
      }
    }
    const webhookActive = Boolean(webhookMatch);
    const ready = sendingEnabled && receivingEnabled && config.webhookConfigured && webhookActive;
    return {
      provider: 'resend', configured: true, domain: config.domain,
      domainId: match?.id || null, verified, sendingEnabled, receivingEnabled,
      webhookConfigured: config.webhookConfigured,
      webhookActive, webhookId: webhookMatch?.id || null, ready,
      note: !match ? 'The configured domain is not present in the Resend account.'
        : !verified ? 'The configured domain has not been verified by Resend.'
          : !sendingEnabled || !receivingEnabled ? 'Enable both sending and receiving for this verified Resend domain.'
            : !config.webhookConfigured ? 'Set the webhook signing secret and exact HTTPS Minglora webhook URL in the private service environment.'
              : !webhookActive ? 'Create or enable a Resend webhook for email.received at the configured Minglora webhook URL.'
                : 'The Resend domain and inbound webhook are verified and enabled.'
    };
  } catch (error) {
    return {
      provider: 'resend', configured: true, domain: config.domain,
      verified: false, sendingEnabled: false, receivingEnabled: false,
      webhookConfigured: config.webhookConfigured, ready: false,
      note: bounded(error?.message || 'The Resend domain could not be verified.', 220)
    };
  }
}

export async function sendResendEmail({
  from, to, subject, text, idempotencyKey, env = process.env, fetchImpl = fetch
}) {
  const config = getAIEmailConfig(env);
  const domain = normalizeAIEmailDomain(config.domain || '');
  const sender = normalizeAIEmailAddress(from);
  if (!sender.endsWith('@' + domain)) {
    throw Object.assign(new Error('The AI mailbox sender must belong to the configured Minglora email domain.'), { status: 400 });
  }
  const recipients = (Array.isArray(to) ? to : [to]).map(normalizeAIEmailAddress);
  if (!recipients.length || recipients.length > 10) {
    throw Object.assign(new Error('Email must have between one and ten recipients.'), { status: 400 });
  }
  const title = bounded(subject, MAX_SUBJECT);
  const body = String(text ?? '');
  if (!title || !body.trim() || body.length > MAX_BODY) {
    throw Object.assign(new Error('Email subject and message are required; message text must be 1–24,000 characters.'), { status: 400 });
  }
  const idempotency = bounded(idempotencyKey, 180);
  if (!idempotency) throw Object.assign(new Error('A stable email request ID is required for safe retries.'), { status: 400 });
  const result = await resendRequest('/emails', {
    apiKey: env.RESEND_API_KEY, method: 'POST', fetchImpl, idempotencyKey: idempotency,
    body: { from: config.fromName + ' <' + sender + '>', to: recipients, subject: title, text: body }
  });
  const data = result?.data && typeof result.data === 'object' ? result.data : result;
  if (!data?.id) throw Object.assign(new Error('Resend accepted no verifiable email message ID.'), { status: 502 });
  return { provider: 'resend', providerEmailId: String(data.id), accepted: true };
}

export async function retrieveResendInboundEmail(emailId, { env = process.env, fetchImpl = fetch } = {}) {
  const id = clean(emailId);
  if (!/^[0-9a-f-]{20,80}$/i.test(id)) {
    throw Object.assign(new Error('The inbound email provider reference is invalid.'), { status: 400 });
  }
  const result = await resendRequest('/emails/receiving/' + encodeURIComponent(id), {
    apiKey: env.RESEND_API_KEY, fetchImpl
  });
  const data = result?.data && typeof result.data === 'object' ? result.data : result;
  return {
    provider: 'resend',
    providerEmailId: id,
    from: bounded(data?.from, 320),
    to: Array.isArray(data?.to) ? data.to.map(value => bounded(value, 320)).slice(0, 20) : [],
    cc: Array.isArray(data?.cc) ? data.cc.map(value => bounded(value, 320)).slice(0, 20) : [],
    bcc: Array.isArray(data?.bcc) ? data.bcc.map(value => bounded(value, 320)).slice(0, 20) : [],
    subject: bounded(data?.subject, MAX_SUBJECT),
    text: String(data?.text || '').slice(0, MAX_BODY),
    html: String(data?.html || '').slice(0, MAX_BODY),
    messageId: bounded(data?.message_id, 320),
    attachments: Array.isArray(data?.attachments) ? data.attachments.slice(0, 20).map(item => ({
      id: bounded(item?.id, 160), filename: bounded(item?.filename, 240),
      contentType: bounded(item?.content_type || item?.contentType, 120),
      size: Number.isFinite(Number(item?.size)) ? Number(item.size) : null
    })) : [],
    receivedAt: bounded(data?.created_at, 64)
  };
}

export function verifyResendWebhook({ rawBody, headers, secret, now = Date.now(), toleranceSeconds = 300 }) {
  const id = clean(headers?.['svix-id'] || headers?.get?.('svix-id'));
  const timestamp = clean(headers?.['svix-timestamp'] || headers?.get?.('svix-timestamp'));
  const signature = clean(headers?.['svix-signature'] || headers?.get?.('svix-signature'));
  const secretValue = clean(secret);
  if (!id || !/^\d+$/.test(timestamp) || !signature || !secretValue.startsWith('whsec_')) return false;
  const issuedAt = Number(timestamp);
  if (!Number.isSafeInteger(issuedAt) || Math.abs(Math.floor(now / 1000) - issuedAt) > toleranceSeconds) return false;
  let key;
  try { key = Buffer.from(secretValue.slice(6), 'base64'); } catch { return false; }
  if (!key.length) return false;
  const expected = createHmac('sha256', key).update(id + '.' + timestamp + '.' + String(rawBody ?? ''), 'utf8').digest();
  const candidates = signature.split(/\s+/u).flatMap(part => {
    const [version, value] = part.split(',', 2);
    if (version !== 'v1' || !value) return [];
    try { return [Buffer.from(value, 'base64')]; } catch { return []; }
  });
  return candidates.some(candidate => candidate.length === expected.length && timingSafeEqual(candidate, expected));
}

export function escapeAIEmailHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char])).replace(/\r?\n/gu, '<br>');
}
