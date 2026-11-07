import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageMeetWaveParticipants } from '../backend/modules/meetwave/service.js';

test('only the room host can remove another participant', () => {
  const room = { ownerId: 'host-1', status: 'active' };
  assert.equal(canManageMeetWaveParticipants(room, 'host-1', 'member-2'), true);
  assert.equal(canManageMeetWaveParticipants(room, 'member-2', 'host-1'), false);
});

test('a host cannot remove themselves through participant controls', () => {
  const room = { ownerId: 'host-1', status: 'active' };
  assert.equal(canManageMeetWaveParticipants(room, 'host-1', 'host-1'), false);
});

test('ended or missing rooms cannot be managed', () => {
  assert.equal(canManageMeetWaveParticipants({ ownerId: 'host-1', status: 'ended' }, 'host-1', 'member-2'), false);
  assert.equal(canManageMeetWaveParticipants(null, 'host-1', 'member-2'), false);
});
