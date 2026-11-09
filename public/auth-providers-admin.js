(()=>{
  const root=document.querySelector('#admin-centre-root');
  if(!root)return;
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let busy=false;
  let panel=null;
  const api=async(method='GET',payload=null)=>{
    const response=await fetch('/api/admin/auth-providers',{
      method,credentials:'same-origin',cache:'no-store',
      headers:{Accept:'application/json',...(payload?{'Content-Type':'application/json'}:{})},
      ...(payload?{body:JSON.stringify(payload)}:{})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Authentication provider settings could not be loaded.');
    return data;
  };
  const mount=()=>{
    if(panel||!window.__mingloraAdminAccess?.canAccess)return;
    const settings=document.querySelector('#admin-centre-settings');
    if(!settings)return;
    panel=document.createElement('section');
    panel.className='admin-control-centre-section admin-auth-provider-section';
    panel.id='admin-auth-provider-settings';
    panel.innerHTML=
      '<div class="admin-control-centre-section-heading"><div><h3>Supabase Auth providers</h3><p>Manage each sign-in method independently. Provider secrets remain on Supabase and are never displayed in this panel.</p></div>' +
      '<button type="button" class="secondary" id="admin-auth-provider-refresh">Refresh status</button></div>' +
      '<p class="admin-auth-provider-status" id="admin-auth-provider-status" role="status" aria-live="polite">Loading provider configuration…</p>' +
      '<div id="admin-auth-provider-groups" class="admin-auth-provider-groups"></div>' +
      '<p class="admin-auth-provider-footnote">Enabling a provider requires its provider-side client credentials and callback configuration to already be saved in Supabase. Disabling a provider changes only that provider’s enabled flag. Email, SMTP, redirect URLs, password policy, MFA, sessions, and all unrelated Supabase Auth settings are preserved.</p>';
    settings.after(panel);
    panel.querySelector('#admin-auth-provider-refresh')?.addEventListener('click',()=>load());
    void load();
  };
  const render=providers=>{
    const groups=new Map();
    for(const provider of providers){
      if(!groups.has(provider.category))groups.set(provider.category,[]);
      groups.get(provider.category).push(provider);
    }
    const container=panel.querySelector('#admin-auth-provider-groups');
    container.innerHTML=[...groups.entries()].map(([category,items])=>
      '<section class="admin-auth-provider-group"><h4>'+escapeHtml(category)+'</h4><div class="admin-auth-provider-grid">'+
      items.map(provider=>{
        const disabled=(provider.locked&&!provider.enabled)||(!provider.configured&&!provider.enabled);
        const status=provider.locked?'Plan restricted':provider.enabled?(provider.configured?'Enabled · ready':'Enabled · needs credentials'):(provider.configured?'Disabled · ready to enable':'Disabled · needs setup');
        const detail=provider.reason||provider.note||'Provider credentials are configured in Supabase.';
        const action=provider.enabled?'Disable':'Enable';
        const actionAccessibleName=action+' '+provider.label+' sign-in';
        return '<article class="admin-auth-provider-card"><div class="admin-auth-provider-copy"><strong>'+escapeHtml(provider.label)+'</strong><span class="admin-auth-provider-state '+(provider.enabled?'is-enabled':provider.locked?'is-locked':'')+'">'+escapeHtml(status)+'</span><small>'+escapeHtml(detail)+'</small></div>'+
          '<button type="button" class="admin-auth-provider-action" data-provider="'+escapeHtml(provider.id)+'" data-enabled="'+(provider.enabled?'true':'false')+'" data-provider-label="'+escapeHtml(provider.label)+'" aria-label="'+escapeHtml(actionAccessibleName)+'" '+(disabled?'disabled':'')+'>'+action+'</button></article>';
      }).join('')+'</div></section>'
    ).join('');
    container.querySelectorAll('button[data-provider]').forEach(button=>{
      button.addEventListener('click',async()=>{
        if(button.disabled)return;
        const provider=button.dataset.provider;
        const providerLabel=button.dataset.providerLabel||provider.replace(/_/g,' ');
        const enabled=button.dataset.enabled!=='true';
        button.disabled=true;
        const status=panel.querySelector('#admin-auth-provider-status');
        if(status)status.textContent='Saving '+providerLabel+' sign-in setting…';
        try{
          await api('PATCH',{provider,enabled});
          await load();
        }catch(error){
          if(status)status.textContent=error.message||'Provider setting could not be saved.';
          button.disabled=false;
        }
      });
    });
  };
  const load=async()=>{
    if(busy||!panel)return;
    busy=true;
    const status=panel.querySelector('#admin-auth-provider-status');
    const refresh=panel.querySelector('#admin-auth-provider-refresh');
    if(refresh)refresh.disabled=true;
    if(status)status.textContent='Loading the current Supabase Auth provider settings…';
    try{
      const data=await api();
      render(Array.isArray(data.providers)?data.providers:[]);
      const enabled=(data.providers||[]).filter(item=>item.enabled).length;
      if(status)status.textContent='Connected to Minglora Supabase project '+data.projectRef+' · '+enabled+' provider(s) currently enabled.';
    }catch(error){
      if(status)status.textContent=error.message||'Provider configuration is unavailable.';
      const groups=panel.querySelector('#admin-auth-provider-groups');
      if(groups)groups.innerHTML='<div class="admin-auth-provider-error">Check the Render SUPABASE_ACCESS_TOKEN setting and its Supabase project permissions, then refresh this panel.</div>';
    }finally{
      busy=false;
      if(refresh)refresh.disabled=false;
    }
  };
  const observer=new MutationObserver(mount);
  observer.observe(root,{childList:true,subtree:true});
  mount();
})();
