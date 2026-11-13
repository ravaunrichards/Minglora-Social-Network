/* Minglora's responsive Facebook-style Menu and profile tools. */
(() => {
  'use strict';

  const sprite = (name, extra = '') => {
    const version = ["clock","gift","trophy","gamepad","game-video","reels","megaphone","ai","admin","logout"].includes(name) ? '20261110-semantic-icons-3d-1' : '20261102-navigation-3d-2';
    return '<svg class="minglora-menu-icon ' + extra + '" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><use href="/assets/icons/navigation-3d.svg?v=' + version + '#' + name + '"></use></svg>';
  };

  const sections = [
    {
      title: 'Social',
      items: [
        { label: 'Events', detail: 'Find events and manage your plans', icon: 'calendar', action: 'events' },
        { label: 'Friends', detail: 'Find and connect with people', icon: 'friends', action: 'friends' },
        { label: 'Groups', detail: 'Communities built around interests', icon: 'groups', action: 'groups' },
        { label: 'News Feed', detail: 'Posts from people and Pages', icon: 'home', action: 'news-feed' },
        { label: 'Feeds', detail: 'Explore the latest posts and updates', icon: 'activity', action: 'feeds' },
        { label: 'Pages', detail: 'Discover and manage public Pages', icon: 'pages', action: 'pages' }
      ]
    },
    {
      title: 'Entertainment',
      items: [
        { label: 'Reels', detail: 'Watch and create short videos', icon: 'reels', action: 'reels' },
        { label: 'Gaming Video', detail: 'Gaming-focused video discovery', icon: 'game-video', action: 'coming-soon', pending: true },
        { label: 'Play Games', detail: 'Games and interactive experiences', icon: 'gamepad', action: 'coming-soon', pending: true }
      ]
    },
    {
      title: 'Shopping',
      items: [
        { label: 'Order and Payments', detail: 'Wallet, payments and creator earnings', icon: 'coins', action: 'payments' },
        { label: 'Marketplace', detail: 'Buy and sell with the community', icon: 'delivery', action: 'coming-soon', pending: true }
      ]
    },
    {
      title: 'Personal',
      items: [
        { label: 'Your Ad Activity', detail: 'Review ads associated with your account', icon: 'activity', action: 'coming-soon', pending: true },
        { label: 'Memories', detail: 'Revisit moments you have shared', icon: 'restore', action: 'coming-soon', pending: true },
        { label: 'Saved', detail: 'Find posts and videos you saved', icon: 'saved', action: 'saved' },
        { label: 'Clock Centre', detail: 'Clocks, world time, alarms and timers', icon: 'clock', action: 'clock-centre' }
      ]
    },
    {
      title: 'Professional',
      items: [
        { label: 'Ads Manager', detail: 'Create and manage advertising campaigns', icon: 'megaphone', action: 'coming-soon', pending: true },
        { label: 'Creator Dashboard', detail: 'Manage creator tools and performance', icon: 'creator', action: 'creator' }
      ]
    }
  ];

  const metaItems = [
    { label: 'Meta AI', detail: 'Open Meta AI', icon: 'ai', href: 'https://www.meta.ai/' },
    { label: 'Messenger Kids', detail: 'Open Messenger Kids', icon: 'messages', href: 'https://www.messengerkids.com/' },
    { label: 'WhatsApp', detail: 'Open WhatsApp', icon: 'messages', href: 'https://www.whatsapp.com/' },
    { label: 'Instagram', detail: 'Open Instagram', icon: 'photo', href: 'https://www.instagram.com/' }
  ];

  const createItems = [
    { label: 'Post', detail: 'Share with your audience', icon: 'share', action: 'post' },
    { label: 'Story', detail: 'Share a moment for 24 hours', icon: 'photo', action: 'story' },
    { label: 'Reel', detail: 'Create a short video', icon: 'reels', action: 'reel' },
    { label: 'Life Update', detail: 'Share what is happening in your life', icon: 'feeling', action: 'life-update' },
    { label: 'Note', detail: 'Write a text update', icon: 'create', action: 'note' },
    { label: 'Page', detail: 'Create a public Page', icon: 'pages', action: 'page' },
    { label: 'Ad', detail: 'Create an advertisement', icon: 'megaphone', action: 'coming-soon', pending: true },
    { label: 'Group', detail: 'Start a community', icon: 'groups', action: 'group' },
    { label: 'Event', detail: 'Create an event', icon: 'calendar', action: 'event' }
  ];

  const itemMarkup = item => {
    const icon = sprite(item.icon);
    const pending = item.pending
      ? '<small class="minglora-menu-status">Coming soon</small>'
      : '';
    if (item.href) {
      return '<a class="minglora-menu-item" data-menu-item href="' + item.href + '" target="_blank" rel="noopener noreferrer">' +
        '<span class="minglora-menu-item-icon">' + icon + '</span>' +
        '<span class="minglora-menu-item-copy"><strong>' + item.label + '</strong><small>' + item.detail + '</small></span>' +
        '<span class="minglora-menu-external" aria-hidden="true">↗</span></a>';
    }
    return '<button type="button" class="minglora-menu-item" data-menu-item data-menu-action="' + item.action + '"' +
      (item.pending ? ' disabled aria-disabled="true"' : '') + '>' +
      '<span class="minglora-menu-item-icon">' + icon + '</span>' +
      '<span class="minglora-menu-item-copy"><strong>' + item.label + '</strong><small>' + item.detail + '</small></span>' +
      pending + '</button>';
  };

  const sectionMarkup = section =>
    '<section class="minglora-menu-section" data-menu-section>' +
      '<h3>' + section.title + '</h3>' +
      '<div class="minglora-menu-grid">' + section.items.map(itemMarkup).join('') + '</div>' +
    '</section>';

  function initializeMenu() {
    const root = document.getElementById('app');
    const trigger = document.getElementById('minglora-menu-toggle');
    const panel = document.getElementById('minglora-menu-panel');
    if (!root || !trigger || !panel || panel.dataset.initialized === 'true') return;
    panel.dataset.initialized = 'true';

    panel.innerHTML =
      '<header class="minglora-menu-header">' +
        '<div class="minglora-menu-heading"><h2>Menu</h2><p>Explore Minglora</p></div>' +
        '<button type="button" class="minglora-menu-close" aria-label="Close menu" title="Close menu">×</button>' +
      '</header>' +
      '<div class="minglora-menu-body">' +
        '<div class="minglora-menu-main-scroll">' +
          '<div class="minglora-menu-search" role="search">' +
            '<label class="minglora-menu-search-field" for="minglora-menu-search-input">' +
              sprite('search') +
              '<input id="minglora-menu-search-input" type="search" placeholder="Search menu" aria-label="Search menu" aria-controls="minglora-menu-results" autocomplete="off" spellcheck="false">' +
            '</label>' +
          '</div>' +
          '<div class="minglora-menu-results" id="minglora-menu-results">' +
            sections.map(sectionMarkup).join('') +
            sectionMarkup({ title: 'More from Meta', items: metaItems }) +
          '</div>' +
          '<p class="minglora-menu-no-results" id="minglora-menu-no-results" role="status" aria-live="polite" hidden></p>' +
        '</div>' +
        '<aside class="minglora-menu-create-column" aria-label="Create">' +
          '<section class="minglora-menu-create-card" data-menu-section>' +
            '<h3>Create</h3><p class="minglora-menu-create-intro">Make something to share with your community.</p>' +
            '<div class="minglora-menu-create-list">' + createItems.map(itemMarkup).join('') + '</div>' +
          '</section>' +
        '</aside>' +
      '</div>';

    const searchInput = panel.querySelector('#minglora-menu-search-input');
    const menuResults = panel.querySelector('#minglora-menu-results');
    const noResults = panel.querySelector('#minglora-menu-no-results');
    const normalizeMenuSearch = value => String(value || '').toLocaleLowerCase().trim();

    function filterMenuItems(value) {
      const term = normalizeMenuSearch(value);
      const rawTerm = String(value || '').trim();
      let visibleItems = 0;
      menuResults.querySelectorAll('[data-menu-section]').forEach(section => {
        const heading = normalizeMenuSearch(section.querySelector('h3')?.textContent);
        const headingMatches = Boolean(term && heading.includes(term));
        let visibleInSection = 0;
        section.querySelectorAll('[data-menu-item]').forEach(item => {
          const matches = !term || headingMatches || normalizeMenuSearch(item.textContent).includes(term);
          item.hidden = !matches;
          if (matches) { visibleInSection += 1; visibleItems += 1; }
        });
        section.hidden = visibleInSection === 0;
      });
      noResults.hidden = !term || visibleItems > 0;
      noResults.textContent = noResults.hidden ? '' : 'No menu results for "' + rawTerm + '".';
    }

    searchInput.addEventListener('input', () => filterMenuItems(searchInput.value));
    searchInput.addEventListener('keydown', event => {
      if (event.key === 'Escape' && searchInput.value) {
        event.preventDefault();
        event.stopPropagation();
        searchInput.value = '';
        filterMenuItems('');
      } else if (event.key === 'ArrowDown') {
        const firstResult = menuResults.querySelector('[data-menu-item]:not([hidden]):not(:disabled)');
        if (firstResult) { event.preventDefault(); firstResult.focus(); }
      }
    });

    function closeMenu() {
      searchInput.value = '';
      filterMenuItems('');
      panel.hidden = true;
      panel.classList.remove('is-open');
      document.body.classList.remove('minglora-menu-open');
      document.documentElement.classList.remove('minglora-menu-open');
      trigger.setAttribute('aria-expanded', 'false');
    }

    function openMenu() {
      if (typeof window.closeAccountSwitcherMenu === 'function') window.closeAccountSwitcherMenu();
      const accountMenu = document.getElementById('profile-account-menu');
      if (accountMenu) accountMenu.hidden = true;
      const accountTrigger = document.getElementById('profile-menu');
      accountTrigger?.setAttribute('aria-expanded', 'false');
      panel.hidden = false;
      panel.classList.add('is-open');
      document.body.classList.add('minglora-menu-open');
      document.documentElement.classList.add('minglora-menu-open');
      trigger.setAttribute('aria-expanded', 'true');
    }

    trigger.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (panel.hidden) openMenu();
      else closeMenu();
    });
    panel.querySelector('.minglora-menu-close').addEventListener('click', closeMenu);

    if (window.MingloraMenuDismissal?.bindOutsideDismissal) {
      window.MingloraMenuDismissal.bindOutsideDismissal({
        roots: () => [panel, trigger],
        isOpen: () => !panel.hidden,
        onDismiss: closeMenu
      });
    }
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) {
        closeMenu();
        trigger.focus();
      }
    });

    const waitForPaint = () => new Promise(resolve => window.requestAnimationFrame(resolve));
    const notifyUnavailable = label => {
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = label + ' is not available in Minglora yet.';
        toast.classList.add('show');
        window.setTimeout(() => toast.classList.remove('show'), 2800);
      }
    };

    async function activateView(view) {
      closeMenu();
      if (typeof window.MingloraActivateView === 'function') await window.MingloraActivateView(view);
    }

    async function runCreateAction(action) {
      closeMenu();
      if (action === 'post') {
        if (typeof window.openComposer === 'function') window.openComposer();
        else document.getElementById('open-composer')?.click();
      } else if (action === 'story') {
        if (typeof window.openStoryComposer === 'function') window.openStoryComposer();
        else document.getElementById('create-story')?.click();
      } else if (action === 'reel') {
        if (typeof window.openVideoComposer === 'function') window.openVideoComposer({ videoFormat: 'reel' });
        else {
          await activateView('videos');
          await waitForPaint();
          panel.querySelector('[data-video-mode="reels"]')?.click();
        }
      } else if (action === 'life-update' || action === 'note') {
        if (typeof window.openComposer === 'function') window.openComposer();
        else document.getElementById('open-composer')?.click();
        await waitForPaint();
        const title = document.getElementById('create-post-title');
        const field = document.querySelector('#create-post-form textarea[name="text"]');
        if (title) title.textContent = action === 'life-update' ? 'Share a life update' : 'Write a note';
        if (field) {
          field.placeholder = action === 'life-update' ? 'What is happening in your life?' : 'Write a note to share with your community…';
          field.focus();
        }
      } else if (action === 'page') {
        await activateView('pages');
        await waitForPaint();
        document.getElementById('create-page')?.click();
        document.getElementById('page-title')?.focus();
      } else if (action === 'group') {
        await activateView('groups');
        await waitForPaint();
        document.getElementById('create-group')?.click();
      } else if (action === 'event') {
        await activateView('calendar');
        await waitForPaint();
        document.querySelector('#main-content [data-add]')?.click();
      } else if (action === 'coming-soon') {
        notifyUnavailable('This feature');
      }
    }

    panel.addEventListener('click', async event => {
      const item = event.target instanceof Element ? event.target.closest('[data-menu-action]') : null;
      if (!item || item.disabled) return;
      const action = item.dataset.menuAction;
      const routes = {
        events: 'calendar',
        friends: 'friends',
        groups: 'groups',
        'news-feed': 'feed',
        feeds: 'for-you',
        pages: 'pages',
        reels: 'videos',
        videos: 'videos',
        payments: 'coins',
        saved: 'saved',
        'clock-centre': 'clock-centre',
        creator: 'creator'
      };
      if (routes[action]) {
        await activateView(routes[action]);
        if (action === 'reels') {
          await waitForPaint();
          document.querySelector('#main-content [data-video-mode="reels"]')?.click();
        }
        return;
      }
      await runCreateAction(action);
    });

    window.MingloraMenu = { open: openMenu, close: closeMenu };
  }


  function installAccountActions() {
    const panel = document.getElementById('profile-account-menu');
    if (!panel || panel.hidden || panel.querySelector('.account-switcher-actions')) return;
    if (!panel.querySelector('.account-switcher-current-card') && !panel.querySelector('.account-switcher-head')) return;

    const menus = {
      settings: {
        label: 'Settings & privacy',
        icon: 'settings',
        items: [
          ['Settings', 'settings'],
          ['Privacy Checkup', 'privacy-checkup'],
          ['Privacy Center', 'privacy-center']
        ]
      },
      support: {
        label: 'Help & support',
        icon: 'request',
        items: [
          ['Help Center', 'help-center'],
          ['Scam Protection Center', 'scam-protection'],
          ['Account Status', 'account-status'],
          ['Support Inbox', 'support-inbox'],
          ['Report a problem', 'report-problem']
        ]
      },
      display: {
        label: 'Display & accessibility',
        icon: 'palette',
        items: [
          ['Display & Accessibility', 'display-accessibility'],
          ['Keyboard', 'keyboard']
        ]
      }
    };

    const signOutAction = { label: 'Log out', icon: 'logout' };
    const nav = document.createElement('nav');
    nav.className = 'account-switcher-actions';
    nav.setAttribute('aria-label', 'Account settings, help and sign out');
    const menuHome = '<div class="account-switcher-menu-home" data-account-menu-home>' +
      Object.entries(menus).map(([key, item]) =>
        '<button type="button" class="account-switcher-action" data-account-tool="' + key + '" aria-expanded="false" aria-controls="account-switcher-submenu-' + key + '">' +
          sprite(item.icon, 'nav-3d-icon') + '<span>' + item.label + '</span><span class="account-switcher-menu-chevron" aria-hidden="true">›</span>' +
        '</button>'
      ).join('') +
      '<button type="button" class="account-switcher-action" data-account-feedback>' +
        sprite('activity', 'nav-3d-icon') + '<span>Give feedback</span>' +
      '</button>' +
      '<button type="button" class="account-switcher-action account-switcher-logout" data-account-logout>' +
        sprite(signOutAction.icon, 'nav-3d-icon') + '<span>' + signOutAction.label + '</span>' +
      '</button>' +
    '</div>';
    const submenuMarkup = Object.entries(menus).map(([key, item]) =>
      '<section class="account-switcher-submenu" id="account-switcher-submenu-' + key + '" data-account-menu-page="' + key + '" aria-label="' + item.label + '" hidden>' +
        '<button type="button" class="account-switcher-back" data-account-menu-back="' + key + '">' +
          '<span aria-hidden="true">‹</span><span>' + item.label + '</span>' +
        '</button>' +
        item.items.map(([label, destination]) =>
          '<button type="button" class="account-switcher-submenu-item" data-account-destination="' + destination + '">' +
            '<span>' + label + '</span><span class="account-switcher-menu-chevron" aria-hidden="true">›</span>' +
          '</button>'
        ).join('') +
      '</section>'
    ).join('');
    nav.innerHTML = menuHome + submenuMarkup;

    nav.addEventListener('click', async event => {
      const target = event.target instanceof Element ? event.target : null;
      const sectionButton = target?.closest('[data-account-tool]');
      if (sectionButton) {
        const key = sectionButton.dataset.accountTool;
        const submenu = nav.querySelector('[data-account-menu-page="' + key + '"]');
        if (!submenu) return;
        nav.querySelector('[data-account-menu-home]').hidden = true;
        submenu.hidden = false;
        sectionButton.setAttribute('aria-expanded', 'true');
        submenu.querySelector('[data-account-menu-back]')?.focus({ preventScroll: true });
        return;
      }

      const backButton = target?.closest('[data-account-menu-back]');
      if (backButton) {
        const key = backButton.dataset.accountMenuBack;
        const rootButton = nav.querySelector('[data-account-tool="' + key + '"]');
        const submenu = nav.querySelector('[data-account-menu-page="' + key + '"]');
        if (submenu) submenu.hidden = true;
        nav.querySelector('[data-account-menu-home]').hidden = false;
        rootButton?.setAttribute('aria-expanded', 'false');
        rootButton?.focus({ preventScroll: true });
        return;
      }

      const destinationButton = target?.closest('[data-account-destination]');
      if (destinationButton) {
        const destination = destinationButton.dataset.accountDestination;
        try {
          await openSettingsDestination(destination);
        } catch (error) {
          notifyMenuError(error?.message || 'Minglora Settings could not be opened.');
        }
        return;
      }

      if (target?.closest('[data-account-feedback]')) {
        try {
          await openSettingsDestination('feedback');
        } catch (error) {
          notifyMenuError(error?.message || 'Feedback could not be opened.');
        }
        return;
      }

      if (target?.closest('[data-account-logout]')) {
        if (typeof window.closeAccountSwitcherMenu === 'function') window.closeAccountSwitcherMenu();
        document.getElementById('logout-btn')?.click();
      }
    });

    const profiles = panel.querySelector('.account-switcher-profiles');
    if (profiles?.nextSibling) panel.insertBefore(nav, profiles.nextSibling);
    else panel.append(nav);
  }

  async function openSettingsDestination(destination) {
    if(destination==='help-center'){window.location.assign('/help-center.html');return;}
    const openSettings = window.MingloraSettings?.open;
    if (typeof openSettings !== 'function') {
      throw new Error('Minglora Settings could not be opened. Please try again.');
    }
    if (typeof window.closeAccountSwitcherMenu === 'function') window.closeAccountSwitcherMenu();
    else {
      const panel = document.getElementById('profile-account-menu');
      if (panel) panel.hidden = true;
    }

    await openSettings();
    await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));

    const click = selector => {
      const button = document.querySelector(selector);
      if (!button) throw new Error('This option is not available yet.');
      button.click();
    };
    const openPage = page => click('#settings-navigation [data-settings-open-page="' + page + '"]');

    if (destination === 'settings') {
      openPage('settings');
      return;
    }
    if (destination === 'privacy-checkup' || destination === 'privacy-center') {
      openPage('settings');
      await new Promise(resolve => window.requestAnimationFrame(resolve));
      openPage(destination);
      return;
    }
    if (destination === 'display-accessibility') {
      openPage('display-accessibility');
      return;
    }
    if (destination === 'keyboard') {
      openPage('display-accessibility');
      await new Promise(resolve => window.requestAnimationFrame(resolve));
      openPage('keyboard');
      return;
    }
    if (destination === 'feedback') {
      openPage('report-support');
      await new Promise(resolve => window.requestAnimationFrame(resolve));
      click('#settings-navigation [data-settings-title="Contact Support"]');
      return;
    }

    openPage('help-support');
    await new Promise(resolve => window.requestAnimationFrame(resolve));
    if (destination === 'help-center' || destination === 'scam-protection' || destination === 'account-status') {
      openPage(destination);
      return;
    }
    if (destination === 'support-inbox') {
      click('#settings-navigation [data-settings-page="help-support"] [data-settings-title="Support Inbox"]');
      return;
    }
    if (destination === 'report-problem') {
      click('#settings-navigation [data-settings-page="help-support"] [data-settings-report-problem]');
      return;
    }
    throw new Error('This Settings destination is not available.');
  }

  function notifyMenuError(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function initializeAccountActions() {
    const panel = document.getElementById('profile-account-menu');
    if (!panel || panel.dataset.menuToolsObserver === 'true') return;
    panel.dataset.menuToolsObserver = 'true';
    const observer = new MutationObserver(() => installAccountActions());
    observer.observe(panel, { childList: true, subtree: true });
    installAccountActions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initializeMenu();
      initializeAccountActions();
    }, { once: true });
  } else {
    initializeMenu();
    initializeAccountActions();
  }
})();
