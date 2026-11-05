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
        <section class="admin-member-promotions" aria-labelledby="admin-member-promotions-title">
          <div class="admin-member-promotions-heading">
            <div>
              <strong id="admin-member-promotions-title">Member promotional Coins</strong>
              <p>Choose each recipient and the exact amount yourself. No Coins are sent automatically when a person registers.</p>
            </div>
          </div>
          <form id="admin-member-promotion-form" class="admin-marketing-form">
            <strong>Send a promotion to one member</strong>
            <label for="admin-member-promotion-username">Member username</label>
            <input id="admin-member-promotion-username" name="memberUsername" type="text" maxlength="31" autocomplete="off" placeholder="@username" required>
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
    const promotionHistoryList = panel.querySelector('#admin-member-promotion-history-list');
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
      const memberInput = form.querySelector('#admin-member-promotion-username');
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
      } catch (error) {
        if (status) status.textContent = error.message || 'Promotional Coins could not be sent.';
      } finally {
        if (submit) submit.disabled = false;
      }
    });

    const money = minor => 'USD     const budgetSummary = panel.querySelector('#admin-marketing-budget-summary');
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
})(); + (Number(minor || 0) / 100).toLocaleString(undefined, {minimumFractionDigits:2,maximumFractionDigits:2});
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
})(); + (Number(minor || 0) / 100).toFixed(2);
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
})(); + (Number(minor || 0) / 100).toLocaleString(undefined, {minimumFractionDigits:2,maximumFractionDigits:2});
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