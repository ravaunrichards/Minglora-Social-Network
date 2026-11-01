import crypto from 'node:crypto';

const API_PATH = '/api';
const sha256 = value => crypto.createHash('sha256').update(value || Buffer.alloc(0)).digest('hex');

function signedHeaders({ secret, userId, method, path, body = '' }) {
  const timestamp = String(Date.now());
  const bodyHash = sha256(body);
  const signed = [timestamp, String(method).toUpperCase(), path, String(userId), bodyHash].join('\\n');
  const signature = crypto.createHmac('sha256', secret).update(signed).digest('hex');
  return {
    'x-minglora-user-id': String(userId),
    'x-minglora-timestamp': timestamp,
    'x-minglora-signature': signature
  };
}

function settings() {
  const base = String(process.env.MAILHARBOR_API_URL || '').trim().replace(/\\/+$/, '');
  const secret = String(process.env.MAILHARBOR_SSO_SECRET || '');
  if (!base || Buffer.byteLength(secret) < 32) return null;
  let parsed;
  try { parsed = new URL(base); } catch { return null; }
  const localEmbeddedApi = parsed.protocol === 'http:' &&
    parsed.hostname === '127.0.0.1' && parsed.port === '3211';
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:' && !localEmbeddedApi) return null;
  return { base, secret };
}

async function forward({ base, secret, userId, method, path, input }) {
  const body = ['GET','HEAD'].includes(method) ? '' : JSON.stringify(input ?? {});
  const response = await fetch(base + path, {
    method,
    headers: {
      ...signedHeaders({ secret, userId, method, path, body }),
      ...(body ? { 'content-type': 'application/json' } : {}),
      accept: 'application/json'
    },
    body: body || undefined,
    signal: AbortSignal.timeout(15000)
  });
  const raw = await response.text();
  let payload;
  try { payload = raw ? JSON.parse(raw) : null; }
  catch { payload = { error: 'MailHarbor returned an invalid response.' }; }
  return { status: response.status, body: payload };
}

export async function proxyMailHarbor({ method, pathname, search = '', input = {}, user }) {
  const config = settings();
  if (!config) return {
    status: 503,
    body: { error: 'MailHarbor is not connected inside Minglora. Configure its local API and private SSO secret.' }
  };
  if (!user?.id || !user?.username || !user?.name) {
    return { status: 401, body: { error: 'A complete Minglora member session is required to open MailHarbor.' } };
  }

  try {
    const provisionPath = API_PATH + '/sso/provision';
    const provision = await forward({
      ...config,
      userId: user.id,
      method: 'POST',
      path: provisionPath,
      input: { username: user.username, displayName: user.name }
    });
    if (provision.status < 200 || provision.status >= 300) return provision;

    const safePath = String(pathname || '/');
    if (!safePath.startsWith('/') || safePath.startsWith('//') || safePath.includes('\\\\')) {
      return { status: 400, body: { error: 'Invalid MailHarbor API route.' } };
    }
    const upstreamPath = API_PATH + safePath + String(search || '');
    return await forward({
      ...config,
      userId: user.id,
      method: String(method || 'GET').toUpperCase(),
      path: upstreamPath,
      input
    });
  } catch (error) {
    console.error('[Minglora MailHarbor]', String(error?.message || error).slice(0,180));
    return { status: 503, body: { error: 'MailHarbor is temporarily unavailable inside Minglora. Your message request was not confirmed.' } };
  }
}
