import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canAccessMeetWaveRoom,
  meetWaveRoomJoinAvailability,
  normalizeMeetWaveMessage,
  validateMeetWaveRoomInput
} from '../../backend/modules/meetwave/service.js';

test('MeetWave validates instant and personal rooms without a schedule', () => {
  const instant = validateMeetWaveRoomInput({ title: 'Team check-in', mode: 'instant', visibility: 'private' });
  assert.equal(instant.valid, true);
  assert.equal(instant.value.scheduledAt, null);
  const personal = validateMeetWaveRoomInput({ title: 'My room', mode: 'personal', visibility: 'friends' });
  assert.equal(personal.valid, true);
});

test('MeetWave requires a valid future scheduled time', () => {
  const now = Date.parse('2026-11-01T12:00:00.000Z');
  assert.equal(validateMeetWaveRoomInput({ title: 'Planning', mode: 'scheduled', scheduledAt: 'bad-date' }, now).valid, false);
  assert.equal(validateMeetWaveRoomInput({ title: 'Planning', mode: 'scheduled', scheduledAt: '2026-11-01T12:00:30.000Z' }, now).valid, false);
  const valid = validateMeetWaveRoomInput({ title: 'Planning', mode: 'scheduled', scheduledAt: '2026-11-01T13:00:00.000Z' }, now);
  assert.equal(valid.valid, true);
});

test('MeetWave enforces room visibility and invitation rules', () => {
  const room = { ownerId: 'host', visibility: 'private', status: 'ready' };
  assert.equal(canAccessMeetWaveRoom(room, 'host'), true);
  assert.equal(canAccessMeetWaveRoom(room, 'invitee', { invited: true }), true);
  assert.equal(canAccessMeetWaveRoom(room, 'stranger'), false);
  assert.equal(canAccessMeetWaveRoom({ ...room, visibility: 'friends' }, 'friend', { isFriend: true }), true);
  assert.equal(canAccessMeetWaveRoom({ ...room, visibility: 'public' }, 'stranger'), true);
  assert.equal(canAccessMeetWaveRoom({ ...room, status: 'ended' }, 'host'), false);
});

test('scheduled MeetWave rooms open fifteen minutes before the start', () => {
  const start = Date.parse('2026-11-01T13:00:00.000Z');
  const room = { mode: 'scheduled', status: 'scheduled', scheduledAt: new Date(start).toISOString() };
  assert.equal(meetWaveRoomJoinAvailability(room, start - 16 * 60 * 1000), 'too-early');
  assert.equal(meetWaveRoomJoinAvailability(room, start - 15 * 60 * 1000), 'open');
  assert.equal(meetWaveRoomJoinAvailability({ ...room, status: 'ended' }, start), 'ended');
});

test('MeetWave chat trims whitespace and rejects empty or oversized messages', () => {
  assert.equal(normalizeMeetWaveMessage('  Hello   team  '), 'Hello team');
  assert.equal(normalizeMeetWaveMessage('   '), '');
  assert.equal(normalizeMeetWaveMessage('x'.repeat(1001)), '');
});
