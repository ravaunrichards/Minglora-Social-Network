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
      const [result, blockedResult, sessionResult, mfaResult, supportResult, reportResult, moderationAccess] = await Promise.all([
        api('/settings'),api('/blocks'),api('/security/sessions').catch(error=>({error:error.message,sessions:[]})),
        api('/security/mfa').catch(error=>({error:error.message,available:false,factors:[]})),
        api('/support/tickets').catch(error=>({error:error.message,tickets:[]})),
        api('/reports/mine').catch(error=>({error:error.message,reports:[]})),
        api('/moderation/access').catch(()=>({canModerate:false}))
      ]);
      const blockedUsers=blockedResult.users||[],sessions=sessionResult.sessions||[],factors=mfaResult.factors||[],tickets=supportResult.tickets||[],reports=reportResult.reports||[],canModerate=moderationAccess.canModerate===true;
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
            <a href="#settings-account">Account</a><a href="#settings-privacy">Privacy &amp; audience</a><a href="#settings-blocking">Blocking</a>
            <a href="#settings-notifications">Notifications</a><a href="#settings-preferences">Preferences</a><a href="#settings-data">Your information</a>
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
            <section class="card settings-card" id="settings-blocking">
              ${sectionHeading('⊘', 'Blocking', 'Review people you have blocked and remove a block when you are ready.')}
              <div class="settings-blocked-list">
                ${blockedUsers.length ? blockedUsers.map(member => `<div class="settings-blocked-person"><img src="${escapeHtml(member.avatar || '')}" alt=""><div><strong>${escapeHtml(member.name || 'Minglora member')}</strong><small>@${escapeHtml(member.username || '')}</small></div><button class="secondary" type="button" data-unblock-user="${escapeHtml(member.id)}">Unblock</button></div>`).join('') : '<p class="settings-empty">You have not blocked anyone.</p>'}
              </div>
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
            <section class="card settings-card" id="settings-data">
              ${sectionHeading('⇩', 'Your information', 'Download a copy of the information associated with your Minglora account.')}
              <div class="settings-data-export"><div><strong>Download your information</strong><p>Creates a JSON file with your profile, settings, posts, comments, relationships, groups, Pages, Stories, messages and in-app notifications. Passwords, authentication tokens and active session secrets are not included.</p></div><button class="primary" type="button" id="download-account-data">Download information</button></div>
              <div class="settings-unavailable"><strong>Account deletion is not enabled yet.</strong><p>Permanent account deletion needs a verified re-authentication and a coordinated removal process across posts, media, messages, provider identity and retention obligations. Minglora will not pretend to delete an account before that process is implemented.</p></div>
              <p class="settings-data-status" id="account-export-status" role="status"></p>
            </section>
            <section class="card settings-card" id="settings-security">
              ${sectionHeading('▣', 'Security and login', 'Protect your password, sign-in email, authenticator and active sessions.')}
              <form id="security-email-form" class="settings-security-form">
                <h3>Change email address</h3><label class="field"><span>New email address</span><input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="name@example.com"></label><label class="field"><span>Current password</span><input name="currentPassword" type="password" autocomplete="current-password" minlength="10" required></label>
                <button class="secondary" type="submit">Request email change</button><p class="settings-form-status" id="security-email-status" role="status"></p>
              </form>
              <form id="security-password-form" class="settings-security-form">
                <h3>Change password</h3><label class="field"><span>Current password</span><input name="currentPassword" type="password" autocomplete="current-password" required minlength="10"></label>
                <label class="field"><span>New password</span><input name="newPassword" type="password" autocomplete="new-password" required minlength="10" maxlength="1024"></label>
                <label class="field"><span>Confirm new password</span><input name="confirmPassword" type="password" autocomplete="new-password" required minlength="10" maxlength="1024"></label>
                <button class="primary" type="submit">Update password</button><p class="settings-form-status" id="security-password-status" role="status"></p>
              </form>
              <div class="settings-security-form">
                <div class="settings-inline-heading"><h3>Authenticator app (two-factor authentication)</h3><span class="settings-status-pill">${mfaResult.enabled?'Enabled':mfaResult.available?'Not enabled':'Unavailable'}</span></div>
                <p class="muted">Use an authenticator app such as Google Authenticator, Microsoft Authenticator or another TOTP app. Sign-in will ask for its current code.</p>
                <div id="mfa-enrollment-panel"></div>
                <div id="mfa-factors-list">${factors.length?factors.map(factor=>'<div class="settings-blocked-person"><div><strong>'+escapeHtml(factor.friendlyName||'Authenticator')+'</strong><small>'+escapeHtml(factor.type||'TOTP')+' · '+escapeHtml(factor.status||'unknown')+'</small></div><button class="secondary" type="button" data-remove-factor="'+escapeHtml(factor.id)+'">Remove</button></div>').join(''):'<p class="settings-empty">No authenticator factors enrolled.</p>'}</div>
                <button class="secondary" type="button" id="enroll-totp" ${mfaResult.available?'':'disabled'}>Set up authenticator</button>
                <p class="settings-form-status" id="mfa-status" role="status">${escapeHtml(mfaResult.error||'')}</p>
              </div>
              <div class="settings-security-form">
                <div class="settings-inline-heading"><h3>Active sessions</h3><button type="button" class="secondary" id="revoke-other-sessions">Log out other devices</button></div>
                <div id="active-sessions-list">${sessions.map(session=>'<div class="settings-session-row"><div><strong>'+escapeHtml(session.userAgent||'Unknown device')+(session.current?' · This device':'')+'</strong><small>Last active '+escapeHtml(session.lastSeenAt||'')+' · Expires '+escapeHtml(session.expiresAt||'')+'</small></div>'+(session.current?'<span class="settings-current-session">Current</span>':'<button type="button" class="secondary" data-revoke-session="'+escapeHtml(session.id)+'">Revoke</button>')+'</div>').join('')||'<p class="settings-empty">'+escapeHtml(sessionResult.error||'No active sessions found.')+'</p>'}</div>
              </div>
            </section>
            <section class="card settings-card" id="settings-help">
              ${sectionHeading('?', 'Help &amp; support', 'Get help from Minglora and track your existing support conversations.')}
              <form id="support-ticket-form" class="settings-security-form">
                <h3>Contact support</h3>
                <label class="field"><span>What do you need help with?</span><select name="category"><option value="general">General question</option><option value="account">Account</option><option value="security">Security</option><option value="bug">Report a bug</option><option value="abuse">Safety / abuse</option><option value="billing">Billing</option><option value="privacy">Privacy</option></select></label>
                <label class="field"><span>Subject</span><input name="subject" minlength="4" maxlength="120" required></label>
                <label class="field"><span>Message</span><textarea name="message" rows="4" maxlength="5000" required placeholder="Describe what happened and how we can help."></textarea></label>
                <button class="primary" type="submit">Send to support</button><p class="settings-form-status" id="support-create-status" role="status">${escapeHtml(supportResult.error||'')}</p>
              </form>
              <div class="settings-security-form"><h3>Your support conversations</h3><div id="support-tickets-list">${tickets.map(ticket=>'<article class="settings-ticket" data-ticket="'+escapeHtml(ticket.id)+'"><div class="settings-inline-heading"><strong>'+escapeHtml(ticket.subject)+'</strong><span class="settings-status-pill">'+escapeHtml(ticket.status)+'</span></div><small>'+escapeHtml(ticket.category)+' · '+escapeHtml(ticket.createdAt)+'</small><div class="settings-ticket-messages">'+(ticket.messages||[]).map(message=>'<p><strong>'+escapeHtml(message.sender?.name||'Minglora support')+':</strong> '+escapeHtml(message.message)+'</p>').join('')+'</div>'+(ticket.status==='closed'?'':'<form class="support-reply-form" data-reply-ticket="'+escapeHtml(ticket.id)+'"><input name="message" maxlength="5000" required placeholder="Reply to support"><button class="secondary" type="submit">Reply</button></form>')+'</article>').join('')||'<p class="settings-empty">No support tickets yet.</p>'}</div>
              </div>
              <div class="settings-security-form"><h3>Your reports</h3><div id="member-reports-list">${reports.map(report=>'<div class="settings-session-row"><div><strong>'+escapeHtml(report.targetType)+' · '+escapeHtml(report.category)+'</strong><small>'+escapeHtml(report.createdAt)+' · '+escapeHtml(report.status)+'</small></div></div>').join('')||'<p class="settings-empty">You have not submitted any reports.</p>'}</div></div>
              ${canModerate?'<div class="settings-security-form" id="moderation-workspace"><div class="settings-inline-heading"><h3>Moderator queue</h3><button class="secondary" type="button" id="refresh-moderation">Refresh</button></div><div id="moderation-reports-list">Loading reports…</div></div>':''}
              ${canModerate?'<div class="settings-security-form" id="moderator-support-workspace"><div class="settings-inline-heading"><h3>Support inbox</h3><button class="secondary" type="button" id="refresh-support-inbox">Refresh</button></div><div id="moderator-support-tickets">Loading support tickets…</div></div>':''}
            </section>
            <div class="settings-save-bar"><span class="muted">Changes are saved to your Minglora account.</span><button class="primary" type="submit">Save changes</button></div>
          </form>
        </div>`;

      document.querySelectorAll('.settings-nav a').forEach(link => link.addEventListener('click', event => {
        event.preventDefault();
        document.querySelector(link.getAttribute('href'))?.scrollIntoView({ behavior: settings.preferences.reducedMotion ? 'auto' : 'smooth', block: 'start' });
      }));

      document.querySelector('#download-account-data')?.addEventListener('click', async buttonEvent => {
        const button = buttonEvent.currentTarget;
        const status = document.querySelector('#account-export-status');
        button.disabled = true;
        status.textContent = 'Preparing your account export…';
        try {
          const archive = await api('/account/export');
          const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          const date = new Date().toISOString().slice(0, 10);
          link.href = url;
          link.download = `minglora-account-export-${date}.json`;
          document.body.append(link);
          link.click();
          link.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          status.textContent = 'Your account export has been prepared.';
        } catch (error) {
          status.textContent = error.message;
        } finally {
          button.disabled = false;
        }
      });

      document.querySelectorAll('[data-unblock-user]').forEach(button => button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await api('/users/' + encodeURIComponent(button.dataset.unblockUser) + '/block', { method: 'DELETE', body: '{}' });
          window.alert('Member unblocked.');
          await openSettings();
        } catch (error) {
          button.disabled = false;
          window.alert(error.message);
        }
      }));

      document.querySelector('#security-email-form')?.addEventListener('submit',async event=>{
        event.preventDefault();const form=event.currentTarget,status=document.querySelector('#security-email-status'),button=form.querySelector('button[type="submit"]');button.disabled=true;
        try{const values=new FormData(form);const result=await api('/security/email',{method:'POST',body:JSON.stringify({email:values.get('email'),currentPassword:values.get('currentPassword')})});status.textContent=result.message||'Check your new email for a verification link.';form.reset();}
        catch(error){status.textContent=error.message;}
        finally{button.disabled=false;}
      });
      document.querySelector('#security-password-form')?.addEventListener('submit',async event=>{
        event.preventDefault();const form=event.currentTarget,status=document.querySelector('#security-password-status'),button=form.querySelector('button[type="submit"]'),values=new FormData(form);
        if(values.get('newPassword')!==values.get('confirmPassword')){status.textContent='The new passwords do not match.';return;}
        button.disabled=true;
        try{await api('/security/password',{method:'POST',body:JSON.stringify({currentPassword:values.get('currentPassword'),newPassword:values.get('newPassword')})});status.textContent='Password updated successfully.';form.reset();}
        catch(error){status.textContent=error.message;}
        finally{button.disabled=false;}
      });
      document.querySelector('#enroll-totp')?.addEventListener('click',async buttonEvent=>{
        const button=buttonEvent.currentTarget,panel=document.querySelector('#mfa-enrollment-panel'),status=document.querySelector('#mfa-status');button.disabled=true;
        try{
          const result=await api('/security/mfa/totp/enroll',{method:'POST',body:'{}'}),factor=result.factor||{},totp=result.totp||{};
          const qr=String(totp.qr_code||''),secret=String(totp.secret||''),uri=String(totp.uri||'');
          panel.innerHTML='<div class="mfa-enrollment"><p>1. Scan this QR code in your authenticator app, or enter the secret manually.</p>'+(qr.startsWith('data:image/')?'<img class="mfa-qr" src="'+escapeHtml(qr)+'" alt="Authenticator QR code">':'<p class="muted">A QR image was not returned. Use the secret below.</p>')+'<div class="mfa-secret"><small>Authenticator secret</small><code>'+escapeHtml(secret||'Secret not returned')+'</code></div><p class="muted">'+escapeHtml(uri)+'</p><form id="mfa-verify-form"><input type="hidden" name="factorId" value="'+escapeHtml(factor.id||'')+'"><label class="field"><span>2. Enter the 6-digit verification code</span><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,8}" required></label><button class="primary" type="submit">Verify and enable two-factor authentication</button></form></div>';
          panel.querySelector('#mfa-verify-form')?.addEventListener('submit',async formEvent=>{
            formEvent.preventDefault();const verifyButton=formEvent.currentTarget.querySelector('button[type="submit"]');verifyButton.disabled=true;
            try{const data=new FormData(formEvent.currentTarget);await api('/security/mfa/totp/verify',{method:'POST',body:JSON.stringify({factorId:data.get('factorId'),code:data.get('code')})});window.alert('Two-factor authentication is enabled. You will need an authenticator code at your next sign-in.');await openSettings();}
            catch(error){status.textContent=error.message;verifyButton.disabled=false;}
          });
          status.textContent='Authenticator enrollment started. Verify the code to finish setup.';
        }catch(error){status.textContent=error.message;}
        finally{button.disabled=false;}
      });
      document.querySelectorAll('[data-remove-factor]').forEach(button=>button.addEventListener('click',async()=>{
        if(!window.confirm('Remove this authenticator factor? This reduces your sign-in protection.'))return;
        button.disabled=true;
        try{await api('/security/mfa/factors/'+encodeURIComponent(button.dataset.removeFactor),{method:'DELETE',body:'{}'});await openSettings();}
        catch(error){window.alert(error.message);button.disabled=false;}
      }));
      document.querySelector('#revoke-other-sessions')?.addEventListener('click',async buttonEvent=>{
        const button=buttonEvent.currentTarget;if(!window.confirm('Log out all Minglora sessions except this device?'))return;button.disabled=true;
        try{await api('/security/sessions/revoke-others',{method:'POST',body:'{}'});await openSettings();}
        catch(error){window.alert(error.message);button.disabled=false;}
      });
      document.querySelectorAll('[data-revoke-session]').forEach(button=>button.addEventListener('click',async()=>{
        if(!window.confirm('Revoke this device session?'))return;button.disabled=true;
        try{await api('/security/sessions/'+encodeURIComponent(button.dataset.revokeSession),{method:'DELETE',body:'{}'});await openSettings();}
        catch(error){window.alert(error.message);button.disabled=false;}
      }));
      document.querySelector('#support-ticket-form')?.addEventListener('submit',async event=>{
        event.preventDefault();const form=event.currentTarget,status=document.querySelector('#support-create-status'),button=form.querySelector('button[type="submit"]'),values=new FormData(form);button.disabled=true;
        try{await api('/support/tickets',{method:'POST',body:JSON.stringify({category:values.get('category'),subject:values.get('subject'),message:values.get('message')})});await openSettings();}
        catch(error){status.textContent=error.message;button.disabled=false;}
      });
      document.querySelectorAll('[data-reply-ticket]').forEach(form=>form.addEventListener('submit',async event=>{
        event.preventDefault();const values=new FormData(form),button=form.querySelector('button[type="submit"]');button.disabled=true;
        try{await api('/support/tickets/'+encodeURIComponent(form.dataset.replyTicket)+'/messages',{method:'POST',body:JSON.stringify({message:values.get('message')})});await openSettings();}
        catch(error){window.alert(error.message);button.disabled=false;}
      }));
      async function loadModeratorSupportInbox(){
        const panel=document.querySelector('#moderator-support-tickets');if(!panel)return;panel.textContent='Loading support tickets…';
        try{
          const result=await api('/support/tickets?scope=all');
          panel.innerHTML=(result.tickets||[]).map(ticket=>'<article class="settings-ticket"><div class="settings-inline-heading"><div><strong>'+escapeHtml(ticket.subject)+'</strong><small>'+escapeHtml(ticket.requester?.name||ticket.userId)+' · '+escapeHtml(ticket.category)+'</small></div><span class="settings-status-pill">'+escapeHtml(ticket.status)+'</span></div><div class="settings-ticket-messages">'+(ticket.messages||[]).map(message=>'<p><strong>'+escapeHtml(message.sender?.name||message.senderId)+':</strong> '+escapeHtml(message.message)+'</p>').join('')+'</div>'+(ticket.status==='closed'?'':'<form class="moderator-ticket-reply" data-moderator-reply="'+escapeHtml(ticket.id)+'"><textarea name="message" maxlength="5000" rows="2" required placeholder="Reply to this member"></textarea><select name="status"><option value="waiting_for_member">Waiting for member</option><option value="in_progress">In progress</option><option value="closed">Close ticket</option></select><button class="primary" type="submit">Reply</button></form>')+'</article>').join('')||'<p class="settings-empty">The support inbox is empty.</p>';
          panel.querySelectorAll('[data-moderator-reply]').forEach(form=>form.addEventListener('submit',async event=>{
            event.preventDefault();const values=new FormData(form),button=form.querySelector('button[type="submit"]');button.disabled=true;
            try{
              const message=String(values.get('message')||'').trim();
              if(message)await api('/support/tickets/'+encodeURIComponent(form.dataset.moderatorReply)+'/messages',{method:'POST',body:JSON.stringify({message})});
              await api('/support/tickets/'+encodeURIComponent(form.dataset.moderatorReply),{method:'PATCH',body:JSON.stringify({status:values.get('status')})});
              await loadModeratorSupportInbox();
            }catch(error){window.alert(error.message);button.disabled=false;}
          }));
        }catch(error){panel.textContent=error.message;}
      }
      document.querySelector('#refresh-support-inbox')?.addEventListener('click',loadModeratorSupportInbox);
      async function loadModerationQueue(){
        const panel=document.querySelector('#moderation-reports-list');if(!panel)return;panel.textContent='Loading reports…';
        try{
          const result=await api('/moderation/reports?status=open');
          panel.innerHTML=(result.reports||[]).map(report=>{
            const actions=report.targetType==='post'?'<option value="hide_post">Hide post</option><option value="remove_post">Remove post</option>':report.targetType==='story'?'<option value="remove_story">Remove story</option>':report.targetType==='user'?'<option value="suspend_account">Suspend account</option>':'';
            return '<article class="moderation-report"><div class="settings-inline-heading"><strong>'+escapeHtml(report.targetType)+' · '+escapeHtml(report.category)+'</strong><span class="settings-status-pill">'+escapeHtml(report.status)+'</span></div><p>'+escapeHtml(report.details||'No extra details')+'</p><small>Reporter: '+escapeHtml(report.reporter?.username||'member')+' · Target owner: '+escapeHtml(report.targetOwner?.username||'unknown')+'</small><form class="moderation-report-form" data-moderate-report="'+escapeHtml(report.id)+'"><select name="status"><option value="triaged">Mark in review</option><option value="actioned">Mark actioned</option><option value="dismissed">Dismiss</option><option value="open">Keep open</option></select><select name="action"><option value="">No content action</option>'+actions+'</select><button class="primary" type="submit">Apply</button></form></article>';
          }).join('')||'<p class="settings-empty">No open reports.</p>';
          panel.querySelectorAll('[data-moderate-report]').forEach(form=>form.addEventListener('submit',async event=>{
            event.preventDefault();const values=new FormData(form),button=form.querySelector('button[type="submit"]');button.disabled=true;
            try{await api('/moderation/reports/'+encodeURIComponent(form.dataset.moderateReport),{method:'PATCH',body:JSON.stringify({status:values.get('status'),action:values.get('action')||null})});await loadModerationQueue();}
            catch(error){window.alert(error.message);button.disabled=false;}
          }));
        }catch(error){panel.textContent=error.message;}
      }
      document.querySelector('#refresh-moderation')?.addEventListener('click',loadModerationQueue);
      if(canModerate){loadModerationQueue();loadModeratorSupportInbox();}
      
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
