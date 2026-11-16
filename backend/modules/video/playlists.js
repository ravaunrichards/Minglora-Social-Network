export const VIDEO_PLAYLIST_VISIBILITIES = Object.freeze(['public', 'unlisted', 'friends', 'private']);
export const VIDEO_PLAYLIST_MAX_ITEMS = 500;

export function validateVideoPlaylistInput(input, { partial = false } = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const value = {};
  const errors = [];

  if (!partial || Object.hasOwn(source, 'title')) {
    const title = String(source.title ?? '').trim();
    if (!title || title.length > 80) errors.push('Playlist title must contain between 1 and 80 characters.');
    else value.title = title;
  }
  if (!partial || Object.hasOwn(source, 'description')) {
    const description = String(source.description ?? '').trim();
    if (description.length > 500) errors.push('Playlist description must be 500 characters or fewer.');
    else value.description = description;
  }
  if (!partial || Object.hasOwn(source, 'visibility')) {
    const visibility = String(source.visibility ?? (partial ? '' : 'private')).trim().toLowerCase();
    if (!VIDEO_PLAYLIST_VISIBILITIES.includes(visibility)) {
      errors.push('Playlist visibility must be public, unlisted, friends or private.');
    } else value.visibility = visibility;
  }

  if (partial && !Object.keys(value).length && !errors.length) {
    errors.push('Provide at least one playlist field to update.');
  }
  return { valid: errors.length === 0, value, errors };
}

export function canViewVideoPlaylist(playlist, viewerId, {
  isFriend = () => false,
  isBlocked = false,
  allowUnlisted = true
} = {}) {
  if (!playlist || !viewerId || !playlist.ownerId) return false;
  if (viewerId === playlist.ownerId) return true;
  if (isBlocked) return false;
  switch (playlist.visibility) {
    case 'public': return true;
    case 'unlisted': return allowUnlisted === true;
    case 'friends': return isFriend(viewerId, playlist.ownerId) === true;
    default: return false;
  }
}

export function addVideoPlaylistItem(items, {
  playlistId, postId, actorId, ownerId, id, createdAt,
  maxItems = VIDEO_PLAYLIST_MAX_ITEMS
}) {
  if (!Array.isArray(items) || !playlistId || !postId || !actorId || !ownerId) return { status: 'invalid' };
  if (actorId !== ownerId) return { status: 'forbidden' };
  const normalizedPostId = String(postId).trim();
  if (!normalizedPostId || normalizedPostId.length > 128) return { status: 'invalid' };
  const current = items.filter(item => item.playlistId === playlistId);
  const existing = current.find(item => item.postId === normalizedPostId);
  if (existing) return { status: 'exists', item: existing };
  if (current.length >= maxItems) return { status: 'limit' };
  const item = {
    id: String(id || ''),
    playlistId,
    postId: normalizedPostId,
    position: current.length,
    createdAt: String(createdAt || new Date().toISOString())
  };
  if (!item.id) return { status: 'invalid' };
  items.push(item);
  return { status: 'created', item };
}

export function removeVideoPlaylistItem(items, { playlistId, postId, actorId, ownerId }) {
  if (!Array.isArray(items) || !playlistId || !postId) return { status: 'invalid' };
  if (actorId !== ownerId) return { status: 'forbidden' };
  const index = items.findIndex(item => item.playlistId === playlistId && item.postId === String(postId));
  if (index < 0) return { status: 'not_found' };
  const [removed] = items.splice(index, 1);
  items.filter(item => item.playlistId === playlistId)
    .sort((a, b) => Number(a.position) - Number(b.position))
    .forEach((item, position) => { item.position = position; });
  return { status: 'removed', item: removed };
}

export function reorderVideoPlaylistItems(items, {
  playlistId, orderedPostIds, actorId, ownerId
}) {
  if (!Array.isArray(items) || !playlistId || !Array.isArray(orderedPostIds)) return { status: 'invalid' };
  if (actorId !== ownerId) return { status: 'forbidden' };
  const current = items.filter(item => item.playlistId === playlistId);
  const requested = orderedPostIds.map(value => String(value || '').trim());
  const requestedSet = new Set(requested);
  const currentSet = new Set(current.map(item => item.postId));
  if (requested.length !== current.length || requestedSet.size !== requested.length ||
      requested.some(postId => !currentSet.has(postId))) return { status: 'invalid_order' };
  const byPostId = new Map(current.map(item => [item.postId, item]));
  requested.forEach((postId, position) => { byPostId.get(postId).position = position; });
  return { status: 'reordered', items: requested.map(postId => byPostId.get(postId)) };
}
