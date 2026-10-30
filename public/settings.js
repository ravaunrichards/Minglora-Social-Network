(() => {
  const defaults = {
    privacy: { profileVisibility: 'public', allowFriendRequests: true, messageAudience: 'everyone' },
    notifications: { inApp: true, friendRequests: true, messages: true, interactions: true },
    preferences: { theme: 'system', feedSort: 'recent', reducedMotion: false }
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));

  async function api(path, options = {}) {
    const response = await fetch('/api' + path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    return payload;
  }

  function applyPreferences(settings) {
    const preferences = settings?.preferences || defaults.preferences;
    document.body.classList.toggle('theme-dark', preferences.theme === 'dark');
    document.body.classList.toggle('theme-system', preferences.theme === 'system');
    document.body.classList.toggle('reduce-motion', preferences.reducedMotion === true);
  }

  function sectionHeading(icon, title, description) {
    return `<div class="settings-section-title"><span class="settings-icon">${icon}</span><div><h2>${title}</h2><p>${description}</p></div></div>`;
  }

  async function openSettings() {
    const main = document.querySelector('#main-content');
    if (!main) return;
    main.innerHTML = '<section class="card empty-state"><h3>Loading Settings &amp; privacy…</h3></section>';
    try {
      const result = await api('/settings');
      const settings = {
        privacy: { ...defaults.privacy, ...(result.settings?.privacy || {}) },
        notifications: { ...defaults.notifications, ...(result.settings?.notifications || {}) },
        preferences: { ...defaults.preferences, ...(result.settings?.preferences || {}) }
      };
      applyPreferences(settings);
      window.dispatchEvent(new CustomEvent('minglora:settings-loaded', { detail: settings }));
      main.innerHTML = `
        <div class="settings-heading">
          <div><p class="settings-eyebrow">YOUR ACCOUNT</p><h1>Settings &amp; privacy</h1>
          <p class="muted">Manage your Minglora account, audience, notifications and experience.</p></div>
        </div>
        <div class="settings-layout">
          <nav class="settings-nav" aria-label="Settings categories">
            <a href="#settings-account">Account</a><a href="#settings-privacy">Privacy &amp; audience</a>
            <a href="#settings-notifications">Notifications</a><a href="#settings-preferences">Preferences</a>
            <a href="#settings-security">Security</a><a href="#settings-help">Help &amp; support</a>
          </nav>
          <form id="settings-form" class="settings-panels">
            <section class="card settings-card" id="settings-account">
              ${sectionHeading('◉', 'Account information', 'Review the account identity associated with your session.')}
              <div class="settings-readonly-grid">
                <div><small>Display name</small><strong>${escapeHtml(result.account?.name || 'Not available')}</strong></div>
                <div><small>Username</small><strong>@${escapeHtml(result.account?.username || '')}</strong></div>
                <div><small>Email address</small><strong>${escapeHtml(result.account?.email || 'Not available')}</strong></div>
              </div>
              <p class="settings-note">Edit your public name, biography and location from your profile's Edit profile control. Email changes require a secure authentication-provider flow and are not enabled here.</p>
            </section>
            <section class="card settings-card" id="settings-privacy">
              ${sectionHeading('◈', 'Privacy &amp; audience', 'Control who can discover your profile and contact you.')}
              <label class="settings-field"><span><strong>Profile visibility</strong><small>Friends-only and private profiles are filtered by the server in profile discovery, search and feed results.</small></span>
                <select name="profileVisibility"><option value="public" ${settings.privacy.profileVisibility === 'public' ? 'selected' : ''}>Public</option><option value="friends" ${settings.privacy.profileVisibility === 'friends' ? 'selected' : ''}>Friends only</option><option value="private" ${settings.privacy.profileVisibility === 'private' ? 'selected' : ''}>Private</option></select>
              </label>
              <label class="settings-toggle"><span><strong>Allow friend requests</strong><small>Let other members send you friend requests.</small></span><input type="checkbox" name="allowFriendRequests" ${settings.privacy.allowFriendRequests ? 'checked' : ''}></label>
              <label class="settings-field"><span><strong>Who can message you?</strong><small>Choose who can start a new direct conversation.</small></span>
                <select name="messageAudience"><option value="everyone" ${settings.privacy.messageAudience === 'everyone' ? 'selected' : ''}>Everyone</option><option value="friends" ${settings.privacy.messageAudience === 'friends' ? 'selected' : ''}>Friends only</option><option value="nobody" ${settings.privacy.messageAudience === 'nobody' ? 'selected' : ''}>Nobody new</option></select>
              </label>
            </section>
            <section class="card settings-card" id="settings-notifications">
              ${sectionHeading('♢', 'Notifications', 'Choose which activity appears in the Minglora notification centre.')}
              <label class="settings-toggle"><span><strong>In-app notifications</strong><small>Master switch for notifications inside Minglora.</small></span><input type="checkbox" name="notificationInApp" ${settings.notifications.inApp ? 'checked' : ''}></label>
              <label class="settings-toggle"><span><strong>Friend requests</strong><small>Notifications when someone requests or confirms a friendship.</small></span><input type="checkbox" name="notificationFriendRequests" ${settings.notifications.friendRequests ? 'checked' : ''}></label>
              <label class="settings-toggle"><span><strong>Messages</strong><small>Notifications when someone sends you a message.</small></span><input type="checkbox" name="notificationMessages" ${settings.notifications.messages ? 'checked' : ''}></label>
              <label class="settings-toggle"><span><strong>Post interactions</strong><small>Notifications for reactions, comments and new followers.</small></span><input type="checkbox" name="notificationInteractions" ${settings.notifications.interactions ? 'checked' : ''}></label>
            </section>
            <section class="card settings-card" id="settings-preferences">
              ${sectionHeading('☼', 'Preferences', 'Personalize the appearance and default feed order on your account.')}
              <label class="settings-field"><span><strong>Appearance</strong><small>Choose the theme used by Minglora.</small></span>
                <select name="theme"><option value="system" ${settings.preferences.theme === 'system' ? 'selected' : ''}>Use device setting</option><option value="light" ${settings.preferences.theme === 'light' ? 'selected' : ''}>Light</option><option value="dark" ${settings.preferences.theme === 'dark' ? 'selected' : ''}>Dark</option></select>
              </label>
              <label class="settings-field"><span><strong>Default feed order</strong><small>Choose which posts appear first when you open the feed.</small></span>
                <select name="feedSort"><option value="recent" ${settings.preferences.feedSort === 'recent' ? 'selected' : ''}>Most recent</option><option value="oldest" ${settings.preferences.feedSort === 'oldest' ? 'selected' : ''}>Oldest first</option></select>
              </label>
              <label class="settings-toggle"><span><strong>Reduce motion</strong><small>Reduce interface animations and transitions.</small></span><input type="checkbox" name="reducedMotion" ${settings.preferences.reducedMotion ? 'checked' : ''}></label>
            </section>
            <section class="card settings-card" id="settings-security">
              ${sectionHeading('▣', 'Security and login', 'Account protection controls.')}
              <div class="settings-unavailable"><strong>Additional security controls are not connected yet.</strong><p>Password changes, two-factor authentication, active-session management and account recovery must be implemented through the authenticated account provider before they can safely be enabled here.</p></div>
            </section>
            <section class="card settings-card" id="settings-help">
              ${sectionHeading('?', 'Help &amp; support', 'Support and safety resources.')}
              <div class="settings-unavailable"><strong>Support centre integration is still pending.</strong><p>Reporting, appeals, help articles and support requests need their own working service and moderation workflows.</p></div>
            </section>
            <div class="settings-save-bar"><span class="muted">Changes are saved to your Minglora account.</span><button class="primary" type="submit">Save changes</button></div>
          </form>
        </div>`;

      document.querySelectorAll('.settings-nav a').forEach(link => link.addEventListener('click', event => {
        event.preventDefault();
        document.querySelector(link.getAttribute('href'))?.scrollIntoView({ behavior: settings.preferences.reducedMotion ? 'auto' : 'smooth', block: 'start' });
      }));

      document.querySelector('#settings-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const payload = {
          privacy: {
            profileVisibility: formData.get('profileVisibility'),
            allowFriendRequests: formData.has('allowFriendRequests'),
            messageAudience: formData.get('messageAudience')
          },
          notifications: {
            inApp: formData.has('notificationInApp'),
            friendRequests: formData.has('notificationFriendRequests'),
            messages: formData.has('notificationMessages'),
            interactions: formData.has('notificationInteractions')
          },
          preferences: {
            theme: formData.get('theme'),
            feedSort: formData.get('feedSort'),
            reducedMotion: formData.has('reducedMotion')
          }
        };
        const button = event.currentTarget.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
          const saved = await api('/settings', { method: 'PATCH', body: JSON.stringify(payload) });
          applyPreferences(saved.settings);
          window.dispatchEvent(new CustomEvent('minglora:settings-loaded', { detail: saved.settings }));
          button.textContent = 'Saved';
          const status = document.createElement('p');
          status.className = 'settings-save-status';
          status.setAttribute('role', 'status');
          status.textContent = 'Your settings have been saved.';
          event.currentTarget.querySelector('.settings-save-status')?.remove();
          event.currentTarget.querySelector('.settings-save-bar')?.prepend(status);
        } catch (error) {
          window.alert(error.message);
        } finally {
          button.disabled = false;
          button.textContent = 'Save changes';
        }
      });
    } catch (error) {
      main.innerHTML = `<section class="card empty-state"><h3>Settings could not be loaded</h3><p>${escapeHtml(error.message)}</p><button class="primary" id="retry-settings">Try again</button></section>`;
      document.querySelector('#retry-settings')?.addEventListener('click', openSettings);
    }
  }

  window.MingloraSettings = { open: openSettings };
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('#settings-btn')?.addEventListener('click', openSettings);
    document.querySelector('#rail-settings')?.addEventListener('click', openSettings);
    window.addEventListener('minglora:session-ready', async () => { try { const result = await api('/settings'); applyPreferences(result.settings); window.dispatchEvent(new CustomEvent('minglora:settings-loaded', { detail: result.settings })); } catch {} });
  });
})();
