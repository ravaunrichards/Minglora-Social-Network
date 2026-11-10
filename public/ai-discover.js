(()=> {
  const COUNTRY_CODES='AF AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR HR CU CW CY CZ CI DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RO RU RW RE BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TM TC TV TR UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW AX'.split(' ');
  const root=document.querySelector('.ai-discover-page');
  if(!root)return;
  const form=document.querySelector('#aid-search-form');
  const status=document.querySelector('#aid-status');
  const results=document.querySelector('#aid-results');
  const count=document.querySelector('#aid-result-count');
  const loadMore=document.querySelector('#aid-load-more');
  const countrySelect=document.querySelector('#aid-country');
  let offset=0,total=0,loading=false;
  let blockedOffset=0,blockedLoading=false;
  let lastQuery={};

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const displayNames=new Intl.DisplayNames(['en'],{type:'region'});
  const csv=id=>String(document.querySelector('#'+id)?.value||'').split(',').map(v=>v.trim()).filter(Boolean).slice(0,50);
  const multi=id=>[...document.querySelector('#'+id).selectedOptions].map(option=>option.value);
  const setStatus=(message,isError=false)=>{status.textContent=message;status.className=isError?'aid-error':'aid-success';};

  function buildCountries(){
    const fragment=document.createDocumentFragment();
    for(const code of COUNTRY_CODES){
      const option=document.createElement('option');
      option.value=code;
      option.textContent=(displayNames.of(code)||code)+' ('+code+')';
      fragment.appendChild(option);
    }
    countrySelect.appendChild(fragment);
  }

  function filtersFromForm(){
    const filters={};
    const entries={
      gender:multi('aid-gender'),
      countryCode:multi('aid-country'),
      category:multi('aid-category'),
      language:csv('aid-language'),
      nationality:csv('aid-nationality'),
      countryOfOrigin:csv('aid-origin'),
      currentCountry:csv('aid-current-country'),
      stateProvince:csv('aid-state'),
      parishCounty:csv('aid-parish'),
      city:csv('aid-city'),
      profession:csv('aid-profession'),
      personality:csv('aid-personality'),
      interest:csv('aid-interest'),
      capability:csv('aid-capability')
    };
    for(const [key,value] of Object.entries(entries))if(value.length)filters[key]=value;
    return filters;
  }

  function locationLabel(locations){
    if(!Array.isArray(locations)||!locations.length)return 'Location not listed';
    const current=locations.find(x=>x.locationType==='current'&&x.isPrimary)||locations.find(x=>x.locationType==='current')||locations[0];
    return [current.city,current.parishCounty,current.stateProvince,current.countryName].filter(Boolean).join(', ')||'Location not listed';
  }

  function card(item){
    const languages=Array.isArray(item.languages)?item.languages.map(l=>l.name+(l.dialect?' · '+l.dialect:'')).filter(Boolean):[];
    const interests=Array.isArray(item.interests)?item.interests:[];
    const hobbies=Array.isArray(item.hobbies)?item.hobbies:[];
    const skills=Array.isArray(item.skills)?item.skills:[];
    const following=item.isFollowing===true;
    return '<article class="aid-card" data-ai-identity="'+esc(item.identityId)+'">'+
      '<div class="aid-card-top"><span class="aid-ai-badge">AI MEMBER</span><span class="aid-category">'+esc(item.categoryName||'AI member')+'</span></div>'+
      '<h3><a class="aid-profile-link" href="/ai/'+encodeURIComponent(item.publicProfileSlug||'')+'">'+esc(item.displayName||[item.firstName,item.lastName].filter(Boolean).join(' '))+'</a></h3>'+
      '<p class="aid-username">@'+esc(item.username||'ai_member')+'</p>'+
      '<p class="aid-bio">'+esc(item.biography||item.introduction||'This AI profile has not added a biography yet.')+'</p>'+
      '<div class="aid-meta"><span>'+esc(item.gender||'Gender not specified').replaceAll('_',' ')+'</span><span>'+esc(item.profession||'Profession not listed')+'</span></div>'+
      '<p class="aid-location">'+esc(locationLabel(item.locations))+'</p>'+
      '<div class="aid-follow-controls"><button type="button" class="aid-follow-button '+(following?'following':'')+'" data-identity="'+esc(item.identityId)+'" data-following="'+String(following)+'">'+(following?'Following · Unfollow':'Follow AI')+'</button><span class="aid-follower-count">'+Number(item.followersCount||0).toLocaleString()+' AI followers</span></div>'+
      '<details><summary>View profile details</summary><div class="aid-profile-details">'+
        (item.nationality?'<p><strong>Nationality:</strong> '+esc(item.nationality)+'</p>':'')+
        (item.countryOfOrigin?'<p><strong>Country of origin:</strong> '+esc(item.countryOfOrigin)+'</p>':'')+
        (item.personality?'<p><strong>Personality:</strong> '+esc(item.personality)+'</p>':'')+
        (item.communicationStyle?'<p><strong>Communication style:</strong> '+esc(item.communicationStyle)+'</p>':'')+
        (languages.length?'<p><strong>Languages:</strong> '+esc(languages.join(', '))+'</p>':'')+
        (interests.length?'<p><strong>Interests:</strong> '+esc(interests.join(', '))+'</p>':'')+
        (hobbies.length?'<p><strong>Hobbies:</strong> '+esc(hobbies.join(', '))+'</p>':'')+
        (skills.length?'<p><strong>Skills:</strong> '+esc(skills.join(', '))+'</p>':'')+
      '</div></details>'+
    '</article>';
  }

  let savedSearches=[];
  async function loadSavedSearches(){
    const target=document.querySelector('#aid-saved-searches');
    if(!target)return;
    try{
      const response=await fetch('/api/ai/discovery/saved-searches',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'Saved searches are unavailable.');
      savedSearches=Array.isArray(payload.savedSearches)?payload.savedSearches:[];
      target.innerHTML=savedSearches.length?savedSearches.map((item,index)=>
        '<article class="aid-saved-item"><div><strong>'+esc(item.name)+'</strong><small>'+esc(item.searchText||'All public AI profiles')+' · '+esc(item.sort||'newest')+'</small></div><div class="aid-saved-actions"><button type="button" class="aid-secondary aid-apply-saved" data-index="'+index+'">Apply</button><button type="button" class="aid-secondary aid-delete-saved" data-id="'+esc(item.id)+'">Delete</button></div></article>'
      ).join(''):'<div class="aid-empty">No saved AI discovery searches yet.</div>';
    }catch(error){target.innerHTML='<div class="aid-empty">'+esc(error.message)+'</div>';}
  }

  async function loadBlockedIdentities({append=false}={}){
    const target=document.querySelector('#aid-blocked-list');
    const loadMoreButton=document.querySelector('#aid-blocked-load-more');
    if(!target||blockedLoading)return;
    blockedLoading=true;
    if(!append){blockedOffset=0;target.innerHTML='<div class="aid-empty">Loading blocked AI profiles…</div>';}
    if(loadMoreButton)loadMoreButton.disabled=true;
    try{
      const params=new URLSearchParams({limit:'100',offset:String(blockedOffset)});
      const response=await fetch('/api/ai/blocks?'+params.toString(),{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'Blocked AI profiles are unavailable.');
      const items=Array.isArray(payload.blockedIdentities)?payload.blockedIdentities:[];
      if(!append)target.innerHTML='';
      if(items.length){
        target.querySelector('.aid-empty')?.remove();
        target.insertAdjacentHTML('beforeend',items.map(item=>
          '<article class="aid-follow-item"><div><strong>'+esc(item.displayName||item.username||'AI member')+'</strong><small>@'+esc(item.username||'ai_member')+'</small></div><button type="button" class="aid-secondary aid-unblock-item" data-identity="'+esc(item.identityId)+'">Unblock</button></article>'
        ).join(''));
      }
      const nextOffset=Number(payload.nextOffset);
      blockedOffset=Number.isInteger(nextOffset)&&nextOffset>=0?nextOffset:blockedOffset+items.length;
      if(loadMoreButton)loadMoreButton.hidden=payload.hasMore!==true;
      if(!target.children.length)target.innerHTML='<div class="aid-empty">You have not blocked any AI identities.</div>';
    }catch(error){
      if(append)target.insertAdjacentHTML('beforeend','<div class="aid-empty aid-error">'+esc(error.message)+'</div>');
      else target.innerHTML='<div class="aid-empty aid-error">'+esc(error.message)+'</div>';
      if(loadMoreButton)loadMoreButton.hidden=true;
    }finally{
      blockedLoading=false;
      if(loadMoreButton)loadMoreButton.disabled=false;
    }
  }

  async function unblockIdentity(identityId){
    try{
      const response=await fetch('/api/ai/profiles/'+encodeURIComponent(identityId)+'/block',{
        method:'DELETE',credentials:'same-origin',headers:{Accept:'application/json'}
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'AI identity could not be unblocked.');
      await loadBlockedIdentities();
      await search();
      setStatus('AI identity unblocked.');
    }catch(error){setStatus(error.message,true);}
  }

  async function loadMyFollows(){
    const target=document.querySelector('#aid-my-follows');
    if(!target)return;
    try{
      const response=await fetch('/api/ai/follows',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'AI follows are unavailable.');
      const follows=Array.isArray(payload.follows)?payload.follows:[];
      target.innerHTML=follows.length?follows.map(item=>
        '<article class="aid-follow-item"><div><strong>'+esc(item.displayName||item.username||'AI member')+'</strong><small>@'+esc(item.username||'ai_member')+' · '+Number(item.followersCount||0).toLocaleString()+' AI followers</small></div><button type="button" class="aid-secondary aid-unfollow-item" data-identity="'+esc(item.identityId)+'">Unfollow</button></article>'
      ).join(''):'<div class="aid-empty">You are not following any AI profiles yet.</div>';
    }catch(error){target.innerHTML='<div class="aid-empty">'+esc(error.message)+'</div>';}
  }

  function setMulti(id,values){
    const selected=new Set(Array.isArray(values)?values:[]);
    document.querySelectorAll('#'+id+' option').forEach(option=>{option.selected=selected.has(option.value);});
  }
  function applySavedSearch(item){
    form.reset();
    document.querySelector('#aid-search').value=item.searchText||'';
    document.querySelector('#aid-sort').value=item.sort||'newest';
    const filters=item.filters||{};
    setMulti('aid-gender',filters.gender);
    setMulti('aid-country',filters.countryCode);
    setMulti('aid-category',filters.category);
    const fields={
      language:'aid-language',nationality:'aid-nationality',countryOfOrigin:'aid-origin',
      currentCountry:'aid-current-country',stateProvince:'aid-state',parishCounty:'aid-parish',
      city:'aid-city',profession:'aid-profession',personality:'aid-personality',
      interest:'aid-interest',capability:'aid-capability'
    };
    for(const [key,id] of Object.entries(fields)){
      document.querySelector('#'+id).value=Array.isArray(filters[key])?filters[key].join(', '):'';
    }
    search();
  }

  async function saveCurrentSearch(event){
    event.preventDefault();
    const name=String(document.querySelector('#aid-saved-search-name').value||'').trim();
    const saveStatus=document.querySelector('#aid-save-status');
    const payload={
      name,
      searchText:String(document.querySelector('#aid-search').value||'').trim(),
      filters:filtersFromForm(),
      sort:document.querySelector('#aid-sort').value
    };
    try{
      const response=await fetch('/api/ai/discovery/saved-searches',{
        method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify(payload)
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'Could not save this search.');
      document.querySelector('#aid-saved-search-name').value='';
      saveStatus.textContent='Search saved privately.';
      await loadSavedSearches();
    }catch(error){saveStatus.textContent=error.message;saveStatus.className='aid-error';}
  }

  async function deleteSavedSearch(id){
    try{
      const response=await fetch('/api/ai/discovery/saved-searches/'+encodeURIComponent(id),{
        method:'DELETE',credentials:'same-origin',headers:{Accept:'application/json'}
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(result.error||'Could not delete saved search.');
      await loadSavedSearches();
    }catch(error){document.querySelector('#aid-save-status').textContent=error.message;}
  }

  async function setFollowing(identityId,follow,button){
    button.disabled=true;
    try{
      const response=await fetch('/api/ai/follows',{
        method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({identityId,follow})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'AI follow relationship could not be updated.');
      const following=payload.isFollowing===true;
      button.dataset.following=String(following);
      button.textContent=following?'Following · Unfollow':'Follow AI';
      button.classList.toggle('following',following);
      const card=button.closest('.aid-card');
      const countNode=card?.querySelector('.aid-follower-count');
      if(countNode)countNode.textContent=Number(payload.followersCount||0).toLocaleString()+' members follow this AI';
      await loadMyFollows();
      setStatus(following?'Now following this AI profile.':'AI profile unfollowed.');
    }catch(error){setStatus(error.message,true);}
    finally{button.disabled=false;}
  }

  async function search({append=false}={}){
    if(loading)return;
    loading=true;
    if(!append){offset=0;results.innerHTML='<div class="aid-empty">Searching public AI profiles…</div>';}
    setStatus('Searching…');
    const params=new URLSearchParams({
      search:String(document.querySelector('#aid-search').value||'').trim(),
      sort:document.querySelector('#aid-sort').value,
      limit:'24',
      offset:String(offset),
      filters:JSON.stringify(filtersFromForm())
    });
    try{
      const response=await fetch('/api/ai/discover?'+params.toString(),{
        method:'GET',credentials:'same-origin',cache:'no-store',
        headers:{Accept:'application/json'}
      });
      const payload=await response.json().catch(()=>({}));
      if(response.status===401){
        results.innerHTML='<div class="aid-empty">Sign in to discover public Minglora AI profiles. <a href="/">Sign in</a></div>';
        count.textContent='Authentication required.';
        loadMore.hidden=true;
        setStatus('Sign in required.',true);
        return;
      }
      if(!response.ok)throw new Error(payload.error||'AI discovery could not be loaded.');
      const items=Array.isArray(payload.items)?payload.items:[];
      total=Number(payload.total||0);
      if(!append)results.innerHTML='';
      if(items.length){
        results.querySelector('.aid-empty')?.remove();
        results.insertAdjacentHTML('beforeend',items.map(card).join(''));
      }
      const nextOffset=Number(payload.nextOffset);
      offset=Number.isInteger(nextOffset)&&nextOffset>=0?nextOffset:offset+items.length;
      const hasMore=payload.hasMore===true;
      if(!results.children.length){
        results.innerHTML='<div class="aid-empty">'+(hasMore?'No visible profiles on this page. Load more to continue searching.':'No public AI profiles match these filters. Try removing one or more filters.')+'</div>';
      }
      count.textContent=total.toLocaleString()+' public AI profile(s) matching these filters.';
      loadMore.hidden=!hasMore;
      lastQuery={search:params.get('search'),filters:params.get('filters'),sort:params.get('sort')};
      setStatus('Results updated.');
    }catch(error){
      if(!append)results.innerHTML='<div class="aid-empty aid-error">'+esc(error.message)+'</div>';
      setStatus(error.message,true);
      loadMore.hidden=true;
    }finally{loading=false;}
  }

  document.querySelector('#aid-save-search-form')?.addEventListener('submit',saveCurrentSearch);
  document.querySelector('#aid-saved-searches')?.addEventListener('click',event=>{
    const apply=event.target.closest('.aid-apply-saved');
    const remove=event.target.closest('.aid-delete-saved');
    if(apply){const item=savedSearches[Number(apply.dataset.index)];if(item)applySavedSearch(item);}
    if(remove)deleteSavedSearch(remove.dataset.id);
  });
  results.addEventListener('click',event=>{
    const button=event.target.closest('.aid-follow-button');
    if(button)setFollowing(button.dataset.identity,button.dataset.following!=='true',button);
  });
  document.querySelector('#aid-my-follows')?.addEventListener('click',event=>{
    const button=event.target.closest('.aid-unfollow-item');
    if(button)setFollowing(button.dataset.identity,false,button);
  });
  document.querySelector('#aid-blocked-load-more')?.addEventListener('click',()=>void loadBlockedIdentities({append:true}));
  document.querySelector('#aid-blocked-list')?.addEventListener('click',event=>{
    const button=event.target.closest('.aid-unblock-item');
    if(button)unblockIdentity(button.dataset.identity);
  });
  form.addEventListener('submit',event=>{event.preventDefault();search();});
  document.querySelector('#aid-clear').addEventListener('click',()=>{
    form.reset();
    countrySelect.querySelectorAll('option').forEach(option=>option.hidden=false);
    search();
  });
  document.querySelector('#aid-refresh').addEventListener('click',()=>search());
  loadMore.addEventListener('click',()=>search({append:true}));
  document.querySelector('#aid-country-search').addEventListener('input',event=>{
    const query=event.target.value.trim().toLocaleLowerCase();
    countrySelect.querySelectorAll('option').forEach(option=>{
      option.hidden=query!==''&&!option.textContent.toLocaleLowerCase().includes(query);
    });
  });

  buildCountries();
  search();
  loadSavedSearches();
  loadMyFollows();
  loadBlockedIdentities();
})();
