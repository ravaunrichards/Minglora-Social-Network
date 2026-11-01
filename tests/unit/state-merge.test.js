import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeConcurrentState, reconcileStateInPlace } from '../../src/state-merge.js';

test('merges independent records from concurrent application writers', () => {
  const base = { meetWaveRooms: [{ id: 'room-1', title: 'Planning', status: 'ready' }] };
  const local = { meetWaveRooms: [{ id: 'room-2', title: 'Study room', status: 'ready' }, ...base.meetWaveRooms] };
  const remote = { meetWaveRooms: [{ id: 'room-3', title: 'Team room', status: 'ready' }, ...base.meetWaveRooms] };
  const merged = mergeConcurrentState(base, local, remote);
  assert.deepEqual(merged.meetWaveRooms.map(room => room.id), ['room-2', 'room-1', 'room-3']);
});

test('merges different field updates to the same saved record', () => {
  const base = { users: [{ id: 'u1', name: 'Original', bio: 'Old bio' }] };
  const local = { users: [{ id: 'u1', name: 'Updated name', bio: 'Old bio' }] };
  const remote = { users: [{ id: 'u1', name: 'Original', bio: 'Updated bio' }] };
  assert.deepEqual(mergeConcurrentState(base, local, remote).users[0], { id: 'u1', name: 'Updated name', bio: 'Updated bio' });
});

test('keeps a remotely updated record when the local writer deleted its old copy', () => {
  const base = { meetWaveRooms: [{ id: 'room-1', title: 'Old title', status: 'ready' }] };
  const local = { meetWaveRooms: [] };
  const remote = { meetWaveRooms: [{ id: 'room-1', title: 'Renamed room', status: 'ready' }] };
  assert.deepEqual(mergeConcurrentState(base, local, remote).meetWaveRooms, remote.meetWaveRooms);
});

test('honours a deletion when the other writer left the record unchanged', () => {
  const base = { meetWaveRooms: [{ id: 'room-1', title: 'Planning', status: 'ready' }] };
  assert.deepEqual(mergeConcurrentState(base, { meetWaveRooms: [] }, structuredClone(base)).meetWaveRooms, []);
});

test('merges primitive membership lists without losing concurrent additions', () => {
  const merged = mergeConcurrentState(
    { members: ['owner', 'friend-a'] },
    { members: ['owner', 'friend-a', 'friend-b'] },
    { members: ['owner', 'friend-a', 'friend-c'] }
  );
  assert.deepEqual(merged.members, ['owner', 'friend-a', 'friend-b', 'friend-c']);
});

test('merges concurrently created nested records with the same identity', () => {
  const merged = mergeConcurrentState(
    { meetWaveRooms: [] },
    { meetWaveRooms: [{ id: 'room-1', title: 'Planning', status: 'ready' }] },
    { meetWaveRooms: [{ id: 'room-1', title: 'Planning', description: 'Shared agenda' }] }
  );
  assert.deepEqual(merged.meetWaveRooms, [{ id: 'room-1', title: 'Planning', status: 'ready', description: 'Shared agenda' }]);
});

test('retains unrelated collection and nested chat changes', () => {
  const base = { meetWaveRooms: [{ id: 'r1', title: 'Room', messages: [{ id: 'm1', text: 'Hello' }] }], follows: [{ followerId: 'a', followedId: 'b' }] };
  const local = structuredClone(base);
  local.meetWaveRooms[0].messages.push({ id: 'm2', text: 'Local message' });
  const remote = structuredClone(base);
  remote.follows.push({ followerId: 'c', followedId: 'd' });
  const merged = mergeConcurrentState(base, local, remote);
  assert.deepEqual(merged.meetWaveRooms[0].messages.map(message => message.id), ['m1', 'm2']);
  assert.equal(merged.follows.length, 2);
});

test('reconciles in place and preserves active record references', () => {
  const target = { users: [{ id: 'u1', name: 'Before' }], meetWaveRooms: [] };
  const heldUserReference = target.users[0];
  reconcileStateInPlace(target, { users: [{ id: 'u1', name: 'After' }], meetWaveRooms: [{ id: 'r1' }] });
  assert.equal(target.users[0], heldUserReference);
  assert.equal(heldUserReference.name, 'After');
  assert.deepEqual(target.meetWaveRooms, [{ id: 'r1' }]);
});
