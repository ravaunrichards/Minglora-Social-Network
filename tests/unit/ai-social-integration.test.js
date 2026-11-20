import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = path => readFileSync(resolve(root, path), 'utf8');

test('AI identities enter existing feed and profile surfaces with an explicit AI disclosure', () => {
  const server = read('src/server.js');
  const app = read('public/app.js');

  assert.ok(server.includes('function publicAISocialActor(actor)'));
  assert.ok(server.includes("aiDisclosure: 'AI member'"));
  assert.ok(server.includes("if(aiAuthor ? {userId:aiAuthor.id,aiGenerated:true,aiActor:aiAuthor}"));
  assert.ok(server.includes("const publicProfileMatch = socialPath.match(/^profiles"));
  assert.ok(server.includes('requestedAiIdentityId = aiSocialIdentityFromPeer(m[1])'));
  assert.ok(app.includes('AI MEMBER · AI-GENERATED'));
  assert.ok(app.includes('c.author?.isAI'));
});

test('AI publishing uses owner-scoped grants, human approval, idempotency and the global pause gate', () => {
  const server = read('src/server.js');
  const migration = read('supabase/migrations/20261120190000_minglora_ai_social_idempotency_replay_before_rate_limit.sql');
  const routeStart = server.indexOf("if (p === '/api/ai-network/social'");
  const routeEnd = server.indexOf("if (p === '/api/ai-network' || p.startsWith('/api/ai-network/'))", routeStart);
  assert.ok(routeStart >= 0 && routeEnd > routeStart, 'member-facing social routes are isolated from the owner-only workspace');
  const route = server.slice(routeStart, routeEnd);

  for (const action of ['posts','comments','reactions','messages/reply','ai-interactions','permissions','history','content','consent','pause']) {
    assert.ok(route.includes("socialPath === '" + action + "'") || route.includes("socialPath === '" + action + "'"), action + ' route exists');
  }
  assert.ok(route.includes("social_action: 'post', human_approved: true"));
  assert.ok(route.includes("social_action: 'comment', human_approved: true"));
  assert.ok(route.includes("social_action: 'react', human_approved: true"));
  assert.ok(route.includes("human_initiated:true"));
  assert.ok(route.includes("isModerator(user, req) || !hasActiveReviewerSession(user)"));
  assert.ok(route.includes("idempotency_key: idempotencyKey"));
  const retryIndex = migration.indexOf('if v_idempotency_key is not null then');
  const rateIndex = migration.indexOf('v_rate_limit := case v_action_name');
  assert.ok(retryIndex >= 0 && rateIndex > retryIndex, 'idempotent event reuse precedes hourly rate counting');
});

test('AI-to-human and AI-to-AI interactions use opt-in, chain-depth and activity-ledger controls', () => {
  const server = read('src/server.js');
  const socialBlockStart = server.indexOf("if (p === '/api/ai-network/social'");
  const socialBlockEnd = server.indexOf("if (p === '/api/ai-network' || p.startsWith('/api/ai-network/'))", socialBlockStart);
  const route = server.slice(socialBlockStart, socialBlockEnd);
  const migration = read('supabase/migrations/20261120190000_minglora_ai_social_idempotency_replay_before_rate_limit.sql');

  assert.ok(route.includes("socialPath === 'consent'"));
  assert.ok(route.includes("socialPath === 'messages/reply'"));
  assert.ok(route.includes("socialPath === 'ai-interactions'"));
  assert.ok(route.includes("social_action:'member_message'"));
  assert.ok(route.includes('record_member_activity'));
  assert.ok(route.includes("loop_depth:0"));
  assert.ok(route.includes("target_identity_id:targetIdentityId"));
  assert.ok(migration.includes("recipient_user_id"));
  assert.ok(migration.includes("allow_ai_messages is true"));
  assert.ok(migration.includes("v_loop_depth >= 2"));
  assert.ok(migration.includes("already visited that target"));
  assert.ok(migration.includes("max_ai_interactions_per_hour"));
});

test('Messenger discovers public AI members but preserves its existing human direct-message routes', () => {
  const app = read('public/app.js');
  const server = read('src/server.js');
  const composeStart = app.indexOf('async function renderMessengerPanelList()');
  const composeEnd = app.indexOf("if(state.messengerPanelSection!=='chats')", composeStart);
  const compose = app.slice(composeStart, composeEnd);
  assert.ok(compose.includes("api('/ai-network/social/profiles')"));
  assert.ok(compose.includes("id:'ai:'+String(profile.aiIdentityId||'')"));
  assert.ok(compose.includes('AI MEMBER'));
  assert.ok(compose.includes('openMessageWindow(member)'));
  assert.ok(server.includes("if(method==='POST'&&p==='/api/messages')"));
  assert.ok(server.includes("if(method==='GET'&&p==='/api/messages')"));
  assert.ok(server.includes("aiSocialIdentityFromPeer(to)"));
  assert.ok(server.includes("human_initiated:true"));
});

test('Human post, comment, reaction and Messenger endpoints remain available', () => {
  const server = read('src/server.js');
  assert.ok(server.includes("if(method==='POST'&&p==='/api/posts')"));
  assert.ok(server.includes("m=p.match(/^\\/api\\/posts\\/([^/]+)\\/reactions$/)"));
  assert.ok(server.includes("m=p.match(/^\\/api\\/posts\\/([^/]+)\\/comments$/)"));
  assert.ok(server.includes("if(method==='POST'&&p==='/api/messages')"));
  assert.ok(server.includes("if(method==='GET'&&p==='/api/messages')"));
  assert.ok(server.includes("if(method==='POST'&&p==='/api/messages'&&input.groupId)"));
  assert.ok(server.includes("blockedBetween(user.id,to)"));
});

test('AI social admin controls expose permission editing, suspension, content management and history', () => {
  const ui = read('public/ai-network.js');
  const styles = read('public/styles.css');
  assert.ok(ui.includes('function loadAISocialAdmin()'));
  assert.ok(ui.includes('function renderAISocialCenter()'));
  for (const field of ['can_post','can_comment','can_react','can_message','can_ai_interact','is_suspended']) {
    assert.ok(ui.includes("['" + field + "'"), field + ' permission toggle is exposed');
  }
  assert.ok(ui.includes('social-global-pause'));
  assert.ok(ui.includes('/social/history'));
  assert.ok(ui.includes('/social/content'));
  assert.ok(ui.includes('AI-generated activity'));
  assert.ok(styles.includes('.ai-member-disclosure'));
});
