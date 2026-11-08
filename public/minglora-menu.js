/* Minglora's responsive Facebook-style Menu and profile tools. */
(() => {
  'use strict';

  const sprite = (name, extra = '') =>
    '<svg class="minglora-menu-icon ' + extra + '" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><use href="/assets/icons/navigation-3d.svg?v=20261102-navigation-3d-2#' + name + '"></use></svg>';

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
        { label: 'Reels', detail: 'Watch and create short videos', icon: 'video', action: 'reels' },
        { label: 'Gaming Video', detail: 'Gaming-focused video discovery', icon: 'video', action: 'coming-soon', pending: true },
        { label: 'Play Games', detail: 'Games and interactive experiences', icon: 'explore', action: 'coming-soon', pending: true }
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
        { label: 'Saved', detail: 'Find posts and videos you saved', icon: 'saved', action: 'saved' }
      ]
    },
    {
      title: 'Professional',
      items: [
        { label: 'Ads Manager', detail: 'Create and manage advertising campaigns', icon: 'creator', action: 'coming-soon', pending: true },
        { label: 'Creator Dashboard', detail: 'Manage creator tools and performance', icon: 'creator', action: 'creator' }
      ]
    }
  ];

  const metaItems = [
    { label: 'Meta AI', detail: 'Open Meta AI', icon: 'explore', href: 'https://www.meta.ai/' },
    { label: 'Messenger Kids', detail: 'Open Messenger Kids', icon: 'messages', href: 'https://www.messengerkids.com/' },
    { label: 'WhatsApp', detail: 'Open WhatsApp', icon: 'messages', href: 'https://www.whatsapp.com/' },
    { label: 'Instagram', detail: 'Open Instagram', icon: 'photo', href: 'https://www.instagram.com/' }
  ];

  const createItems = [
    { label: 'Post', detail: 'Share with your audience', icon: 'share', action: 'post' },
    { label: 'Story', detail: 'Share a moment for 24 hours', icon: 'photo', action: 'story' },
    { label: 'Reel', detail: 'Create a short video', icon: 'video', action: 'reel' },
    { label: 'Life Update', detail: 'Share what is happening in your life', icon: 'feeling', action: 'life-update' },
    { label: 'Note', detail: 'Write a text update', icon: 'create', action: 'note' },
    { label: 'Page', detail: 'Create a public Page', icon: 'pages', action: 'page' },
    { label: 'Ad', detail: 'Create an advertisement', icon: 'creator', action: 'coming-soon', pending: true },
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
          sections.map(sectionMarkup).join('') +
          sectionMarkup({ title: 'More from Meta', items: metaItems }) +
        '</div>' +
        '<aside class="minglora-menu-create-column" aria-label="Create">' +
          '<section class="minglora-menu-create-card" data-menu-section>' +
            '<h3>Create</h3><p class="minglora-menu-create-intro">Make something to share with your community.</p>' +
            '<div class="minglora-menu-create-list">' + createItems.map(itemMarkup).join('') + '</div>' +
          '</section>' +
        '</aside>' +
      '</div>';

    function closeMenu() {
      panel.hidden = true;
      panel.classList.remove('is-open');
      document.body.classList.remove('minglora-menu-open');
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
      trigger.setAttribute('aria-expanded', 'true');
    }

    trigger.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (panel.hidden) openMenu();
      else closeMenu();
    });
    panel.querySelector('.minglora-menu-close').addEventListener('click', closeMenu);

    document.addEventListener('pointerdown', event => {
      if (!panel.hidden && !panel.contains(event.target) && !trigger.contains(event.target)) closeMenu();
    });
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
    if (!panel.querySelector('.account-switcher-head')) return;

    const actions = [
      { label: 'See all Profiles', key: 'profiles', icon: 'profile' },
      { label: 'Settings & Privacy', key: 'settings', icon: 'settings' },
      { label: 'Help & Support', key: 'support', icon: 'activity' },
      { label: 'Report a problem', key: 'report', icon: 'request' },
      { label: 'Display & Accessibility', key: 'display', icon: 'palette' },
      { label: 'Log Out', key: 'logout', icon: 'lock' }
    ];
    const nav = document.createElement('nav');
    nav.className = 'account-switcher-actions';
    nav.setAttribute('aria-label', 'Account settings and help');
    nav.innerHTML = actions.map(item =>
      '<button type="button" class="account-switcher-action" data-account-tool="' + item.key + '">' +
        sprite(item.icon) + '<span>' + item.label + '</span>' +
      '</button>'
    ).join('');

    const foot = panel.querySelector('.account-switcher-foot');
    if (foot) panel.insertBefore(nav, foot);
    else panel.append(nav);

    nav.addEventListener('click', async event => {
      const button = event.target instanceof Element ? event.target.closest('[data-account-tool]') : null;
      if (!button) return;
      const action = button.dataset.accountTool;
      if (typeof window.closeAccountSwitcherMenu === 'function') window.closeAccountSwitcherMenu();
      else panel.hidden = true;

      if (action === 'profiles') {
        // The account switcher itself lists every profile saved on this device.
        document.getElementById('profile-menu')?.click();
        return;
      }

      if (action === 'logout') {
        document.getElementById('logout-btn')?.click();
        return;
      }

      const openSettings = window.MingloraSettings?.open;
      if (typeof openSettings !== 'function') {
        notifyMenuError('Minglora Settings could not be opened. Please try again.');
        return;
      }
      try {
        await openSettings();
        await new Promise(resolve => window.requestAnimationFrame(resolve));
        if (action === 'support' || action === 'report') {
          document.querySelector('[data-settings-category-button="support-about"]')?.click();
          await new Promise(resolve => window.requestAnimationFrame(resolve));
          const form = document.getElementById('support-ticket-form');
          if (action === 'report') {
            const category = form?.querySelector('select[name="category"]');
            if (category) category.value = 'bug';
            const subject = form?.querySelector('input[name="subject"]');
            if (subject) subject.placeholder = 'Briefly describe the problem';
          }
          form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          form?.querySelector('input[name="subject"]')?.focus({ preventScroll: true });
        } else if (action === 'display') {
          document.querySelector('[data-settings-category-button="content-display"]')?.click();
        }
      } catch (error) {
        notifyMenuError(error?.message || 'Minglora Settings could not be opened.');
      }
    });

    function notifyMenuError(message) {
      const toast = document.getElementById('toast');
      if (!toast) return;
      toast.textContent = message;
      toast.classList.add('show');
      window.setTimeout(() => toast.classList.remove('show'), 2800);
    }
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
