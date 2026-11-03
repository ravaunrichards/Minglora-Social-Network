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
