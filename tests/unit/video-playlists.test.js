import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIDEO_PLAYLIST_MAX_ITEMS,
  validateVideoPlaylistInput,
  canViewVideoPlaylist,
  addVideoPlaylistItem,
  removeVideoPlaylistItem,
  reorderVideoPlaylistItems
} from '../../backend/modules/video/playlists.js';

test('validates playlist metadata and rejects unsupported visibility', () => {
  assert.deepEqual(validateVideoPlaylistInput({ title: '  Road Trips  ', description: 'Places to see', visibility: 'public' }), {
    valid: true,
    value: { title: 'Road Trips', description: 'Places to see', visibility: 'public' },
    errors: []
  });
  assert.equal(validateVideoPlaylistInput({ title: '', visibility: 'worldwide' }).valid, false);
  assert.equal(validateVideoPlaylistInput({ title: 'x'.repeat(81) }).valid, false);
  assert.equal(validateVideoPlaylistInput({ description: 'x'.repeat(501) }).valid, false);
  assert.deepEqual(validateVideoPlaylistInput({ visibility: 'friends' }, { partial: true }).value, { visibility: 'friends' });
  assert.equal(validateVideoPlaylistInput({}, { partial: true }).valid, false);
});

test('enforces private, unlisted, friends and public playlist visibility', () => {
  const base = { ownerId: 'owner', visibility: 'private' };
  assert.equal(canViewVideoPlaylist(base, 'owner'), true);
  assert.equal(canViewVideoPlaylist(base, 'viewer'), false);
  assert.equal(canViewVideoPlaylist({ ...base, visibility: 'unlisted' }, 'viewer'), true);
  assert.equal(canViewVideoPlaylist({ ...base, visibility: 'unlisted' }, 'viewer', { allowUnlisted: false }), false);
  assert.equal(canViewVideoPlaylist({ ...base, visibility: 'friends' }, 'viewer', { isFriend: () => true }), true);
  assert.equal(canViewVideoPlaylist({ ...base, visibility: 'friends' }, 'viewer', { isFriend: () => false }), false);
  assert.equal(canViewVideoPlaylist({ ...base, visibility: 'public' }, 'viewer'), true);
  assert.equal(canViewVideoPlaylist({ ...base, visibility: 'public' }, 'viewer', { isBlocked: true }), false);
});

test('adds a real video reference once and enforces ownership and item limits', () => {
  const items = [];
  const input = { playlistId: 'list-1', postId: 'video-1', actorId: 'owner', ownerId: 'owner', id: 'item-1', createdAt: '2026-11-11T00:00:00.000Z' };
  const added = addVideoPlaylistItem(items, input);
  assert.equal(added.status, 'created');
  assert.equal(added.item.position, 0);
  assert.equal(addVideoPlaylistItem(items, { ...input, id: 'item-2' }).status, 'exists');
  assert.equal(addVideoPlaylistItem(items, { ...input, postId: 'video-2', actorId: 'other' }).status, 'forbidden');
  assert.equal(addVideoPlaylistItem(items, { ...input, postId: 'video-2', id: 'item-2', maxItems: 1 }).status, 'limit');
  assert.equal(VIDEO_PLAYLIST_MAX_ITEMS, 500);
  assert.equal(items.length, 1);
});

test('reorders only the complete unique item set and compacts after removal', () => {
  const items = [
    { id: 'a', playlistId: 'list-1', postId: 'video-a', position: 0 },
    { id: 'b', playlistId: 'list-1', postId: 'video-b', position: 1 },
    { id: 'c', playlistId: 'list-1', postId: 'video-c', position: 2 }
  ];
  assert.equal(reorderVideoPlaylistItems(items, {
    playlistId: 'list-1', orderedPostIds: ['video-c', 'video-a', 'video-b'], actorId: 'owner', ownerId: 'owner'
  }).status, 'reordered');
  assert.deepEqual(items.slice().sort((a, b) => a.position - b.position).map(item => item.postId), ['video-c', 'video-a', 'video-b']);
  assert.equal(reorderVideoPlaylistItems(items, {
    playlistId: 'list-1', orderedPostIds: ['video-a', 'video-a', 'missing'], actorId: 'owner', ownerId: 'owner'
  }).status, 'invalid_order');
  assert.equal(removeVideoPlaylistItem(items, {
    playlistId: 'list-1', postId: 'video-a', actorId: 'owner', ownerId: 'owner'
  }).status, 'removed');
  assert.deepEqual(items.slice().sort((a, b) => a.position - b.position).map(item => [item.postId, item.position]), [['video-c', 0], ['video-b', 1]]);
  assert.equal(removeVideoPlaylistItem(items, {
    playlistId: 'list-1', postId: 'missing', actorId: 'owner', ownerId: 'owner'
  }).status, 'not_found');
});
