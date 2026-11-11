export function isVideoChannelSubscribed(subscriptions, subscriberId, channelOwnerId) {
  if (!Array.isArray(subscriptions) || !subscriberId || !channelOwnerId) return false;
  return subscriptions.some(item =>
    item && item.subscriberId === subscriberId && item.channelOwnerId === channelOwnerId
  );
}

export function subscribeToVideoChannel(subscriptions, {
  subscriberId, channelOwnerId, id, createdAt
}) {
  if (!Array.isArray(subscriptions) || !subscriberId || !channelOwnerId || !id) {
    return { status: 'invalid' };
  }
  if (subscriberId === channelOwnerId) return { status: 'self' };
  const existing = subscriptions.find(item =>
    item && item.subscriberId === subscriberId && item.channelOwnerId === channelOwnerId
  );
  if (existing) return { status: 'exists', subscription: existing };

  const subscription = {
    id: String(id),
    subscriberId: String(subscriberId),
    channelOwnerId: String(channelOwnerId),
    createdAt: String(createdAt || new Date().toISOString())
  };
  subscriptions.push(subscription);
  return { status: 'created', subscription };
}

export function unsubscribeFromVideoChannel(subscriptions, {
  subscriberId, channelOwnerId
}) {
  if (!Array.isArray(subscriptions) || !subscriberId || !channelOwnerId) {
    return { status: 'invalid' };
  }
  const index = subscriptions.findIndex(item =>
    item && item.subscriberId === subscriberId && item.channelOwnerId === channelOwnerId
  );
  if (index < 0) return { status: 'not_found' };
  const [subscription] = subscriptions.splice(index, 1);
  // Repair legacy duplicate edges if any, without touching another subscriber.
  for (let i = subscriptions.length - 1; i >= 0; i--) {
    const item = subscriptions[i];
    if (item?.subscriberId === subscriberId && item?.channelOwnerId === channelOwnerId) {
      subscriptions.splice(i, 1);
    }
  }
  return { status: 'removed', subscription };
}
