(()=> {
  const NON_VERIFICATION_PROFILE_BADGES = [
    '.platform-admin-profile-banner',
    '.platform-admin-profile-badge',
    '.profile-live-pro-badge',
    '.gp-profile-level-badge',
    '.gp-new-gifter-identity',
    '.gp-admin-awarded-marker',
    '.gp-live-entry-badge',
    '.creator-league-profile-badge',
    '.profile-admin-identity'
  ].join(',');

  const normalizeProfileBadges = () => {
    document.querySelectorAll(
      '.profile-info-main, .profile-view-as-person, .live-profile-preview-heading, .profile-friend-card'
    ).forEach(surface => {
      surface.querySelectorAll(NON_VERIFICATION_PROFILE_BADGES).forEach(badge => badge.remove());
    });
  };

  if (!document.documentElement.dataset.mingloraProfileBadges) {
    document.documentElement.dataset.mingloraProfileBadges = 'true';
    const observer = new MutationObserver(normalizeProfileBadges);
    observer.observe(document.documentElement, {subtree:true, childList:true});
    normalizeProfileBadges();
  }
})();
