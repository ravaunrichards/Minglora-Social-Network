(()=> {
  const escapeText = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[char]));

  function addProfileEntry() {
    const profileInfo = document.querySelector('.profile-info-main');
    const ownProfileControls = document.querySelector('#profile-edit-avatar');
    const ownAdminBadge = profileInfo?.querySelector('.platform-admin-profile-badge');
    if (!profileInfo || !ownProfileControls || !ownAdminBadge ||
        profileInfo.querySelector('[data-open-admin-centre]')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-centre-profile-button';
    button.dataset.openAdminCentre = 'true';
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 3.5 5.5v6.1c0 5.2 3.4 8.8 8.5 10.4 5.1-1.6 8.5-5.2 8.5-10.4V5.5L12 2Z"></path><path d="M8 12h8M12 8v8"></path></svg><span>Admin Control Centre</span>';
    profileInfo.append(button);
  }

  function addControlCentrePanel() {
    const security = document.querySelector('#settings-security');
    if (!security || security.querySelector('#admin-control-centre')) return;
    const moderation = security.querySelector('#moderation-workspace');
    const support = security.querySelector('#moderator-support-workspace');
    const unlocked = Boolean(moderation && support);

    const panel = document.createElement('div');
    panel.className = 'admin-control-centre';
    panel.id = 'admin-control-centre';
    panel.innerHTML = `
      <div class="admin-control-centre-head">
        <div>
          <h3>Admin Control Centre</h3>
          <p>Private platform tools for the designated Creator Hub administrator.</p>
        </div>
        <span class="admin-control-centre-status">${unlocked ? 'Secure session active' : 'MFA required'}</span>
      </div>
      <div class="admin-control-centre-note">
        Your Admin badge is part of your public Minglora profile. Administrative actions remain protected and require an authenticator-verified session.
      </div>
      ${unlocked ? `
        <div class="admin-control-centre-grid">
          <button type="button" class="admin-control-centre-tile" data-admin-jump="moderation-workspace">
            <strong>Moderation reports</strong><small>Review reports and apply available moderation actions.</small>
          </button>
          <button type="button" class="admin-control-centre-tile" data-admin-jump="moderator-support-workspace">
            <strong>Member support inbox</strong><small>Review support tickets and respond to members.</small>
          </button>
        </div>
      ` : `
        <div class="admin-control-centre-note">
          The owner account is recognized, but protected tools are not unlocked in this session. Set up an authenticator app, then sign in again using its current code.
        </div>
        <div><button type="button" class="primary" id="admin-centre-enable-mfa">Set up authenticator</button></div>
      `}
    `;
    const firstForm = security.querySelector('.settings-security-form');
    if (firstForm) security.insertBefore(panel, firstForm);
    else security.append(panel);

    panel.querySelectorAll('[data-admin-jump]').forEach(button => {
      button.addEventListener('click', () => {
        document.getElementById(button.dataset.adminJump)?.scrollIntoView({behavior:'smooth',block:'start'});
      });
    });
    panel.querySelector('#admin-centre-enable-mfa')?.addEventListener('click', () => {
      const enroll = document.querySelector('#enroll-totp');
      enroll?.scrollIntoView({behavior:'smooth',block:'center'});
      enroll?.click();
    });
  }

  document.addEventListener('click', async event => {
    const trigger = event.target.closest('[data-open-admin-centre]');
    if (!trigger) return;
    trigger.disabled = true;
    try {
      if (!window.MingloraSettings?.open) throw new Error('Settings are not available yet. Refresh Minglora and try again.');
      await window.MingloraSettings.open();
      addControlCentrePanel();
      document.querySelector('#admin-control-centre')?.scrollIntoView({behavior:'smooth',block:'start'});
    } catch (error) {
      window.alert(error.message || 'The Admin Control Centre could not be opened.');
    } finally {
      trigger.disabled = false;
    }
  });

  const observer = new MutationObserver(addProfileEntry);
  observer.observe(document.documentElement, {subtree:true,childList:true});
  addProfileEntry();
})();