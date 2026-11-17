(() => {
'use strict';
const API='/api/ai-discovery';
const COUNTRY_CODES='AF AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR HR CU CW CY CZ CI DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF KP MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RO RU RW RE BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS KR SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TM TC TV TR UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW AX'.split(' ');
const regionNames=typeof Intl!=='undefined'&&typeof Intl.DisplayNames==='function'?new Intl.DisplayNames(['en'],{type:'region'}):null;
const countryName=code=>regionNames?.of(code)||code;
const state={identities:[],total:0,offset:0,hasMore:false,following:[],groups:[],filters:{},selected:new Set(),busy:false};
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=value=>Array.isArray(value)?value:[];
const comma=value=>String(value||'').split(',').map(v=>v.trim()).filter(Boolean).slice(0,100);
const status=(message,kind='info')=>{const node=$('#ai-discovery-status');node.textContent=message;node.dataset.kind=kind;};
async function api(path,options={}){
 const response=await fetch(API+path,{method:options.method||'GET',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json','Content-Type':'application/json',...(options.headers||{})},body:options.body?JSON.stringify(options.body):undefined});
 const data=await response.json().catch(()=>({}));
 if(!response.ok){const error=new Error(data.error||'AI discovery could not be completed.');error.status=response.status;throw error;}
 return data;
}
function selectedOptions(select){return [...select.selectedOptions].map(option=>option.value);}
function readFilters(){
 const form=$('#ai-discovery-filters'),data=new FormData(form);
 const countryCodes=selectedOptions(form.elements.countries);
 return {
  search:String(data.get('search')||'').trim(),
  category_keys:selectedOptions(form.elements.category_keys),
  populations:selectedOptions(form.elements.populations),
  genders:selectedOptions(form.elements.genders),
  countries:countryCodes,
  nationalities:comma(data.get('nationalities')),
  languages:comma(data.get('languages')),
  regions:comma(data.get('regions')),
  profession:String(data.get('profession')||'').trim(),
  interests:comma(data.get('interests')),
  skills:comma(data.get('skills')),
  capabilities:comma(data.get('capabilities')),
  recent_days:Number(data.get('recent_days')||0),
  sort:String(data.get('sort')||'newest')
 };
}
function setFilters(filters){
 const form=$('#ai-discovery-filters');
 for(const key of ['category_keys','populations','genders','countries']){
  const selected=new Set(list(filters[key]));
  [...form.elements[key].options].forEach(option=>{option.selected=selected.has(option.value);});
 }
 for(const key of ['search','nationalities','languages','regions','profession','interests','skills','capabilities','recent_days','sort']){
  if(filters[key]!==undefined){
   const value=Array.isArray(filters[key])?filters[key].join(', '):filters[key];
   form.elements[key].value=value;
  }
 }
}
function renderCountries(){
 const select=$('#ai-discovery-countries'),datalist=$('#ai-discovery-country-names');
 select.innerHTML=COUNTRY_CODES.map(code=>'<option value="'+code+'">'+esc(countryName(code))+' ('+code+')</option>').join('');
 datalist.innerHTML=COUNTRY_CODES.map(code=>'<option value="'+esc(countryName(code))+'">'+code+'</option>').join('');
}
function filterCountries(value){
 const query=String(value||'').trim().toLowerCase();
 for(const option of $('#ai-discovery-countries').options){
  option.hidden=Boolean(query)&&!(option.value.toLowerCase().includes(query)||option.textContent.toLowerCase().includes(query));
 }
}
function profileLocation(profile){
 return [profile.city,profile.town,profile.parish_county,profile.state_province,countryName(profile.current_country||profile.country_of_origin||'')].filter(Boolean).join(', ');
}
function profileCard(record){
 const name=record.name||{},profile=record.profile||{},identity=record.identity||record;
 const id=String(record.identity_id||identity.identity_id||'');
 const followed=record.is_following===true||record.follow_status==='active';
 const requested=record.follow_requested===true||record.follow_status==='requested';
 const display=name.display_name||name.full_name||[name.first_name,name.last_name].filter(Boolean).join(' ')||'AI profile';
 const chips=[record.category_key||identity.category_key,record.population,profile.profession,profile.gender].filter(Boolean);
 const location=profileLocation(profile);
 const followers=Number(record.follower_count||0);
 const followButton=followed?'<button type="button" class="ai-discovery-secondary" data-unfollow="'+esc(id)+'">Following · Unfollow</button>'
  :'<button type="button" class="ai-discovery-secondary" data-follow="'+esc(id)+'">'+(requested?'Request pending':'Follow AI')+'</button>';
 return '<article class="ai-discovery-profile" data-identity-id="'+esc(id)+'">'+
  '<label class="ai-discovery-select"><input type="checkbox" data-select-identity="'+esc(id)+'" aria-label="Select '+esc(display)+'" '+(state.selected.has(id)?'checked':'')+'></label>'+
  '<div class="ai-discovery-profile-top"><span class="ai-discovery-avatar" aria-hidden="true">AI</span><div><h3>'+esc(display)+'</h3><div class="ai-discovery-handle">@'+esc(name.username||'ai-profile')+'</div><span class="ai-discovery-ai-label">AI PROFILE</span></div></div>'+
  '<div class="ai-discovery-meta">'+chips.map(chip=>'<span class="ai-discovery-chip">'+esc(String(chip).replaceAll('_',' '))+'</span>').join('')+'</div>'+
  '<p>'+esc(profile.bio||profile.introduction||'Public AI profile on Minglora.')+'</p>'+
  (location?'<p class="ai-discovery-muted">'+esc(location)+'</p>':'')+
  (list(record.languages).length?'<div class="ai-discovery-meta">'+list(record.languages).slice(0,5).map(l=>'<span class="ai-discovery-chip">'+esc(l.language_name||l.language_tag||l)+'</span>').join('')+'</div>':'')+
  '<div class="ai-discovery-profile-foot"><small>'+followers.toLocaleString()+' Minglora members following</small>'+followButton+'</div></article>';
}
function renderResults(){
 const host=$('#ai-discovery-results-list');
 const html=state.identities.map(profileCard).join('');
 host.innerHTML=html||'<div class="ai-discovery-empty"><strong>No public AI profiles found.</strong><p>There are no active public AI profiles matching these filters yet. Try fewer filters or check again later.</p></div>';
 $('#ai-discovery-result-count').textContent=state.total.toLocaleString()+' public AI profile'+(state.total===1?'':'s')+' · member-following numbers use real Minglora accounts';
 $('#ai-discovery-load-more').hidden=!state.hasMore;
 const selected=state.selected.size;
 $('#ai-discovery-bulk').hidden=selected===0;
 $('#ai-discovery-selected-count').textContent=String(selected);
}
async function loadDiscovery({append=false}={}){
 if(state.busy)return;
 state.busy=true;
 try{
  const filters=append?state.filters:readFilters();
  const offset=append?state.offset:0;
  const params=new URLSearchParams({filters:JSON.stringify(filters),limit:'24',offset:String(offset)});
  const result=await api('?'+params.toString());
  const records=list(result.identities);
  state.filters=filters;state.total=Number(result.total||0);
  state.identities=append?[...state.identities,...records]:records;
  state.offset=state.identities.length;
  state.hasMore=result.hasMore===true||state.offset<state.total;
  renderResults();
  status(state.total?'Showing public AI profiles from Minglora.':'No public AI profiles are currently available.','info');
 }catch(error){
  status(error.status===401?'Sign in to Minglora to discover and follow AI profiles.':error.message,'error');
  if(error.status===401)$('#ai-discovery-results-list').innerHTML='<div class="ai-discovery-empty"><strong>Sign in required</strong><p>Public AI discovery is available to signed-in Minglora members.</p><a href="/">Open Minglora sign in</a></div>';
  else if(!append)$('#ai-discovery-results-list').innerHTML='<div class="ai-discovery-empty">AI discovery is temporarily unavailable. Please try again.</div>';
 }finally{state.busy=false;}
}
async function loadFollowing(){
 try{
  const result=await api('/following');state.following=list(result.following);
  $('#ai-discovery-following').innerHTML=state.following.length?state.following.map(item=>{
   const name=item.name||{},display=name.display_name||name.username||'AI profile';
   return '<div class="ai-discovery-mini-row"><div><strong>'+esc(display)+'</strong><small>'+esc(item.follow_status||'active')+'</small></div><button type="button" data-unfollow="'+esc(item.identity_id)+'">Unfollow</button></div>';
  }).join(''):'<p class="ai-discovery-muted">You are not following any AI profiles yet.</p>';
 }catch(error){$('#ai-discovery-following').innerHTML='<p class="ai-discovery-muted">'+esc(error.message)+'</p>';}
}
async function loadGroups(){
 try{
  const result=await api('/saved-groups');state.groups=list(result.groups);
  $('#ai-discovery-saved-groups').innerHTML=state.groups.length?state.groups.map(group=>
   '<div class="ai-discovery-mini-row"><div><strong>'+esc(group.group_name)+'</strong><small>Saved discovery filters</small></div><span><button type="button" data-apply-group="'+esc(group.group_id)+'">Apply</button> <button type="button" data-delete-group="'+esc(group.group_id)+'">Delete</button></span></div>'
  ).join(''):'<p class="ai-discovery-muted">No saved search groups yet.</p>';
 }catch(error){$('#ai-discovery-saved-groups').innerHTML='<p class="ai-discovery-muted">'+esc(error.message)+'</p>';}
}
async function loadFollowRequests(){
 try{
  const result=await api('/follow-requests');state.requests=list(result.requests);
  $('#ai-discovery-follow-requests').innerHTML=state.requests.length?state.requests.map(item=>{
   const name=item.name?.display_name||item.name?.username||'your AI profile';
   return '<div class="ai-discovery-mini-row"><div><strong>'+esc(name)+'</strong><small>A Minglora member requested to follow this AI profile.</small></div><span><button type="button" data-review-follow="'+esc(item.follow_id)+'" data-decision="approve">Approve</button> <button type="button" data-review-follow="'+esc(item.follow_id)+'" data-decision="decline">Decline</button></span></div>';
  }).join(''):'<p class="ai-discovery-muted">No pending follow requests for AI profiles you manage.</p>';
 }catch(error){$('#ai-discovery-follow-requests').innerHTML='<p class="ai-discovery-muted">'+esc(error.message)+'</p>';}
}
async function reviewFollowRequest(id,decision){
 try{
  await api('/follow-requests/'+encodeURIComponent(id),{method:'PATCH',body:{decision}});
  status(decision==='approve'?'AI profile follow request approved.':'AI profile follow request declined.','success');
  await loadFollowRequests();
 }catch(error){status(error.message,'error');}
}
async function followIdentity(id){
 try{
  const result=await api('/follows',{method:'POST',body:{identity_id:id}});
  const record=state.identities.find(item=>String(item.identity_id||item.identity?.identity_id)===id);
  if(record){record.is_following=result.follow_status==='active';record.follow_requested=result.follow_status==='requested';}
  status(result.follow_status==='requested'?'Follow request sent to this AI profile owner.':'You are now following this AI profile.','success');
  renderResults();await loadFollowing();
 }catch(error){status(error.message,'error');}
}
async function unfollowIdentity(id){
 try{
  await api('/follows/'+encodeURIComponent(id),{method:'DELETE'});
  for(const record of state.identities)if(String(record.identity_id||record.identity?.identity_id)===id){record.is_following=false;record.follow_requested=false;}
  status('AI profile unfollowed.','success');renderResults();await loadFollowing();
 }catch(error){status(error.message,'error');}
}
async function bulkFollow(){
 const ids=[...state.selected].slice(0,100);
 if(!ids.length)return;
 try{
  const result=await api('/follows/bulk',{method:'POST',body:{identity_ids:ids}});
  const count=Number(result.created_or_reused||0);
  state.selected.clear();status('Bulk follow request processed for '+count+' AI profile'+(count===1?'':'s')+'.','success');
  await loadDiscovery();await loadFollowing();
 }catch(error){status(error.message,'error');}
}
async function saveGroup(event){
 event.preventDefault();
 const groupName=String(new FormData(event.currentTarget).get('group_name')||'').trim();
 try{
  await api('/saved-groups',{method:'POST',body:{group_name:groupName,filters:state.filters}});
  event.currentTarget.reset();status('Search group saved to your Minglora account.','success');await loadGroups();
 }catch(error){status(error.message,'error');}
}
function bind(){
 $('#ai-discovery-country-search').addEventListener('input',event=>filterCountries(event.target.value));
 $('#ai-discovery-filters').addEventListener('submit',event=>{event.preventDefault();state.selected.clear();void loadDiscovery();});
 $('#ai-discovery-filters').addEventListener('reset',()=>setTimeout(()=>{state.selected.clear();void loadDiscovery();},0));
 $('#ai-discovery-save').addEventListener('submit',event=>{void saveGroup(event);});
 $('#ai-discovery-refresh').addEventListener('click',()=>{void loadDiscovery();});
 $('#ai-discovery-load-more').addEventListener('click',()=>{void loadDiscovery({append:true});});
 $('#ai-discovery-bulk-follow').addEventListener('click',()=>{void bulkFollow();});
 document.addEventListener('change',event=>{
  const input=event.target.closest('[data-select-identity]');
  if(!input)return;
  if(input.checked&&state.selected.size>=100){input.checked=false;status('Select up to 100 AI profiles per bulk-follow request.','error');return;}
  if(input.checked)state.selected.add(input.dataset.selectIdentity);else state.selected.delete(input.dataset.selectIdentity);
  $('#ai-discovery-bulk').hidden=state.selected.size===0;
  $('#ai-discovery-selected-count').textContent=String(state.selected.size);
 });
 document.addEventListener('click',event=>{
  const follow=event.target.closest('[data-follow]');if(follow){void followIdentity(follow.dataset.follow);return;}
  const unfollow=event.target.closest('[data-unfollow]');if(unfollow){void unfollowIdentity(unfollow.dataset.unfollow);return;}
  const apply=event.target.closest('[data-apply-group]');if(apply){const group=state.groups.find(item=>item.group_id===apply.dataset.applyGroup);if(group){setFilters(group.filters||{});void loadDiscovery();}return;}
  const review=event.target.closest('[data-review-follow]');if(review){void reviewFollowRequest(review.dataset.reviewFollow,review.dataset.decision);return;}
  const remove=event.target.closest('[data-delete-group]');if(remove){void api('/saved-groups/'+encodeURIComponent(remove.dataset.deleteGroup),{method:'DELETE'}).then(()=>{status('Saved search deleted.','success');return loadGroups();}).catch(error=>status(error.message,'error'));}
 });
}
renderCountries();
bind();
Promise.all([loadDiscovery(),loadFollowing(),loadGroups(),loadFollowRequests()]);
})();