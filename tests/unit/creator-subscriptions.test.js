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
