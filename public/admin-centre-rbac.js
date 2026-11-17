(()=> {
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
  const roleLabel = key => String(key || '').replace(/_/g,' ').replace(/\b\w/g,ch=>ch.toUpperCase());

  async function mount(panel, api) {
    if (!panel || panel.querySelector('#admin-rbac-management')) return;
    const section=document.createElement('section');
    section.id='admin-rbac-management';
    section.className='admin-control-centre-section admin-rbac-section';
    section.innerHTML=`
      <div class="admin-control-centre-section-heading">
        <div><h3>Administrator roles &amp; permissions</h3>
        <p>Manage delegated administrator access. Creator Hub remains the sole protected platform owner.</p></div>
        <button type="button" class="secondary" id="admin-rbac-refresh">Refresh access list</button>
      </div>
      <div class="admin-rbac-owner-note"><strong>Owner protection is active.</strong> The sole owner cannot be assigned, demoted, deactivated or revoked through this workspace. All delegated accounts require a confirmed Minglora email and MFA.</div>
      <div id="admin-rbac-status" class="admin-rbac-status" role="status" aria-live="polite">Loading the permission catalogue…</div>
      <div class="admin-rbac-assignment-grid">
        <div class="admin-rbac-card">
          <h4>Grant delegated access</h4>
          <form id="admin-rbac-grant-form">
            <label for="admin-rbac-email">Existing Minglora account email</label>
            <input id="admin-rbac-email" name="email" type="email" autocomplete="off" maxlength="254" required>
            <label for="admin-rbac-role">Administrator role</label>
            <select id="admin-rbac-role" name="role" required><option value="">Loading assignable roles…</option></select>
            <label for="admin-rbac-reason">Reason for access</label>
            <textarea id="admin-rbac-reason" name="reason" rows="3" minlength="5" maxlength="1000" required></textarea>
            <button type="submit" class="primary" id="admin-rbac-grant-submit">Grant role</button>
          </form>
          <p class="admin-rbac-hint">Only existing, email-confirmed Minglora accounts with a profile can be assigned. This does not create a user or a Supabase Auth account.</p>
        </div>
        <div class="admin-rbac-card">
          <h4>Role catalogue</h4>
          <div id="admin-rbac-role-catalogue" class="admin-rbac-role-catalogue"><p>Loading role definitions…</p></div>
        </div>
      </div>
      <div class="admin-rbac-card">
        <h4>Current administrator assignments</h4>
        <div id="admin-rbac-staff-list" class="admin-rbac-staff-list"><p>Loading assignments…</p></div>
      </div>
      <div class="admin-rbac-card">
        <h4>Recent permission audit</h4>
        <div id="admin-rbac-audit-list" class="admin-rbac-audit-list"><p>Loading audit records…</p></div>
      </div>`;
    panel.append(section);

    const status=section.querySelector('#admin-rbac-status');
    const roleSelect=section.querySelector('#admin-rbac-role');
    const staffList=section.querySelector('#admin-rbac-staff-list');
    const auditList=section.querySelector('#admin-rbac-audit-list');
    const catalogue=section.querySelector('#admin-rbac-role-catalogue');
    const refresh=async()=>{
      status.textContent='Checking protected role assignments…';
      try{
        const data=await api('/admin/rbac');
        const roles=Array.isArray(data.roles)?data.roles:[];
        const staff=Array.isArray(data.staff)?data.staff:[];
        const audits=Array.isArray(data.audit)?data.audit:[];
        const assignable=roles.filter(role=>role.assignable===true&&role.key!=='super_administrator');
        roleSelect.innerHTML='<option value="">Choose a role</option>'+assignable.map(role=>'<option value="'+escapeHtml(role.key)+'">'+escapeHtml(role.name)+'</option>').join('');
        catalogue.innerHTML=roles.map(role=>'<article class="admin-rbac-role-row"><div><strong>'+escapeHtml(role.name)+'</strong><p>'+escapeHtml(role.description)+'</p><small>'+escapeHtml((role.permissions||[]).join(' · '))+'</small></div><span class="admin-rbac-role-state">'+(role.assignable?'Assignable':'Reserved · not assignable')+'</span></article>').join('');
        staffList.innerHTML=staff.length?staff.map(member=>{
          const owner=member.role==='owner';
          const state=member.active?'Active':'Inactive';
          return '<article class="admin-rbac-staff-row"><div><strong>'+escapeHtml(member.displayName||member.username||member.email||'Minglora account')+'</strong><p>'+escapeHtml(member.email||'')+' · '+escapeHtml(roleLabel(member.role))+' · '+state+'</p><small>'+escapeHtml((member.permissions||[]).join(' · '))+'</small></div><div class="admin-rbac-row-actions">'+(owner?'<span class="admin-rbac-owner-pill">Protected sole owner</span>':member.active?'<button type="button" class="secondary admin-rbac-revoke" data-email="'+escapeHtml(member.email||'')+'">Revoke access</button>':'<span class="admin-rbac-role-state">Inactive</span>')+'</div></article>';
        }).join(''):'<p>No administrator assignments were returned.</p>';
        auditList.innerHTML=audits.length?audits.map(record=>'<article class="admin-rbac-audit-row"><strong>'+escapeHtml(record.action==='staff.granted'?'Access granted':'Access revoked')+'</strong><p>Target: '+escapeHtml(record.targetUserId)+' · '+escapeHtml(record.reason)+'</p><small>'+escapeHtml(record.createdAt?new Date(record.createdAt).toLocaleString():'Time unavailable')+'</small></article>').join(''):'<p>No permission changes have been recorded.</p>';
        status.textContent='Permission catalogue loaded. '+staff.length+' administrator record(s). Existing assignments are shown as stored.';
      }catch(error){
        status.textContent=error.message||'The administrator permission catalogue is unavailable. Apply the reviewed database migration before enabling this workspace.';
        staffList.innerHTML='<p>Assignments could not be loaded.</p>';
        auditList.innerHTML='<p>Audit records could not be loaded.</p>';
        catalogue.innerHTML='<p>Role definitions are not available yet.</p>';
      }
    };
    section.querySelector('#admin-rbac-refresh').addEventListener('click',refresh);
    section.querySelector('#admin-rbac-grant-form').addEventListener('submit',async event=>{
      event.preventDefault();
      const form=event.currentTarget;
      const submit=section.querySelector('#admin-rbac-grant-submit');
      const formData=new FormData(form);
      const payload={email:String(formData.get('email')||'').trim().toLowerCase(),role:String(formData.get('role')||''),reason:String(formData.get('reason')||'').trim()};
      if(!payload.email||!payload.role||payload.reason.length<5){status.textContent='Enter an existing account email, a role and a reason of at least five characters.';return;}
      submit.disabled=true;
      try{
        await api('/admin/rbac',{method:'POST',body:JSON.stringify({rbacAction:'grant',payload})});
        form.reset();
        status.textContent='Delegated role granted and recorded in the administrator audit.';
        await refresh();
      }catch(error){status.textContent=error.message||'The administrator role could not be granted.';}
      finally{submit.disabled=false;}
    });
    staffList.addEventListener('click',async event=>{
      const button=event.target.closest('.admin-rbac-revoke');
      if(!button)return;
      const reason=window.prompt('Enter the reason for revoking this administrator access (at least 5 characters):');
      if(reason===null)return;
      if(reason.trim().length<5){status.textContent='A reason of at least five characters is required.';return;}
      button.disabled=true;
      try{
        await api('/admin/rbac',{method:'POST',body:JSON.stringify({rbacAction:'revoke',payload:{email:button.dataset.email,reason:reason.trim()}})});
        status.textContent='Administrator access revoked and audit recorded.';
        await refresh();
      }catch(error){status.textContent=error.message||'Administrator access could not be revoked.';button.disabled=false;}
    });
    await refresh();
  }
  window.MingloraAdminRbac=Object.freeze({mount});
})();