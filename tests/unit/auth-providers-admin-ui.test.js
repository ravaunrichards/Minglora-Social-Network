import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [admin, css, server] = await Promise.all([
  read('../../public/auth-providers-admin.js'),
  read('../../public/auth-providers-admin.css'),
  read('../../src/server.js')
]);

test('unconfigured Auth providers expose an Enable action that opens credential setup', () => {
  assert.ok(admin.includes("if(!provider.enabled&&!provider.configured)"));
  assert.ok(admin.includes('setupMarkup(provider)'));
  assert.ok(admin.includes('Save and Enable'));
  assert.ok(admin.includes("await api('PATCH',{provider:provider.id,enabled:true,credentials})"));
  assert.doesNotMatch(admin, /const disabled=\(provider\.locked&&!provider\.enabled\)\|\|\(!provider\.configured&&!provider\.enabled\)/);
});

test('provider setup supports optional saved credentials and keeps secrets out of rendered status', () => {
  assert.ok(admin.includes('Already saved in Supabase. Leave blank to keep it'));
  assert.ok(admin.includes('Credentials are sent to the server and saved directly in Supabase'));
  assert.ok(admin.includes('data-config-key'));
  assert.ok(admin.includes('render(Array.isArray(data.providers)?data.providers:[])'));
  assert.ok(css.includes('.admin-auth-provider-setup'));
  assert.match(css, /@media\(max-width:620px\)\s*\{\s*\.admin-auth-provider-grid\{grid-template-columns:1fr/);
});

test('provider writes remain owner/MFA gated, same-origin, allow-listed and read-back verified', () => {
  const routeStart = server.indexOf("if((method==='GET'||method==='PATCH')&&p==='/api/admin/auth-providers'){");
  const routeEnd = server.indexOf("if(method==='GET'&&p==='/api/admin/users')", routeStart);
  const route = server.slice(routeStart, routeEnd);
  assert.ok(route.includes("if(method==='PATCH'&&!isSameOriginApiWrite(req))"));
  assert.ok(route.includes('isDesignatedCreatorHubAdmin(user)'));
  assert.ok(route.includes('hasActiveReviewerSession(user)'));
  assert.ok(route.includes('buildSupabaseProviderCredentialPatch('));
  assert.ok(route.includes("await callManagement('PATCH',requestedPatch)"));
  assert.ok(route.includes("const verified=await callManagement('GET')"));
  assert.ok(route.includes('enabledCount<=1'));
  assert.ok(route.includes('buildMingloraAuthRoutePatch('));
});
