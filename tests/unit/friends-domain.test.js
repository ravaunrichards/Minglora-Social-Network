import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getMutualFollowIds,
  isRelationshipBlocked,
  normalizeFriendPreferences,
  validateFriendPreferencePatch
} from '../../backend/modules/relationships/friends.js';

test('friend roster is derived only from reciprocal follows', () => {
  const follows = [
    { followerId: 'me', followedId: 'a' },
    { followerId: 'a', followedId: 'me' },
    { followerId: 'me', followedId: 'b' },
    { followerId: 'c', followedId: 'me' },
    { followerId: 'me', followedId: 'me' },
    { followerId: 'a', followedId: 'me' }
  ];
  assert.deepEqual(getMutualFollowIds(follows, 'me'), ['a']);
});

test('a block in either direction removes the connection from the friend roster', () => {
  const follows = [
    { followerId: 'me', followedId: 'a' },
    { followerId: 'a', followedId: 'me' },
    { followerId: 'me', followedId: 'b' },
    { followerId: 'b', followedId: 'me' }
  ];
  const blocks = [{ blockerId: 'b', blockedId: 'me' }];
  assert.equal(isRelationshipBlocked(blocks, 'me', 'b'), true);
  assert.deepEqual(getMutualFollowIds(follows, 'me', blocks), ['a']);
});

test('friend preferences default without altering relationship state', () => {
  assert.deepEqual(normalizeFriendPreferences(), {
    isFavorite: false,
    isCloseFriend: false,
    isMutedPosts: false,
    isMutedStories: false,
    snoozedUntil: null
  });
});

test('friend preference patches accept supported flags and a bounded snooze', () => {
  const now = Date.parse('2026-11-06T20:00:00.000Z');
  const valid = validateFriendPreferencePatch({
    isFavorite: true,
    snoozedUntil: '2026-11-13T20:00:00.000Z'
  }, now);
  assert.equal(valid.valid, true);
  assert.equal(valid.value.isFavorite, true);
  assert.equal(valid.value.snoozedUntil, '2026-11-13T20:00:00.000Z');
});

test('friend preference patches reject unknown, mistyped, and excessive snooze values', () => {
  const now = Date.parse('2026-11-06T20:00:00.000Z');
  assert.equal(validateFriendPreferencePatch({ friend: true }, now).valid, false);
  assert.equal(validateFriendPreferencePatch({ isFavorite: 'yes' }, now).valid, false);
  assert.equal(validateFriendPreferencePatch({ snoozedUntil: '2027-01-01T00:00:00.000Z' }, now).valid, false);
});
