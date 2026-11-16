import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIDEO_CHANNEL_MAX_SUBSCRIPTIONS,
  validateVideoChannelInput,
  canViewVideoChannel,
  subscribeToVideoChannel,
  unsubscribeFromVideoChannel
} from '../../backend/modules/video/channels.js';

test('validates channel name, description and visibility', () => {
  assert.deepEqual(validateVideoChannelInput({
    title: '  Minglora Creators  ', description: 'Videos from our community', visibility: 'public'
  }), {
    valid: true,
    value: { title: 'Minglora Creators', description: 'Videos from our community', visibility: 'public' },
    errors: []
  });
  assert.equal(validateVideoChannelInput({ title: '' }).valid, false);
  assert.equal(validateVideoChannelInput({ title: 'x'.repeat(81) }).valid, false);
  assert.equal(validateVideoChannelInput({ description: 'x'.repeat(1001) }).valid, false);
  assert.equal(validateVideoChannelInput({ visibility: 'friends' }).valid, false);
  assert.deepEqual(validateVideoChannelInput({ visibility: 'unlisted' }, { partial: true }).value, { visibility: 'unlisted' });
  assert.equal(validateVideoChannelInput({}, { partial: true }).valid, false);
});

test('channel privacy allows public and unlisted links but protects private and blocked channels', () => {
  const base = { ownerId: 'creator', visibility: 'private' };
  assert.equal(canViewVideoChannel(base, 'creator'), true);
  assert.equal(canViewVideoChannel(base, 'viewer'), false);
  assert.equal(canViewVideoChannel({ ...base, visibility: 'public' }, 'viewer'), true);
  assert.equal(canViewVideoChannel({ ...base, visibility: 'public' }, 'viewer', { isBlocked: true }), false);
  assert.equal(canViewVideoChannel({ ...base, visibility: 'unlisted' }, 'viewer'), true);
  assert.equal(canViewVideoChannel({ ...base, visibility: 'unlisted' }, 'viewer', { allowUnlisted: false }), false);
});

test('channel subscriptions are independent records, idempotent and capped per subscriber', () => {
  const subscriptions = [];
  const input = { ownerId: 'creator', subscriberId: 'viewer', id: 'sub-1', createdAt: '2026-11-11T00:00:00.000Z' };
  assert.equal(subscribeToVideoChannel(subscriptions, input).status, 'created');
  assert.equal(subscribeToVideoChannel(subscriptions, { ...input, id: 'sub-2' }).status, 'exists');
  assert.equal(subscriptions.length, 1);
  assert.equal(subscribeToVideoChannel(subscriptions, { ...input, ownerId: 'viewer', id: 'self' }).status, 'invalid');
  assert.equal(subscribeToVideoChannel(subscriptions, { ...input, ownerId: 'another', id: 'sub-3', maxSubscriptions: 1 }).status, 'limit');
  assert.equal(VIDEO_CHANNEL_MAX_SUBSCRIPTIONS, 5000);
  assert.equal(unsubscribeFromVideoChannel(subscriptions, input).status, 'removed');
  assert.equal(unsubscribeFromVideoChannel(subscriptions, input).status, 'not_found');
  assert.equal(subscriptions.length, 0);
});
