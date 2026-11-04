export function isBlockedBetween(blocks = [], firstId, secondId) {
  if (!firstId || !secondId || firstId === secondId) return false;
  return blocks.some(block =>
    (block.blockerId === firstId && block.blockedId === secondId) ||
    (block.blockerId === secondId && block.blockedId === firstId)
  );
}

export function canViewStory({ viewerId, story, friendships = [], follows = [], blocks = [] }) {
  if (!viewerId || !story?.userId) return false;
  if (viewerId === story.userId) return true;
  if (isBlockedBetween(blocks, viewerId, story.userId)) return false;
  if (story.audience === 'public') return true;
  if (story.audience === 'friends') {
    return friendships.some(friendship => friendship.status === 'accepted' &&
      ((friendship.from === viewerId && friendship.to === story.userId) ||
       (friendship.from === story.userId && friendship.to === viewerId)));
  }
  if (story.audience === 'followers') {
    return follows.some(follow => follow.followerId === viewerId && follow.followedId === story.userId);
  }
  return false;
}

export function expiredStoryIds(stories = [], now = Date.now()) {
  return new Set(stories
    .filter(story => !Number.isFinite(Date.parse(story.expiresAt)) || Date.parse(story.expiresAt) <= now)
    .map(story => story.id));
}

export function removeExpiredStories({ stories = [], views = [], now = Date.now() }) {
  const expiredIds = expiredStoryIds(stories, now);
  return {
    stories: stories.filter(story => !expiredIds.has(story.id)),
    views: views.filter(view => !expiredIds.has(view.storyId)),
    removedCount: expiredIds.size
  };
}

export function normalizeStoryMediaIds({ mediaIds, mediaId } = {}, maxFiles = 10) {
  if (mediaIds !== undefined && mediaId !== undefined && mediaId !== null && mediaId !== '') {
    return { valid: false, error: 'Choose story media once. Do not mix single-file and multiple-file selections.' };
  }
  if (mediaIds !== undefined && !Array.isArray(mediaIds)) {
    return { valid: false, error: 'Story media must be a list of uploaded files.' };
  }

  const raw = mediaIds !== undefined ? mediaIds : (mediaId ? [mediaId] : []);
  const normalized = raw.map(value => String(value || '').trim());
  if (normalized.length > maxFiles) {
    return { valid: false, error: 'A story batch can contain up to ' + maxFiles + ' photos or videos.' };
  }
  if (normalized.some(value => !value || value.length > 160)) {
    return { valid: false, error: 'One or more selected story files are invalid. Select them again.' };
  }
  if (new Set(normalized).size !== normalized.length) {
    return { valid: false, error: 'The same photo or video cannot be added to a story batch twice.' };
  }
  return { valid: true, mediaIds: normalized };
}

export function createStoryBatch({
  userId,
  text = '',
  mediaIds = [],
  audience = 'public',
  soundtrack = null,
  requestId = null,
  idFactory,
  createdAt = new Date().toISOString(),
  expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
}) {
  if (typeof idFactory !== 'function') throw new TypeError('Story batch creation requires an ID generator.');
  const files = mediaIds.length ? mediaIds : [null];
  const batchId = idFactory();
  const createdTime = Date.parse(createdAt);
  const expiryTime = Date.parse(expiresAt);
  if (!Number.isFinite(createdTime) || !Number.isFinite(expiryTime) || expiryTime <= createdTime) {
    throw new TypeError('Story batch timestamps must be valid and ordered.');
  }
  return files.map((mediaId, index) => ({
    id: idFactory(),
    userId,
    text,
    mediaId,
    soundtrack,
    audience,
    storyBatchId: batchId,
    storyBatchIndex: index,
    storyBatchSize: files.length,
    storyRequestId: requestId,
    createdAt: new Date(createdTime + index).toISOString(),
    expiresAt: new Date(expiryTime + index).toISOString()
  }));
}

export function appendStoryBatch(existingStories = [], newStories = []) {
  if (!Array.isArray(existingStories) || !Array.isArray(newStories)) {
    throw new TypeError('Stories must be appended using arrays.');
  }
  return [...existingStories, ...newStories];
}
