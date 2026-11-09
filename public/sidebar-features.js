/* Minglora Facebook-style left navigation interactions. */
(() => {
  'use strict';

  const list = document.getElementById('left-rail-feature-list');
  const toggle = document.getElementById('left-rail-see-toggle');
  const adminCentreLink = document.getElementById('admin-centre-sidebar-link');
  let adminAccessCheck = 0;

  const hideAdminCentre = () => {
    adminAccessCheck += 1;
    if (!adminCentreLink) return;
    adminCentreLink.hidden = true;
    adminCentreLink.classList.add('hidden');
    adminCentreLink.setAttribute('aria-hidden', 'true');
  };

  const refreshAdminCentreVisibility = async () => {
    if (!adminCentreLink) return;
    const check = ++adminAccessCheck;
    hideAdminCentreLinkOnly();
    try {
      const response = await fetch('/api/admin/access', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      const access = await response.json().catch(() => ({}));
      if (check !== adminAccessCheck) return;
      const isDesignatedAdmin = response.ok &&
        (access.canAccess === true || access.setupRequired === true);
      adminCentreLink.hidden = !isDesignatedAdmin;
      adminCentreLink.classList.toggle('hidden', !isDesignatedAdmin);
      adminCentreLink.setAttribute('aria-hidden', String(!isDesignatedAdmin));
    } catch {
      if (check === adminAccessCheck) hideAdminCentreLinkOnly();
    }
  };

  function hideAdminCentreLinkOnly() {
    if (!adminCentreLink) return;
    adminCentreLink.hidden = true;
    adminCentreLink.classList.add('hidden');
    adminCentreLink.setAttribute('aria-hidden', 'true');
  }

  window.addEventListener('minglora:session-ready', refreshAdminCentreVisibility);
  window.addEventListener('minglora:session-ended', hideAdminCentre);
  if (document.getElementById('app') && !document.getElementById('app').classList.contains('hidden')) {
    void refreshAdminCentreVisibility();
  }

  if (list && toggle && toggle.dataset.bound !== 'true') {
    toggle.dataset.bound = 'true';
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      list.classList.toggle('is-collapsed', expanded);
      toggle.setAttribute('aria-expanded', String(!expanded));
      const label = toggle.querySelector('span');
      if (label) label.textContent = expanded ? 'See more' : 'See less';
      toggle.setAttribute('aria-label', expanded ? 'See more features' : 'See less features');
    });
  }

  document.addEventListener('click', async event => {
    const button = event.target instanceof Element
      ? event.target.closest('[data-left-action="reels"]')
      : null;
    if (!button || button.disabled) return;
    const activate = window.MingloraActivateView;
    if (typeof activate !== 'function') return;

    button.disabled = true;
    try {
      await activate('videos');
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      document.querySelector('#main-content [data-video-mode="reels"]')?.click();
    } catch (error) {
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = error?.message || 'Reels could not be opened.';
        toast.classList.add('show');
        window.setTimeout(() => toast.classList.remove('show'), 2800);
      }
    } finally {
      button.disabled = false;
    }
  });
})();
