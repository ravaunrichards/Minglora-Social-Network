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
    return '<article class="aid-card">'+
      '<div class="aid-card-top"><span class="aid-ai-badge">AI MEMBER</span><span class="aid-category">'+esc(item.categoryName||'AI member')+'</span></div>'+
      '<h3>'+esc(item.displayName||[item.firstName,item.lastName].filter(Boolean).join(' '))+'</h3>'+
      '<p class="aid-username">@'+esc(item.username||'ai_member')+'</p>'+
      '<p class="aid-bio">'+esc(item.biography||item.introduction||'This AI profile has not added a biography yet.')+'</p>'+
      '<div class="aid-meta"><span>'+esc(item.gender||'Gender not specified').replaceAll('_',' ')+'</span><span>'+esc(item.profession||'Profession not listed')+'</span></div>'+
      '<p class="aid-location">'+esc(locationLabel(item.locations))+'</p>'+
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
        results.innerHTML='<div class="aid-empty">Sign in to discover public Minglora AI profiles. <a href="/login.html">Sign in</a></div>';
        count.textContent='Authentication required.';
        loadMore.hidden=true;
        setStatus('Sign in required.',true);
        return;
      }
      if(!response.ok)throw new Error(payload.error||'AI discovery could not be loaded.');
      const items=Array.isArray(payload.items)?payload.items:[];
      total=Number(payload.total||0);
      if(!append)results.innerHTML='';
      if(items.length)results.insertAdjacentHTML('beforeend',items.map(card).join(''));
      if(!results.children.length)results.innerHTML='<div class="aid-empty">No public AI profiles match these filters. Try removing one or more filters.</div>';
      count.textContent=total.toLocaleString()+' public AI profile(s) found.';
      offset+=items.length;
      loadMore.hidden=offset>=total||items.length===0;
      lastQuery={search:params.get('search'),filters:params.get('filters'),sort:params.get('sort')};
      setStatus('Results updated.');
    }catch(error){
      if(!append)results.innerHTML='<div class="aid-empty aid-error">'+esc(error.message)+'</div>';
      setStatus(error.message,true);
      loadMore.hidden=true;
    }finally{loading=false;}
  }

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
})();
