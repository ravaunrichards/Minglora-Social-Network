function timestamp(value) {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isActiveCreatorSubscription(subscription, at = new Date()) {
  if (!subscription || String(subscription.status || '').toLowerCase() !== 'active') return false;
  if (!subscription.creatorId || !subscription.subscriberId || subscription.creatorId === subscription.subscriberId) return false;

  const now = at instanceof Date ? at.getTime() : new Date(at).getTime();
  if (!Number.isFinite(now)) throw new TypeError('Subscription activity checks require a valid timestamp.');

  if (subscription.currentPeriodEnd !== undefined && subscription.currentPeriodEnd !== null && subscription.currentPeriodEnd !== '') {
    const periodEnd = new Date(subscription.currentPeriodEnd).getTime();
    if (!Number.isFinite(periodEnd) || periodEnd <= now) return false;
  }

  // A cancellation scheduled for the end of a paid period remains active until
  // currentPeriodEnd. A cancellation that has already taken effect must use a
  // non-active status and is excluded above.
  return true;
}

export function listActiveCreatorSubscriptions(subscriptions, creatorId, at = new Date()) {
  if (!Array.isArray(subscriptions) || !creatorId) return [];

  const latestBySubscriber = new Map();
  for (const subscription of subscriptions) {
    if (subscription?.creatorId !== creatorId || !isActiveCreatorSubscription(subscription, at)) continue;

    const subscriberId = subscription.subscriberId;
    const existing = latestBySubscriber.get(subscriberId);
    if (!existing || timestamp(subscription.createdAt || subscription.startedAt) > timestamp(existing.createdAt || existing.startedAt)) {
      latestBySubscriber.set(subscriberId, subscription);
    }
  }

  return [...latestBySubscriber.values()].sort((a, b) =>
    timestamp(b.createdAt || b.startedAt) - timestamp(a.createdAt || a.startedAt) ||
    String(a.subscriberId).localeCompare(String(b.subscriberId))
  );
}
