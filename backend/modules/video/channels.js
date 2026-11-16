export const VIDEO_CHANNEL_VISIBILITIES = Object.freeze(['public', 'unlisted', 'private']);
export const VIDEO_CHANNEL_MAX_SUBSCRIPTIONS = 5000;

export function validateVideoChannelInput(input, { partial = false } = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const value = {};
  const errors = [];

  if (!partial || Object.hasOwn(source, 'title')) {
    const title = String(source.title ?? '').trim();
    if (!title || title.length > 80) errors.push('Channel name must contain between 1 and 80 characters.');
    else value.title = title;
  }
  if (!partial || Object.hasOwn(source, 'description')) {
    const description = String(source.description ?? '').trim();
    if (description.length > 1000) errors.push('Channel description must be 1,000 characters or fewer.');
    else value.description = description;
  }
  if (!partial || Object.hasOwn(source, 'visibility')) {
    const visibility = String(source.visibility ?? (partial ? '' : 'public')).trim().toLowerCase();
    if (!VIDEO_CHANNEL_VISIBILITIES.includes(visibility)) {
      errors.push('Channel visibility must be public, unlisted or private.');
    } else value.visibility = visibility;
  }
  if (partial && !Object.keys(value).length && !errors.length) {
    errors.push('Provide at least one channel field to update.');
  }
  return { valid: errors.length === 0, value, errors };
}

export function canViewVideoChannel(channel, viewerId, { isBlocked = false, allowUnlisted = true } = {}) {
  if (!channel || !viewerId || !channel.ownerId) return false;
  if (viewerId === channel.ownerId) return true;
  if (isBlocked) return false;
  if (channel.visibility === 'public') return true;
  if (channel.visibility === 'unlisted') return allowUnlisted === true;
  return false;
}

export function subscribeToVideoChannel(subscriptions, {
  ownerId, subscriberId, id, createdAt, maxSubscriptions = VIDEO_CHANNEL_MAX_SUBSCRIPTIONS
}) {
  if (!Array.isArray(subscriptions) || !ownerId || !subscriberId || !id || ownerId === subscriberId) {
    return { status: 'invalid' };
  }
  const existing = subscriptions.find(item => item.ownerId === ownerId && item.subscriberId === subscriberId);
  if (existing) return { status: 'exists', subscription: existing };
  const owned = subscriptions.filter(item => item.subscriberId === subscriberId);
  if (owned.length >= maxSubscriptions) return { status: 'limit' };
  const subscription = {
    id: String(id),
    ownerId: String(ownerId),
    subscriberId: String(subscriberId),
    createdAt: String(createdAt || new Date().toISOString())
  };
  subscriptions.push(subscription);
  return { status: 'created', subscription };
}

export function unsubscribeFromVideoChannel(subscriptions, { ownerId, subscriberId }) {
  if (!Array.isArray(subscriptions) || !ownerId || !subscriberId || ownerId === subscriberId) {
    return { status: 'invalid' };
  }
  const index = subscriptions.findIndex(item => item.ownerId === ownerId && item.subscriberId === subscriberId);
  if (index < 0) return { status: 'not_found' };
  const [subscription] = subscriptions.splice(index, 1);
  return { status: 'removed', subscription };
}
