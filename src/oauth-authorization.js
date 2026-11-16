import crypto from 'node:crypto';

export function createSupabaseOAuthAuthorization(provider, appOrigin, projectUrl) {
  const providerId = String(provider || '').trim().toLowerCase();
  if (!/^[a-z0-9_]+$/.test(providerId)) {
    throw new TypeError('OAuth provider identifier is invalid.');
  }

  let appBase;
  let projectBase;
  try {
    appBase = new URL(appOrigin);
    projectBase = new URL(projectUrl);
  } catch {
    throw new TypeError('Minglora or Supabase project URL is invalid.');
  }
  if (!['http:', 'https:'].includes(appBase.protocol) || !appBase.host ||
      projectBase.protocol !== 'https:' || !projectBase.host) {
    throw new TypeError('OAuth redirect and Supabase project URLs must use secure supported origins.');
  }

  const state = crypto.randomBytes(24).toString('base64url');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const redirectTarget = new URL('/auth/oauth/callback', appBase.origin);
  redirectTarget.searchParams.set('state', state);

  const authorize = new URL('/auth/v1/authorize', projectBase.origin);
  authorize.searchParams.set('provider', providerId);
  authorize.searchParams.set('redirect_to', redirectTarget.toString());
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 's256');

  return {
    provider: providerId,
    state,
    verifier,
    challenge,
    callbackUrl: redirectTarget.toString(),
    authorizationUrl: authorize.toString()
  };
}
