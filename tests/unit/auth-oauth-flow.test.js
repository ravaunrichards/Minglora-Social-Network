import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

const [server, auth, login, admin, html, css, worker] = await Promise.all([
  read('../../src/server.js'),
  read('../../src/supabase-auth.js'),
  read('../../public/auth-login.js'),
  read('../../public/auth-providers-admin.js'),
  read('../../public/index.html'),
  read('../../public/auth-oauth.css'),
  read('../../public/sw.js')
]);

test('OAuth start route only accepts providers enabled by current Supabase Auth settings', () => {
  assert.ok(server.includes("const provider=p.slice('/auth/oauth/'.length)"));
  assert.ok(server.includes('OAUTH_PROVIDER_LABELS[provider]'));
  assert.ok(server.includes("settings.external?.[provider]!==true"));
  assert.ok(server.includes("new URL('https://gzycobgbasnqqhnympkr.supabase.co/auth/v1/authorize')"));
  assert.ok(server.includes("authorize.searchParams.set('code_challenge',challenge)"));
  assert.ok(server.includes("authorize.searchParams.set('code_challenge_method','s256')"));
  assert.ok(server.includes("redirectTarget=new URL('/auth/oauth/callback',appOrigin(req))"));
  assert.ok(server.includes("oauthFlowCookie(state,verifier)"));
  assert.ok(server.includes("Path=/auth/oauth/callback; Max-Age=600"));
});

test('OAuth callback verifies signed state, exchanges PKCE code and creates a Minglora session', () => {
  assert.ok(server.includes("p==='/auth/oauth/callback'"));
  assert.ok(server.includes("returnedState!==flow.state"));
  assert.ok(server.includes("readOAuthFlowCookie(req)"));
  assert.ok(server.includes("supabaseExchangeOAuthCode({code:authorizationCode,codeVerifier:flow.verifier})"));
  assert.ok(server.includes("ensureLocalUser(verifiedUser)"));
  assert.ok(server.includes("createAppSession(account,authenticated,req)"));
  assert.ok(server.includes("clearOAuthFlowCookie()"));
  assert.ok(server.includes("isAccountBanned(account)||account.status==='suspended'"));
});

test('OAuth sign-in carries verified MFA accounts through Minglora MFA login', () => {
  assert.ok(server.includes("db.pendingAuth.push({"));
  assert.ok(server.includes("authSealed:sealSessionAuth(authenticated)"));
  assert.ok(server.includes("oauth-mfa="));
  assert.ok(login.includes("pendingOAuthMfa"));
  assert.ok(login.includes("requestMfa(pendingOAuthMfa)"));
  assert.ok(login.includes("enterMingloraSession(verified.user)"));
});

test('Minglora exposes only currently enabled provider names to the public login screen', () => {
  assert.ok(server.includes("p==='/api/auth/providers'"));
  assert.ok(server.includes("filter(provider=>settings.external?.[provider]===true)"));
  assert.ok(server.includes("href:'/auth/oauth/'+encodeURIComponent(id)"));
  assert.ok(!server.includes("external_google_secret:"));
  assert.ok(login.includes("fetch('/api/auth/providers'"));
  assert.ok(login.includes("String(provider.href || '') === '/auth/oauth/' + String(provider.id)"));
  assert.ok(login.includes("window.location.assign(button.dataset.oauthHref)"));
});

test('Admin provider setup writes allowlisted credentials and verifies enable/disable changes', () => {
  assert.ok(server.includes("p==='/api/admin/auth-providers'"));
  assert.ok(server.includes("isDesignatedCreatorHubAdmin(user)"));
  assert.ok(server.includes("hasActiveReviewerSession(user)"));
  assert.ok(server.includes("Auth Write access to this project"));
  assert.ok(server.includes("buildCredentialPatch(definition,input.credentials,current)"));
  assert.ok(server.includes("await callManagement('PATCH',requestedPatch)"));
  assert.ok(server.includes("const verified=await callManagement('GET')"));
  assert.ok(server.includes("verified[definition.flag]===true)!==requestedEnabled"));
  assert.ok(server.includes("enabledCount<=1"));
  assert.ok(admin.includes("Save and Enable"));
  assert.ok(admin.includes("data-provider-action"));
  assert.ok(admin.includes("data-config-key"));
});

test('Route repair preserves existing redirects and includes the OAuth callback path', () => {
  assert.ok(server.includes("input?.action==='sync-routes'"));
  assert.ok(server.includes("const allowedRedirectUrls=parseRedirectList(current.uri_allow_list)"));
  assert.ok(server.includes("for(const requiredRedirect of [siteRedirectUrl,appRedirectUrl])"));
  assert.ok(server.includes("new URL('/auth/oauth/callback',appSiteUrl)"));
  assert.ok(server.includes("allowedRedirectUrls.includes(siteRedirectUrl)&&allowedRedirectUrls.includes(appRedirectUrl)"));
  assert.ok(server.includes("const verified=await callManagement('GET')"));
  assert.ok(admin.includes("Connect / repair routes"));
  assert.ok(admin.includes("Minglora OAuth return route"));
});

test('OAuth helper uses Supabase Auth PKCE exchange and public Auth settings endpoints', () => {
  assert.ok(auth.includes("authRequest('token?grant_type=pkce',{auth_code:authorizationCode,code_verifier:verifier})"));
  assert.ok(auth.includes("baseUrl+'/auth/v1/settings'"));
  assert.ok(auth.includes("Authorization: 'Bearer ' + apiKey"));
});

test('Social login UI loads before app.js and is available in the offline app shell', () => {
  assert.ok(html.includes('id="auth-social-signin"'));
  assert.ok(html.includes('id="auth-social-providers"'));
  assert.ok(html.includes('auth-oauth.css?v=20261109-oauth-pkce-buttons-1'));
  assert.ok(html.includes('auth-login.js?v=20261109-oauth-pkce-buttons-1'));
  assert.ok(html.indexOf('auth-login.js?v=20261109-oauth-pkce-buttons-1') < html.indexOf('/app.js?'));
  assert.ok(worker.includes('auth-oauth.css?v=20261109-oauth-pkce-buttons-1'));
  assert.ok(worker.includes('auth-login.js?v=20261109-oauth-pkce-buttons-1'));
  assert.ok(css.includes('.auth-social-provider'));
  assert.ok(css.includes('@media(max-width:420px)'));
});
