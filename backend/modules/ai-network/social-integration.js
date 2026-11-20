const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REACTIONS = new Set(['like', 'love', 'care', 'haha', 'wow', 'sad', 'angry']);

export function buildAISocialMember(profile) {
  if (!profile || typeof profile !== 'object') return null;
  const id = String(profile.identity_id || profile.id || '').trim();
  const status = String(profile.status || '').toLowerCase();
  const visibility = String(profile.profile_visibility || '').toLowerCase();
  if (!UUID_PATTERN.test(id) || status !== 'active' || profile.enabled !== true || visibility !== 'public') return null;
  const name = String(profile.display_name || profile.name || '').trim().slice(0, 120);
  const username = String(profile.username || '').trim().replace(/^@/, '').slice(0, 80);
  if (!name || !/^[a-z0-9_]{3,80}$/i.test(username)) return null;
  return {
    id,
    aiIdentityId: id,
    name,
    username,
    bio: String(profile.bio || '').slice(0, 500),
    introduction: String(profile.introduction || '').slice(0, 1200),
    profession: String(profile.profession || '').slice(0, 120),
    interests: Array.isArray(profile.interests) ? profile.interests.slice(0, 20).map(value => String(value).slice(0, 80)) : [],
    skills: Array.isArray(profile.skills) ? profile.skills.slice(0, 20).map(value => String(value).slice(0, 80)) : [],
    avatar: '',
    avatarUrl: '',
    cover: '',
    createdAt: profile.created_at || null,
    profileVisibility: 'public',
    isAI: true,
    aiAccount: true,
    aiDisclosureRequired: true
  };
}

export function validateAISocialText(value, { min = 1, max = 5000 } = {}) {
  const text = String(value ?? '').trim();
  if (text.length < min || text.length > max) {
    throw Object.assign(new Error(`Text must contain between ${min} and ${max} characters.`), { status: 400 });
  }
  return text;
}

function findExistingContent(db, action, identityId, requestId) {
  if (action === 'post') return (db.posts || []).find(item => item.id === requestId && item.userId === identityId) || null;
  if (action === 'comment') {
    for (const post of db.posts || []) {
      const comment = (post.comments || []).find(item => item.id === requestId && item.userId === identityId);
      if (comment) return { post, comment };
    }
    return null;
  }
  if (action === 'react') {
    for (const post of db.posts || []) {
      const event = (post.aiReactionEvents || []).find(item => item.id === requestId && item.identityId === identityId);
      if (event) return { post, event };
    }
    return null;
  }
  return (db.messages || []).find(item => item.id === requestId && item.from === identityId) || null;
}

async function completeAuthorizedEvent(complete, eventId) {
  if (!eventId) return;
  try {
    await complete(eventId);
  } catch (error) {
    // A reused event may already be completed. The authorization command only
    // returns an existing event ID for the same owner/action/idempotency key.
    if (Number(error?.status) !== 404 && String(error?.code || '') !== 'P0002') throw error;
  }
}

export async function performAISocialAction({
  identityId,
  action,
  input,
  db,
  authorize,
  complete,
  save,
  canViewTargetPost,
  canMessageMember,
  canInteractWithAI,
  now = () => new Date().toISOString()
}) {
  if (!UUID_PATTERN.test(String(identityId || ''))) throw Object.assign(new Error('A valid AI identity ID is required.'), { status: 400 });
  if (!['post', 'comment', 'react', 'message'].includes(action)) throw Object.assign(new Error('Unsupported AI social action.'), { status: 400 });
  if (!input || input.humanApproved !== true) throw Object.assign(new Error('Explicit human approval is required for every AI social action.'), { status: 403 });
  const requestId = String(input.requestId || '').trim();
  if (!UUID_PATTERN.test(requestId)) throw Object.assign(new Error('A UUID requestId is required for safe retries.'), { status: 400 });

  const existing = findExistingContent(db, action, identityId, requestId);
  if (existing) {
    await completeAuthorizedEvent(complete, existing.aiActivityEventId || existing.comment?.aiActivityEventId || existing.event?.aiActivityEventId);
    return { reused: true, content: existing };
  }

  let post = null;
  let recipientId = '';
  let recipientIdentityId = '';
  let targetType = '';
  let targetId = '';
  let text = '';
  let reaction = '';
  let interactionEvent = null;
  const chainId = String(input.chainId || requestId);
  const loopDepth = Number.isInteger(Number(input.loopDepth)) ? Number(input.loopDepth) : 0;

  if (action === 'post') {
    text = validateAISocialText(input.text, { min: 1, max: 5000 });
    if (String(input.audience || 'public') !== 'public') {
      throw Object.assign(new Error('AI social posts must use the public audience and a public AI profile.'), { status: 403 });
    }
    targetType = 'post';
    targetId = requestId;
  } else if (action === 'comment' || action === 'react') {
    const postId = String(input.postId || '').trim();
    post = (db.posts || []).find(item => item.id === postId);
    if (!post || post.status === 'hidden' || post.archivedAt || post.audience && post.audience !== 'public') {
      throw Object.assign(new Error('The target post is not available for AI interaction.'), { status: 404 });
    }
    if (typeof canViewTargetPost !== 'function' || !await canViewTargetPost(post)) {
      throw Object.assign(new Error('The target post is private, blocked or otherwise unavailable to this AI identity.'), { status: 403 });
    }
    targetType = 'post';
    targetId = post.id;
    if (action === 'comment') {
      text = validateAISocialText(input.text, { min: 1, max: 2000 });
    } else {
      reaction = String(input.reaction || 'like').toLowerCase();
      if (!REACTIONS.has(reaction)) throw Object.assign(new Error('Unsupported reaction.'), { status: 400 });
    }
    if (post.aiGenerated === true || post.aiIdentityId || (post.userId && post.userId !== identityId && input.targetIdentityId)) {
      const targetIdentityId = String(post.aiIdentityId || post.userId || input.targetIdentityId || '');
      if (!UUID_PATTERN.test(targetIdentityId) || targetIdentityId === identityId) {
        throw Object.assign(new Error('AI-to-AI interaction must target another valid AI identity.'), { status: 403 });
      }
      if (typeof canInteractWithAI !== 'function' || !await canInteractWithAI(targetIdentityId)) {
        throw Object.assign(new Error('The target AI identity is not available for AI interaction.'), { status: 403 });
      }
      if (loopDepth < 0 || loopDepth >= 2) throw Object.assign(new Error('AI interaction chain depth cannot exceed two.'), { status: 403 });
      interactionEvent = await authorize({
        social_action: 'ai_interact',
        target_identity_id: targetIdentityId,
        target_type: 'ai_identity',
        target_id: targetIdentityId,
        chain_id: chainId,
        loop_depth: loopDepth,
        idempotency_key: requestId + ':ai-interact',
        human_approved: true
      });
    }
  } else {
    recipientId = String(input.recipientUserId || '').trim();
    recipientIdentityId = String(input.recipientIdentityId || '').trim();
    text = validateAISocialText(input.text, { min: 1, max: 3000 });
    if (recipientIdentityId) {
      if (!UUID_PATTERN.test(recipientIdentityId) || recipientIdentityId === identityId ||
          typeof canInteractWithAI !== 'function' || !await canInteractWithAI(recipientIdentityId)) {
        throw Object.assign(new Error('Choose another active public AI identity that permits AI interaction.'), { status: 403 });
      }
      if (loopDepth < 0 || loopDepth >= 2) throw Object.assign(new Error('AI interaction chain depth cannot exceed two.'), { status: 403 });
      interactionEvent = await authorize({
        social_action: 'ai_interact',
        target_identity_id: recipientIdentityId,
        target_type: 'ai_identity',
        target_id: recipientIdentityId,
        chain_id: chainId,
        loop_depth: loopDepth,
        idempotency_key: requestId + ':ai-interact',
        human_approved: true
      });
      targetType = 'ai_identity';
      targetId = recipientIdentityId;
    } else {
      if (!UUID_PATTERN.test(recipientId) || typeof canMessageMember !== 'function' || !await canMessageMember(recipientId)) {
        throw Object.assign(new Error('AI messages require a human-initiated conversation, an unrestricted recipient and explicit member consent.'), { status: 403 });
      }
      targetType = 'member';
      targetId = recipientId;
    }
  }

  // An AI-to-AI message is the bounded interaction itself. The database
  // authorize command deliberately permits only human-initiated AI-to-human
  // messages, so do not send an AI-to-AI message through that branch.
  const authorization = action === 'message' && recipientIdentityId
    ? interactionEvent
    : await authorize({
      social_action: action,
      target_type: targetType,
      target_id: targetId,
      idempotency_key: requestId,
      human_approved: true,
      ...(action === 'message' ? { human_initiated: true, recipient_user_id: recipientId } : {}),
      ...(interactionEvent ? { chain_id: chainId, loop_depth: loopDepth } : {})
    });

  if (authorization?.reused === true) {
    const reused = findExistingContent(db, action, identityId, requestId);
    if (!reused) throw Object.assign(new Error('This request was already authorized but its content is not available. No duplicate content was created.'), { status: 409 });
    await completeAuthorizedEvent(complete, authorization.event_id);
    if (interactionEvent?.event_id !== authorization?.event_id) await completeAuthorizedEvent(complete, interactionEvent?.event_id);
    return { reused: true, content: reused };
  }

  const createdAt = now();
  let content;
  if (action === 'post') {
    content = {
      id: requestId, userId: identityId, aiIdentityId: identityId, aiGenerated: true,
      aiDisclosureRequired: true, text, mediaIds: [], audience: 'public', createdAt,
      reactions: {}, comments: [], aiActivityEventId: authorization?.event_id || null
    };
    db.posts ||= [];
    db.posts.unshift(content);
  } else if (action === 'comment') {
    content = {
      id: requestId, userId: identityId, aiIdentityId: identityId, aiGenerated: true,
      aiDisclosureRequired: true, text, createdAt, aiActivityEventId: authorization?.event_id || null
    };
    post.comments ||= [];
    post.comments.push(content);
  } else if (action === 'react') {
    post.reactions ||= {};
    post.aiReactionEvents ||= [];
    post.reactions[identityId] = reaction;
    content = {
      id: requestId, identityId, reaction, aiGenerated: true,
      aiDisclosureRequired: true, createdAt, aiActivityEventId: authorization?.event_id || null
    };
    post.aiReactionEvents.push(content);
  } else {
    content = {
      id: requestId, from: identityId, to: recipientIdentityId || recipientId,
      text, attachmentIds: [], createdAt, read: false, reactions: {},
      aiGenerated: true, aiIdentityId: identityId, aiDisclosureRequired: true,
      ...(recipientIdentityId ? { aiToAI: true } : {}),
      aiActivityEventId: authorization?.event_id || interactionEvent?.event_id || null
    };
    db.messages ||= [];
    db.messages.push(content);
  }

  if (typeof save === 'function') await save();
  await completeAuthorizedEvent(complete, authorization?.event_id);
  if (interactionEvent?.event_id !== authorization?.event_id) await completeAuthorizedEvent(complete, interactionEvent?.event_id);
  return { reused: false, content };
}

export function validateAISocialConsent(value) {
  if (typeof value !== 'boolean') throw Object.assign(new Error('allow_ai_messages must be a boolean.'), { status: 400 });
  return value;
}
