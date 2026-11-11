import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isVideoChannelSubscribed,
  subscribeToVideoChannel,
  unsubscribeFromVideoChannel
} from '../../backend/modules/video/channels.js';

test('subscribes an account to a distinct video channel once', () => {
  const subscriptions = [];
  const args = {
    subscriberId: 'viewer',
    channelOwnerId: 'creator',
    id: 'sub-1',
    createdAt: '2026-11-11T18:00:00.000Z'
  };
  const created = subscribeToVideoChannel(subscriptions, args);
  assert.equal(created.status, 'created');
  assert.equal(isVideoChannelSubscribed(subscriptions, 'viewer', 'creator'), true);
  assert.deepEqual(created.subscription, {
    id: 'sub-1',
    subscriberId: 'viewer',
    channelOwnerId: 'creator',
    createdAt: '2026-11-11T18:00:00.000Z'
  });
  assert.equal(subscribeToVideoChannel(subscriptions, { ...args, id: 'sub-2' }).status, 'exists');
  assert.equal(subscriptions.length, 1);
});

test('rejects self-subscription and malformed requests', () => {
  assert.equal(subscribeToVideoChannel([], {
    subscriberId: 'creator', channelOwnerId: 'creator', id: 'sub-1'
  }).status, 'self');
  assert.equal(subscribeToVideoChannel([], {
    subscriberId: 'viewer', channelOwnerId: 'creator'
  }).status, 'invalid');
  assert.equal(isVideoChannelSubscribed(null, 'viewer', 'creator'), false);
});

test('unsubscribes only the requesting viewer and leaves other members intact', () => {
  const subscriptions = [
    { id: 'a', subscriberId: 'viewer', channelOwnerId: 'creator' },
    { id: 'b', subscriberId: 'other', channelOwnerId: 'creator' },
    { id: 'c', subscriberId: 'viewer', channelOwnerId: 'another-creator' }
  ];
  assert.equal(unsubscribeFromVideoChannel(subscriptions, {
    subscriberId: 'viewer', channelOwnerId: 'creator'
  }).status, 'removed');
  assert.equal(isVideoChannelSubscribed(subscriptions, 'viewer', 'creator'), false);
  assert.equal(isVideoChannelSubscribed(subscriptions, 'other', 'creator'), true);
  assert.equal(isVideoChannelSubscribed(subscriptions, 'viewer', 'another-creator'), true);
  assert.equal(unsubscribeFromVideoChannel(subscriptions, {
    subscriberId: 'viewer', channelOwnerId: 'creator'
  }).status, 'not_found');
});
