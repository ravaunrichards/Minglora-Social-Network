import { createHash, randomUUID } from 'node:crypto';

const nowIso = (now = new Date()) => new Date(now).toISOString();
const makeId = () => randomUUID();
const fail = (status, message) => Object.assign(new Error(message), { status });
const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const validId = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
const ownerRows = (rows, ownerUserId) => (Array.isArray(rows) ? rows : []).filter(row => row?.ownerUserId === ownerUserId);
const ACTION_PERMISSION = Object.freeze({
  post: 'publishPosts',
  comment: 'commentOnPosts',
  message_human: 'sendMessagesToHumans',
  message_ai: 'sendMessagesToOtherAI'
});
const PERMISSION_KEYS = Object.freeze([
  'publishPosts',
  'commentOnPosts',
  'reactToPosts',
  'receiveHumanMessages',
  'sendMessagesToHumans',
  'receiveAIMessages',
  'sendMessagesToOtherAI'
]);
const AUDIENCES = new Set(['public', 'private']);
const REACTIONS = new Set(['like', 'love', 'care', 'haha', 'wow', 'sad', 'angry']);
const RATE_LIMITS = Object.freeze({
  post: { max: 3, windowMs: 24 * 60 * 60 * 1000 },
  comment: { max: 8, windowMs: 60 * 60 * 1000 },
  react: { max: 30, windowMs: 60 * 60 * 1000 },
  message_human: { max: 3, windowMs: 24 * 60 * 60 * 1000 },
  message_ai: { max: 10, windowMs: 24 * 60 * 60 * 1000 },
  inbound_human: { max: 5, windowMs: 60 * 60 * 1000 }
});

export function ensureAISocialCollections(db) {
  if (!db || typeof db !== 'object' || Array.isArray(db)) throw new TypeError('A Minglora state object is required.');
  for (const key of [
    'aiSocialProfiles', 'aiSocialPermissions', 'aiSocialDrafts',
    'aiSocialConversations', 'aiSocialMessages', 'aiSocialConsents', 'aiSocialActivities'
  ]) if (!Array.isArray(db[key])) db[key] = [];
  if (!Array.isArray(db.posts)) db.posts = [];
  return db;
}

function hashText(value) {
  return createHash('sha256').update(String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()).digest('hex');
}

function activity(db, ownerUserId, identityId, action, targetType, targetId, status = 'completed', at = new Date(), extra = {}) {
  const row = {
    id: makeId(), ownerUserId, identityId, action, targetType,
    targetId: String(targetId || ''), status, occurredAt: nowIso(at),
    source: 'minglora_ai_social', aiDisclosure: true, ...extra
  };
  db.aiSocialActivities.push(row);
  return row;
}

export function upsertAISocialProfile(db, ownerUserId, identityResult, { now = new Date() } = {}) {
  ensureAISocialCollections(db);
  const identity = identityResult?.identity || {};
  const name = identityResult?.name || {};
  const profile = identityResult?.profile || {};
  const identityId = String(identity.identity_id || '');
  if (!validId(identityId)) throw fail(400, 'A valid canonical Minglora AI identity is required.');
  if (String(identity.owner_user_id || '') !== String(ownerUserId)) {
    throw fail(403, 'This AI identity does not belong to the signed-in Minglora owner.');
  }
  const visibility = ['public', 'followers', 'private', 'hidden'].includes(profile.profile_visibility)
    ? profile.profile_visibility : 'private';
  const next = {
    identityId,
    ownerUserId,
    displayName: clean(name.display_name || name.full_name || [name.first_name, name.last_name].filter(Boolean).join(' '), 120),
    username: clean(name.username, 30).toLowerCase(),
    bio: clean(profile.bio, 500),
    introduction: clean(profile.introduction, 500),
    profileVisibility: visibility,
    identityStatus: clean(identity.status, 24).toLowerCase(),
    enabled: identity.enabled === true,
    createdAt: nowIso(now),
    updatedAt: nowIso(now)
  };
  if (!next.displayName || !/^[a-z0-9_]{3,30}$/.test(next.username)) {
    throw fail(409, 'The canonical AI identity is missing its public display name or username.');
  }
  const current = db.aiSocialProfiles.find(item => item.identityId === identityId && item.ownerUserId === ownerUserId);
  if (current) {
    Object.assign(current, next, { createdAt: current.createdAt || next.createdAt });
    return current;
  }
  db.aiSocialProfiles.push(next);
  activity(db, ownerUserId, identityId, 'profile_linked', 'ai_profile', identityId, 'completed', now);
  return next;
}

export function getAISocialProfile(db, identityId, { viewerId = null } = {}) {
  ensureAISocialCollections(db);
  const profile = db.aiSocialProfiles.find(item => item.identityId === identityId);
  if (!profile) return null;
  const isOwner = viewerId && viewerId === profile.ownerUserId;
  if (!isOwner && (profile.profileVisibility !== 'public' || profile.identityStatus !== 'active' || !profile.enabled)) return null;
  return {
    id: 'ai:' + profile.identityId,
    identityId: profile.identityId,
    actorType: 'ai',
    isAI: true,
    aiDisclosure: true,
    aiDisclosureLabel: 'AI',
    name: profile.displayName,
    displayName: profile.displayName,
    username: profile.username,
    bio: profile.bio,
    avatar: '',
    avatarUrl: '',
    profileVisibility: profile.profileVisibility,
    status: profile.identityStatus,
    ...(isOwner ? { ownerUserId: profile.ownerUserId } : {})
  };
}

export function listPublicAISocialProfiles(db) {
  ensureAISocialCollections(db);
  return db.aiSocialProfiles
    .filter(profile => profile.profileVisibility === 'public' && profile.identityStatus === 'active' && profile.enabled)
    .map(profile => getAISocialProfile(db, profile.identityId))
    .filter(Boolean);
}

export function setAISocialPermissions(db, ownerUserId, identityId, input = {}, { now = new Date() } = {}) {
  ensureAISocialCollections(db);
  const profile = db.aiSocialProfiles.find(item => item.identityId === identityId && item.ownerUserId === ownerUserId);
  if (!profile) throw fail(404, 'AI social profile not found. Load the canonical AI identity profile first.');
  if (input.autonomous === true || input.automaticReplies === true || input.autoPost === true || input.autoReply === true) {
    throw fail(403, 'Autonomous posting and automatic reply loops are disabled. AI social actions require a separate human approval.');
  }
  const permissions = {};
  const requested = input.permissions && typeof input.permissions === 'object' && !Array.isArray(input.permissions)
    ? input.permissions : {};
  for (const key of PERMISSION_KEYS) {
    if (requested[key] !== undefined && typeof requested[key] !== 'boolean') {
      throw fail(400, 'Each AI social permission must be true or false.');
    }
    permissions[key] = requested[key] === true;
  }
  const status = input.status === undefined ? 'paused' : String(input.status);
  if (!['active', 'paused', 'suspended'].includes(status)) throw fail(400, 'Choose active, paused or suspended for AI social access.');
  const allowedAudiences = input.allowedAudiences === undefined ? ['private'] : input.allowedAudiences;
  if (!Array.isArray(allowedAudiences) || !allowedAudiences.length ||
      allowedAudiences.some(value => !AUDIENCES.has(String(value)))) {
    throw fail(400, 'AI post audiences are limited to public or private.');
  }
  if (allowedAudiences.includes('public') && profile.profileVisibility !== 'public') {
    throw fail(403, 'A public AI post requires a public AI profile.');
  }
  const current = db.aiSocialPermissions.find(item => item.identityId === identityId && item.ownerUserId === ownerUserId);
  const next = {
    id: current?.id || makeId(), ownerUserId, identityId, status, permissions,
    allowedAudiences: [...new Set(allowedAudiences)],
    humanApprovalRequired: true, aiDisclosureRequired: true,
    automaticReplies: false, autonomous: false,
    grantedByUserId: ownerUserId, updatedAt: nowIso(now),
    createdAt: current?.createdAt || nowIso(now)
  };
  if (current) Object.assign(current, next);
  else db.aiSocialPermissions.push(next);
  activity(db, ownerUserId, identityId, 'permissions_updated', 'ai_social_permissions', next.id, 'completed', now);
  return next;
}

export function getAISocialPermissions(db, ownerUserId, identityId) {
  ensureAISocialCollections(db);
  const record = db.aiSocialPermissions.find(item => item.identityId === identityId && item.ownerUserId === ownerUserId);
  if (!record) return null;
  return {
    ...record,
    permissions: { ...record.permissions },
    rateLimits: { ...RATE_LIMITS }
  };
}

function requireSocialPermission(db, ownerUserId, identityId, action) {
  const settings = (db.aiBotSettings || []).find(item => item.ownerId === ownerUserId);
  if (!settings || settings.globalPaused !== false) {
    throw fail(409, 'The Minglora AI Network is paused. Resume it in Admin Centre before approving social activity.');
  }
  const profile = db.aiSocialProfiles.find(item => item.identityId === identityId && item.ownerUserId === ownerUserId);
  if (!profile || profile.identityStatus !== 'active' || !profile.enabled) {
    throw fail(409, 'Only an active, enabled canonical AI identity may use social features.');
  }
  const grant = db.aiSocialPermissions.find(item => item.identityId === identityId && item.ownerUserId === ownerUserId);
  if (!grant || grant.status !== 'active') throw fail(403, 'AI social permissions have not been activated for this identity.');
  const permissionKey = ACTION_PERMISSION[action] || (action === 'react' ? 'reactToPosts' : '');
  if (!permissionKey || grant.permissions?.[permissionKey] !== true) {
    throw fail(403, 'This AI identity has not been granted permission for that social action.');
  }
  return { profile, grant };
}

function enforceRateLimit(db, ownerUserId, identityId, action, now, { actorId = identityId } = {}) {
  const rule = RATE_LIMITS[action];
  if (!rule) return;
  const cutoff = new Date(now).getTime() - rule.windowMs;
  const count = db.aiSocialActivities.filter(item =>
    item.ownerUserId === ownerUserId && item.identityId === identityId &&
    item.action === action && item.status === 'completed' &&
    (action !== 'inbound_human' || item.actorId === actorId) &&
    Date.parse(item.occurredAt) >= cutoff
  ).length;
  if (count >= rule.max) throw fail(429, 'This AI social action has reached its rate limit. Try again after the limit window resets.');
}

function findHumanConsent(db, humanUserId, identityId) {
  const consent = db.aiSocialConsents.find(item => item.humanUserId === humanUserId && item.enabled === true);
  return Boolean(consent && (consent.allowAllActiveAI === true ||
    (Array.isArray(consent.allowedIdentityIds) && consent.allowedIdentityIds.includes(identityId))));
}

function findConversation(db, identityId, targetType, targetId) {
  if (targetType === 'human') {
    return db.aiSocialConversations.find(item => item.kind === 'human_ai' &&
      item.identityId === identityId && item.humanUserId === targetId && item.status === 'active') || null;
  }
  return db.aiSocialConversations.find(item => item.kind === 'ai_ai' &&
    item.identityId === identityId && item.peerIdentityId === targetId && item.status === 'active') || null;
}

function createConversation(db, ownerUserId, identityId, targetType, targetId, now) {
  const row = {
    id: makeId(), ownerUserId, identityId,
    kind: targetType === 'human' ? 'human_ai' : 'ai_ai',
    humanUserId: targetType === 'human' ? targetId : null,
    peerIdentityId: targetType === 'ai' ? targetId : null,
    status: 'active',
    automaticReplies: false,
    maxAutomatedHops: 1,
    lastAutomatedHop: 0,
    createdAt: nowIso(now),
    updatedAt: nowIso(now),
    lastActivityAt: nowIso(now)
  };
  db.aiSocialConversations.push(row);
  return row;
}

function addSocialMessage(db, conversation, { fromType, fromId, toType, toId, text, approvedByUserId = null }, now) {
  const row = {
    id: makeId(), conversationId: conversation.id,
    ownerUserId: conversation.ownerUserId, identityId: conversation.identityId,
    fromType, fromId, toType, toId, text,
    aiGenerated: fromType === 'ai',
    aiDisclosureLabel: fromType === 'ai' ? 'AI' : null,
    approvedByUserId,
    createdAt: nowIso(now),
    automated: false
  };
  db.aiSocialMessages.push(row);
  conversation.updatedAt = nowIso(now);
  conversation.lastActivityAt = row.createdAt;
  return row;
}

export function setHumanAISocialConsent(db, humanUserId, input = {}, { now = new Date() } = {}) {
  ensureAISocialCollections(db);
  if (typeof input.enabled !== 'boolean') throw fail(400, 'Choose whether to allow AI-initiated messages.');
  if (input.enabled && input.acknowledgeAI !== true) {
    throw fail(400, 'Confirm that the sender is an AI identity before enabling AI messages.');
  }
  const allowedIdentityIds = input.allowAllActiveAI === true ? [] :
    [...new Set((Array.isArray(input.allowedIdentityIds) ? input.allowedIdentityIds : []).filter(validId))].slice(0, 100);
  if (input.enabled && input.allowAllActiveAI !== true && !allowedIdentityIds.length) {
    throw fail(400, 'Select at least one AI identity or explicitly allow all active AI identities.');
  }
  const current = db.aiSocialConsents.find(item => item.humanUserId === humanUserId);
  const next = {
    id: current?.id || makeId(), humanUserId,
    enabled: input.enabled,
    allowAllActiveAI: input.enabled && input.allowAllActiveAI === true,
    allowedIdentityIds: input.enabled ? allowedIdentityIds : [],
    consentedAt: input.enabled ? nowIso(now) : null,
    withdrawnAt: input.enabled ? null : nowIso(now),
    updatedAt: nowIso(now)
  };
  if (current) Object.assign(current, next);
  else db.aiSocialConsents.push(next);
  return next;
}

export function openAISocialConversation(db, humanUserId, identityId, text, { now = new Date() } = {}) {
  ensureAISocialCollections(db);
  const profile = db.aiSocialProfiles.find(item => item.identityId === identityId);
  const grant = db.aiSocialPermissions.find(item => item.identityId === identityId);
  const settings = profile && (db.aiBotSettings || []).find(item => item.ownerId === profile.ownerUserId);
  if (!profile || profile.profileVisibility !== 'public' || profile.identityStatus !== 'active' || !profile.enabled) {
    throw fail(404, 'This AI member is not available.');
  }
  if (!settings || settings.globalPaused !== false) throw fail(409, 'This AI member is not accepting messages while the AI Network is paused.');
  if (!grant || grant.status !== 'active' || grant.permissions?.receiveHumanMessages !== true) {
    throw fail(403, 'This AI member is not accepting human messages.');
  }
  const messageText = clean(text, 3000);
  if (!messageText) throw fail(400, 'Enter a message of up to 3,000 characters.');
  const recent = db.aiSocialActivities.filter(item => item.identityId === identityId &&
    item.action === 'inbound_human' && item.actorId === humanUserId &&
    Date.parse(item.occurredAt) >= new Date(now).getTime() - RATE_LIMITS.inbound_human.windowMs);
  if (recent.length >= RATE_LIMITS.inbound_human.max) throw fail(429, 'You have reached the message limit for this AI member.');
  const hash = hashText(messageText);
  const duplicate = db.aiSocialMessages.some(item => item.identityId === identityId &&
    item.fromType === 'human' && item.fromId === humanUserId &&
    hashText(item.text) === hash && Date.parse(item.createdAt) >= new Date(now).getTime() - 60 * 60 * 1000);
  if (duplicate) throw fail(409, 'This message was already sent to the AI member.');
  let conversation = findConversation(db, identityId, 'human', humanUserId);
  if (!conversation) conversation = createConversation(db, profile.ownerUserId, identityId, 'human', humanUserId, now);
  const message = addSocialMessage(db, conversation, {
    fromType: 'human', fromId: humanUserId, toType: 'ai', toId: identityId, text: messageText
  }, now);
  activity(db, profile.ownerUserId, identityId, 'inbound_human', 'conversation', conversation.id, 'completed', now, { actorId: humanUserId });
  return { conversation, message, ownerUserId: profile.ownerUserId, identityId };
}

export function createAISocialDraft(db, ownerUserId, identityId, input = {}, { now = new Date() } = {}) {
  ensureAISocialCollections(db);
  const kind = String(input.kind || '');
  if (!['post', 'comment', 'message_human', 'message_ai'].includes(kind)) {
    throw fail(400, 'Choose post, comment, message_human or message_ai.');
  }
  const profile = db.aiSocialProfiles.find(item => item.identityId === identityId && item.ownerUserId === ownerUserId);
  if (!profile) throw fail(404, 'AI social profile not found. Load the canonical AI identity profile first.');
  if (profile.identityStatus !== 'active' || !profile.enabled) throw fail(409, 'Only an active, enabled AI identity can prepare social content.');
  const permissionKey = ACTION_PERMISSION[kind];
  const grant = db.aiSocialPermissions.find(item => item.identityId === identityId && item.ownerUserId === ownerUserId);
  if (!grant || grant.status !== 'active' || grant.permissions?.[permissionKey] !== true) {
    throw fail(403, 'Grant the required AI social permission before creating this draft.');
  }
  const text = clean(input.text, kind === 'comment' ? 2000 : kind.startsWith('message_') ? 3000 : 4000);
  if (!text) throw fail(400, 'AI social content cannot be empty.');
  const idempotencyKey = clean(input.idempotencyKey, 160);
  if (idempotencyKey) {
    const existing = db.aiSocialDrafts.find(item => item.ownerUserId === ownerUserId &&
      item.identityId === identityId && item.idempotencyKey === idempotencyKey);
    if (existing) {
      if (existing.contentHash !== hashText(text) || existing.kind !== kind) {
        throw fail(409, 'This idempotency key was already used for different AI social content.');
      }
      return existing;
    }
  }
  const audience = String(input.audience || 'private');
  if (kind === 'post' && (!AUDIENCES.has(audience) || !grant.allowedAudiences.includes(audience))) {
    throw fail(403, 'This AI identity has not been granted the requested post audience.');
  }
  if (kind === 'post' && audience === 'public' && profile.profileVisibility !== 'public') {
    throw fail(403, 'A public post requires a public AI member profile.');
  }
  const targetPostId = clean(input.targetPostId, 100);
  const targetUserId = clean(input.targetUserId, 100);
  const targetIdentityId = clean(input.targetIdentityId, 100);
  if (kind === 'comment' && !targetPostId) throw fail(400, 'Choose the post this AI comment is intended for.');
  if (kind === 'message_human' && !targetUserId) throw fail(400, 'Choose the human recipient for this AI message.');
  if (kind === 'message_ai' && (!validId(targetIdentityId) || targetIdentityId === identityId)) {
    throw fail(400, 'Choose another valid AI identity as the message recipient.');
  }
  const contentHash = hashText(text);
  const draft = {
    id: makeId(), ownerUserId, identityId, kind, text, contentHash,
    audience: kind === 'post' ? audience : null,
    targetPostId: kind === 'comment' ? targetPostId : null,
    targetUserId: kind === 'message_human' ? targetUserId : null,
    targetIdentityId: kind === 'message_ai' ? targetIdentityId : null,
    conversationId: clean(input.conversationId, 100) || null,
    idempotencyKey: idempotencyKey || null,
    contentOrigin: input.contentOrigin === 'provider_generated' ? 'provider_generated' : 'owner_authored',
    status: 'pending_approval',
    humanApprovalRequired: true,
    aiDisclosureRequired: true,
    createdAt: nowIso(now),
    updatedAt: nowIso(now)
  };
  db.aiSocialDrafts.push(draft);
  activity(db, ownerUserId, identityId, 'draft_created', 'social_draft', draft.id, 'pending_approval', now);
  return draft;
}

export function approveAISocialDraft(db, ownerUserId, identityId, draftId, {
  approvedByUserId = ownerUserId, now = new Date(), validateTarget = null
} = {}) {
  ensureAISocialCollections(db);
  const draft = db.aiSocialDrafts.find(item => item.id === draftId &&
    item.ownerUserId === ownerUserId && item.identityId === identityId);
  if (!draft) throw fail(404, 'AI social draft not found.');
  if (draft.status === 'published' || draft.status === 'sent') return draft;
  if (draft.status !== 'pending_approval') throw fail(409, 'Only a pending AI social draft can be approved.');
  const action = draft.kind;
  const { profile, grant } = requireSocialPermission(db, ownerUserId, identityId, action);
  if (typeof validateTarget === 'function') validateTarget(draft, { profile, grant });
  enforceRateLimit(db, ownerUserId, identityId, action, now);
  const recentDuplicate = db.aiSocialActivities.some(item =>
    item.ownerUserId === ownerUserId && item.identityId === identityId &&
    item.action === action && item.contentHash === draft.contentHash &&
    item.status === 'completed' && Date.parse(item.occurredAt) >= new Date(now).getTime() - 24 * 60 * 60 * 1000
  );
  if (recentDuplicate) throw fail(409, 'Similar AI content was already published or sent recently.');

  let result;
  if (action === 'post') {
    const post = {
      id: makeId(), userId: ownerUserId, text: draft.text, mediaIds: [],
      audience: draft.audience, createdAt: nowIso(now), reactions: {}, comments: [],
      aiIdentityId: identityId, aiGenerated: true, aiDisclosureLabel: 'AI',
      aiContentOrigin: draft.contentOrigin, aiApprovedByUserId: approvedByUserId,
      aiProfile: getAISocialProfile(db, identityId, { viewerId: ownerUserId })
    };
    db.posts.unshift(post);
    draft.status = 'published';
    draft.publishedPostId = post.id;
    result = { postId: post.id };
  } else if (action === 'comment') {
    const post = db.posts.find(item => item.id === draft.targetPostId &&
      item.status !== 'hidden' && !item.archivedAt);
    if (!post) throw fail(404, 'The target post is not available.');
    post.comments ||= [];
    const comment = {
      id: makeId(), userId: ownerUserId, text: draft.text, createdAt: nowIso(now),
      aiIdentityId: identityId, aiGenerated: true, aiDisclosureLabel: 'AI',
      aiApprovedByUserId: approvedByUserId, aiContentOrigin: draft.contentOrigin
    };
    post.comments.push(comment);
    draft.status = 'published';
    draft.publishedCommentId = comment.id;
    result = { postId: post.id, commentId: comment.id };
  } else if (action === 'message_human' || action === 'message_ai') {
    const targetType = action === 'message_human' ? 'human' : 'ai';
    const targetId = action === 'message_human' ? draft.targetUserId : draft.targetIdentityId;
    let conversation = draft.conversationId
      ? db.aiSocialConversations.find(item => item.id === draft.conversationId &&
          item.ownerUserId === ownerUserId && item.identityId === identityId && item.status === 'active')
      : findConversation(db, identityId, targetType, targetId);
    if (!conversation) conversation = createConversation(db, ownerUserId, identityId, targetType, targetId, now);
    const message = addSocialMessage(db, conversation, {
      fromType: 'ai', fromId: identityId,
      toType: targetType, toId: targetId, text: draft.text, approvedByUserId
    }, now);
    draft.status = 'sent';
    draft.sentMessageId = message.id;
    draft.conversationId = conversation.id;
    result = { conversationId: conversation.id, messageId: message.id };
  }
  draft.approvedByUserId = approvedByUserId;
  draft.approvedAt = nowIso(now);
  draft.updatedAt = nowIso(now);
  activity(db, ownerUserId, identityId, action, action === 'post' ? 'post' : action === 'comment' ? 'post' : 'conversation',
    action === 'post' ? draft.publishedPostId : action === 'comment' ? draft.targetPostId : draft.conversationId,
    'completed', now, { contentHash: draft.contentHash, approvedByUserId });
  return { ...draft, result };
}

export function recordAISocialReaction(db, ownerUserId, identityId, postId, reaction, {
  now = new Date(), validateTarget = null
} = {}) {
  ensureAISocialCollections(db);
  const { grant } = requireSocialPermission(db, ownerUserId, identityId, 'react');
  const post = db.posts.find(item => item.id === postId && item.status !== 'hidden' && !item.archivedAt);
  if (!post) throw fail(404, 'The target post is not available.');
  if (post.aiIdentityId === identityId) throw fail(403, 'An AI identity cannot react to its own post.');
  if (!REACTIONS.has(reaction)) throw fail(400, 'Unsupported reaction.');
  if (typeof validateTarget === 'function') validateTarget(post, { grant });
  enforceRateLimit(db, ownerUserId, identityId, 'react', now);
  post.reactions ||= {};
  const reactionKey = 'ai:' + identityId;
  if (post.reactions[reactionKey] === reaction) delete post.reactions[reactionKey];
  else post.reactions[reactionKey] = reaction;
  activity(db, ownerUserId, identityId, 'react', 'post', postId, 'completed', now, { reaction });
  return { postId, reaction: post.reactions[reactionKey] || null };
}

export function setAISocialIdentityStatus(db, ownerUserId, identityId, status, { now = new Date() } = {}) {
  ensureAISocialCollections(db);
  if (!['active', 'paused', 'suspended'].includes(status)) throw fail(400, 'Choose active, paused or suspended.');
  const grant = db.aiSocialPermissions.find(item => item.identityId === identityId && item.ownerUserId === ownerUserId);
  if (!grant) throw fail(404, 'AI social permissions were not found.');
  grant.status = status;
  grant.updatedAt = nowIso(now);
  if (status !== 'active') {
    for (const draft of db.aiSocialDrafts) {
      if (draft.ownerUserId === ownerUserId && draft.identityId === identityId && draft.status === 'pending_approval') {
        draft.status = 'cancelled';
        draft.updatedAt = nowIso(now);
      }
    }
  }
  activity(db, ownerUserId, identityId, 'social_' + status, 'ai_social_permissions', grant.id, 'completed', now);
  return grant;
}

export function listAISocialHistory(db, ownerUserId, identityId, { limit = 50 } = {}) {
  ensureAISocialCollections(db);
  const safeLimit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 50)));
  return ownerRows(db.aiSocialActivities, ownerUserId)
    .filter(item => item.identityId === identityId)
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, safeLimit);
}

export function listAISocialInbox(db, ownerUserId, identityId) {
  ensureAISocialCollections(db);
  return ownerRows(db.aiSocialConversations, ownerUserId)
    .filter(item => item.identityId === identityId && item.status === 'active')
    .sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt))
    .map(conversation => ({
      ...conversation,
      messages: db.aiSocialMessages
        .filter(item => item.conversationId === conversation.id)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    }));
}

export function listAISocialConversationsForHuman(db, humanUserId) {
  ensureAISocialCollections(db);
  return db.aiSocialConversations
    .filter(item => item.kind === 'human_ai' && item.humanUserId === humanUserId && item.status === 'active')
    .map(conversation => {
      const profile = db.aiSocialProfiles.find(item => item.identityId === conversation.identityId);
      if (!profile || profile.profileVisibility !== 'public' || profile.identityStatus !== 'active' || !profile.enabled) return null;
      return {
        conversation,
        profile: getAISocialProfile(db, profile.identityId),
        messages: db.aiSocialMessages
          .filter(item => item.conversationId === conversation.id)
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      };
    })
    .filter(Boolean);
}
