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
