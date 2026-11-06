export const FRIEND_PREFERENCE_DEFAULTS = Object.freeze({
  isFavorite: false,
  isCloseFriend: false,
  isMutedPosts: false,
  isMutedStories: false,
  snoozedUntil: null
});

const FRIEND_PREFERENCE_KEYS = new Set(Object.keys(FRIEND_PREFERENCE_DEFAULTS));

export function isRelationshipBlocked(blocks = [], firstId, secondId) {
  if (!firstId || !secondId || firstId === secondId) return false;
  return blocks.some(item =>
    (item.blockerId === firstId && item.blockedId === secondId) ||
    (item.blockerId === secondId && item.blockedId === firstId)
  );
}

export function getMutualFollowIds(follows = [], ownerId, blocks = []) {
  if (!ownerId) return [];
  const outgoing = new Set(
    follows.filter(edge => edge.followerId === ownerId).map(edge => edge.followedId)
  );
  const incoming = new Set(
    follows.filter(edge => edge.followedId === ownerId).map(edge => edge.followerId)
  );
  return [...outgoing]
    .filter(id => id && id !== ownerId && incoming.has(id) && !isRelationshipBlocked(blocks, ownerId, id));
}

export function normalizeFriendPreferences(record) {
  return { ...FRIEND_PREFERENCE_DEFAULTS, ...(record || {}) };
}

export function validateFriendPreferencePatch(patch, nowMs = Date.now()) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { valid: false, error: 'Friend preferences must be an object.' };
  }
  const value = {};
  for (const [key, next] of Object.entries(patch)) {
    if (!FRIEND_PREFERENCE_KEYS.has(key)) {
      return { valid: false, error: 'Unsupported friend preference: ' + key };
    }
    if (key === 'snoozedUntil') {
      if (next === null || next === '') {
        value.snoozedUntil = null;
        continue;
      }
      const timestamp = Date.parse(next);
      const maximum = nowMs + 30 * 24 * 60 * 60 * 1000;
      if (typeof next !== 'string' || !Number.isFinite(timestamp) || timestamp <= nowMs || timestamp > maximum) {
        return { valid: false, error: 'Snooze must end within the next 30 days.' };
      }
      value.snoozedUntil = new Date(timestamp).toISOString();
      continue;
    }
    if (typeof next !== 'boolean') {
      return { valid: false, error: key + ' must be true or false.' };
    }
    value[key] = next;
  }
  if (!Object.keys(value).length) return { valid: false, error: 'Choose a friend preference to update.' };
  return { valid: true, value };
}
