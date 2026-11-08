(() => {
  'use strict';

  const FEELINGS = [
    'happy','loved','blessed','thankful','grateful','excited','motivated','proud',
    'relaxed','hopeful','amazed','creative','sad','tired','in love','celebrating'
  ];
  const ACTIVITIES = [
    'celebrating','travelling','watching a movie','listening to music','playing games',
    'working out','reading','cooking','attending an event','spending time with friends'
  ];
  const BACKGROUNDS = ['sky','sunset','rose','violet','mint'];
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[char]);
  const safeArray = value => Array.isArray(value) ? value : [];

  function openShareComposer(options) {
    options = options || {};
    if (!state.user) return;

    const returnToProfileId = String(options.returnToProfileId || '').trim();
    const returnToVideoCentre = Boolean(options.returnToVideoCentre);
    const initialPanel = options.panel || '';
    const selectedBackground = { value: '' };
    let friends = [];
    let friendsLoaded = false;

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop ml-share-modal-backdrop';
    modal.innerHTML =
      '<section class="modal ml-share-modal" role="dialog" aria-modal="true" aria-labelledby="ml-share-title">' +
        '<header class="modal-head ml-share-modal-head">' +
          '<div><span class="ml-share-eyebrow">MINGLORA</span><h2 id="ml-share-title">Create post</h2></div>' +
          '<button class="modal-close" type="button" data-share-close aria-label="Close">×</button>' +
        '</header>' +
        '<form class="modal-body ml-share-form" id="ml-share-form">' +
          '<div class="ml-share-author-row">' +
            '<img class="avatar" src="' + escapeHtml(avatar(state.user)) + '" alt="">' +
            '<div class="ml-share-author-copy"><strong>' + escapeHtml(state.user.name || 'Your profile') + '</strong>' +
              '<label class="ml-share-audience-label" for="ml-share-audience">Post audience</label>' +
              '<select id="ml-share-audience" name="audience">' +
                '<option value="public">🌐 Public</option><option value="friends">👥 Friends</option>' +
                '<option value="close_friends">⭐ Close Friends</option><option value="followers">◉ Followers</option>' +
                '<option value="private">🔒 Only me</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
          '<div class="ml-share-composer-field">' +
            '<textarea id="ml-share-text" name="text" maxlength="5000" placeholder="What’s on your mind?" aria-label="What’s on your mind?"></textarea>' +
            '<div class="ml-share-counter"><span data-share-counter>0</span>/5000</div>' +
          '</div>' +
          '<div class="ml-share-backgrounds" data-share-panel="background" hidden>' +
            '<div class="ml-share-panel-title"><strong>Choose a text background</strong><button type="button" data-share-clear-background>Remove</button></div>' +
            '<div class="ml-share-background-options">' +
              '<button type="button" data-share-background="sky" aria-label="Blue sky background" aria-pressed="false"></button>' +
              '<button type="button" data-share-background="sunset" aria-label="Sunset background" aria-pressed="false"></button>' +
              '<button type="button" data-share-background="rose" aria-label="Rose background" aria-pressed="false"></button>' +
              '<button type="button" data-share-background="violet" aria-label="Violet background" aria-pressed="false"></button>' +
              '<button type="button" data-share-background="mint" aria-label="Mint background" aria-pressed="false"></button>' +
            '</div>' +
            '<small>Backgrounds are used for text-only posts.</small>' +
          '</div>' +
          '<section class="ml-share-add-box" aria-label="Add to your post">' +
            '<div class="ml-share-add-heading"><strong>Add to your post</strong><span>Choose anything you want to include</span></div>' +
            '<div class="ml-share-add-actions">' +
              '<button type="button" data-share-open="media"><span class="ml-share-action-icon ml-share-photo-icon">▣</span><span>Photo/video</span></button>' +
              '<button type="button" data-share-open="feeling"><span class="ml-share-action-icon ml-share-feeling-icon">☺</span><span>Feeling/activity</span></button>' +
              '<button type="button" data-share-open="location"><span class="ml-share-action-icon ml-share-location-icon">⌖</span><span>Check in</span></button>' +
              '<button type="button" data-share-open="tags"><span class="ml-share-action-icon ml-share-tag-icon">@</span><span>Tag friends</span></button>' +
              '<button type="button" data-share-open="background"><span class="ml-share-action-icon ml-share-background-icon">▤</span><span>Background</span></button>' +
              '<button type="button" data-share-open="music"><span class="ml-share-action-icon ml-share-music-icon">♫</span><span>Music</span></button>' +
            '</div>' +
            '<div class="ml-share-panel" data-share-panel="media" hidden><div class="ml-share-panel-title"><strong>Photos and videos</strong><button type="button" data-share-panel-close>Done</button></div><div id="ml-share-media-picker"></div></div>' +
            '<div class="ml-share-panel" data-share-panel="feeling" hidden>' +
              '<div class="ml-share-panel-title"><strong>How are you feeling?</strong><button type="button" data-share-panel-close>Done</button></div>' +
              '<div class="ml-share-form-grid">' +
                '<label>Feeling<select name="feeling"><option value="">Choose a feeling</option>' + FEELINGS.map(item => '<option value="' + escapeHtml(item) + '">' + escapeHtml(item[0].toUpperCase() + item.slice(1)) + '</option>').join('') + '</select></label>' +
                '<label>Activity<select name="activity"><option value="">Choose an activity</option>' + ACTIVITIES.map(item => '<option value="' + escapeHtml(item) + '">' + escapeHtml(item[0].toUpperCase() + item.slice(1)) + '</option>').join('') + '</select></label>' +
              '</div>' +
            '</div>' +
            '<div class="ml-share-panel" data-share-panel="location" hidden>' +
              '<div class="ml-share-panel-title"><strong>Where are you?</strong><button type="button" data-share-panel-close>Done</button></div>' +
              '<label class="ml-share-field-label" for="ml-share-location">Location</label>' +
              '<input id="ml-share-location" name="location" maxlength="120" placeholder="Enter a place, city or venue" autocomplete="off">' +
              '<small>Your location is included only when you choose to share it.</small>' +
            '</div>' +
            '<div class="ml-share-panel" data-share-panel="tags" hidden>' +
              '<div class="ml-share-panel-title"><strong>Tag friends</strong><button type="button" data-share-panel-close>Done</button></div>' +
              '<input class="ml-share-tag-search" type="search" placeholder="Search your friends" aria-label="Search your friends">' +
              '<div class="ml-share-friend-list" data-share-friend-list><p class="muted">Loading your friends…</p></div>' +
              '<small>You can tag up to 10 friends. Friends are people who follow you back.</small>' +
            '</div>' +
            '<div class="ml-share-panel" data-share-panel="music" hidden><div class="ml-share-panel-title"><strong>Add music</strong><button type="button" data-share-panel-close>Done</button></div><div id="ml-share-soundtrack"></div></div>' +
          '</section>' +
          '<p class="ml-share-status" data-share-status role="status" aria-live="polite"></p>' +
          '<div class="modal-actions ml-share-modal-actions">' +
            '<button type="button" class="secondary" data-share-close>Cancel</button>' +
            '<button type="submit" class="primary ml-share-submit">Post</button>' +
          '</div>' +
        '</form>' +
      '</section>';

    document.body.append(modal);

    const form = modal.querySelector('#ml-share-form');
    const textarea = modal.querySelector('#ml-share-text');
    const submit = modal.querySelector('.ml-share-submit');
    const status = modal.querySelector('[data-share-status]');
    const counter = modal.querySelector('[data-share-counter]');
    const mediaPicker = createMediaPicker(modal.querySelector('#ml-share-media-picker'), { slot:'post', maxFiles:10 });
    const soundtrackEditor = createSoundtrackEditor(modal.querySelector('#ml-share-soundtrack'));
    let isClosing = false;

    function close() {
      if (isClosing) return;
      isClosing = true;
      document.removeEventListener('keydown', onKeyDown, true);
      mediaPicker.destroy();
      soundtrackEditor.destroy();
      modal.remove();
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    }
    function setPanel(name) {
      modal.querySelectorAll('[data-share-panel]').forEach(panel => {
        panel.hidden = panel.dataset.sharePanel !== name;
      });
      modal.querySelectorAll('[data-share-open]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.shareOpen === name);
        button.setAttribute('aria-expanded', button.dataset.shareOpen === name ? 'true' : 'false');
      });
      if (name === 'tags' && !friendsLoaded) void loadFriends();
      const panel = modal.querySelector('[data-share-panel="' + name + '"]');
      if (panel) panel.scrollIntoView({ block:'nearest', behavior:'smooth' });
    }
    function renderFriends(query) {
      const list = modal.querySelector('[data-share-friend-list]');
      if (!list) return;
      const search = String(query || '').trim().toLowerCase();
      const selected = new Set(Array.from(modal.querySelectorAll('input[name="taggedUserIds"]:checked')).map(input => input.value));
      const matches = friends.filter(friend => {
        const label = [friend.name, friend.username].join(' ').toLowerCase();
        return !search || label.includes(search);
      });
      if (!matches.length) {
        list.innerHTML = '<p class="muted">' + (friends.length ? 'No friends match that search.' : 'No friends yet. Follow each other to become friends.') + '</p>';
        return;
      }
      list.innerHTML = matches.map(friend =>
        '<label class="ml-share-friend-option">' +
          '<input type="checkbox" name="taggedUserIds" value="' + escapeHtml(friend.id) + '"' + (selected.has(friend.id) ? ' checked' : '') + '>' +
          '<img src="' + escapeHtml(avatar(friend)) + '" alt="">' +
          '<span><strong>' + escapeHtml(friend.name || 'Minglora member') + '</strong><small>@' + escapeHtml(friend.username || 'member') + '</small></span>' +
        '</label>'
      ).join('');
      list.querySelectorAll('input[name="taggedUserIds"]').forEach(input => input.addEventListener('change', () => {
        const checked = modal.querySelectorAll('input[name="taggedUserIds"]:checked');
        if (checked.length > 10) {
          input.checked = false;
          status.textContent = 'You can tag up to 10 friends in one post.';
        } else status.textContent = '';
      }));
    }
    async function loadFriends() {
      const list = modal.querySelector('[data-share-friend-list]');
      if (!list) return;
      try {
        const result = await api('/friends');
        friends = safeArray(result.friends).filter(friend => friend && friend.id && friend.id !== state.user.id);
        friendsLoaded = true;
        renderFriends(modal.querySelector('.ml-share-tag-search')?.value || '');
      } catch (error) {
        list.innerHTML = '<p class="ml-share-error">Could not load friends. ' + escapeHtml(error.message || 'Try again.') + '</p>';
      }
    }

    modal.querySelectorAll('[data-share-close]').forEach(button => button.addEventListener('click', close));
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    modal.querySelectorAll('[data-share-open]').forEach(button => button.addEventListener('click', () => setPanel(button.dataset.shareOpen)));
    modal.querySelectorAll('[data-share-panel-close]').forEach(button => button.addEventListener('click', () => setPanel('')));
    modal.querySelector('.ml-share-tag-search')?.addEventListener('input', event => renderFriends(event.target.value));
    modal.querySelectorAll('[data-share-background]').forEach(button => button.addEventListener('click', () => {
      const next = BACKGROUNDS.includes(button.dataset.shareBackground) ? button.dataset.shareBackground : '';
      selectedBackground.value = selectedBackground.value === next ? '' : next;
      modal.querySelectorAll('[data-share-background]').forEach(item => item.setAttribute('aria-pressed', item.dataset.shareBackground === selectedBackground.value ? 'true' : 'false'));
      modal.querySelectorAll('[data-share-background]').forEach(item => item.classList.toggle('is-selected', item.dataset.shareBackground === selectedBackground.value));
    }));
    modal.querySelector('[data-share-clear-background]')?.addEventListener('click', () => {
      selectedBackground.value = '';
      modal.querySelectorAll('[data-share-background]').forEach(item => {
        item.setAttribute('aria-pressed', 'false');
        item.classList.remove('is-selected');
      });
    });
    textarea.addEventListener('input', () => { counter.textContent = String(textarea.value.length); });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submit.disabled) return;
      const text = String(textarea.value || '').trim();
      const selectedTags = Array.from(modal.querySelectorAll('input[name="taggedUserIds"]:checked')).map(input => input.value);
      if (selectedTags.length > 10) {
        status.textContent = 'You can tag up to 10 friends in one post.';
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Posting…';
      status.textContent = 'Preparing your post…';
      try {
        const mediaIds = await mediaPicker.upload();
        if (!text && mediaIds.length === 0) throw new Error('Write something or add a photo or video before posting.');
        const payload = {
          text: text,
          audience: form.elements.audience.value,
          mediaIds: mediaIds,
          soundtrack: soundtrackEditor.value(),
          feeling: form.elements.feeling.value,
          activity: form.elements.activity.value,
          location: form.elements.location.value.trim(),
          taggedUserIds: selectedTags,
          background: mediaIds.length ? '' : selectedBackground.value
        };
        await api('/posts', { method:'POST', body:JSON.stringify(payload) });
        close();
        if (returnToProfileId) {
          await openProfile(returnToProfileId);
        } else if (returnToVideoCentre) {
          await renderVideoCentre();
        } else {
          await loadFeed();
          await renderFeed();
        }
        toast(returnToProfileId ? 'Your post is published on your profile.' : 'Your post is published.');
        enhancePostCards();
      } catch (error) {
        status.textContent = error.message || 'Minglora could not publish your post.';
        toast(status.textContent);
        submit.disabled = false;
        submit.textContent = 'Post';
      }
    });

    document.addEventListener('keydown', onKeyDown, true);
    if (initialPanel) setPanel(initialPanel);
    window.requestAnimationFrame(() => textarea.focus());
  }

  function findPost(id) {
    const pools = [
      state.feed, state.videoFeed, state.savedPosts,
      state.profile && state.profile.posts,
      state.searchResults && state.searchResults.posts
    ];
    for (const pool of pools) {
      for (const item of safeArray(pool)) {
        const post = item && item.post ? item.post : item;
        if (post && String(post.id) === String(id)) return post;
      }
    }
    return null;
  }

  function enhancePostCards(root) {
    root = root || document;
    root.querySelectorAll('.post[data-post]').forEach(card => {
      const post = findPost(card.dataset.post);
      if (!post) return;

      if ((post.feeling || post.activity || post.location || safeArray(post.taggedUsers).length) && !card.querySelector('.ml-post-context')) {
        const context = document.createElement('div');
        context.className = 'ml-post-context';
        if (post.feeling) {
          const line = document.createElement('span');
          line.textContent = (post.author && post.author.name ? post.author.name : 'The author') + ' is feeling ' + post.feeling;
          context.append(line);
        }
        if (post.activity) {
          const line = document.createElement('span');
          line.textContent = (post.author && post.author.name ? post.author.name : 'The author') + ' is ' + post.activity;
          context.append(line);
        }
        if (post.location) {
          const line = document.createElement('span');
          line.textContent = '📍 ' + post.location;
          context.append(line);
        }
        const tagged = safeArray(post.taggedUsers);
        if (tagged.length) {
          const line = document.createElement('span');
          line.textContent = 'with ' + tagged.map(person => person.name || 'Minglora friend').join(', ');
          context.append(line);
        }
        const head = card.querySelector('.post-head');
        if (head) head.insertAdjacentElement('afterend', context);
      }

      const body = card.querySelector('.post-text');
      if (body && !safeArray(post.media).length && BACKGROUNDS.includes(post.background)) {
        body.classList.add('ml-post-text-background', 'ml-post-text-background--' + post.background);
      }
    });
  }

  function openFromTrigger(trigger) {
    if (!trigger || !state.user) return;
    const id = trigger.id;
    const panel = id.includes('photo') ? 'media' : (id.includes('feeling') ? 'feeling' : '');
    const isProfile = id.indexOf('profile-') === 0;
    openShareComposer({
      panel: panel,
      returnToProfileId: isProfile ? ((state.profile && state.profile.user && state.profile.user.id) || state.profileTargetId || '') : '',
      returnToVideoCentre: state.view === 'videos'
    });
  }

  document.addEventListener('click', event => {
    const trigger = event.target && event.target.closest
      ? event.target.closest('#open-composer, #post-text, #post-photo, #post-feeling, #profile-composer, #profile-post-photo, #profile-post-feeling')
      : null;
    if (!trigger || !state.user) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openFromTrigger(trigger);
  }, true);

  window.MingloraOpenShareThoughts = openShareComposer;
  enhancePostCards();
  const main = document.getElementById('main-content');
  if (main && typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => enhancePostCards(main));
    observer.observe(main, { childList:true, subtree:true });
  }
})();