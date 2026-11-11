/**
 * Remove only the direct social connections between two blocked accounts.
 * Historical messages, posts, profile-view history, paid subscriptions, and
 * shared group memberships remain intact; the block policy prevents new access.
 */
export function disconnectBlockedConnections(state, firstId, secondId, at = new Date().toISOString()) {
  const first = String(firstId || '');
  const second = String(secondId || '');
  if (!state || !first || !second || first === second) {
    return { follows: 0, friendships: 0, preferences: 0, friendListMembers: 0, pageFollows: 0, presence: 0, calls: [] };
  }
  const pair = new Set([first, second]);
  const isPair = (left, right) => pair.has(String(left || '')) && pair.has(String(right || ''))
    && String(left || '') !== String(right || '');

  const removeMatching = (key, predicate) => {
    const rows = Array.isArray(state[key]) ? state[key] : [];
    const kept = rows.filter(row => !predicate(row));
    state[key] = kept;
    return rows.length - kept.length;
  };

  const follows = removeMatching('follows', edge => isPair(edge?.followerId, edge?.followedId));
  const friendships = removeMatching('friendships', edge => isPair(edge?.from, edge?.to));
  const preferences = removeMatching('friendPreferences', row => isPair(row?.ownerId, row?.targetId));

  let friendListMembers = 0;
  state.friendLists = (Array.isArray(state.friendLists) ? state.friendLists : []).map(list => {
    const ownerId = String(list?.ownerId || '');
    const blockedMemberId = ownerId === first ? second : ownerId === second ? first : '';
    if (!blockedMemberId || !Array.isArray(list.memberIds)) return list;
    const memberIds = list.memberIds.filter(id => String(id) !== blockedMemberId);
    const removed = list.memberIds.length - memberIds.length;
    if (!removed) return list;
    friendListMembers += removed;
    const updated = { ...list, memberIds, updatedAt: at };
    if (Object.hasOwn(list, 'memberCount')) updated.memberCount = memberIds.length;
    return updated;
  });

  const ownedPageIds = new Set(
    (Array.isArray(state.pages) ? state.pages : [])
      .filter(page => pair.has(String(page?.createdBy || '')))
      .map(page => String(page.id || ''))
      .filter(Boolean)
  );
  const pageFollows = removeMatching('pageFollows', edge =>
    ownedPageIds.has(String(edge?.pageId || '')) && pair.has(String(edge?.userId || ''))
      && !pair.has(String((Array.isArray(state.pages) ? state.pages : []).find(page => String(page.id) === String(edge.pageId))?.createdBy || '')) === false
      && String((Array.isArray(state.pages) ? state.pages : []).find(page => String(page.id) === String(edge.pageId))?.createdBy || '') !== String(edge?.userId || '')
  );

  const presence = removeMatching('profileViewPresence', entry =>
    isPair(entry?.targetUserId, entry?.viewerUserId)
  );

  const calls = [];
  const participants = Array.isArray(state.callParticipants) ? state.callParticipants : [];
  for (const call of Array.isArray(state.calls) ? state.calls : []) {
    if (!['ringing', 'active'].includes(String(call?.status || '').toLowerCase())) continue;
    const activeRows = participants.filter(row =>
      row.callId === call.id && !['left', 'cancelled', 'declined', 'missed'].includes(String(row.status || '').toLowerCase())
    );
    const participantIds = new Set(activeRows.map(row => String(row.userId || '')).filter(Boolean));
    if (participantIds.size !== 2 || !participantIds.has(first) || !participantIds.has(second)) continue;
    call.status = 'ended';
    call.endedAt = at;
    call.endReason = 'blocked';
    call.endedById = first;
    for (const row of activeRows) {
      row.status = ['invited', 'calling'].includes(String(row.status || '').toLowerCase()) ? 'cancelled' : 'left';
      row.leftAt = at;
    }
    calls.push(call);
  }

  return { follows, friendships, preferences, friendListMembers, pageFollows, presence, calls };
}
