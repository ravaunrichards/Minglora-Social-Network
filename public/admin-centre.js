(()=> {
  const escapeText = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[char]));

  let checkingAdminAccess = false;

  async function addProfileEntry() {
    const profileInfo = document.querySelector('.profile-info-main');
    const ownProfileControls = document.querySelector('#profile-edit-avatar');
    if (!profileInfo || !ownProfileControls ||
        profileInfo.querySelector('[data-open-admin-centre]') ||
        checkingAdminAccess) return;

    checkingAdminAccess = true;
    try {
      const response = await fetch('/api/admin/access', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' }
      });
      if (!response.ok) return;
      const access = await response.json();
      if (access?.canAccess !== true || !profileInfo.isConnected ||
          !ownProfileControls.isConnected ||
          profileInfo.querySelector('[data-open-admin-centre]')) return;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'admin-centre-profile-button';
      button.dataset.openAdminCentre = 'true';
      button.setAttribute('aria-label', 'Open private Admin Control Centre');
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 3.5 5.5v6.1c0 5.2 3.4 8.8 8.5 10.4 5.1-1.6 8.5-5.2 8.5-10.4V5.5L12 2Z"></path><path d="M8 12h8M12 8v8"></path></svg><span>Private Admin Controls</span>';
      profileInfo.append(button);
    } catch (error) {
      console.warn('[Minglora admin] Private admin controls could not be checked.', error);
    } finally {
      checkingAdminAccess = false;
    }
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
        Your administrator status is private. These controls are only shown to your secured CreatorHub account and protected actions require an authenticator-verified session.
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
        <form class="admin-owner-coin-issuance" id="admin-owner-coin-issuance-form">
          <div>
            <strong>Owner Coin issuance</strong>
            <p>Issue Coins directly to CreatorHubCreatorNetwork@gmail.com. These are owner-issued promotional Coins, not member credit.</p>
          </div>
          <label for="admin-owner-coin-amount">Coin amount</label>
          <input id="admin-owner-coin-amount" name="amountCoins" type="number" min="1" max="9007199254740991" step="1" value="9007199254740991" inputmode="numeric" required>
          <label for="admin-owner-coin-note">Issuance note</label>
          <input id="admin-owner-coin-note" name="note" type="text" maxlength="240" value="Creator Hub owner promotional Coins">
          <button type="submit" class="primary" id="admin-owner-coin-issue-submit">Issue owner Coins to CreatorHub</button>
          <p id="admin-owner-coin-issuance-status" aria-live="polite"></p>
        </form>
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
    panel.querySelector('#admin-owner-coin-issuance-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const amountInput = form.querySelector('#admin-owner-coin-amount');
      const noteInput = form.querySelector('#admin-owner-coin-note');
      const status = form.querySelector('#admin-owner-coin-issuance-status');
      const submit = form.querySelector('#admin-owner-coin-issue-submit');
      const amountCoins = Number(amountInput?.value);
      if (!Number.isSafeInteger(amountCoins) || amountCoins < 1) {
        if (status) status.textContent = 'Enter a whole-number amount from 1 to 9,007,199,254,740,991.';
        return;
      }
      const formattedAmount = amountCoins.toLocaleString();
      if (!window.confirm('Issue ' + formattedAmount + ' owner-issued Coins to CreatorHubCreatorNetwork@gmail.com? This is not member credit.')) return;
      if (submit) submit.disabled = true;
      if (status) status.textContent = 'Submitting owner Coin issuance…';
      try {
        if (!window.crypto?.randomUUID) throw new Error('A secure request reference could not be generated on this device.');
        const response = await fetch('/api/admin/coins/owner-issuance', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            amountCoins,
            requestId: window.crypto.randomUUID(),
            note: String(noteInput?.value || 'Creator Hub owner promotional Coins').slice(0,240)
          })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Owner Coin issuance failed.');
        const balance = Number(result.wallet?.wallet?.balance_coins ?? result.issuance?.issuance?.balanceAfter ?? 0);
        if (status) status.textContent = 'Issued ' + formattedAmount + ' owner Coins to CreatorHubCreatorNetwork@gmail.com. Wallet balance: ' + balance.toLocaleString() + ' Coins.';
      } catch (error) {
        if (status) status.textContent = error.message || 'Owner Coin issuance could not be completed.';
      } finally {
        if (submit) submit.disabled = false;
      }
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