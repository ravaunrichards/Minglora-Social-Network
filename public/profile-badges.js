(()=> {
  const makeAdminBadge = () => {
    const badge = document.createElement('span');
    badge.className = 'platform-admin-profile-badge';
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', 'Minglora platform administrator');
    badge.title = 'Minglora platform administrator';
    badge.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8 21 5.2v6.5c0 5.4-3.6 9.1-9 11.5-5.4-2.4-9-6.1-9-11.5V5.2L12 1.8Z"></path><path d="m8.3 12.2 2.3 2.3 5.2-5.3"></path></svg><span>Admin</span>';
    return badge;
  };

  const normalizeSingleUsernameCheck = (profile, usernameLine) => {
    const checks = [...profile.querySelectorAll('.profile-blue-verification')];
    const check = checks.find(item => usernameLine?.contains(item)) || checks[0] || null;
    checks.forEach(item => { if (item !== check) item.remove(); });
    if (check && usernameLine && !usernameLine.contains(check)) {
      usernameLine.append(' ', check);
    }
  };

  const normalizeProfileBadges = () => {
    document.querySelectorAll('.profile-info-main').forEach(profile => {
      const name = profile.querySelector('h1');
      const adminBanner = name?.nextElementSibling;
      if (name && adminBanner?.classList.contains('platform-admin-profile-banner')) {
        adminBanner.replaceWith(makeAdminBadge());
      }
      normalizeSingleUsernameCheck(profile, profile.querySelector('.profile-username-line'));
    });
    document.querySelectorAll('.profile-view-as-person').forEach(profile => {
      const name = profile.querySelector('strong');
      normalizeSingleUsernameCheck(profile, profile.querySelector('small'));
      const adminBanner = profile.querySelector('.platform-admin-profile-banner');
      if (name && adminBanner) adminBanner.replaceWith(makeAdminBadge());
      if (name) name.classList.add('profile-preview-name');
    });
  };

  if (!document.documentElement.dataset.mingloraProfileBadges) {
    document.documentElement.dataset.mingloraProfileBadges = 'true';
    const observer = new MutationObserver(normalizeProfileBadges);
    observer.observe(document.documentElement, {subtree:true, childList:true});
    normalizeProfileBadges();
  }
})();