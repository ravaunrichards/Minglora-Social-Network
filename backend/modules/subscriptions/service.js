const timestamp = value => {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export const CREATOR_SUBSCRIPTION_PACKAGES = Object.freeze([
  Object.freeze({ code: 'supporter', name: 'Supporter', priceMinor: 299, currency: 'USD', interval: 'month' }),
  Object.freeze({ code: 'plus', name: 'Plus', priceMinor: 499, currency: 'USD', interval: 'month' }),
  Object.freeze({ code: 'vip', name: 'VIP', priceMinor: 999, currency: 'USD', interval: 'month' })
]);

export const CREATOR_SUBSCRIPTION_PERKS = Object.freeze([
  Object.freeze({ code: 'subscriber_badge', label: 'Subscriber badge', description: 'A visible supporter badge beside your name.' }),
  Object.freeze({ code: 'exclusive_posts', label: 'Exclusive posts', description: 'Posts marked for active subscribers.' }),
  Object.freeze({ code: 'exclusive_reels', label: 'Exclusive videos and Reels', description: 'Subscriber-only video and Reel access.' }),
  Object.freeze({ code: 'subscriber_live', label: 'Subscriber-only LIVE', description: 'Access to LIVE sessions reserved for subscribers.' }),
  Object.freeze({ code: 'priority_live_chat', label: 'Priority LIVE chat', description: 'Subscriber messages receive priority styling.' }),
  Object.freeze({ code: 'behind_the_scenes', label: 'Behind-the-scenes updates', description: 'Private creator updates for subscribers.' })
]);

const perkCodes = new Set(CREATOR_SUBSCRIPTION_PERKS.map(perk => perk.code));
const packageByCode = new Map(CREATOR_SUBSCRIPTION_PACKAGES.map(item => [item.code, item]));

export function getCreatorSubscriptionPlans(plans, creatorId) {
  const owned = Array.isArray(plans) ? plans.filter(item => item?.creatorId === creatorId) : [];
  return CREATOR_SUBSCRIPTION_PACKAGES.map(option => {
    const saved = owned.find(item => item.planCode === option.code);
    return {
      ...option,
      enabled: saved?.enabled === true,
      perks: Object.fromEntries(CREATOR_SUBSCRIPTION_PERKS.map(perk => [
        perk.code,
        saved?.perks?.[perk.code] === true
      ])),
      paypalProductId: saved?.paypalProductId || null,
      paypalPlanId: saved?.paypalPlanId || null
    };
  });
}

export function normalizeCreatorSubscriptionPlans(creatorId, requestedPlans, existingPlans = []) {
  if (!creatorId || !Array.isArray(requestedPlans) || requestedPlans.length !== CREATOR_SUBSCRIPTION_PACKAGES.length) {
    return { valid: false, error: 'Choose settings for all three subscription packages.' };
  }

  const byCode = new Map();
  for (const item of requestedPlans) {
    const code = String(item?.code || '');
    if (!packageByCode.has(code) || byCode.has(code)) {
      return { valid: false, error: 'A subscription package is missing or duplicated.' };
    }
    if (typeof item.enabled !== 'boolean' || !item.perks || typeof item.perks !== 'object' || Array.isArray(item.perks)) {
      return { valid: false, error: 'Each package needs an enable setting and perk selections.' };
    }
    for (const [key, enabled] of Object.entries(item.perks)) {
      if (!perkCodes.has(key) || typeof enabled !== 'boolean') {
        return { valid: false, error: 'The selected subscription perks are not valid.' };
      }
    }
    byCode.set(code, item);
  }

  const existingByCode = new Map((Array.isArray(existingPlans) ? existingPlans : [])
    .filter(item => item?.creatorId === creatorId)
    .map(item => [item.planCode, item]));

  const normalized = CREATOR_SUBSCRIPTION_PACKAGES.map(option => {
    const requested = byCode.get(option.code);
    const saved = existingByCode.get(option.code);
    const perks = Object.fromEntries(CREATOR_SUBSCRIPTION_PERKS.map(perk => [
      perk.code,
      requested.perks[perk.code] === true
    ]));
    if (requested.enabled && !Object.values(perks).some(Boolean)) {
      throw new Error('Enable at least one perk for every active package.');
    }
    return {
      creatorId,
      planCode: option.code,
      name: option.name,
      priceMinor: option.priceMinor,
      currency: option.currency,
      interval: option.interval,
      enabled: requested.enabled,
      perks,
      paypalProductId: saved?.paypalProductId || null,
      paypalPlanId: saved?.paypalPlanId || null,
      updatedAt: new Date().toISOString()
    };
  });

  return { valid: true, plans: normalized };
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

  // A scheduled cancellation remains active through the paid billing period.
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
