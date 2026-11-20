import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAISocialMember,
  performAISocialAction,
  validateAISocialConsent,
  validateAISocialText
} from '../../backend/modules/ai-network/social-integration.js';

const identityId = '10000000-0000-4000-8000-000000000001';
const targetAIId = '20000000-0000-4000-8000-000000000002';
const requestId = '30000000-0000-4000-8000-000000000003';
const humanId = '40000000-0000-4000-8000-000000000004';

function profile(identity_id = identityId, overrides = {}) {
  return {
    identity_id, display_name: 'Avery Morgan', username: 'avery_morgan_ai',
    bio: 'A transparent AI member', status: 'active', enabled: true,
    profile_visibility: 'public', created_at: '2026-11-20T00:00:00.000Z', ...overrides
  };
}

function makeHarness() {
  const db = { posts: [], messages: [] };
  const authorized = [];
  const completed = [];
  return {
    db, authorized, completed,
    authorize: async payload => {
      authorized.push(structuredClone(payload));
      return { authorized: true, event_id: '50000000-0000-4000-8000-' + String(authorized.length).padStart(12, '0') };
    },
    complete: async eventId => { completed.push(eventId); },
    save: async () => {},
    now: () => '2026-11-20T12:00:00.000Z'
  };
}

test('AI profiles are exposed as member-shaped records only when active, enabled and public', () => {
  const member = buildAISocialMember(profile());
  assert.equal(member.id, identityId);
  assert.equal(member.aiAccount, true);
  assert.equal(member.aiDisclosureRequired, true);
  assert.equal(buildAISocialMember(profile(identityId, { profile_visibility: 'private' })), null);
  assert.equal(buildAISocialMember(profile(identityId, { enabled: false })), null);
  assert.equal(buildAISocialMember(profile(identityId, { status: 'suspended' })), null);
});

test('AI post is stored in the existing social posts collection, labelled and idempotent', async () => {
  const h = makeHarness();
  const input = { requestId, humanApproved: true, text: 'A clearly labelled AI post.' };
  const result = await performAISocialAction({
    identityId, action: 'post', input, db: h.db, authorize: h.authorize,
    complete: h.complete, save: h.save, now: h.now
  });
  assert.equal(result.content.userId, identityId);
  assert.equal(result.content.aiGenerated, true);
  assert.equal(result.content.aiDisclosureRequired, true);
  assert.equal(h.db.posts.length, 1);
  assert.equal(h.completed.length, 1);
  const retry = await performAISocialAction({
    identityId, action: 'post', input, db: h.db, authorize: h.authorize,
    complete: h.complete, save: h.save, now: h.now
  });
  assert.equal(retry.reused, true);
  assert.equal(h.db.posts.length, 1);
});

test('AI comment and reaction operate on existing posts and keep AI attribution', async () => {
  const h = makeHarness();
  const target = { id: 'post-human', userId: humanId, audience: 'public', comments: [], reactions: {} };
  h.db.posts.push(target);
  const common = {
    identityId, db: h.db, authorize: h.authorize, complete: h.complete,
    save: h.save, canViewTargetPost: async () => true, now: h.now
  };
  const comment = await performAISocialAction({
    ...common, action: 'comment',
    input: { requestId, humanApproved: true, postId: target.id, text: 'AI-authored comment.' }
  });
  assert.equal(comment.content.aiGenerated, true);
  assert.equal(comment.content.aiIdentityId, identityId);
  const reactionId = '30000000-0000-4000-8000-000000000006';
  const reaction = await performAISocialAction({
    ...common, action: 'react',
    input: { requestId: reactionId, humanApproved: true, postId: target.id, reaction: 'love' }
  });
  assert.equal(target.reactions[identityId], 'love');
  assert.equal(reaction.content.aiDisclosureRequired, true);
});

test('AI-to-AI interaction authorizes a bounded chain before commenting', async () => {
  const h = makeHarness();
  const target = { id: 'post-ai', userId: targetAIId, aiIdentityId: targetAIId, aiGenerated: true, audience: 'public', comments: [], reactions: {} };
  h.db.posts.push(target);
  const result = await performAISocialAction({
    identityId, action: 'comment',
    input: { requestId, humanApproved: true, postId: target.id, text: 'A bounded AI-to-AI interaction.' },
    db: h.db, authorize: h.authorize, complete: h.complete, save: h.save,
    canViewTargetPost: async () => true, canInteractWithAI: async () => true, now: h.now
  });
  assert.equal(result.content.aiGenerated, true);
  assert.equal(h.authorized[0].social_action, 'ai_interact');
  assert.equal(h.authorized[0].target_identity_id, targetAIId);
  assert.equal(h.authorized[1].social_action, 'comment');
  assert.equal(h.completed.length, 2);
});

test('AI-to-AI loop depth two is rejected and no content is written', async () => {
  const h = makeHarness();
  const target = { id: 'post-ai', userId: targetAIId, aiIdentityId: targetAIId, aiGenerated: true, audience: 'public', comments: [], reactions: {} };
  h.db.posts.push(target);
  await assert.rejects(() => performAISocialAction({
    identityId, action: 'comment',
    input: { requestId, humanApproved: true, postId: target.id, text: 'Too deep.', loopDepth: 2 },
    db: h.db, authorize: h.authorize, complete: h.complete, save: h.save,
    canViewTargetPost: async () => true, canInteractWithAI: async () => true, now: h.now
  }), /depth cannot exceed two/i);
  assert.equal(target.comments.length, 0);
  assert.equal(h.authorized.length, 0);
});

test('AI direct messages require both a human-initiated recipient and consent checks', async () => {
  const h = makeHarness();
  const message = await performAISocialAction({
    identityId, action: 'message',
    input: { requestId, humanApproved: true, recipientUserId: humanId, text: 'A reply after the member initiated.' },
    db: h.db, authorize: h.authorize, complete: h.complete, save: h.save,
    canMessageMember: async id => id === humanId, now: h.now
  });
  assert.equal(message.content.from, identityId);
  assert.equal(message.content.to, humanId);
  assert.equal(message.content.aiGenerated, true);
  assert.equal(h.authorized[0].human_initiated, true);
  assert.equal(h.authorized[0].recipient_user_id, humanId);
  await assert.rejects(() => performAISocialAction({
    identityId, action: 'message',
    input: { requestId: '30000000-0000-4000-8000-000000000007', humanApproved: true, recipientUserId: humanId, text: 'No consent.' },
    db: h.db, authorize: h.authorize, complete: h.complete, save: h.save,
    canMessageMember: async () => false, now: h.now
  }), /human-initiated conversation/i);
});

test('AI-to-AI direct messages use the bounded interaction permission', async () => {
  const h = makeHarness();
  const message = await performAISocialAction({
    identityId, action: 'message',
    input: { requestId, humanApproved: true, recipientIdentityId: targetAIId, text: 'A bounded AI message.' },
    db: h.db, authorize: h.authorize, complete: h.complete, save: h.save,
    canInteractWithAI: async id => id === targetAIId, now: h.now
  });
  assert.equal(message.content.aiToAI, true);
  assert.equal(message.content.to, targetAIId);
  assert.equal(h.authorized.length, 1);
  assert.equal(h.authorized[0].social_action, 'ai_interact');
  assert.equal(h.completed.length, 1);
});

test('explicit approval, request identifiers, reaction values and content lengths are validated', async () => {
  const h = makeHarness();
  await assert.rejects(() => performAISocialAction({
    identityId, action: 'post', input: { requestId, humanApproved: false, text: 'No approval.' },
    db: h.db, authorize: h.authorize, complete: h.complete, save: h.save
  }), /Explicit human approval/i);
  assert.throws(() => validateAISocialText(''), /between 1 and 5000/i);
  assert.throws(() => validateAISocialConsent('true'), /must be a boolean/i);
  assert.equal(validateAISocialConsent(false), false);
});

test('Minglora social routes, consent UI and AI disclosure are wired into existing member surfaces', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const read = relative => readFile(path.join(root, relative), 'utf8');
  const [server, edge, app, settings, adminUI] = await Promise.all([
    read('src/server.js'),
    read('supabase/functions/minglora-runtime-state/index.ts'),
    read('public/app.js'),
    read('public/settings.js'),
    read('public/ai-network.js')
  ]);

  assert.match(edge, /"ai_social_command"/);
  assert.match(edge, /minglora_ai_social_command/);
  assert.match(server, /\/api\/ai-social\/consent/);
  assert.match(server, /list_public_profiles/);
  assert.match(server, /record_member_activity/);
  assert.match(server, /socialActionParts/);
  assert.match(server, /socialContentListParts/);
  assert.match(server, /global_paused/);
  assert.match(server, /aiGenerated:true/);
  assert.match(app, /AI member/);
  assert.match(settings, /name="allowAIMessages"/);
  assert.match(adminUI, /social-permissions/);
  assert.match(adminUI, /social-global-toggle/);
  assert.match(adminUI, /social-content-manage/);
});
