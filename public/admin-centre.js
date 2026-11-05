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
      if ((access?.canAccess !== true && access?.setupRequired !== true) || !profileInfo.isConnected ||
          !ownProfileControls.isConnected ||
          profileInfo.querySelector('[data-open-admin-centre]')) return;

      const button = document.createElement('a');
      button.href = '/admin-centre.html';
      button.className = 'admin-centre-profile-button';
      button.dataset.openAdminCentre = 'true';
      button.setAttribute('aria-label', 'Open the separate private Admin Control Centre');
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 3.5 5.5v6.1c0 5.2 3.4 8.8 8.5 10.4 5.1-1.6 8.5-5.2 8.5-10.4V5.5L12 2Z"></path><path d="M8 12h8M12 8v8"></path></svg><span>Private Admin Controls</span>';
      profileInfo.append(button);
    } catch (error) {
      console.warn('[Minglora admin] Private admin controls could not be checked.', error);
    } finally {
      checkingAdminAccess = false;
    }
  }

  function addControlCentrePanel() {
    const root = document.querySelector('#admin-centre-root');
    if (!root || root.querySelector('#admin-control-centre')) return;
    const access = window.__mingloraAdminAccess || {};
    const unlocked = access.canAccess === true;

    const panel = document.createElement('div');
    panel.className = 'admin-control-centre admin-control-centre-page';
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
        This is Minglora’s separate private administrator workspace, not member Settings. Protected actions require the designated Creator Hub account and an authenticator-verified session.
      </div>
      <nav class="admin-centre-navigation" aria-label="Admin Centre sections">
        <a href="#admin-control-centre">Overview</a>
        ${unlocked ? `<a href="#admin-campaign-coins-wallet">Admin Promotional Gift Wallet</a><a href="#admin-member-promotions">Member promotions</a><a href="#admin-marketing-budget">Marketing budget</a><a href="#moderation-workspace">Moderation</a><a href="#moderator-support-workspace">Support inbox</a>` : ''}
        <a href="#admin-centre-settings">Admin settings</a>
      </nav>
      ${unlocked ? `
        <div class="admin-control-centre-grid">
          <button type="button" class="admin-control-centre-tile" data-admin-jump="moderation-workspace">
            <strong>Moderation reports</strong><small>Review reports and apply available moderation actions.</small>
          </button>
          <button type="button" class="admin-control-centre-tile" data-admin-jump="moderator-support-workspace">
            <strong>Member support inbox</strong><small>Review support tickets and respond to members.</small>
          </button>
        </div>
        <section class="admin-marketing-budget" id="admin-campaign-coins-wallet" aria-labelledby="admin-campaign-coins-wallet-title">
          <div class="admin-marketing-budget-heading">
            <div><strong id="admin-campaign-coins-wallet-title">Admin Promotional Gift Wallet</strong>
              <p>Independent campaign allocation and transaction ledger. This wallet is separate from Main Coins, Main Promotional Coins and cash-backed marketing funds.</p></div>
            <button type="button" class="secondary" id="admin-campaign-coins-refresh">Refresh balance</button>
          </div>
          <div class="admin-marketing-budget-summary" id="admin-campaign-coins-summary" aria-live="polite">Loading verified campaign balance…</div>
        </section>
        <div class="admin-control-centre-note" id="admin-main-wallet-protection">
          CreatorHub Main Coin balance is protected. Member promotions are issued only from the separate Admin Promotional Gift Wallet shown above.
        </div>
        <section class="admin-member-promotions" aria-labelledby="admin-member-promotions-title">
          <div class="admin-member-promotions-heading">
            <div>
              <strong id="admin-member-promotions-title">Member promotional Coins</strong>
              <p>Choose each recipient and the exact amount yourself. No Coins are sent automatically when a person registers.</p>
            </div>
          </div>
          <form id="admin-member-promotion-form" class="admin-marketing-form">
            <strong>Send a promotion to one member</strong>
            <p>Newest members are listed first. Search by username or display name, then select the exact recipient before entering an amount.</p>
            <label for="admin-member-promotion-search">Find a member</label>
            <div class="admin-member-search-row">
              <input id="admin-member-promotion-search" type="search" maxlength="80" autocomplete="off" placeholder="Search username or display name">
              <button type="button" class="secondary" id="admin-member-promotion-find">Search</button>
            </div>
            <p id="admin-member-promotion-search-status" class="admin-member-search-status" aria-live="polite">Showing the newest members first.</p>
            <label for="admin-member-promotion-recipient">Choose recipient</label>
            <select id="admin-member-promotion-recipient" name="memberUsername" required>
              <option value="">Loading members…</option>
            </select>
            <p class="admin-member-promotion-funding-note">These Coins are allocated from the separate Admin Campaign Coins wallet into each member’s Promotional Gift Wallet. They never deduct from the owner’s Main Coin balance or the member’s Main Coin balance.</p>
            <label for="admin-member-promotion-amount">Promotional Coin amount</label>
            <input id="admin-member-promotion-amount" name="amountCoins" type="number" min="1" max="9007199254740991" step="1" inputmode="numeric" placeholder="Enter the amount you choose" required>
            <label for="admin-member-promotion-note">Reason or promotion note</label>
            <input id="admin-member-promotion-note" name="note" type="text" maxlength="240" value="Minglora member promotional Coins">
            <button type="submit" class="primary" id="admin-member-promotion-submit">Send promotional Coins</button>
            <p id="admin-member-promotion-status" aria-live="polite"></p>
          </form>
          <div class="admin-member-promotion-history">
            <div class="admin-member-promotion-history-heading">
              <strong>Recent member promotions</strong>
              <button type="button" class="secondary" id="admin-member-promotion-refresh">Refresh history</button>
            </div>
            <div id="admin-member-promotion-history-list" aria-live="polite">Loading promotion history…</div>
          </div>
        </section>
        <section class="admin-marketing-budget" aria-labelledby="admin-marketing-budget-title">
          <div class="admin-marketing-budget-heading">
            <div>
              <strong id="admin-marketing-budget-title">Creator marketing budget</strong>
              <p>Cash-backed promotional Coins for member campaigns. Creator earnings from these gifts are paid only from this reserved, funded budget.</p>
            </div>
            <button type="button" class="secondary" id="admin-marketing-budget-refresh">Refresh budget</button>
          </div>
          <div class="admin-marketing-budget-summary" id="admin-marketing-budget-summary" aria-live="polite">Loading verified budget…</div>
          <form id="admin-marketing-funding-form" class="admin-marketing-form">
            <strong>Record verified marketing funding</strong>
            <p>Only record money already received and independently matched to the external transfer or settlement reference.</p>
            <label for="admin-marketing-funding-amount">Amount received (USD)</label>
            <input id="admin-marketing-funding-amount" name="amount" type="number" min="1.00" step="0.01" inputmode="decimal" placeholder="100.00" required>
            <label for="admin-marketing-funding-reference">External transfer / settlement reference</label>
            <input id="admin-marketing-funding-reference" name="reference" type="text" minlength="6" maxlength="160" autocomplete="off" placeholder="Bank or PayPal transaction reference" required>
            <label for="admin-marketing-funding-note">Funding note</label>
            <input id="admin-marketing-funding-note" name="note" type="text" maxlength="240" value="Verified Minglora creator marketing funding">
            <button type="submit" class="primary" id="admin-marketing-funding-submit">Record received funds</button>
            <p id="admin-marketing-funding-status" aria-live="polite"></p>
          </form>
          <form id="admin-marketing-grant-form" class="admin-marketing-form">
            <strong>Grant marketing-funded Coins</strong>
            <p>Grants reserve the equivalent USD cents from the funded budget. These are different from ordinary non-cash owner/admin promotional credits.</p>
            <label for="admin-marketing-member">Member username</label>
            <input id="admin-marketing-member" name="memberUsername" type="text" maxlength="31" placeholder="@username" required>
            <label for="admin-marketing-grant-amount">Coin amount</label>
            <input id="admin-marketing-grant-amount" name="amountCoins" type="number" min="1" step="1" inputmode="numeric" placeholder="1000" required>
            <label for="admin-marketing-grant-note">Grant note</label>
            <input id="admin-marketing-grant-note" name="note" type="text" maxlength="240" value="Minglora funded creator campaign">
            <button type="submit" class="primary" id="admin-marketing-grant-submit">Grant funded Coins</button>
            <p id="admin-marketing-grant-status" aria-live="polite"></p>
          </form>
        </section>
      ` : `
        <div class="admin-control-centre-note">
          The owner account is recognized, but protected tools are not unlocked in this session. Set up an authenticator app, then sign in again using its current code.
        </div>
        <p class="admin-control-centre-note">Open Admin Settings below to configure or verify your authenticator.</p>
      `}
    `;
    if (unlocked) {
      panel.insertAdjacentHTML('beforeend',
        '<section class="admin-control-centre-section" id="moderation-workspace" aria-labelledby="admin-moderation-title">' +
          '<div class="admin-control-centre-section-heading"><div><h3 id="admin-moderation-title">Moderation reports</h3><p>Review member reports and apply available content or account actions.</p></div>' +
          '<button type="button" class="secondary" id="admin-centre-refresh-moderation">Refresh</button></div>' +
          '<div id="moderation-reports-list" aria-live="polite">Loading reports…</div></section>' +
        '<section class="admin-control-centre-section" id="moderator-support-workspace" aria-labelledby="admin-support-title">' +
          '<div class="admin-control-centre-section-heading"><div><h3 id="admin-support-title">Member support inbox</h3><p>Respond to member tickets and update their status.</p></div>' +
          '<button type="button" class="secondary" id="admin-centre-refresh-support">Refresh</button></div>' +
          '<div id="moderator-support-tickets" aria-live="polite">Loading support tickets…</div></section>'
      );
    }
    const adminSettings = document.createElement('section');
    adminSettings.className = 'admin-control-centre-section admin-centre-settings';
    adminSettings.id = 'admin-centre-settings';
    adminSettings.innerHTML =
      '<div class="admin-control-centre-section-heading"><div><h3>Admin settings</h3><p>Security and session controls for this private administrator workspace.</p></div>' +
        '<span class="admin-control-centre-status">' + (unlocked ? 'Secure session active' : 'Security setup required') + '</span></div>' +
      '<div class="admin-centre-settings-grid">' +
        '<section class="admin-centre-settings-card"><h4>Administrator account security</h4>' +
          '<p id="admin-centre-security-status" aria-live="polite">Checking authenticator status…</p>' +
          '<div id="admin-centre-mfa-factors">Loading authenticator details…</div>' +
          '<button type="button" class="secondary" id="admin-centre-enable-mfa">Set up or restart authenticator</button>' +
          '<div id="admin-centre-mfa-enrollment-panel"></div></section>' +
        '<section class="admin-centre-settings-card"><h4>Signed-in devices</h4>' +
          '<p>Review sessions belonging to this account. You can sign out other devices without ending this session.</p>' +
          '<div id="admin-centre-session-list" aria-live="polite">Loading active sessions…</div>' +
          '<button type="button" class="secondary" id="admin-centre-revoke-other-sessions">Log out other devices</button>' +
          '<p id="admin-centre-session-status" role="status" aria-live="polite"></p></section>' +
      '</div>';
    panel.append(adminSettings);
    root.replaceChildren(panel);
    root.dataset.adminCentreReady = 'true';

    panel.querySelectorAll('[data-admin-jump]').forEach(button => {
      button.addEventListener('click', () => {
        document.getElementById(button.dataset.adminJump)?.scrollIntoView({behavior:'smooth',block:'start'});
      });
    });
    const promotionHistoryList = panel.querySelector('#admin-member-promotion-history-list');
    const promotionMemberSearch = panel.querySelector('#admin-member-promotion-search');
    const promotionMemberSelect = panel.querySelector('#admin-member-promotion-recipient');
    const promotionMemberSearchStatus = panel.querySelector('#admin-member-promotion-search-status');
    const loadPromotionMembers = async (search = '') => {
      if (!promotionMemberSelect) return;
      promotionMemberSelect.innerHTML = '<option value="">Loading members…</option>';
      if (promotionMemberSearchStatus) promotionMemberSearchStatus.textContent = search
        ? 'Searching members…' : 'Loading the newest members…';
      try {
        const response = await fetch('/api/admin/coins/member-promotions/members?search=' + encodeURIComponent(search), {
          credentials:'same-origin',
          headers:{Accept:'application/json'}
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Member list could not be loaded.');
        const members = Array.isArray(result.members) ? result.members : [];
        if (!members.length) {
          promotionMemberSelect.innerHTML = '<option value="">No matching members found</option>';
          if (promotionMemberSearchStatus) promotionMemberSearchStatus.textContent =
            search ? 'No members matched that search.' : 'No member accounts are available yet.';
          return;
        }
        promotionMemberSelect.innerHTML = '<option value="">Choose a recipient</option>' + members.map(member => {
          const username = String(member.username || '');
          const name = String(member.displayName || '').trim();
          const joined = member.joinedAt && !Number.isNaN(new Date(member.joinedAt).getTime())
            ? new Date(member.joinedAt).toLocaleDateString() : '';
          const label = '@' + username + (name ? ' — ' + name : '') + (joined ? ' · Joined ' + joined : '');
          return '<option value="' + escapeText(username) + '">' + escapeText(label) + '</option>';
        }).join('');
        if (promotionMemberSearchStatus) promotionMemberSearchStatus.textContent =
          (search ? 'Search results' : 'Newest members first') + ' · ' + members.length + ' member' +
          (members.length === 1 ? '' : 's') + ' shown.';
      } catch (error) {
        promotionMemberSelect.innerHTML = '<option value="">Member list unavailable</option>';
        if (promotionMemberSearchStatus) promotionMemberSearchStatus.textContent =
          error.message || 'Member list could not be loaded.';
      }
    };
    panel.querySelector('#admin-member-promotion-find')?.addEventListener('click', () => {
      loadPromotionMembers(String(promotionMemberSearch?.value || '').trim());
    });
    promotionMemberSearch?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        loadPromotionMembers(String(promotionMemberSearch.value || '').trim());
      }
    });
    loadPromotionMembers();
    const refreshMemberPromotionHistory = async () => {
      if (!promotionHistoryList) return;
      promotionHistoryList.textContent = 'Loading promotion history…';
      try {
        const response = await fetch('/api/admin/coins/member-promotions/history', {
          credentials:'same-origin',
          headers:{Accept:'application/json'}
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Promotion history could not be loaded.');
        const items = Array.isArray(result.items) ? result.items : [];
        if (!items.length) {
          promotionHistoryList.textContent = 'No member promotional Coins have been issued yet.';
          return;
        }
        promotionHistoryList.innerHTML = items.map(item => {
          const username = escapeText(item.memberUsername ? '@' + item.memberUsername : 'Minglora member');
          const displayName = escapeText(item.memberDisplayName || '');
          const amount = Number(item.amountCoins || 0);
          const note = escapeText(item.note || 'Promotional Coins');
          const createdAt = item.createdAt && !Number.isNaN(new Date(item.createdAt).getTime())
            ? escapeText(new Date(item.createdAt).toLocaleString()) : 'Date unavailable';
          return '<article class="admin-member-promotion-row"><div class="admin-member-promotion-recipient"><strong>' +
            username + '</strong>' + (displayName ? '<small>' + displayName + '</small>' : '') +
            '<small>' + createdAt + ' · ' + note + '</small></div><strong class="admin-member-promotion-amount">' +
            (Number.isSafeInteger(amount) ? amount.toLocaleString() : escapeText(item.amountCoins)) + ' Coins</strong></article>';
        }).join('');
      } catch (error) {
        promotionHistoryList.textContent = error.message || 'Promotion history could not be loaded.';
      }
    };
    panel.querySelector('#admin-member-promotion-refresh')?.addEventListener('click', refreshMemberPromotionHistory);
    refreshMemberPromotionHistory();

    panel.querySelector('#admin-member-promotion-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const memberInput = panel.querySelector('#admin-member-promotion-recipient');
      const amountInput = form.querySelector('#admin-member-promotion-amount');
      const noteInput = form.querySelector('#admin-member-promotion-note');
      const status = form.querySelector('#admin-member-promotion-status');
      const submit = form.querySelector('#admin-member-promotion-submit');
      const memberUsername = String(memberInput?.value || '').trim().replace(/^@/,'').toLowerCase();
      const amountCoins = Number(amountInput?.value);
      if (!/^[a-z0-9_]{3,30}$/.test(memberUsername) ||
          !Number.isSafeInteger(amountCoins) || amountCoins < 1 || amountCoins > Number.MAX_SAFE_INTEGER) {
        if (status) status.textContent = 'Enter a valid member username and a positive whole-number Coin amount.';
        return;
      }
      if (!window.crypto?.randomUUID) {
        if (status) status.textContent = 'A secure promotion reference could not be generated on this device.';
        return;
      }
      const note = String(noteInput?.value || 'Minglora member promotional Coins').trim().slice(0,240);
      if (!window.confirm('Send ' + amountCoins.toLocaleString() + ' promotional Coins to @' + memberUsername + '? This will be recorded in the member promotion history.')) return;
      if (submit) submit.disabled = true;
      if (status) status.textContent = 'Sending your approved promotional Coins…';
      try {
        const response = await fetch('/api/admin/coins/member-promotions', {
          method:'POST', credentials:'same-origin',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({memberUsername,amountCoins,note,requestId:window.crypto.randomUUID()})
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Promotional Coins could not be sent.');
        const credit = result.credit || {};
        const balance = Number(credit.balanceAfter || 0);
        if (status) status.textContent = (credit.alreadyCredited ? 'This promotion was already processed. ' : 'Sent ') +
          Number(credit.amountCoins || amountCoins).toLocaleString() + ' promotional Coins to @' +
          escapeText(credit.memberUsername || memberUsername) + '. Recipient wallet balance: ' +
          balance.toLocaleString() + ' Coins.';
        if (amountInput) amountInput.value = '';
        await refreshMemberPromotionHistory();
        await refreshAdminCampaignWallet();
      } catch (error) {
        if (status) status.textContent = error.message || 'Promotional Coins could not be sent.';
      } finally {
        if (submit) submit.disabled = false;
      }
    });

    const money = minor => 'USD ' + (Number(minor || 0) / 100).toFixed(2);
    const budgetSummary = panel.querySelector('#admin-marketing-budget-summary');
    const refreshMarketingBudget = async () => {
      if (!budgetSummary) return;
      budgetSummary.textContent = 'Loading verified budget…';
      try {
        const response = await fetch('/api/admin/marketing/budget', {
          credentials: 'same-origin',
          headers: {Accept:'application/json'}
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Marketing budget could not be loaded.');
        budgetSummary.textContent =
          'Funded: ' + money(result.fundedMinor) +
          ' · Reserved in member wallets/reward pools: ' + money(result.reservedMinor) +
          ' · Spent on eligible gifts: ' + money(result.spentMinor) +
          ' · Available to grant: ' + money(result.availableMinor);
      } catch (error) {
        budgetSummary.textContent = error.message || 'Marketing budget is unavailable.';
      }
    };
    panel.querySelector('#admin-marketing-budget-refresh')?.addEventListener('click', refreshMarketingBudget);
    refreshMarketingBudget();

    panel.querySelector('#admin-marketing-funding-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const amountInput = form.querySelector('#admin-marketing-funding-amount');
      const referenceInput = form.querySelector('#admin-marketing-funding-reference');
      const noteInput = form.querySelector('#admin-marketing-funding-note');
      const status = form.querySelector('#admin-marketing-funding-status');
      const submit = form.querySelector('#admin-marketing-funding-submit');
      const rawAmount = String(amountInput?.value || '').trim();
      const amount = Number(rawAmount);
      const amountMinor = Math.round(amount * 100);
      const reference = String(referenceInput?.value || '').trim();
      if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(rawAmount) ||
          !Number.isSafeInteger(amountMinor) || amountMinor < 100 ||
          reference.length < 6 || reference.length > 160) {
        if (status) status.textContent = 'Enter at least USD $1.00 and a valid external funding reference.';
        return;
      }
      if (!window.crypto?.randomUUID) {
        if (status) status.textContent = 'A secure funding reference could not be generated on this device.';
        return;
      }
      if (!window.confirm('Confirm that USD ' + money(amountMinor) + ' has already been received and matched to external reference ' + reference + '? Do not record pending or expected funds.')) return;
      if (submit) submit.disabled = true;
      if (status) status.textContent = 'Recording verified funding…';
      try {
        const response = await fetch('/api/admin/marketing/funding', {
          method:'POST', credentials:'same-origin',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            amountMinor,
            requestId:window.crypto.randomUUID(),
            fundingReference:reference,
            note:String(noteInput?.value || '').slice(0,240)
          })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Marketing funding could not be recorded.');
        if (status) status.textContent = 'Funding recorded. Available marketing balance: ' + money(result.availableMinor) + '.';
        if (amountInput) amountInput.value = '';
        if (referenceInput) referenceInput.value = '';
        await refreshMarketingBudget();
      } catch (error) {
        if (status) status.textContent = error.message || 'Marketing funding could not be recorded.';
      } finally {
        if (submit) submit.disabled = false;
      }
    });

    panel.querySelector('#admin-marketing-grant-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      const memberInput = form.querySelector('#admin-marketing-member');
      const amountInput = form.querySelector('#admin-marketing-grant-amount');
      const noteInput = form.querySelector('#admin-marketing-grant-note');
      const status = form.querySelector('#admin-marketing-grant-status');
      const submit = form.querySelector('#admin-marketing-grant-submit');
      const memberUsername = String(memberInput?.value || '').trim().replace(/^@/,'').toLowerCase();
      const amountCoins = Number(amountInput?.value);
      if (!/^[a-z0-9_]{3,30}$/.test(memberUsername) ||
          !Number.isSafeInteger(amountCoins) || amountCoins < 1) {
        if (status) status.textContent = 'Enter a valid Minglora username and a positive whole-number Coin amount.';
        return;
      }
      if (!window.crypto?.randomUUID) {
        if (status) status.textContent = 'A secure grant reference could not be generated on this device.';
        return;
      }
      if (!window.confirm('Grant ' + amountCoins.toLocaleString() + ' marketing-funded Coins to @' + memberUsername + '? This reserves ' + money(amountCoins) + ' from the confirmed marketing budget.')) return;
      if (submit) submit.disabled = true;
      if (status) status.textContent = 'Reserving marketing funds and granting Coins…';
      try {
        const response = await fetch('/api/admin/marketing/grants', {
          method:'POST', credentials:'same-origin',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            memberUsername,amountCoins,requestId:window.crypto.randomUUID(),
            note:String(noteInput?.value || '').slice(0,240)
          })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Marketing Coin grant failed.');
        if (status) status.textContent = 'Granted ' + Number(result.amountCoins || amountCoins).toLocaleString() +
          ' marketing-funded Coins to @' + memberUsername + '.';
        if (amountInput) amountInput.value = '';
        await refreshMarketingBudget();
      } catch (error) {
        if (status) status.textContent = error.message || 'Marketing Coin grant failed.';
      } finally {
        if (submit) submit.disabled = false;
      }
    });

    const refreshAdminCampaignWallet = async () => {
      const target = panel.querySelector('#admin-campaign-coins-summary');
      if (!target) return;
      target.textContent = 'Loading verified campaign balance…';
      try {
        const response = await fetch('/api/admin/coins/campaign-wallet', {
          credentials:'same-origin', headers:{Accept:'application/json'}
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Campaign wallet could not be loaded.');
        const wallet = result.wallet || {};
        const available = Number(wallet.available_coins || 0);
        const funded = Number(wallet.lifetime_funded_coins || 0);
        const allocated = Number(wallet.lifetime_allocated_coins || 0);
        target.innerHTML = '<div class="admin-marketing-budget-metrics">' +
          '<div><small>Available campaign Coins</small><strong>' + available.toLocaleString() + '</strong></div>' +
          '<div><small>Total allocated</small><strong>' + allocated.toLocaleString() + '</strong></div>' +
          '<div><small>Total funded</small><strong>' + funded.toLocaleString() + '</strong></div>' +
          '<div><small>Wallet limit</small><strong>' + Number(wallet.max_balance_coins || 0).toLocaleString() + '</strong></div></div>';
      } catch (error) {
        target.textContent = error.message || 'Campaign wallet could not be loaded.';
      }
    };
    panel.querySelector('#admin-campaign-coins-refresh')?.addEventListener('click', refreshAdminCampaignWallet);
    refreshAdminCampaignWallet();
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
    panel.querySelector('#admin-centre-enable-mfa')?.addEventListener('click', () => startAdminMfaEnrollment(panel));
    panel.querySelector('#admin-centre-refresh-moderation')?.addEventListener('click', () => loadAdminModerationQueue(panel));
    panel.querySelector('#admin-centre-refresh-support')?.addEventListener('click', () => loadAdminSupportInbox(panel));
    panel.querySelector('#admin-centre-revoke-other-sessions')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      const status = panel.querySelector('#admin-centre-session-status');
      if (!window.confirm('Log out all other Minglora sessions for this administrator account?')) return;
      button.disabled = true;
      try {
        await adminCentreApi('/security/sessions/revoke-others', {method:'POST',body:'{}'});
        if (status) status.textContent = 'Other device sessions have been signed out.';
        await loadAdminSecuritySettings(panel);
      } catch (error) {
        if (status) status.textContent = error.message || 'Other sessions could not be revoked.';
      } finally { button.disabled = false; }
    });
    loadAdminSecuritySettings(panel);
    if (unlocked) { loadAdminModerationQueue(panel); loadAdminSupportInbox(panel); }
  }

  async function adminCentreApi(path, options = {}) {
    const response = await fetch('/api' + path, {
      credentials:'same-origin', headers:{'Content-Type':'application/json',...(options.headers || {})}, ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The administrator request could not be completed.');
    return payload;
  }

  async function loadAdminModerationQueue(panel) {
    const target = panel.querySelector('#moderation-reports-list');
    if (!target) return;
    target.textContent = 'Loading reports…';
    try {
      const result = await adminCentreApi('/moderation/reports?status=open');
      target.innerHTML = (result.reports || []).map(report => {
        const actions = report.targetType === 'post' ? '<option value="hide_post">Hide post</option><option value="remove_post">Remove post</option>' :
          report.targetType === 'story' ? '<option value="remove_story">Remove story</option>' :
          report.targetType === 'user' ? '<option value="suspend_account">Suspend account</option>' : '';
        return '<article class="moderation-report"><strong>' + escapeText(report.targetType) + ' · ' + escapeText(report.category) +
          '</strong><p>' + escapeText(report.details || 'No extra details') + '</p><small>Reporter: ' +
          escapeText(report.reporter?.username || 'member') + ' · Target owner: ' +
          escapeText(report.targetOwner?.username || 'unknown') + '</small><form data-admin-moderate-report="' +
          escapeText(report.id) + '"><select name="status"><option value="triaged">In review</option><option value="actioned">Actioned</option>' +
          '<option value="dismissed">Dismiss</option><option value="open">Keep open</option></select><select name="action">' +
          '<option value="">No content action</option>' + actions + '</select><button class="primary" type="submit">Apply</button></form></article>';
      }).join('') || '<p class="settings-empty">No open reports.</p>';
      target.querySelectorAll('[data-admin-moderate-report]').forEach(form => form.addEventListener('submit', async event => {
        event.preventDefault();
        const values = new FormData(form), button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          await adminCentreApi('/moderation/reports/' + encodeURIComponent(form.dataset.adminModerateReport), {
            method:'PATCH', body:JSON.stringify({status:values.get('status'),action:values.get('action') || null})
          });
          await loadAdminModerationQueue(panel);
        } catch (error) { window.alert(error.message); button.disabled = false; }
      }));
    } catch (error) { target.textContent = error.message || 'Moderation reports could not be loaded.'; }
  }

  async function loadAdminSupportInbox(panel) {
    const target = panel.querySelector('#moderator-support-tickets');
    if (!target) return;
    target.textContent = 'Loading support tickets…';
    try {
      const result = await adminCentreApi('/support/tickets?scope=all');
      target.innerHTML = (result.tickets || []).map(ticket =>
        '<article class="settings-ticket"><strong>' + escapeText(ticket.subject) + '</strong><small>' +
        escapeText(ticket.requester?.name || ticket.userId) + ' · ' + escapeText(ticket.category) +
        ' · ' + escapeText(ticket.status) + '</small><div class="settings-ticket-messages">' +
        (ticket.messages || []).map(message => '<p><strong>' + escapeText(message.sender?.name || message.senderId) +
        ':</strong> ' + escapeText(message.message) + '</p>').join('') + '</div>' +
        (ticket.status === 'closed' ? '' : '<form data-admin-moderator-reply="' + escapeText(ticket.id) +
        '"><textarea name="message" maxlength="5000" rows="2" placeholder="Reply to this member"></textarea>' +
        '<select name="status"><option value="waiting_for_member">Waiting for member</option><option value="in_progress">In progress</option>' +
        '<option value="closed">Close ticket</option></select><button class="primary" type="submit">Reply / update</button></form>') +
        '</article>').join('') || '<p class="settings-empty">The support inbox is empty.</p>';
      target.querySelectorAll('[data-admin-moderator-reply]').forEach(form => form.addEventListener('submit', async event => {
        event.preventDefault();
        const values = new FormData(form), button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          const message = String(values.get('message') || '').trim();
          if (message) await adminCentreApi('/support/tickets/' + encodeURIComponent(form.dataset.adminModeratorReply) + '/messages', {
            method:'POST', body:JSON.stringify({message})
          });
          await adminCentreApi('/support/tickets/' + encodeURIComponent(form.dataset.adminModeratorReply), {
            method:'PATCH', body:JSON.stringify({status:values.get('status')})
          });
          await loadAdminSupportInbox(panel);
        } catch (error) { window.alert(error.message); button.disabled = false; }
      }));
    } catch (error) { target.textContent = error.message || 'Support inbox could not be loaded.'; }
  }

  function adminTotpQrSource(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^data:image\/(?:svg\+xml|png|webp);/i.test(raw)) return raw;
    return /^(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(raw)
      ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(raw) : '';
  }

  async function loadAdminSecuritySettings(panel) {
    const status = panel.querySelector('#admin-centre-security-status');
    const factorsPanel = panel.querySelector('#admin-centre-mfa-factors');
    const sessionsPanel = panel.querySelector('#admin-centre-session-list');
    try {
      const result = await adminCentreApi('/security/mfa');
      if (status) status.textContent = result.enabled
        ? (window.__mingloraAdminAccess?.canAccess ? 'Authenticator is enabled and this session is verified.' : 'Authenticator is enabled. Sign in again with a current code to unlock protected actions.')
        : 'Authenticator is not enabled. Set it up here to protect this administrator account.';
      const factors = Array.isArray(result.factors) ? result.factors : [];
      if (factorsPanel) factorsPanel.innerHTML = factors.map(factor =>
        '<div class="admin-centre-factor-row"><strong>' + escapeText(factor.friendlyName || 'Authenticator') +
        '</strong><small>' + escapeText(factor.type || 'TOTP') + ' · ' + escapeText(factor.status || 'unknown') +
        '</small></div>').join('') || '<p class="settings-empty">No authenticator factors enrolled.</p>';
    } catch (error) {
      if (status) status.textContent = error.message || 'Authenticator status is unavailable.';
      if (factorsPanel) factorsPanel.textContent = 'Authenticator details could not be loaded.';
    }
    try {
      const result = await adminCentreApi('/security/sessions');
      const sessions = Array.isArray(result.sessions) ? result.sessions : [];
      if (sessionsPanel) sessionsPanel.innerHTML = sessions.map(session =>
        '<div class="admin-centre-session-row"><div><strong>' + escapeText(session.userAgent || 'Unknown device') +
        (session.current ? ' · This device' : '') + '</strong><small>Last active ' + escapeText(session.lastSeenAt || 'Unknown') +
        ' · Expires ' + escapeText(session.expiresAt || 'Unknown') + '</small></div>' +
        (session.current ? '<span class="settings-current-session">Current</span>' : '<span class="settings-status-pill">Active</span>') +
        '</div>').join('') || '<p class="settings-empty">No active sessions found.</p>';
    } catch (error) { if (sessionsPanel) sessionsPanel.textContent = error.message || 'Active sessions are unavailable.'; }
  }

  async function startAdminMfaEnrollment(panel) {
    const button = panel.querySelector('#admin-centre-enable-mfa');
    const enrollment = panel.querySelector('#admin-centre-mfa-enrollment-panel');
    const status = panel.querySelector('#admin-centre-security-status');
    if (button) button.disabled = true;
    if (status) status.textContent = 'Starting authenticator setup…';
    try {
      const result = await adminCentreApi('/security/mfa/totp/enroll', {method:'POST',body:'{}'});
      const factor = result.factor || {}, totp = result.totp || {};
      const qr = adminTotpQrSource(totp.qr_code || totp.qrCode || totp.qr || '');
      const secret = String(totp.secret || '').trim(), uri = String(totp.uri || '').trim();
      if (!factor.id || (!qr && !secret && !uri)) throw new Error('The provider did not return complete authenticator setup details.');
      enrollment.innerHTML = '<div class="mfa-enrollment"><p>Scan this QR code or enter the setup key in your authenticator app.</p>' +
        (qr ? '<img class="mfa-qr" src="' + escapeText(qr) + '" alt="Authenticator QR code">' : '') +
        (secret ? '<div class="mfa-secret"><small>Authenticator setup key</small><code>' + escapeText(secret) + '</code></div>' : '') +
        (uri ? '<p class="muted">Manual setup URI: ' + escapeText(uri) + '</p>' : '') +
        '<form id="admin-centre-mfa-verify-form"><input type="hidden" name="factorId" value="' + escapeText(factor.id) +
        '"><label class="field"><span>Enter the current 6–8 digit code</span><input name="code" type="text" inputmode="numeric" ' +
        'autocomplete="one-time-code" pattern="[0-9 ]{6,8}" minlength="6" maxlength="8" required></label>' +
        '<p id="admin-centre-mfa-verify-status" role="status"></p><button class="primary" type="submit">Verify authenticator</button></form></div>';
      enrollment.querySelector('#admin-centre-mfa-verify-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget, values = new FormData(form);
        const verifyButton = form.querySelector('button[type="submit"]'), verifyStatus = form.querySelector('#admin-centre-mfa-verify-status');
        verifyButton.disabled = true;
        if (verifyStatus) verifyStatus.textContent = 'Checking your authenticator code…';
        try {
          await adminCentreApi('/security/mfa/totp/verify', {method:'POST',body:JSON.stringify({
            factorId:values.get('factorId'),code:String(values.get('code') || '').replace(/\s/g,'')
          })});
          if (verifyStatus) verifyStatus.textContent = 'Authenticator verified. Refreshing private access…';
          window.location.reload();
        } catch (error) {
          if (verifyStatus) verifyStatus.textContent = error.message || 'The code could not be verified.';
          verifyButton.disabled = false;
        }
      });
      if (status) status.textContent = 'Authenticator enrollment started. Verify the code to complete setup.';
    } catch (error) { if (status) status.textContent = error.message || 'Authenticator setup could not be started.'; }
    finally { if (button) button.disabled = false; }
  }

  async function initializeAdminCentre() {
    const root = document.querySelector('#admin-centre-root');
    if (!root) return;
    root.innerHTML = '<section class="admin-centre-loading"><h2>Verifying private administrator access…</h2><p>This workspace is separate from member Settings.</p></section>';
    try {
      const response = await fetch('/api/admin/access', {credentials:'same-origin',headers:{Accept:'application/json'}});
      const access = await response.json().catch(() => ({}));
      if (!response.ok || (!access.canAccess && !access.setupRequired)) {
        root.innerHTML = '<section class="admin-centre-access-denied"><h2>Private Admin Centre</h2><p>This workspace is available only to the designated Creator Hub administrator. Sign in with that account and try again.</p><a class="secondary" href="/">Return to Minglora</a></section>';
        return;
      }
      window.__mingloraAdminAccess = access;
      addControlCentrePanel();
    } catch (error) {
      root.innerHTML = '<section class="admin-centre-access-denied"><h2>Admin access could not be checked</h2><p>' +
        escapeText(error.message || 'Sign in with the designated administrator account and try again.') +
        '</p><a class="secondary" href="/">Return to Minglora</a></section>';
    }
  }

  if (document.querySelector('#admin-centre-root')) initializeAdminCentre();
  else {
    const observer = new MutationObserver(addProfileEntry);
    observer.observe(document.documentElement, {subtree:true,childList:true});
    addProfileEntry();
  }
})();