import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20261114033000_minglora_ai_identity_profile_media.sql');
const privateMediaMigration = read('supabase/migrations/20261114125814_minglora_ai_private_profile_media.sql');
const runtime = read('supabase/functions/minglora-runtime-state/index.ts');
const server = read('src/server.js');
const app = read('public/app.js');
const ui = read('public/ai-network.js');
const css = read('public/ai-network.css');

test('AI profile media RPC is private, owner-scoped and records version/audit history', () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /set search_path = ''/i);
  assert.match(migration, /current_user <> 'service_role'/i);
  assert.match(migration, /i\.owner_user_id = p_actor_user_id/i);
  assert.match(migration, /minglora-avatars/);
  assert.match(migration, /minglora-covers/);
  assert.match(migration, /avatar_storage_ref/);
  assert.match(migration, /cover_storage_ref/);
  assert.match(migration, /public\.media_assets/);
  assert.match(migration, /ai_identity_versions/);
  assert.match(migration, /ai_identity_audit_logs/);
  assert.match(migration, /revoke all on function public\.minglora_ai_identity_profile_media_update[\s\S]*from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.minglora_ai_identity_profile_media_update[\s\S]*to service_role/i);
});

test('AI profile media references are constrained to the dedicated private bucket', () => {
  assert.match(privateMediaMigration, /v_expected_bucket := 'minglora-ai-profile-media'/);
  assert.match(privateMediaMigration, /security invoker/i);
  assert.match(privateMediaMigration, /set search_path = ''/i);
  assert.match(privateMediaMigration, /i\.owner_user_id = p_actor_user_id/i);
  assert.match(privateMediaMigration, /ai_identity_versions/);
  assert.match(privateMediaMigration, /ai_identity_audit_logs/);
  assert.match(privateMediaMigration, /grant execute on function public\.minglora_ai_identity_profile_media_update[\s\S]*to service_role/i);
});

test('AI media upload preparation verifies owner ownership and stores images below the identity namespace', () => {
  const start = runtime.indexOf('if (action === "media_upload_prepare")');
  const end = runtime.indexOf('if (action === "media_upload_complete")', start);
  const handler = runtime.slice(start, end);
  assert.match(handler, /aiIdentityId/);
  assert.match(handler, /minglora_ai_identity_command/);
  assert.match(handler, /p_actor_user_id:ownerId/);
  assert.match(handler, /ai-identities/);
  assert.match(handler, /createSignedUploadUrl/);
  assert.match(handler, /AI_PROFILE_MEDIA_BUCKET/);
  assert.match(handler, /getBucket\(AI_PROFILE_MEDIA_BUCKET\)/);
  assert.match(handler, /createBucket\(AI_PROFILE_MEDIA_BUCKET,[\s\S]*public:false/);
  assert.match(handler, /aiIdentityRequested\?AI_PROFILE_MEDIA_BUCKET/);
  assert.match(handler, /const aiUuidPattern=/);
  assert.equal((handler.match(/const uuidPattern=/g) || []).length, 1, "upload preparation must declare its shared UUID validator only once");
});

test('AI media completion validates the nested owner path and never updates the human profile', () => {
  const start = runtime.indexOf('if (action === "media_upload_complete")');
  const end = runtime.indexOf('if (action === "media_delete")', start);
  const handler = runtime.slice(start, end);
  assert.match(handler, /expectedFolder/);
  assert.match(handler, /ai_identity:/);
  assert.match(handler, /AI_PROFILE_MEDIA_BUCKET/);
  assert.match(handler, /createSignedUrl\(objectPath,3600\)/);
  assert.match(handler, /minglora_ai_identity_profile_media_update/);
  assert.match(handler, /if\(aiIdentityRequested\)[\s\S]*else if\(slot==="avatar"\|\|slot==="cover"\)/);
  assert.match(handler, /\.from\("profiles"\)/);
});

test('authenticated server routes expose only owner-scoped AI identity media and use signed Storage links', () => {
  const start = server.indexOf("if (p === '/api/ai-network' || p.startsWith('/api/ai-network/'))");
  const end = server.indexOf("if (method === 'POST' && p === '/api/webhooks/paypal')", start);
  const route = server.slice(start, end);
  assert.match(route, /requireAuth\(user\)/);
  assert.match(route, /parts\[2\] === 'media'/);
  assert.match(route, /aiIdentityId/);
  assert.match(route, /mediaGateway\('media_upload_prepare'/);
  assert.match(route, /mediaGateway\('media_upload_complete'/);
  assert.match(route, /mediaGateway\('media_sign'/);
  assert.match(route, /ai_identity:/);
  assert.match(route, /minglora-ai-profile-media/);
  assert.match(route, /asset\.url = asset\.aiIdentityId \? null : completed\.url/);
  assert.match(server, /if\(asset\.url&&!asset\.aiIdentityId\)return asset\.url/);
});

test('shared uploader preserves regular media behavior and routes AI images through AI endpoints', () => {
  assert.match(app, /uploadOptions=\{\}\)/);
  assert.match(app, /const aiIdentityId=String\(uploadOptions\?\.aiIdentityId/);
  assert.match(app, /\/ai-network\/identities\//);
  assert.match(app, /const preparePath=aiIdentityId\?/);
  assert.match(app, /const completePath=aiIdentityId\?/);
  assert.match(app, /window\.uploadMediaFile=uploadMediaFile/);
});

test('AI owner workspace previews and uploads identity media separately from human profile photos', () => {
  assert.match(ui, /name="avatarFile"/);
  assert.match(ui, /name="coverFile"/);
  assert.match(ui, /profile\.avatar_storage_ref/);
  assert.match(ui, /profile\.cover_storage_ref/);
  assert.match(ui, /uploadMediaFile\(slot, file/);
  assert.match(ui, /aiIdentityId: identityIdForMedia/);
  assert.match(ui, /Images are stored for this AI identity only/);
  assert.match(css, /ai-network-cover-preview/);
  assert.match(css, /ai-network-avatar img/);
});

test('AI network state refreshes render the workspace into main content', () => {
  assert.match(ui, /function paintSnapshot\(\)[\s\S]*host\.innerHTML = renderSnapshot\(state\.snapshot\)/);
  assert.ok(!/renderSnapshot\(state\.snapshot\);/.test(ui.replace('host.innerHTML = renderSnapshot(state.snapshot);','')));
});
