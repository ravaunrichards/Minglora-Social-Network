const ROOM_MODES = new Set(['instant', 'scheduled', 'personal']);
const ROOM_VISIBILITIES = new Set(['private', 'friends', 'public']);

export function validateMeetWaveRoomInput(input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, error: 'Meeting details must be an object.' };
  }
  const title = String(input.title || '').trim().replace(/\s+/g, ' ').slice(0, 100);
  const description = String(input.description || '').trim().slice(0, 1000);
  const mode = String(input.mode || 'instant').trim().toLowerCase();
  const visibility = String(input.visibility || 'private').trim().toLowerCase();
  if (title.length < 2) return { valid: false, error: 'Give your meeting a title of at least two characters.' };
  if (!ROOM_MODES.has(mode)) return { valid: false, error: 'Choose instant, scheduled or personal for the meeting type.' };
  if (!ROOM_VISIBILITIES.has(visibility)) return { valid: false, error: 'Choose private, friends or public for room access.' };

  let scheduledAt = null;
  if (mode === 'scheduled') {
    const timestamp = Date.parse(String(input.scheduledAt || ''));
    if (!Number.isFinite(timestamp)) return { valid: false, error: 'Choose a valid date and time for this meeting.' };
    if (timestamp < now + 60_000) return { valid: false, error: 'Schedule the meeting at least one minute in the future.' };
    if (timestamp > now + 366 * 24 * 60 * 60 * 1000) return { valid: false, error: 'Meetings can only be scheduled up to one year ahead.' };
    scheduledAt = new Date(timestamp).toISOString();
  }
  return { valid: true, value: { title, description, mode, visibility, scheduledAt } };
}

export function canAccessMeetWaveRoom(room, userId, { isFriend = false, invited = false } = {}) {
  if (!room || !userId || room.status === 'ended') return false;
  if (room.ownerId === userId) return true;
  if (invited) return true;
  if (room.visibility === 'public') return true;
  return room.visibility === 'friends' && isFriend;
}

export function meetWaveRoomJoinAvailability(room, now = Date.now()) {
  if (!room || room.status === 'ended') return 'ended';
  if (room.mode !== 'scheduled') return 'open';
  const start = Date.parse(String(room.scheduledAt || ''));
  if (!Number.isFinite(start)) return 'ended';
  return now < start - 15 * 60 * 1000 ? 'too-early' : 'open';
}

export function canReceiveMeetWaveInvitation(settings, { isFriend = false } = {}) {
  const audience = String(settings?.privacy?.meetWaveAudience || 'everyone');
  if (audience === 'everyone') return true;
  if (audience === 'friends') return Boolean(isFriend);
  return false;
}

export function normalizeMeetWaveMessage(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 0 && text.length <= 1000 ? text : '';
}
