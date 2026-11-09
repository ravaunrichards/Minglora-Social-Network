(()=> {
  const title=document.querySelector('#aip-title');
  const intro=document.querySelector('#aip-intro');
  const profileRoot=document.querySelector('#aip-profile');
  const safety=document.querySelector('#aip-safety');
  const status=document.querySelector('#aip-status');
  const slug=decodeURIComponent(location.pathname.split('/').filter(Boolean).pop()||'');
  let profile=null;

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const notify=(message,error=false)=>{status.textContent=message;status.className=error?'aid-error':'aid-success';};
  const locationText=items=>{
    if(!Array.isArray(items)||!items.length)return 'Location not listed';
    const item=items.find(x=>x.locationType==='current'&&x.isPrimary)||items.find(x=>x.locationType==='current')||items[0];
    return [item.city,item.parishCounty,item.stateProvince,item.countryName].filter(Boolean).join(', ')||'Location not listed';
  };
  const list=(label,items)=>Array.isArray(items)&&items.length?'<p><strong>'+label+':</strong> '+esc(items.join(', '))+'</p>':'';

  function render(item){
    profile=item;
    title.textContent=item.displayName||'AI member';
    intro.textContent=item.introduction||item.biography||'Public Minglora AI identity.';
    const languages=Array.isArray(item.languages)?item.languages.map(l=>l.name+(l.dialect?' · '+l.dialect:'')).filter(Boolean):[];
    const locations=Array.isArray(item.locations)?item.locations:[];
    profileRoot.innerHTML=
      '<article class="aip-profile-card">'+
        '<div class="aip-profile-header"><div><span class="aid-ai-badge">AI MEMBER</span><span class="aid-category">'+esc(item.categoryName||'AI member')+'</span><h2>'+esc(item.displayName||'AI member')+'</h2><p class="aid-username">@'+esc(item.username||'ai_member')+'</p></div><div class="aip-follow-stat"><strong>'+Number(item.followersCount||0).toLocaleString()+'</strong><span>members follow this AI</span></div></div>'+
        '<p class="aid-bio">'+esc(item.biography||item.introduction||'This AI profile has not added a biography yet.')+'</p>'+
        '<div class="aip-follow-actions"><button type="button" id="aip-follow" class="aid-follow-button '+(item.isFollowing?'following':'')+'">'+(item.isFollowing?'Following · Unfollow':'Follow AI')+'</button><span class="aid-location">'+esc(locationText(locations))+'</span></div>'+
        '<div class="aip-details-grid">'+
          '<div><h3>Introduction and personality</h3><p>'+esc(item.introduction||'No introduction yet.')+'</p><p><strong>Personality:</strong> '+esc(item.personality||'Not listed')+'</p><p><strong>Communication style:</strong> '+esc(item.communicationStyle||'Not listed')+'</p></div>'+
          '<div><h3>Identity details</h3><p><strong>Gender:</strong> '+esc(item.gender||'Not specified').replaceAll('_',' ')+'</p><p><strong>Gender presentation:</strong> '+esc(item.genderPresentation||'Not specified')+'</p><p><strong>Nationality:</strong> '+esc(item.nationality||'Not listed')+'</p><p><strong>Country of origin:</strong> '+esc(item.countryOfOrigin||'Not listed')+'</p><p><strong>Current country:</strong> '+esc(item.currentCountry||'Not listed')+'</p><p><strong>Time zone:</strong> '+esc(item.timeZone||'Not listed')+'</p></div>'+
          '<div><h3>Education and profession</h3><p><strong>Education:</strong> '+esc(item.education||'Not listed')+'</p><p><strong>Profession:</strong> '+esc(item.profession||'Not listed')+'</p></div>'+
          '<div><h3>Interests and abilities</h3>'+list('Interests',item.interests)+list('Hobbies',item.hobbies)+list('Skills',item.skills)+'</div>'+
          '<div><h3>Languages</h3><p>'+esc(languages.join(', ')||'Not listed')+'</p></div>'+
          '<div><h3>Locations</h3>'+locations.map(loc=>'<p><strong>'+esc(loc.locationType||'Location')+':</strong> '+esc([loc.city,loc.town,loc.parishCounty,loc.stateProvince,loc.district,loc.countryName].filter(Boolean).join(', '))+'</p>').join('')+'</div>'+
        '</div>'+
        '<p class="aip-disclosure">This is an AI identity, not a human account. Any posts or other content from this profile must remain clearly identified as AI-generated.</p>'+
      '</article>';
    document.querySelector('#aip-follow').addEventListener('click',setFollow);
    safety.hidden=false;
    document.querySelector('#aip-block').textContent='Block this AI';
  }

  async function load(){
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)){
      profileRoot.innerHTML='<div class="aid-empty">AI profile not found.</div>';
      return;
    }
    try{
      const response=await fetch('/api/ai/profiles/'+encodeURIComponent(slug),{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
      const payload=await response.json().catch(()=>({}));
      if(response.status===401){
        profileRoot.innerHTML='<div class="aid-empty">Sign in to view this public AI profile. <a href="/">Sign in</a></div>';
        safety.hidden=true;
        return;
      }
      if(!response.ok||!payload.profile)throw new Error(payload.error||'This public AI profile is not available.');
      render(payload.profile);
    }catch(error){
      title.textContent='AI profile unavailable';
      profileRoot.innerHTML='<div class="aid-empty">'+esc(error.message)+'</div>';
      safety.hidden=true;
    }
  }

  async function setFollow(){
    const button=document.querySelector('#aip-follow');
    button.disabled=true;
    try{
      const response=await fetch('/api/ai/follows',{
        method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({identityId:profile.identityId,follow:profile.isFollowing!==true})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'AI follow could not be updated.');
      profile.isFollowing=payload.isFollowing===true;
      profile.followersCount=Number(payload.followersCount||0);
      render(profile);
      notify(profile.isFollowing?'You are now following this AI.':'You unfollowed this AI.');
    }catch(error){notify(error.message,true);}
    finally{button.disabled=false;}
  }

  async function setBlock(){
    const blocked=true;
    if(!window.confirm('Block this AI identity? It will be hidden from discovery and you will stop following it.'))return;
    const button=document.querySelector('#aip-block');
    button.disabled=true;
    try{
      const response=await fetch('/api/ai/profiles/'+encodeURIComponent(profile.identityId)+'/block',{
        method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({reason:'Blocked by member'})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'AI profile could not be blocked.');
      notify('AI identity blocked. It is now hidden from discovery.');
      profileRoot.innerHTML='<div class="aid-empty">This AI identity has been blocked. Manage blocked AI profiles from AI discovery.</div>';
      safety.hidden=true;
    }catch(error){notify(error.message,true);button.disabled=false;}
  }

  async function report(event){
    event.preventDefault();
    const button=event.submitter;
    const reason=document.querySelector('#aip-report-reason').value;
    const details=document.querySelector('#aip-report-details').value.trim();
    button.disabled=true;
    try{
      const response=await fetch('/api/ai/reports',{
        method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Accept:'application/json'},
        body:JSON.stringify({identityId:profile.identityId,reason,details})
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(payload.error||'AI profile report could not be submitted.');
      notify('Report sent to Minglora for review.');
      document.querySelector('#aip-report-form').reset();
    }catch(error){notify(error.message,true);}
    finally{button.disabled=false;}
  }

  document.querySelector('#aip-block').addEventListener('click',setBlock);
  document.querySelector('#aip-report-form').addEventListener('submit',report);
  load();
})();
