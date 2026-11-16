import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAuthRedirectAllowList,
  createMingloraAuthRouteState,
  buildMingloraAuthRoutePatch
} from '../../src/auth-redirect-routes.js';

const SITE = 'https://minglora-social-network.onrender.com';
const HOME = SITE + '/';
const CALLBACK = SITE + '/auth/oauth/callback';
const PROVIDER_CALLBACK = 'https://gzycobgbasnqqhnympkr.supabase.co/auth/v1/callback';

test('redirect allow-list parser trims entries, removes blanks and duplicate URLs', () => {
  assert.deepEqual(
    parseAuthRedirectAllowList(' https://one.example/cb, ,https://two.example/cb,https://one.example/cb '),
    ['https://one.example/cb', 'https://two.example/cb']
  );
});

test('route repair preserves existing redirect entries and appends only Minglora routes', () => {
  const patch = buildMingloraAuthRoutePatch({
    site_url: 'https://old-minglora.example',
    uri_allow_list: 'https://existing.example/return, https://mobile.example/callback'
  }, SITE);
  assert.equal(patch.site_url, SITE);
  assert.equal(
    patch.uri_allow_list,
    'https://existing.example/return,https://mobile.example/callback,' + HOME + ',' + CALLBACK
  );
});

test('route repair is idempotent after the site and both redirects are configured', () => {
  const patch = buildMingloraAuthRoutePatch({
    site_url: SITE + '/',
    uri_allow_list: HOME + ',' + CALLBACK
  }, SITE);
  assert.deepEqual(patch, {});
});

test('route state reports ready only when exact site URL and both redirects are present', () => {
  const ready = createMingloraAuthRouteState({
    site_url: SITE + '/',
    uri_allow_list: HOME + ',' + CALLBACK
  }, SITE, PROVIDER_CALLBACK);
  assert.equal(ready.redirectReady, true);
  assert.equal(ready.providerCallbackUrl, PROVIDER_CALLBACK);
  assert.equal(ready.appSiteUrl, SITE);
  assert.equal(ready.configuredSiteUrl, SITE + '/');
  assert.deepEqual(ready.allowedRedirectUrls, [HOME, CALLBACK]);
});

test('route state remains not ready when the OAuth callback is missing', () => {
  const state = createMingloraAuthRouteState({
    site_url: SITE,
    uri_allow_list: HOME
  }, SITE, PROVIDER_CALLBACK);
  assert.equal(state.redirectReady, false);
  assert.deepEqual(state.allowedRedirectUrls, [HOME]);
});

test('route repair keeps unrelated configured routes when normalizing duplicates', () => {
  const patch = buildMingloraAuthRoutePatch({
    site_url: SITE,
    uri_allow_list: 'https://existing.example/return, ' + HOME + ',https://existing.example/return,' + HOME
  }, SITE);
  assert.equal(
    patch.uri_allow_list,
    'https://existing.example/return,' + HOME + ',' + CALLBACK
  );
});

test('invalid application origins are rejected instead of creating redirect routes', () => {
  assert.throws(() => buildMingloraAuthRoutePatch({}, 'not-a-url'));
  assert.throws(() => createMingloraAuthRouteState({}, 'not-a-url', PROVIDER_CALLBACK));
});
