import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsername, validateEmail, validatePostInput, validateProfilePatch, normalizeContactPhone, validateContactPhone } from '../../src/domain/validation.js';
import { decodeCursor, paginateDescending } from '../../src/domain/pagination.js';
import { areFriends, canViewAudience, isBlocked } from '../../src/domain/relationships.js';

test('normalizes usernames and emails and rejects invalid emails', () => {
  assert.equal(normalizeUsername('  MiNgLe_1 '), 'mingle_1');
  assert.equal(validateEmail(' Person@Example.com ').valid, true);
  assert.equal(validateEmail('not-an-email').valid, false);
});
test('normalizes and validates international contact phone numbers', () => {
  assert.equal(normalizeContactPhone(' +1 (876) 555-0123 '), '+18765550123');
  assert.equal(validateContactPhone('+18765550123').valid, true);
  assert.equal(validateContactPhone('+441234567890').valid, true);
  assert.equal(validateContactPhone('18765550123').valid, false);
  assert.equal(validateContactPhone('+01234567890').valid, false);
  assert.equal(validateContactPhone('+123').valid, false);
});
test('accepts post text and owned media references but rejects pasted image URLs', () => {
  assert.equal(validatePostInput({}).valid, false);
  assert.equal(validatePostInput({ text: 'Hello' }).valid, true);
  assert.equal(validatePostInput({ mediaIds: ['owned-media-id'] }).valid, true);
  assert.equal(validatePostInput({ text: 'Hello', mediaIds: ['one','two'] }).valid, true);
  assert.equal(validatePostInput({ imageUrl: 'http://example.test/a.jpg' }).valid, false);
  assert.equal(validatePostInput({ imageUrl: 'https://example.test/a.jpg' }).valid, false);
  assert.equal(validatePostInput({ text: 'x'.repeat(5001) }).valid, false);
  assert.equal(validatePostInput({ mediaIds: Array.from({length:11},(_,i)=>String(i)) }).valid, false);
});
test('validates editable profile fields', () => {
  assert.equal(validateProfilePatch({ name: 'Minglora Member', bio: 'Hello' }).valid, true);
  assert.equal(validateProfilePatch({ name: 'x' }).valid, false);
  assert.equal(validateProfilePatch({ avatar: 'javascript:alert(1)' }).valid, false);
});
test('cursor pagination is stable across pages and rejects invalid limits', () => {
  const rows = [
    { id: 'c', createdAt: '2026-01-03T00:00:00.000Z' },
    { id: 'b', createdAt: '2026-01-02T00:00:00.000Z' },
    { id: 'a', createdAt: '2026-01-01T00:00:00.000Z' }
  ];
  const first = paginateDescending(rows, { limit: 2 });
  assert.deepEqual(first.items.map(x => x.id), ['c', 'b']);
  assert.equal(first.hasMore, true);
  assert.equal(decodeCursor(first.nextCursor).id, 'b');
  const second = paginateDescending(rows, { limit: 2, cursor: first.nextCursor });
  assert.deepEqual(second.items.map(x => x.id), ['a']);
  assert.equal(second.nextCursor, null);
  assert.throws(() => paginateDescending([], { limit: 101 }), /limit must be an integer/);
  assert.throws(() => decodeCursor('not-valid-json!'), /Invalid pagination cursor/);
});
test('blocks override friend audience access', () => {
  const friendships = [{ requesterId: 'a', recipientId: 'b', status: 'accepted' }];
  const blocks = [{ blockerId: 'a', blockedId: 'b' }];
  assert.equal(areFriends(friendships, 'a', 'b'), true);
  assert.equal(isBlocked(blocks, 'a', 'b'), true);
  assert.equal(canViewAudience({ audience: 'friends', viewerId: 'a', ownerId: 'b', friendships }), true);
  assert.equal(canViewAudience({ audience: 'friends', viewerId: 'a', ownerId: 'b', friendships, blocks }), false);
  assert.equal(canViewAudience({ audience: 'public', viewerId: 'a', ownerId: 'b' }), true);
  assert.equal(canViewAudience({ audience: 'private', viewerId: 'a', ownerId: 'b' }), false);
});
