import test from 'node:test';
import assert from 'node:assert/strict';
import { isActiveCreatorSubscription, listActiveCreatorSubscriptions } from '../../backend/modules/subscriptions/service.js';

const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
const past = new Date(Date.now() - 60 * 1000).toISOString();

test('only distinct, currently active creator subscribers are counted', () => {
  const subscriptions = [
    { id: 'sub-1-old', creatorId: 'creator', subscriberId: 'member-a', status: 'active', createdAt: '2026-10-01T00:00:00.000Z', currentPeriodEnd: future },
    { id: 'sub-1-new', creatorId: 'creator', subscriberId: 'member-a', status: 'active', createdAt: '2026-10-02T00:00:00.000Z', currentPeriodEnd: future },
    { id: 'sub-2', creatorId: 'creator', subscriberId: 'member-b', status: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: future },
    { id: 'sub-expired', creatorId: 'creator', subscriberId: 'member-c', status: 'active', currentPeriodEnd: past },
    { id: 'sub-cancelled', creatorId: 'creator', subscriberId: 'member-d', status: 'cancelled', currentPeriodEnd: future },
    { id: 'sub-past-due', creatorId: 'creator', subscriberId: 'member-e', status: 'past_due', currentPeriodEnd: future },
    { id: 'sub-other-creator', creatorId: 'another-creator', subscriberId: 'member-f', status: 'active', currentPeriodEnd: future }
  ];

  const active = listActiveCreatorSubscriptions(subscriptions, 'creator');
  assert.deepEqual(active.map(item => item.subscriberId).sort(), ['member-a', 'member-b']);
  assert.equal(active.find(item => item.subscriberId === 'member-a').id, 'sub-1-new');
});

test('invalid, expired, self, and non-active subscription records are not counted', () => {
  assert.equal(isActiveCreatorSubscription({ creatorId: 'creator', subscriberId: 'creator', status: 'active' }), false);
  assert.equal(isActiveCreatorSubscription({ creatorId: 'creator', subscriberId: 'member', status: 'cancelled' }), false);
  assert.equal(isActiveCreatorSubscription({ creatorId: 'creator', subscriberId: 'member', status: 'active', currentPeriodEnd: 'not-a-date' }), false);
  assert.equal(isActiveCreatorSubscription({ creatorId: 'creator', subscriberId: 'member', status: 'active', currentPeriodEnd: past }), false);
  assert.equal(isActiveCreatorSubscription({ creatorId: 'creator', subscriberId: 'member', status: 'active', currentPeriodEnd: future }), true);
});

import {
  CREATOR_SUBSCRIPTION_PACKAGES,
  CREATOR_SUBSCRIPTION_PERKS,
  getCreatorSubscriptionPlans,
  normalizeCreatorSubscriptionPlans
} from '../../backend/modules/subscriptions/service.js';

test('creator subscriptions expose three monthly package choices and perk toggles', () => {
  assert.deepEqual(CREATOR_SUBSCRIPTION_PACKAGES.map(item => [item.code, item.priceMinor]), [
    ['supporter', 299], ['plus', 499], ['vip', 999]
  ]);
  assert.ok(CREATOR_SUBSCRIPTION_PERKS.some(perk => perk.code === 'subscriber_badge'));
  assert.ok(CREATOR_SUBSCRIPTION_PERKS.some(perk => perk.code === 'exclusive_posts'));
  const requested = CREATOR_SUBSCRIPTION_PACKAGES.map((plan, index) => ({
    code: plan.code,
    enabled: index !== 1,
    perks: Object.fromEntries(CREATOR_SUBSCRIPTION_PERKS.map((perk, perkIndex) => [
      perk.code, perkIndex === 0 || (index === 2 && perk.code === 'subscriber_live')
    ]))
  }));
  const normalized = normalizeCreatorSubscriptionPlans('creator-a', requested);
  assert.equal(normalized.valid, true);
  assert.equal(normalized.plans.length, 3);
  assert.equal(normalized.plans[0].enabled, true);
  assert.equal(normalized.plans[1].enabled, false);
  assert.equal(normalized.plans[2].perks.subscriber_live, true);
});

test('creator subscription settings preserve PayPal plan references and remain private to their owner', () => {
  const saved = normalizeCreatorSubscriptionPlans('creator-a', CREATOR_SUBSCRIPTION_PACKAGES.map(plan => ({
    code: plan.code, enabled: true, perks: { subscriber_badge: true }
  })), [{ creatorId: 'creator-a', planCode: 'supporter', paypalProductId: 'PROD-123', paypalPlanId: 'P-123' }]);
  assert.equal(saved.plans[0].paypalProductId, 'PROD-123');
  assert.equal(saved.plans[0].paypalPlanId, 'P-123');
  const publicPlans = getCreatorSubscriptionPlans(saved.plans, 'creator-b');
  assert.equal(publicPlans.every(plan => plan.enabled === false), true);
});

test('enabled subscription packages must include at least one selected perk', () => {
  const requested = CREATOR_SUBSCRIPTION_PACKAGES.map((plan, index) => ({
    code: plan.code, enabled: index === 0, perks: {}
  }));
  assert.throws(
    () => normalizeCreatorSubscriptionPlans('creator-a', requested),
    /at least one perk/i
  );
});
