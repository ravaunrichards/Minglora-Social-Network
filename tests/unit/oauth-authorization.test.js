import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createSupabaseOAuthAuthorization } from '../../src/oauth-authorization.js';

const APP = 'https://minglora-social-network.onrender.com';
const SUPABASE = 'https://gzycobgbasnqqhnympkr.supabase.co';

test('OAuth authorization builder creates exact Supabase authorize and Minglora callback URLs', () => {
  const result = createSupabaseOAuthAuthorization('google', APP, SUPABASE);
  const authorize = new URL(result.authorizationUrl);
  const callback = new URL(authorize.searchParams.get('redirect_to'));

  assert.equal(authorize.origin, SUPABASE);
  assert.equal(authorize.pathname, '/auth/v1/authorize');
  assert.equal(authorize.searchParams.get('provider'), 'google');
  assert.equal(callback.origin, APP);
  assert.equal(callback.pathname, '/auth/oauth/callback');
  assert.equal(callback.searchParams.get('state'), result.state);
  assert.equal(result.callbackUrl, callback.toString());
});

test('OAuth authorization builder produces a 32-character state and a valid PKCE S256 pair', () => {
  const result = createSupabaseOAuthAuthorization('github', APP, SUPABASE);
  const expected = crypto.createHash('sha256').update(result.verifier).digest('base64url');
  const authorize = new URL(result.authorizationUrl);
  assert.match(result.state, /^[A-Za-z0-9_-]{32}$/);
  assert.match(result.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(result.challenge, expected);
  assert.equal(authorize.searchParams.get('code_challenge'), expected);
  assert.equal(authorize.searchParams.get('code_challenge_method'), 's256');
});

test('OAuth authorization builder encodes provider identifiers and retains distinct state per attempt', () => {
  const first = createSupabaseOAuthAuthorization('linkedin_oidc', APP, SUPABASE);
  const second = createSupabaseOAuthAuthorization('linkedin_oidc', APP, SUPABASE);
  assert.equal(new URL(first.authorizationUrl).searchParams.get('provider'), 'linkedin_oidc');
  assert.notEqual(first.state, second.state);
  assert.notEqual(first.verifier, second.verifier);
});

test('OAuth authorization builder rejects malformed provider IDs and unsafe Supabase origins', () => {
  assert.throws(() => createSupabaseOAuthAuthorization('../google', APP, SUPABASE), TypeError);
  assert.throws(() => createSupabaseOAuthAuthorization('google', APP, 'http://supabase.example'), TypeError);
  assert.throws(() => createSupabaseOAuthAuthorization('google', 'javascript:alert(1)', SUPABASE), TypeError);
  assert.throws(() => createSupabaseOAuthAuthorization('google', 'not-a-url', SUPABASE), TypeError);
});

test('OAuth authorization builder does not leak PKCE verifier into the authorization URL', () => {
  const result = createSupabaseOAuthAuthorization('apple', APP, SUPABASE);
  assert.equal(new URL(result.authorizationUrl).searchParams.has('code_verifier'), false);
  assert.equal(result.authorizationUrl.includes(result.verifier), false);
});
