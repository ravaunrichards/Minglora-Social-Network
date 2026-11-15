/* Minglora Facebook-style left navigation interactions. */
(() => {
  'use strict';

  const list = document.getElementById('left-rail-feature-list');
  const toggle = document.getElementById('left-rail-see-toggle');
  const adminCentreLink = document.getElementById('admin-centre-sidebar-link');
  const aiNetworkLink = document.getElementById('ai-network-sidebar-link');
  let adminAccessCheck = 0;

  const setLinkVisibility = (link, visible) => {
    if (!link) return;
    link.hidden = !visible;
    link.classList.toggle('hidden', !visible);
    link.setAttribute('aria-hidden', String(!visible));
  };

  const publishAdminAccess = access => {
    window.__mingloraAdminAccess = access && typeof access === 'object'
      ? access
      : { canAccess: false, setupRequired: false, mfaVerified: false };
    window.dispatchEvent(new CustomEvent('minglora:admin-access-updated', {
      detail: window.__mingloraAdminAccess
    }));
  };

  const hideAdminNavigation = () => {
    adminAccessCheck += 1;
    publishAdminAccess({ canAccess: false, setupRequired: false, mfaVerified: false });
    setLinkVisibility(adminCentreLink, false);
    setLinkVisibility(aiNetworkLink, false);
  };

  const refreshAdminCentreVisibility = async () => {
    if (!adminCentreLink && !aiNetworkLink) return;
    const check = ++adminAccessCheck;
    publishAdminAccess({ canAccess: false, setupRequired: false, mfaVerified: false });
    setLinkVisibility(adminCentreLink, false);
    setLinkVisibility(aiNetworkLink, false);
    try {
      const response = await fetch('/api/admin/access', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      });
      const access = await response.json().catch(() => ({}));
      if (check !== adminAccessCheck) return;
      publishAdminAccess(response.ok ? access : null);
      const canOpenAdminCentre = response.ok &&
        (access.canAccess === true || access.setupRequired === true);
      const canOpenAINetwork = response.ok && access.canAccess === true;
      setLinkVisibility(adminCentreLink, canOpenAdminCentre);
      setLinkVisibility(aiNetworkLink, canOpenAINetwork);
    } catch {
      if (check === adminAccessCheck) hideAdminNavigation();
    }
  };

  window.addEventListener('minglora:session-ready', refreshAdminCentreVisibility);
  window.addEventListener('minglora:session-ended', hideAdminNavigation);
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
