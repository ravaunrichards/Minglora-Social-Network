import { randomUUID } from 'node:crypto';

export const PROFILE_VIEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const PROFILE_PRESENCE_TTL_MS = 50 * 1000;

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new TypeError('Profile analytics requires a valid timestamp.');
  return date;
}

export function recordProfileView(views, { targetUserId, viewerUserId, at = new Date() }) {
  if (!Array.isArray(views)) throw new TypeError('Profile view storage must be an array.');
  if (!targetUserId || !viewerUserId || targetUserId === viewerUserId) return false;

  const viewedAt = validDate(at);
  const viewedOn = viewedAt.toISOString().slice(0, 10);
  if (views.some(view =>
    view.targetUserId === targetUserId &&
    view.viewerUserId === viewerUserId &&
    view.viewedOn === viewedOn
  )) return false;

  views.push({
    id: randomUUID(),
    targetUserId,
    viewerUserId,
    viewedOn,
    viewedAt: viewedAt.toISOString()
  });

  // Keep the activity window bounded; the public metric reports the last 30 days.
  const cutoff = viewedAt.getTime() - PROFILE_VIEW_WINDOW_MS;
  for (let index = views.length - 1; index >= 0; index -= 1) {
    if (new Date(views[index].viewedAt).getTime() < cutoff) views.splice(index, 1);
  }
  return true;
}

export function touchProfilePresence(presence, { targetUserId, viewerUserId, at = new Date() }) {
  if (!Array.isArray(presence)) throw new TypeError('Profile presence storage must be an array.');
  if (!targetUserId || !viewerUserId || targetUserId === viewerUserId) return false;

  const heartbeatAt = validDate(at);
  const cutoff = heartbeatAt.getTime() - PROFILE_PRESENCE_TTL_MS;
  for (let index = presence.length - 1; index >= 0; index -= 1) {
    if (new Date(presence[index].lastSeenAt).getTime() < cutoff) presence.splice(index, 1);
  }

  const existing = presence.find(entry =>
    entry.targetUserId === targetUserId && entry.viewerUserId === viewerUserId
  );
  if (existing) {
    existing.lastSeenAt = heartbeatAt.toISOString();
    return false;
  }

  presence.push({ targetUserId, viewerUserId, lastSeenAt: heartbeatAt.toISOString() });
  return true;
}

export function getProfileViewStats({ views = [], presence = [], targetUserId, at = new Date() }) {
  const now = validDate(at);
  const viewCutoff = now.getTime() - PROFILE_VIEW_WINDOW_MS;
  const presenceCutoff = now.getTime() - PROFILE_PRESENCE_TTL_MS;
  const profileViews30d = views.filter(view =>
    view.targetUserId === targetUserId &&
    new Date(view.viewedAt).getTime() >= viewCutoff
  ).length;
  const activeViewers = new Set(
    presence
      .filter(entry =>
        entry.targetUserId === targetUserId &&
        entry.viewerUserId !== targetUserId &&
        new Date(entry.lastSeenAt).getTime() >= presenceCutoff
      )
      .map(entry => entry.viewerUserId)
  );

  return { profileViews30d, activeViewersCount: activeViewers.size };
}
