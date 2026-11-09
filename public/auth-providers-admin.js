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
  const setStatus=message=>{
    const status=panel?.querySelector('#admin-auth-provider-status');
    if(status)status.textContent=message;
  };
  const setupField=(field)=>{
    const type=field.type==='password'?'password':'text';
    const requirement=field.required&&!field.configured;
    const saved=field.configured?'<small class="admin-auth-provider-field-note">Already saved in Supabase. Leave blank to keep it, or enter a replacement.</small>':'';
    return '<label class="admin-auth-provider-field"><span>'+escapeHtml(field.label)+(requirement?' *':'')+'</span>'+
      '<input data-config-key="'+escapeHtml(field.key)+'" type="'+type+'" '+(requirement?'required ':'')+
      'autocomplete="'+(type==='password'?'new-password':'off')+'" maxlength="4096" placeholder="'+(field.configured?'Saved — leave blank to keep':'Enter '+escapeHtml(field.label.toLowerCase()))+'">'+saved+'</label>';
  };
  const smsFieldCatalog={
    twilio:[
      {key:'sms_twilio_account_sid',label:'Twilio Account SID',type:'text',required:true},
      {key:'sms_twilio_auth_token',label:'Twilio Auth Token',type:'password',required:true},
      {key:'sms_twilio_message_service_sid',label:'Messaging Service SID (optional)',type:'text',required:false}
    ],
    vonage:[
      {key:'sms_vonage_api_key',label:'Vonage API Key',type:'text',required:true},
      {key:'sms_vonage_api_secret',label:'Vonage API Secret',type:'password',required:true},
      {key:'sms_vonage_from',label:'Sender ID / From',type:'text',required:true}
    ],
    messagebird:[
      {key:'sms_messagebird_access_key',label:'MessageBird Access Key',type:'password',required:true},
      {key:'sms_messagebird_originator',label:'Originator (optional)',type:'text',required:false}
    ],
    textlocal:[
      {key:'sms_textlocal_api_key',label:'Textlocal API Key',type:'password',required:true},
      {key:'sms_textlocal_sender',label:'Sender ID (optional)',type:'text',required:false}
    ]
  };
  const smsFieldsMarkup=(provider,currentFields=[])=>{
    const saved=new Map(currentFields.map(field=>[field.key,field]));
    return (smsFieldCatalog[provider]||[]).map(field=>{
      const existing=saved.get(field.key);
      const configured=Boolean(existing?.configured);
      const required=field.required&&!configured;
      return '<label class="admin-auth-provider-field"><span>'+escapeHtml(field.label)+(required?' *':'')+'</span>'+
        '<input data-config-key="'+field.key+'" type="'+field.type+'" '+(required?'required ':'')+
        'autocomplete="'+(field.type==='password'?'new-password':'off')+'" maxlength="4096" placeholder="'+(configured?'Saved — leave blank to keep':'Enter '+escapeHtml(field.label.toLowerCase()))+'">'+
        (configured?'<small class="admin-auth-provider-field-note">Already saved in Supabase. Leave blank to keep it.</small>':'')+
        '</label>';
    }).join('');
  };
  const setupMarkup=provider=>{
    if(provider.id==='phone'){
      const selected=provider.smsProvider||'twilio';
      const options=['twilio','vonage','messagebird','textlocal'].map(value=>'<option value="'+value+'" '+(selected===value?'selected':'')+'>'+({twilio:'Twilio',vonage:'Vonage',messagebird:'MessageBird',textlocal:'Textlocal'}[value])+'</option>').join('');
      return '<form class="admin-auth-provider-setup" data-provider-setup="'+escapeHtml(provider.id)+'">'+
        '<div class="admin-auth-provider-setup-heading"><strong>Configure SMS gateway</strong><small>Credentials are sent to Minglora’s server and saved directly in Supabase. They are never displayed again.</small></div>'+
        '<label class="admin-auth-provider-field"><span>SMS provider *</span><select data-sms-provider required>'+options+'</select></label>'+
        '<div class="admin-auth-provider-fields" data-sms-fields>'+smsFieldsMarkup(selected,provider.smsFields||[])+'</div>'+
        '<div class="admin-auth-provider-setup-actions"><button type="submit" class="primary">Save and Enable</button><button type="button" class="secondary" data-cancel-provider-setup>Cancel</button></div>'+
        '</form>';
    }
    const fields=Array.isArray(provider.setupFields)?provider.setupFields:[];
    return '<form class="admin-auth-provider-setup" data-provider-setup="'+escapeHtml(provider.id)+'">'+
      '<div class="admin-auth-provider-setup-heading"><strong>Configure '+escapeHtml(provider.label)+'</strong><small>Use the Client ID and Secret issued by '+escapeHtml(provider.label)+'. Credentials are sent to the server and saved directly in Supabase; they are never returned to this page.</small></div>'+
      '<div class="admin-auth-provider-fields">'+fields.map(setupField).join('')+'</div>'+
      '<div class="admin-auth-provider-setup-actions"><button type="submit" class="primary">Save and Enable</button><button type="button" class="secondary" data-cancel-provider-setup>Cancel</button></div>'+
      '</form>';
  };
  const renderRoutes=routes=>{
    const host=panel.querySelector('#admin-auth-provider-routes');
    if(!host)return;
    if(!routes){
      host.innerHTML='<p class="admin-auth-provider-route-state">Route configuration is unavailable until Supabase Auth configuration loads.</p>';
      return;
    }
    const redirectState=routes.redirectReady
      ?'<span class="admin-auth-provider-route-ready">Minglora return URL is connected</span>'
      :'<span class="admin-auth-provider-route-warning">Minglora return URL needs connecting</span>';
    host.innerHTML=
      '<div class="admin-auth-provider-route-row"><div><strong>Provider callback URL</strong><small>Paste this exact URL into the provider’s Authorized redirect URI / Callback URL field.</small><code id="admin-auth-provider-callback">'+escapeHtml(routes.providerCallbackUrl)+'</code></div><button type="button" class="secondary" data-copy-auth-route="callback">Copy</button></div>'+
      '<div class="admin-auth-provider-route-row"><div><strong>Minglora Site URL</strong><small>Homepage used by Supabase for the production project.</small><code>'+escapeHtml(routes.siteRedirectUrl||routes.appSiteUrl)+'</code></div><button type="button" class="secondary" data-copy-auth-route="site">Copy</button></div>'+
      '<div class="admin-auth-provider-route-row"><div><strong>Minglora OAuth return route</strong><small>Supabase redirects users here so Minglora can exchange the PKCE code and create the signed-in session.</small><code id="admin-auth-provider-return">'+escapeHtml(routes.appRedirectUrl)+'</code></div><button type="button" class="secondary" data-copy-auth-route="return">Copy</button></div>'+
      '<div class="admin-auth-provider-route-footer">'+redirectState+'<button type="button" class="primary" id="admin-auth-provider-sync-routes">Connect / repair routes</button></div>'+
      '<small class="admin-auth-provider-route-note">Connecting routes sets the production Site URL and adds the homepage and exact OAuth callback route to Supabase’s redirect allow-list. Existing allowed redirect URLs are preserved.</small>';
    host.querySelectorAll('[data-copy-auth-route]').forEach(button=>{
      button.addEventListener('click',async()=>{
        const type=button.dataset.copyAuthRoute;
        const text=type==='callback'?routes.providerCallbackUrl:type==='site'?(routes.siteRedirectUrl||routes.appSiteUrl):routes.appRedirectUrl;
        try{
          if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
          else{
            const input=document.createElement('textarea');
            input.value=text;input.setAttribute('readonly','');input.style.position='fixed';input.style.opacity='0';
            document.body.append(input);input.select();
            const copied=document.execCommand('copy');input.remove();
            if(!copied)throw new Error('Copy is unavailable in this browser.');
          }
          setStatus((type==='callback'?'Provider callback':'Minglora return URL')+' copied.');
        }catch(error){setStatus(error.message||'The route could not be copied.');}
      });
    });
    host.querySelector('#admin-auth-provider-sync-routes')?.addEventListener('click',async event=>{
      const button=event.currentTarget;
      button.disabled=true;
      setStatus('Connecting Minglora’s production sign-in routes in Supabase…');
      try{
        const result=await api('PATCH',{action:'sync-routes'});
        await load();
        setStatus(result.routes?.redirectReady?'Minglora production Site URL and redirect route are connected.':'Supabase did not confirm the route configuration.');
      }catch(error){
        setStatus(error.message||'Minglora routes could not be connected.');
        button.disabled=false;
      }
    });
  };
  const mount=()=>{
    if(panel||!window.__mingloraAdminAccess?.canAccess)return;
    const settings=document.querySelector('#admin-centre-settings');
    if(!settings)return;
    panel=document.createElement('section');
    panel.className='admin-control-centre-section admin-auth-provider-section';
    panel.id='admin-auth-provider-settings';
    panel.innerHTML=
      '<div class="admin-control-centre-section-heading"><div><h3>Supabase Auth providers</h3><p>Connect providers, save credentials securely, and switch each sign-in method on or off independently.</p></div>'+
      '<button type="button" class="secondary" id="admin-auth-provider-refresh">Refresh status</button></div>'+
      '<p class="admin-auth-provider-status" id="admin-auth-provider-status" role="status" aria-live="polite">Loading provider configuration…</p>'+
      '<section class="admin-auth-provider-routes"><div><h4>Provider callback and Minglora routes</h4><p>Use the callback URL in each external provider console, then connect Minglora’s production return URL.</p></div><div id="admin-auth-provider-routes">Loading route configuration…</div></section>'+
      '<div id="admin-auth-provider-groups" class="admin-auth-provider-groups"></div>'+
      '<p class="admin-auth-provider-footnote">Provider secrets remain on Supabase and are never returned to this panel. Each OAuth provider still requires credentials created in that provider’s developer console. Disabling a provider changes only its enabled flag; unrelated Auth settings are preserved. Keep at least one sign-in method enabled.</p>';
    settings.after(panel);
    panel.querySelector('#admin-auth-provider-refresh')?.addEventListener('click',()=>load());
    void load();
  };
  const saveProviderToggle=async(provider,enabled,button)=>{
    button.disabled=true;
    setStatus('Saving '+provider.label+' sign-in setting…');
    try{
      await api('PATCH',{provider:provider.id,enabled});
      await load();
      setStatus(provider.label+' sign-in is now '+(enabled?'enabled':'disabled')+'.');
    }catch(error){
      setStatus(error.message||'Provider setting could not be saved.');
      button.disabled=false;
    }
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
        const status=provider.locked?'Plan restricted':provider.enabled
          ?(provider.configured?'Enabled · ready':'Enabled · setup incomplete')
          :(provider.configured?'Ready to enable':'Needs setup');
        const detail=provider.reason||provider.note||'Provider credentials are configured in Supabase.';
        const action=provider.enabled?'Disable':'Enable';
        return '<article class="admin-auth-provider-card" data-provider-card="'+escapeHtml(provider.id)+'"><div class="admin-auth-provider-copy"><strong>'+escapeHtml(provider.label)+'</strong><span class="admin-auth-provider-state '+(provider.enabled?'is-enabled':provider.locked?'is-locked':'')+'">'+escapeHtml(status)+'</span><small>'+escapeHtml(detail)+'</small></div>'+
          '<button type="button" class="admin-auth-provider-action" data-provider-action="'+escapeHtml(provider.id)+'" aria-label="'+escapeHtml(action+' '+provider.label+' sign-in')+'">'+action+'</button></article>'+
          (provider.locked?'<div class="admin-auth-provider-locked-note" data-provider-note="'+escapeHtml(provider.id)+'" hidden></div>':'');
      }).join('')+'</div></section>'
    ).join('');
    container.querySelectorAll('button[data-provider-action]').forEach(button=>{
      button.addEventListener('click',()=>{
        const provider=providers.find(item=>item.id===button.dataset.providerAction);
        if(!provider)return;
        if(provider.locked){
          setStatus(provider.reason||'This provider is restricted by the current Supabase plan.');
          return;
        }
        if(!provider.enabled&&!provider.configured){
          const card=container.querySelector('[data-provider-card="'+CSS.escape(provider.id)+'"]');
          const existing=container.querySelector('[data-provider-setup="'+CSS.escape(provider.id)+'"]');
          if(existing){existing.remove();return;}
          const form=document.createElement('div');
          form.innerHTML=setupMarkup(provider);
          const setup=form.firstElementChild;
          card?.after(setup);
          if(provider.id==='phone'){
            setup.querySelector('[data-sms-provider]')?.addEventListener('change',event=>{
              const fields=setup.querySelector('[data-sms-fields]');
              if(fields)fields.innerHTML=smsFieldsMarkup(event.target.value,[]);
            });
          }
          setup?.querySelector('[data-cancel-provider-setup]')?.addEventListener('click',()=>setup.remove());
          setup?.addEventListener('submit',async event=>{
            event.preventDefault();
            const formElement=event.currentTarget;
            const submit=formElement.querySelector('button[type="submit"]');
            const credentials={};
            formElement.querySelectorAll('[data-config-key]').forEach(input=>{
              const value=String(input.value||'').trim();
              if(value)credentials[input.dataset.configKey]=value;
            });
            const smsProvider=formElement.querySelector('[data-sms-provider]')?.value;
            if(smsProvider)credentials.sms_provider=smsProvider;
            submit.disabled=true;
            setStatus('Saving '+provider.label+' credentials securely to Supabase and enabling sign-in…');
            try{
              await api('PATCH',{provider:provider.id,enabled:true,credentials});
              await load();
              setStatus(provider.label+' credentials were saved in Supabase and sign-in is enabled.');
            }catch(error){
              setStatus(error.message||'Provider setup could not be saved.');
              submit.disabled=false;
            }
          });
          setup?.querySelector('input:not([type="hidden"]),select')?.focus();
          setStatus('Complete the '+provider.label+' setup fields, then choose Save and Enable.');
          return;
        }
        void saveProviderToggle(provider,!provider.enabled,button);
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
      renderRoutes(data.routes);
      const enabled=(data.providers||[]).filter(item=>item.enabled).length;
      if(status)status.textContent='Connected to Minglora Supabase project '+data.projectRef+' · '+enabled+' provider(s) currently enabled.';
    }catch(error){
      if(status)status.textContent=error.message||'Provider configuration is unavailable.';
      const groups=panel.querySelector('#admin-auth-provider-groups');
      if(groups)groups.innerHTML='<div class="admin-auth-provider-error">Check the Render SUPABASE_ACCESS_TOKEN setting and its Supabase Auth Config permissions, then refresh this panel.</div>';
      renderRoutes(null);
    }finally{
      busy=false;
      if(refresh)refresh.disabled=false;
    }
  };
  const observer=new MutationObserver(mount);
  observer.observe(root,{childList:true,subtree:true});
  mount();
})();
