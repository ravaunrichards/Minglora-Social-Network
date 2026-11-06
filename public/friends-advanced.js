/* Minglora Friends: advanced relationship dashboard.
   Friendship remains derived from mutual follows. This module stores only
   owner-specific preferences and custom list organization. */
let friendsDashboardState = {
  tab: 'all',
  query: '',
  lists: [],
  friends: [],
  selectedListId: null,
  loading: false
};

const FRIENDS_DASHBOARD_TABS = [
  ['all', 'All Friends'],
  ['recent', 'Recently Added'],
  ['close', 'Close Friends'],
  ['favorites', 'Favorites'],
  ['lists', 'Friend Lists'],
  ['suggestions', 'Suggestions']
];

function friendsDashboardActiveTab(tab) {
  friendsDashboardState.tab = tab;
  if (tab !== 'lists') friendsDashboardState.selectedListId = null;
}

function friendsDashboardFormatDate(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Friend';
  return new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(new Date(value));
}

function friendsDashboardIsSnoozed(member) {
  return Boolean(member.snoozedUntil && Date.parse(member.snoozedUntil) > Date.now());
}

function friendsDashboardVisibleFriends() {
  const query = friendsDashboardState.query.trim().toLowerCase().replace(/^@/, '');
  let rows = [...friendsDashboardState.friends];
  if (friendsDashboardState.tab === 'recent') {
    rows.sort((a, b) => Date.parse(b.friendSince || 0) - Date.parse(a.friendSince || 0));
  } else if (friendsDashboardState.tab === 'close') {
    rows = rows.filter(member => member.isCloseFriend);
  } else if (friendsDashboardState.tab === 'favorites') {
    rows = rows.filter(member => member.isFavorite);
  } else if (friendsDashboardState.tab === 'lists' && friendsDashboardState.selectedListId) {
    const list = friendsDashboardState.lists.find(item => item.id === friendsDashboardState.selectedListId);
    const ids = new Set(list?.memberIds || []);
    rows = rows.filter(member => ids.has(member.id));
  }
  if (query) {
    rows = rows.filter(member =>
      (String(member.name || '') + ' ' + String(member.username || '')).toLowerCase().includes(query)
    );
  }
  return rows;
}

function friendsDashboardListSelect(member) {
  const lists = friendsDashboardState.lists;
  if (!lists.length) return '<p class="friends-advanced-note">Create a custom list to organize this friend.</p>';
  return '<div class="friend-manager-list-add"><select aria-label="Choose a friend list" data-friend-list-select="' + esc(member.id) + '">' +
    '<option value="">Add to a list…</option>' +
    lists.map(list => '<option value="' + esc(list.id) + '">' + esc(list.name) + '</option>').join('') +
    '</select><button type="button" data-add-friend-list="' + esc(member.id) + '">Add</button></div>';
}

function friendsDashboardFriendCard(member, listId = null) {
  const snoozed = friendsDashboardIsSnoozed(member);
  const tags = [
    member.isCloseFriend ? '<span class="friend-manager-tag friend-manager-tag--blue">Close Friend</span>' : '',
    member.isFavorite ? '<span class="friend-manager-tag">★ Favorite</span>' : '',
    member.isMutedPosts ? '<span class="friend-manager-tag">Posts muted</span>' : '',
    member.isMutedStories ? '<span class="friend-manager-tag">Stories muted</span>' : '',
    snoozed ? '<span class="friend-manager-tag">Snoozed</span>' : ''
  ].filter(Boolean).join('');
  const listAction = listId
    ? '<button type="button" class="danger" data-remove-friend-list="' + esc(listId) + '" data-member-id="' + esc(member.id) + '">Remove from list</button>'
    : friendsDashboardListSelect(member);
  return '<article class="friend-manager-card">' +
    '<div class="friend-manager-identity">' +
      '<img class="avatar" src="' + esc(avatar(member)) + '" alt="">' +
      '<div class="friend-manager-person"><strong>' + esc(member.name) + ' ' + verifiedProfileBadge(member) + '</strong>' +
      '<small>@' + esc(member.username) + '</small></div>' +
      '<span class="friend-manager-since">' + esc(friendsDashboardFormatDate(member.friendSince)) + '</span>' +
    '</div>' +
    '<div class="friend-manager-tags">' + (tags || '<span class="friend-manager-tag">Mutual follow</span>') + '</div>' +
    '<div class="friend-manager-actions">' +
      '<button type="button" data-friend-view="' + esc(member.id) + '">View profile</button>' +
      '<button type="button" data-friend-message="' + esc(member.id) + '">Message</button>' +
      '<button type="button" class="' + (member.isFavorite ? 'is-on' : '') + '" data-friend-pref="' + esc(member.id) + '" data-pref-key="isFavorite" data-pref-value="' + (!member.isFavorite) + '">' + (member.isFavorite ? '★ Favorited' : '☆ Favorite') + '</button>' +
      '<button type="button" class="' + (member.isCloseFriend ? 'is-on' : '') + '" data-friend-pref="' + esc(member.id) + '" data-pref-key="isCloseFriend" data-pref-value="' + (!member.isCloseFriend) + '">' + (member.isCloseFriend ? '✓ Close Friend' : '＋ Close Friend') + '</button>' +
      '<button type="button" class="' + (member.isMutedPosts ? 'is-on' : '') + '" data-friend-pref="' + esc(member.id) + '" data-pref-key="isMutedPosts" data-pref-value="' + (!member.isMutedPosts) + '">' + (member.isMutedPosts ? 'Unmute posts' : 'Mute posts') + '</button>' +
      '<button type="button" class="' + (member.isMutedStories ? 'is-on' : '') + '" data-friend-pref="' + esc(member.id) + '" data-pref-key="isMutedStories" data-pref-value="' + (!member.isMutedStories) + '">' + (member.isMutedStories ? 'Unmute stories' : 'Mute stories') + '</button>' +
      '<button type="button" class="' + (snoozed ? 'is-on' : '') + '" data-friend-snooze="' + esc(member.id) + '" data-snoozed="' + snoozed + '">' + (snoozed ? 'End snooze' : 'Snooze 7 days') + '</button>' +
      listAction +
      '<button type="button" class="danger" data-unfollow-friend="' + esc(member.id) + '">Unfollow</button>' +
    '</div>' +
  '</article>';
}

function friendsDashboardListCards() {
  if (!friendsDashboardState.lists.length) {
    return '<div class="friends-empty"><h3>No custom lists yet</h3><p>Create lists such as Family, Work, School, or Gaming Friends.</p></div>';
  }
  return '<div class="friends-custom-lists">' + friendsDashboardState.lists.map(list =>
    '<article class="friends-custom-list"><strong>' + esc(list.name) + '</strong>' +
    '<small>' + Number(list.memberCount || 0).toLocaleString() + ' friends' + (list.description ? ' · ' + esc(list.description) : '') + '</small>' +
    '<button type="button" data-open-friend-list="' + esc(list.id) + '">Open list →</button></article>'
  ).join('') + '</div>';
}

function friendsDashboardTabMarkup() {
  return '<nav class="friends-advanced-tabs" aria-label="Friends sections">' +
    FRIENDS_DASHBOARD_TABS.map(([key, label]) =>
      '<button type="button" data-friends-tab="' + key + '" aria-pressed="' + (friendsDashboardState.tab === key) + '">' + label + '</button>'
    ).join('') +
  '</nav>';
}

function friendsDashboardMainMarkup() {
  const tab = friendsDashboardState.tab;
  if (tab === 'suggestions') {
    return '<section><div class="friends-list-toolbar"><h2>People you may know</h2><span class="friends-advanced-note">Recommendations use available profile and connection signals.</span></div>' +
      '<div id="people-discovery-grid" class="people-grid people-discovery-grid">' + peopleGridMarkup() + '</div></section>';
  }
  if (tab === 'lists' && !friendsDashboardState.selectedListId) {
    return '<section class="friends-advanced"><div class="friends-list-toolbar"><h2>Your custom lists</h2><button type="button" class="primary" id="friends-create-list">＋ Create list</button></div>' +
      friendsDashboardListCards() +
      '<p class="friends-advanced-note">Custom lists are private to you. A friend can belong to more than one list. Lists never change who follows whom.</p></section>';
  }
  let listId = null;
  let heading = 'All Friends';
  if (tab === 'recent') heading = 'Recently Added';
  if (tab === 'close') heading = 'Close Friends';
  if (tab === 'favorites') heading = 'Favorites';
  if (tab === 'lists') {
    const list = friendsDashboardState.lists.find(item => item.id === friendsDashboardState.selectedListId);
    listId = friendsDashboardState.selectedListId;
    heading = list?.name || 'Friend List';
  }
  const rows = friendsDashboardVisibleFriends();
  const listDetailHead = listId
    ? '<div class="friends-list-detail-head"><h2>' + esc(heading) + '</h2><div class="friends-list-detail-actions">' +
      '<button type="button" id="friends-back-lists">← All lists</button>' +
      '<button type="button" id="friends-rename-list">Rename</button>' +
      '<button type="button" class="danger" id="friends-delete-list">Delete list</button>' +
      '</div></div>'
    : '<div class="friends-list-toolbar"><h2>' + heading + ' (' + rows.length.toLocaleString() + ')</h2></div>';
  return '<section class="friends-list-detail">' + listDetailHead +
    (rows.length
      ? '<div class="friends-advanced-grid">' + rows.map(member => friendsDashboardFriendCard(member, listId)).join('') + '</div>'
      : '<div class="friends-empty"><h3>' + (tab === 'close' ? 'No Close Friends yet' : tab === 'favorites' ? 'No favorites yet' : 'No friends found') + '</h3><p>' + (tab === 'lists' ? 'Add mutual-follow friends to this list from the All Friends view.' : 'When two members follow each other, they appear here automatically.') + '</p></div>') +
  '</section>';
}

function friendsDashboardPaint() {
  const root = document.getElementById('main-content');
  if (!root) return;
  const friendCount = friendsDashboardState.friends.length;
  const closeCount = friendsDashboardState.friends.filter(member => member.isCloseFriend).length;
  const favoriteCount = friendsDashboardState.friends.filter(member => member.isFavorite).length;
  const showSearch = friendsDashboardState.tab !== 'suggestions';
  const listSearch = '<label class="friends-advanced-search"><span aria-hidden="true">⌕</span><input id="friends-advanced-search" type="search" placeholder="Search friends by name or username" value="' + esc(friendsDashboardState.query) + '" aria-label="Search friends"></label>';
  setContent('<div class="friends-advanced">' +
    '<header class="friends-advanced-head"><div><h1>Friends</h1><p>Manage your mutual connections, lists, and personal preferences.</p></div>' +
    (friendsDashboardState.tab !== 'lists' ? '<span class="eyebrow">Mutual-follow friendships</span>' : '') + '</header>' +
    '<div class="friends-advanced-stats">' +
      '<div class="friends-advanced-stat"><strong>' + friendCount.toLocaleString() + '</strong><span>Friends</span></div>' +
      '<div class="friends-advanced-stat"><strong>' + closeCount.toLocaleString() + '</strong><span>Close Friends</span></div>' +
      '<div class="friends-advanced-stat"><strong>' + favoriteCount.toLocaleString() + '</strong><span>Favorites</span></div>' +
    '</div>' +
    '<div class="friends-advanced-toolbar">' + (showSearch ? listSearch : '') + '</div>' +
    friendsDashboardTabMarkup() +
    friendsDashboardMainMarkup() +
    '<p class="friends-advanced-note">Friendship is automatic: you and the other member must follow each other. Unfollowing ends the mutual friendship; favorites, mutes, and lists are separate preferences.</p>' +
  '</div>');
  friendsDashboardBind();
}

function friendsDashboardBind() {
  const root = document.getElementById('main-content');
  if (!root) return;
  root.querySelectorAll('[data-friends-tab]').forEach(button => {
    button.addEventListener('click', () => {
      friendsDashboardActiveTab(button.dataset.friendsTab);
      friendsDashboardPaint();
    });
  });
  const search = root.querySelector('#friends-advanced-search');
  if (search) search.addEventListener('input', () => {
    friendsDashboardState.query = search.value;
    const position = search.selectionStart;
    friendsDashboardPaint();
    const next = document.getElementById('friends-advanced-search');
    if (next) {
      next.focus();
      next.setSelectionRange(position, position);
    }
  });
  root.querySelector('#friends-create-list')?.addEventListener('click', friendsDashboardCreateList);
  root.querySelectorAll('[data-open-friend-list]').forEach(button => button.addEventListener('click', () => {
    friendsDashboardState.selectedListId = button.dataset.openFriendList;
    friendsDashboardPaint();
  }));
  root.querySelector('#friends-back-lists')?.addEventListener('click', () => {
    friendsDashboardState.selectedListId = null;
    friendsDashboardPaint();
  });
  root.querySelector('#friends-rename-list')?.addEventListener('click', friendsDashboardRenameList);
  root.querySelector('#friends-delete-list')?.addEventListener('click', friendsDashboardDeleteList);
  root.querySelectorAll('[data-friend-view]').forEach(button => button.addEventListener('click', () => openProfile(button.dataset.friendView)));
  root.querySelectorAll('[data-friend-message]').forEach(button => button.addEventListener('click', () => {
    const member = friendsDashboardState.friends.find(item => item.id === button.dataset.friendMessage);
    if (member) openMessageWindow(member);
  }));
  root.querySelectorAll('[data-friend-pref]').forEach(button => button.addEventListener('click', () =>
    friendsDashboardUpdatePreference(button.dataset.friendPref, button.dataset.prefKey, button.dataset.prefValue === 'true')
  ));
  root.querySelectorAll('[data-friend-snooze]').forEach(button => button.addEventListener('click', () => {
    const clearing = button.dataset.snoozed === 'true';
    const until = clearing ? null : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    friendsDashboardUpdatePreference(button.dataset.friendSnooze, 'snoozedUntil', until);
  }));
  root.querySelectorAll('[data-add-friend-list]').forEach(button => button.addEventListener('click', () => {
    const select = root.querySelector('[data-friend-list-select="' + CSS.escape(button.dataset.addFriendList) + '"]');
    if (!select?.value) return toast('Choose a friend list first.');
    friendsDashboardChangeListMember(select.value, button.dataset.addFriendList, true);
  }));
  root.querySelectorAll('[data-remove-friend-list]').forEach(button => button.addEventListener('click', () =>
    friendsDashboardChangeListMember(button.dataset.removeFriendList, button.dataset.memberId, false)
  ));
  root.querySelectorAll('[data-unfollow-friend]').forEach(button => button.addEventListener('click', async () => {
    const member = friendsDashboardState.friends.find(item => item.id === button.dataset.unfollowFriend);
    if (!member || !window.confirm('Unfollow ' + member.name + '? This will end the mutual-follow friendship unless they follow you again.')) return;
    button.disabled = true;
    try {
      await api('/users/' + encodeURIComponent(member.id) + '/follow', { method: 'DELETE', body: '{}' });
      toast('You unfollowed ' + member.name + '.');
      await renderFriends();
    } catch (error) {
      toast(error.message);
      button.disabled = false;
    }
  }));
  const suggestionGrid = root.querySelector('#people-discovery-grid');
  if (suggestionGrid) bindPeople(suggestionGrid);
}

async function friendsDashboardCreateList() {
  const name = window.prompt('Name your friend list (for example, Family or Work):');
  if (name === null) return;
  const clean = name.trim();
  if (!clean) return toast('Enter a list name.');
  try {
    const result = await api('/friends/lists', { method: 'POST', body: JSON.stringify({ name: clean }) });
    friendsDashboardState.lists = [...friendsDashboardState.lists, result.list];
    friendsDashboardState.selectedListId = result.list.id;
    friendsDashboardState.tab = 'lists';
    toast('Friend list created.');
    friendsDashboardPaint();
  } catch (error) {
    toast(error.message);
  }
}

async function friendsDashboardRenameList() {
  const list = friendsDashboardState.lists.find(item => item.id === friendsDashboardState.selectedListId);
  if (!list) return;
  const name = window.prompt('Rename this list:', list.name);
  if (name === null) return;
  try {
    await api('/friends/lists/' + encodeURIComponent(list.id), { method: 'PATCH', body: JSON.stringify({ name }) });
    list.name = name.trim();
    toast('Friend list renamed.');
    friendsDashboardPaint();
  } catch (error) {
    toast(error.message);
  }
}

async function friendsDashboardDeleteList() {
  const list = friendsDashboardState.lists.find(item => item.id === friendsDashboardState.selectedListId);
  if (!list || !window.confirm('Delete the private list "' + list.name + '"? Friendships will not be affected.')) return;
  try {
    await api('/friends/lists/' + encodeURIComponent(list.id), { method: 'DELETE', body: '{}' });
    friendsDashboardState.lists = friendsDashboardState.lists.filter(item => item.id !== list.id);
    friendsDashboardState.selectedListId = null;
    toast('Friend list deleted.');
    friendsDashboardPaint();
  } catch (error) {
    toast(error.message);
  }
}

async function friendsDashboardChangeListMember(listId, memberId, add) {
  try {
    const result = await api('/friends/lists/' + encodeURIComponent(listId) + '/members/' + encodeURIComponent(memberId), {
      method: add ? 'PUT' : 'DELETE',
      body: '{}'
    });
    const list = friendsDashboardState.lists.find(item => item.id === listId);
    if (list) {
      const ids = new Set(list.memberIds || []);
      if (add) ids.add(memberId); else ids.delete(memberId);
      list.memberIds = [...ids];
      list.memberCount = result.memberCount;
    }
    toast(add ? 'Friend added to list.' : 'Friend removed from list.');
    friendsDashboardPaint();
  } catch (error) {
    toast(error.message);
  }
}

async function friendsDashboardUpdatePreference(memberId, key, value) {
  try {
    const result = await api('/friends/' + encodeURIComponent(memberId) + '/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ [key]: value })
    });
    const member = friendsDashboardState.friends.find(item => item.id === memberId);
    if (member) Object.assign(member, result.preferences);
    toast('Friend preferences updated.');
    friendsDashboardPaint();
  } catch (error) {
    toast(error.message);
  }
}

async function renderFriends() {
  activateSilent('friends');
  if (typeof stopPeopleDiscoveryRefresh === 'function') stopPeopleDiscoveryRefresh();
  friendsDashboardState.loading = true;
  try {
    const requests = [
      api('/friends/manage'),
      api('/friends/lists'),
      api('/discovery/people'),
      api('/live/sessions').catch(() => ({ sessions: [] }))
    ];
    const [friendResult, listResult, discoveryResult, liveResult] = await Promise.all(requests);
    friendsDashboardState.friends = friendResult.friends || [];
    friendsDashboardState.lists = listResult.lists || [];
    state.people = discoveryResult.users || [];
    state.discoveryLiveSessions = liveResult.sessions || [];
    if (friendsDashboardState.tab === 'lists' && friendsDashboardState.selectedListId &&
        !friendsDashboardState.lists.some(item => item.id === friendsDashboardState.selectedListId)) {
      friendsDashboardState.selectedListId = null;
    }
    friendsDashboardState.loading = false;
    friendsDashboardPaint();
  } catch (error) {
    friendsDashboardState.loading = false;
    setContent('<section class="card friends-empty"><h3>Friends could not be loaded</h3><p>' + esc(error.message || 'Please try again.') + '</p><button class="primary" id="friends-retry">Retry</button></section>');
    document.getElementById('friends-retry')?.addEventListener('click', () => renderFriends());
  }
}
