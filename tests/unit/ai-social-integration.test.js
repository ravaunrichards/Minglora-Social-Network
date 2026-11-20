import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureAISocialCollections,
  upsertAISocialProfile,
  getAISocialProfile,
  listPublicAISocialProfiles,
  setAISocialPermissions,
  getAISocialPermissions,
  createAISocialDraft,
  approveAISocialDraft,
  recordAISocialReaction,
  setAISocialIdentityStatus,
  listAISocialHistory,
  setHumanAISocialConsent,
  openAISocialConversation,
  listAISocialConversationsForHuman
} from '../../backend/modules/ai-network/social-integration.js';

const owner = '11111111-1111-4111-8111-111111111111';
const human = '22222222-2222-4222-8222-222222222222';
const identityId = '33333333-3333-4333-8333-333333333333';
const secondIdentityId = '44444444-4444-4444-8444-444444444444';

function state() {
  return {
    posts: [],
    aiBotSettings: [{ ownerId: owner, globalPaused: false }],
    aiSocialProfiles: [],
    aiSocialPermissions: [],
    aiSocialDrafts: [],
    aiSocialConversations: [],
    aiSocialMessages: [],
    aiSocialConsents: [],
    aiSocialActivities: []
  };
}

function identity(id = identityId, visibility = 'public', status = 'active') {
  return {
    identity: { identity_id: id, owner_user_id: owner, status, enabled: true },
    name: { display_name: 'Minglora AI Guide', username: id === identityId ? 'minglora_ai_guide' : 'minglora_ai_friend' },
    profile: { profile_visibility: visibility, bio: 'A clearly identified AI member.' }
  };
}

function permissions(db, id = identityId, changes = {}) {
  return setAISocialPermissions(db, owner, id, {
    status: 'active',
    allowedAudiences: ['public', 'private'],
    permissions: {
      publishPosts: false,
      commentOnPosts: false,
      reactToPosts: false,
      receiveHumanMessages: false,
      sendMessagesToHumans: false,
      receiveAIMessages: false,
      sendMessagesToOtherAI: false,
      ...changes
    }
  });
}

test('AI identities are linked as typed AI profiles, not human profiles', () => {
  const db = state();
  ensureAISocialCollections(db);
  const profile = upsertAISocialProfile(db, owner, identity());
  assert.equal(profile.identityId, identityId);
  assert.equal(profile.ownerUserId, owner);
  assert.equal(getAISocialProfile(db, identityId).actorType, 'ai');
  assert.equal(getAISocialProfile(db, identityId).id, 'ai:' + identityId);
  assert.equal(getAISocialProfile(db, identityId).ownerUserId, undefined);
  assert.equal(db.users, undefined);
});

test('AI profile visibility defaults to private and public discovery filters status and visibility', () => {
  const db = state();
  upsertAISocialProfile(db, owner, identity(identityId, 'private'));
  assert.equal(getAISocialProfile(db, identityId), null);
  assert.equal(getAISocialProfile(db, identityId, { viewerId: owner }).profileVisibility, 'private');
  assert.deepEqual(listPublicAISocialProfiles(db), []);
  db.aiSocialProfiles[0].profileVisibility = 'public';
  assert.equal(listPublicAISocialProfiles(db).length, 1);
  db.aiSocialProfiles[0].identityStatus = 'suspended';
  assert.deepEqual(listPublicAISocialProfiles(db), []);
});

test('AI identity owner is verified before its profile can be linked', () => {
  const db = state();
  assert.throws(() => upsertAISocialProfile(db, human, identity()), { status: 403 });
});

test('posting is disabled without a specific grant and explicit human approval', () => {
  const db = state();
  upsertAISocialProfile(db, owner, identity());
  assert.throws(() => createAISocialDraft(db, owner, identityId, {
    kind: 'post', text: 'A first AI member post', audience: 'public'
  }), { status: 403 });
  permissions(db, identityId, { publishPosts: true });
  const draft = createAISocialDraft(db, owner, identityId, {
    kind: 'post', text: 'A first AI member post', audience: 'public'
  });
  assert.equal(draft.status, 'pending_approval');
  assert.equal(db.posts.length, 0);
  const result = approveAISocialDraft(db, owner, identityId, draft.id);
  assert.equal(result.status, 'published');
  assert.equal(db.posts.length, 1);
  assert.equal(db.posts[0].userId, owner);
  assert.equal(db.posts[0].aiIdentityId, identityId);
  assert.equal(db.posts[0].aiGenerated, true);
  assert.equal(db.posts[0].aiDisclosureLabel, 'AI');
});

test('public posting is denied for a private AI profile', () => {
  const db = state();
  upsertAISocialProfile(db, owner, identity(identityId, 'private'));
  permissions(db, identityId, { publishPosts: true });
  assert.throws(() => createAISocialDraft(db, owner, identityId, {
    kind: 'post', text: 'Private profile public post', audience: 'public'
  }), { status: 403 });
});

test('the network-wide pause blocks approval even when a per-identity grant is active', () => {
  const db = state();
  upsertAISocialProfile(db, owner, identity());
  permissions(db, identityId, { publishPosts: true });
  const draft = createAISocialDraft(db, owner, identityId, {
    kind: 'post', text: 'Approval is paused', audience: 'public'
  });
  db.aiBotSettings[0].globalPaused = true;
  assert.throws(() => approveAISocialDraft(db, owner, identityId, draft.id), { status: 409 });
  assert.equal(db.posts.length, 0);
});

test('AI comments use the existing post comment collection and retain an AI disclosure', () => {
  const db = state();
  upsertAISocialProfile(db, owner, identity());
  permissions(db, identityId, { commentOnPosts: true });
  db.posts.push({ id: 'human-post-1', userId: human, text: 'A human member post', comments: [], reactions: {} });
  const draft = createAISocialDraft(db, owner, identityId, {
    kind: 'comment', targetPostId: 'human-post-1', text: 'An owner-approved AI comment'
  });
  approveAISocialDraft(db, owner, identityId, draft.id);
  const comment = db.posts[0].comments[0];
  assert.equal(comment.aiIdentityId, identityId);
  assert.equal(comment.aiDisclosureLabel, 'AI');
  assert.equal(comment.aiGenerated, true);
});

test('AI reactions are uniquely attributed, toggleable and rate limited', () => {
  const db = state();
  upsertAISocialProfile(db, owner, identity());
  permissions(db, identityId, { reactToPosts: true });
  db.posts.push({ id: 'human-post-2', userId: human, text: 'A post', reactions: {} });
  assert.deepEqual(recordAISocialReaction(db, owner, identityId, 'human-post-2', 'love').reaction, 'love');
  assert.deepEqual(recordAISocialReaction(db, owner, identityId, 'human-post-2', 'love').reaction, null);
  assert.equal(db.posts[0].reactions['ai:' + identityId], undefined);
});

test('AI self-reactions are rejected', () => {
  const db = state();
  upsertAISocialProfile(db, owner, identity());
  permissions(db, identityId, { reactToPosts: true });
  db.posts.push({ id: 'ai-own-post', userId: owner, aiIdentityId: identityId, reactions: {} });
  assert.throws(() => recordAISocialReaction(db, owner, identityId, 'ai-own-post', 'like'), { status: 403 });
});

test('human-to-AI messages require an active receive grant and do not trigger auto-replies', () => {
  const db = state();
  upsertAISocialProfile(db, owner, identity());
  permissions(db, identityId, { receiveHumanMessages: true });
  const { conversation, message } = openAISocialConversation(db, human, identityId, 'Hello AI member');
  assert.equal(conversation.kind, 'human_ai');
  assert.equal(conversation.automaticReplies, false);
  assert.equal(conversation.maxAutomatedHops, 1);
  assert.equal(message.fromType, 'human');
  assert.equal(db.aiSocialMessages.length, 1);
  assert.equal(listAISocialConversationsForHuman(db, human).length, 1);
});

test('human AI-message consent is explicit, revocable and defaults off', () => {
  const db = state();
  upsertAISocialProfile(db, owner, identity());
  assert.throws(() => {
    const grant = permissions(db, identityId, { sendMessagesToHumans: true });
    const draft = createAISocialDraft(db, owner, identityId, {
      kind: 'message_human', targetUserId: human, text: 'Unsolicited'
    });
    approveAISocialDraft(db, owner, identityId, draft.id, {
      validateTarget: () => {
        const consent = db.aiSocialConsents.find(item => item.humanUserId === human && item.enabled);
        if (!consent) throw Object.assign(new Error('AI messaging consent required'), { status: 403 });
      }
    });
    return grant;
  }, { status: 403 });
  const consent = setHumanAISocialConsent(db, human, {
    enabled: true, acknowledgeAI: true, allowedIdentityIds: [identityId]
  });
  assert.equal(consent.enabled, true);
  assert.equal(consent.allowedIdentityIds[0], identityId);
  setHumanAISocialConsent(db, human, { enabled: false });
  assert.equal(db.aiSocialConsents[0].enabled, false);
});

test('AI-to-AI interaction has no autonomous reply path and requires approval', () => {
  const db = state();
  upsertAISocialProfile(db, owner, identity());
  upsertAISocialProfile(db, owner, identity(secondIdentityId));
  permissions(db, identityId, { sendMessagesToOtherAI: true });
  permissions(db, secondIdentityId, { receiveAIMessages: true });
  const draft = createAISocialDraft(db, owner, identityId, {
    kind: 'message_ai', targetIdentityId: secondIdentityId, text: 'One approved AI-to-AI message'
  });
  const result = approveAISocialDraft(db, owner, identityId, draft.id, {
    validateTarget: (item) => {
      const target = db.aiSocialPermissions.find(row => row.identityId === item.targetIdentityId);
      if (!target || target.status !== 'active' || target.permissions.receiveAIMessages !== true) {
        throw Object.assign(new Error('Target AI identity has not opted in'), { status: 403 });
      }
    }
  });
  assert.equal(result.status, 'sent');
  assert.equal(db.aiSocialMessages[0].toType, 'ai');
  assert.equal(db.aiSocialMessages[0].toId, secondIdentityId);
  assert.equal(db.aiSocialConversations[0].automaticReplies, false);
  assert.equal(db.aiSocialMessages[0].automated, false);
});

test('suspending an AI identity cancels pending drafts and records interaction history', () => {
  const db = state();
  upsertAISocialProfile(db, owner, identity());
  permissions(db, identityId, { publishPosts: true });
  createAISocialDraft(db, owner, identityId, { kind: 'post', text: 'A pending post', audience: 'public' });
  setAISocialIdentityStatus(db, owner, identityId, 'suspended');
  assert.equal(db.aiSocialDrafts[0].status, 'cancelled');
  assert.equal(listAISocialHistory(db, owner, identityId).some(item => item.action === 'social_suspended'), true);
});
