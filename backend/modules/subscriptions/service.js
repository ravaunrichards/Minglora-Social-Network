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


/**
 * Calculate creator/platform shares from PayPal cash actually received,
 * excluding the verified processing fee and tax before applying the creator
 * base share and any approved performance bonus.
 */
export function calculateCreatorSubscriptionShares({
  grossMinor,
  processingFeeMinor,
  taxMinor = 0,
  performanceBonusBps = 0
}) {
  for (const [name, value] of Object.entries({ grossMinor, processingFeeMinor, taxMinor, performanceBonusBps })) {
    if (!Number.isSafeInteger(value)) throw new TypeError(`${name} must be a safe integer.`);
  }
  if (grossMinor <= 0 || processingFeeMinor < 0 || taxMinor < 0 ||
      processingFeeMinor + taxMinor >= grossMinor) {
    throw new RangeError('The gross amount must exceed the verified fee and tax.');
  }
  if (![0, 2000].includes(performanceBonusBps)) {
    throw new RangeError('The subscription performance bonus must be 0 or 2000 basis points.');
  }
  const netMinor = grossMinor - processingFeeMinor - taxMinor;
  const creatorShareBps = 5000 + performanceBonusBps;
  const platformShareBps = 10000 - creatorShareBps;
  const creatorMinor = Math.floor(netMinor * creatorShareBps / 10000);
  return {
    grossMinor,
    processingFeeMinor,
    taxMinor,
    netMinor,
    creatorShareBps,
    platformShareBps,
    performanceBonusBps,
    creatorMinor,
    platformMinor: netMinor - creatorMinor
  };
}

/**
 * Return only the incremental reversal due for a new refund, preserving the
 * exact original share across multiple partial refunds without rounding drift.
 */
export function calculateCreatorSubscriptionRefund({
  originalGrossMinor,
  originalNetMinor,
  originalCreatorMinor,
  refundedBeforeMinor,
  refundGrossMinor
}) {
  for (const [name, value] of Object.entries({
    originalGrossMinor, originalNetMinor, originalCreatorMinor,
    refundedBeforeMinor, refundGrossMinor
  })) {
    if (!Number.isSafeInteger(value)) throw new TypeError(`${name} must be a safe integer.`);
  }
  if (originalGrossMinor <= 0 || originalNetMinor < 0 || originalCreatorMinor < 0 ||
      originalCreatorMinor > originalNetMinor || refundedBeforeMinor < 0 ||
      refundGrossMinor <= 0 || refundedBeforeMinor + refundGrossMinor > originalGrossMinor) {
    throw new RangeError('The refund must be positive and cannot exceed the original payment.');
  }
  const refundedAfterMinor = refundedBeforeMinor + refundGrossMinor;
  const proportional = (total, refunded) => Math.round(total * refunded / originalGrossMinor);
  const netMinor = proportional(originalNetMinor, refundedAfterMinor) -
    proportional(originalNetMinor, refundedBeforeMinor);
  const creatorMinor = proportional(originalCreatorMinor, refundedAfterMinor) -
    proportional(originalCreatorMinor, refundedBeforeMinor);
  return {
    grossMinor: refundGrossMinor,
    netMinor,
    creatorMinor,
    platformMinor: netMinor - creatorMinor,
    refundedAfterMinor
  };
}
