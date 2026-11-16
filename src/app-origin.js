const DEFAULT_PRODUCTION_ORIGIN = 'https://minglora-social-network.onrender.com';

function configuredProductionOrigin(value) {
  if (!value) return '';
  try {
    const url = new URL(String(value).trim());
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !hostname
      || hostname === 'localhost'
      || hostname.endsWith('.localhost')
      || hostname === '127.0.0.1'
      || hostname === '::1'
      || hostname.endsWith('.local')) return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function appOrigin(req, env = process.env) {
  // Never derive production security/auth redirects from request headers.
  // Reverse proxies and client-supplied forwarded headers can otherwise turn
  // password-recovery links into localhost or another attacker-controlled host.
  if (env.NODE_ENV === 'production') {
    return configuredProductionOrigin(env.APP_ORIGIN) || DEFAULT_PRODUCTION_ORIGIN;
  }

  const headers = req?.headers || {};
  const proto = String(headers['x-forwarded-proto'] || (req?.socket?.encrypted ? 'https' : 'http'))
    .split(',')[0].trim();
  const host = String(headers['x-forwarded-host'] || headers.host || 'localhost:3000')
    .split(',')[0].trim();
  try {
    return new URL(proto + '://' + host).origin;
  } catch {
    return 'http://localhost:3000';
  }
}


export function isAllowedAppOrigin(suppliedOrigin, req, env = process.env) {
  let origin;
  try {
    const parsed = new URL(String(suppliedOrigin || ''));
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    origin = parsed.origin;
  } catch {
    return false;
  }

  if (env.NODE_ENV === 'production') {
    // Keep the canonical Render hostname valid even when APP_ORIGIN is also
    // configured for a custom domain. This prevents a stale custom-origin
    // setting from blocking same-origin account creation and sign-in on Render.
    const allowed = [DEFAULT_PRODUCTION_ORIGIN, configuredProductionOrigin(env.APP_ORIGIN)]
      .filter(Boolean);
    return allowed.includes(origin);
  }

  return origin === appOrigin(req, env);
}
