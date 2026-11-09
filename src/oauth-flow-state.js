import crypto from 'node:crypto';

const COOKIE_NAME = 'minglora_oauth';
const COOKIE_PATH = '/auth/oauth/callback';
const COOKIE_MAX_AGE_SECONDS = 600;

function signatureFor(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function isState(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(value);
}

function isVerifier(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}

export function createOAuthFlowCookie(state, verifier, secret, secure = false, createdAt = Date.now()) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new TypeError('OAuth flow signing secret must contain at least 32 characters.');
  }
  if (!isState(state) || !isVerifier(verifier) || !Number.isFinite(createdAt)) {
    throw new TypeError('OAuth flow state or PKCE verifier is invalid.');
  }

  const payload = Buffer.from(JSON.stringify({ state, verifier, createdAt })).toString('base64url');
  const value = payload + '.' + signatureFor(payload, secret);
  return COOKIE_NAME + '=' + encodeURIComponent(value) +
    '; HttpOnly; SameSite=Lax; Path=' + COOKIE_PATH +
    '; Max-Age=' + COOKIE_MAX_AGE_SECONDS + (secure ? '; Secure' : '');
}

export function readOAuthFlowCookie(cookieHeader, secret, now = Date.now()) {
  if (typeof secret !== 'string' || secret.length < 32 || !Number.isFinite(now)) return null;
  const raw = String(cookieHeader || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(COOKIE_NAME + '='))
    ?.slice(COOKIE_NAME.length + 1);
  if (!raw) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }

  const separator = decoded.lastIndexOf('.');
  if (separator < 1) return null;
  const payload = decoded.slice(0, separator);
  const suppliedSignature = decoded.slice(separator + 1);
  const expectedSignature = Buffer.from(signatureFor(payload, secret), 'utf8');
  const actualSignature = Buffer.from(suppliedSignature, 'utf8');
  if (actualSignature.length !== expectedSignature.length ||
      !crypto.timingSafeEqual(actualSignature, expectedSignature)) return null;

  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const age = now - Number(value.createdAt);
    if (!isState(value.state) || !isVerifier(value.verifier) ||
        !Number.isFinite(age) || age < 0 || age > COOKIE_MAX_AGE_SECONDS * 1000) return null;
    return { state: value.state, verifier: value.verifier, createdAt: value.createdAt };
  } catch {
    return null;
  }
}

export function clearOAuthFlowCookie(secure = false) {
  return COOKIE_NAME + '=; HttpOnly; SameSite=Lax; Path=' + COOKIE_PATH +
    '; Max-Age=0' + (secure ? '; Secure' : '');
}
