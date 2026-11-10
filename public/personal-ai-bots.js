(()=> {
  const API='/api/admin/personal-ai-bots';
  const AI_POPULATIONS=[['independent','Independent AI'],['organizational','Organizational AI'],['specialized_service','Specialized AI Service']];
  const HYBRID_ACTIONS=[['analytics_read','Read-only analytics'],['moderation_flag','Flag content for review'],['draft_content','Prepare drafts (never publish)'],['translate_content','Translate approved text'],['prepare_faq_draft','Prepare FAQ drafts']];
  const AI_COUNTRY_CODES='AF AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR HR CU CW CY CZ CI DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RO RU RW RE BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TM TC TV TR UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW AX'.split(' ');
  const AI_COUNTRY_NAMES=new Intl.DisplayNames(['en'],{type:'region'});
  const AI_COUNTRY_CODE_BY_NAME=new Map(AI_COUNTRY_CODES.map(code=>[String(AI_COUNTRY_NAMES.of(code)||code).toLocaleLowerCase(),code]));
  const TASK_TYPES=[['assistant_request','Assistant request'],['draft_post','Draft a post'],['share_media','Share photo or video'],['create_reel','Create a reel'],['draft_comment','Draft a comment'],['draft_reply','Draft a reply'],['follow','Follow a member'],['unfollow','Unfollow a member'],['react','React to content'],['join_group','Join a group'],['send_message','Prepare a message'],['event_participation','Prepare event participation'],['customer_service_draft','Prepare customer service reply'],['support_draft','Prepare support response'],['moderation_review','Review reported content'],['analytics_report','Prepare analytics report'],['automation_request','Automation request'],['community_event_draft','Prepare community event'],['live_show_plan','Prepare live show plan'],['translation','Translate content'],['other','Other administrator instruction']];
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const root=document.querySelector('#pab-root');
  let state=null;
  const request=async(path,options={})=>{
    const response=await fetch(path.startsWith('/api/')?path:API+path,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json','Content-Type':'application/json',...(options.headers||{})},...options});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){const error=new Error(payload.error||'The administrator request failed.');error.status=response.status;error.payload=payload;throw error;}
    return payload;
  };
  const notice=(id,message,type='')=>{const node=document.querySelector('#'+id);if(node){node.textContent=message;node.className='pab-notice'+(type?' '+type:'');}};
  const date=value=>{const d=new Date(value);return value&&!Number.isNaN(d.getTime())?d.toLocaleString():'Time unavailable';};
  const selectOptions=(items,selected)=>items.map(item=>'<option value="'+esc(item[0])+'" '+(item[0]===selected?'selected':'')+'>'+esc(item[1])+'</option>').join('');
  const countryCodeForName=value=>AI_COUNTRY_CODE_BY_NAME.get(String(value||'').trim().toLocaleLowerCase())||'';

  async function initialize(){
    if(!root)return;
    try{
      const access=await request('/api/admin/access');
      if(!access.canAccess){
        root.innerHTML='<section class="pab-access-denied"><h1>Private Personal AI Bots Network</h1><p>Sign in with the designated Minglora owner account and complete authenticator verification in Admin Centre.</p><a class="pab-btn secondary" href="/admin-centre.html">Return to Admin Centre</a></section>';
        return;
      }
      state=await request(API);const batchResult=await request(API+'/batches?limit=50&offset=0');state.batchHistory=Array.isArray(batchResult.batches)?batchResult.batches:[];state.batchHistoryNextOffset=Number(batchResult.nextOffset)||state.batchHistory.length;state.batchHistoryHasMore=batchResult.hasMore===true;await loadProviderRuntimeOverview();render();
    }catch(error){
      root.innerHTML='<section class="pab-access-denied"><h1>Could not open Personal AI Bots Network</h1><p>'+esc(error.message)+'</p><a class="pab-btn secondary" href="/admin-centre.html">Return to Admin Centre</a></section>';
    }
  }
  function metric(value,label){return '<div class="pab-metric"><strong>'+esc(Number(value||0).toLocaleString())+'</strong><span>'+esc(label)+'</span></div>';}
  function categoryCard(category){
    return '<article class="pab-category" data-category-card="'+esc(category.id)+'"><div class="pab-category-copy"><strong>'+esc(category.builtIn?'Built-in category':'Custom category')+'</strong><input class="pab-input pab-category-name" data-category="'+esc(category.id)+'" maxlength="56" value="'+esc(category.name)+'"><textarea class="pab-textarea pab-category-description" data-category="'+esc(category.id)+'" maxlength="600">'+esc(category.description||'')+'</textarea><div class="pab-actions"><button type="button" class="pab-btn secondary pab-save-category" data-category="'+esc(category.id)+'">Save category</button></div></div><label class="pab-check"><span>Enabled</span><input class="pab-switch pab-category-switch" data-category="'+esc(category.id)+'" type="checkbox" '+(category.enabled?'checked':'')+' aria-label="Enable '+esc(category.name)+' category"></label></article>';
  }

  function departmentCard(department){
    const parents=(state.departments||[]).filter(item=>item.id!==department.id);
    const parentOptions='<option value="">No parent department</option>'+parents.map(item=>'<option value="'+esc(item.id)+'" '+(item.id===department.parentDepartmentId?'selected':'')+'>'+esc(item.name)+'</option>').join('');
    const parent=department.parentDepartmentId?(state.departments||[]).find(item=>item.id===department.parentDepartmentId):null;
    return '<article class="pab-category" data-department-card="'+esc(department.id)+'"><div class="pab-category-copy"><strong>'+esc(department.builtIn?'Required built-in department':'Custom department')+' · '+esc(department.code)+'</strong><input class="pab-input pab-department-name" data-department="'+esc(department.id)+'" maxlength="80" value="'+esc(department.name)+'" aria-label="Department name"><textarea class="pab-textarea pab-department-description" data-department="'+esc(department.id)+'" maxlength="600" aria-label="Department responsibilities">'+esc(department.description||'')+'</textarea><label>Reports to<select class="pab-select pab-department-parent" data-department="'+esc(department.id)+'">'+parentOptions+'</select></label><div class="pab-actions"><button type="button" class="pab-btn secondary pab-save-department" data-department="'+esc(department.id)+'">Save department</button></div><small class="pab-notice">'+(parent?'Parent: '+esc(parent.name):'Top-level department')+'</small></div><label class="pab-check"><span>Enabled</span><input class="pab-switch pab-department-switch" data-department="'+esc(department.id)+'" type="checkbox" '+(department.enabled?'checked':'')+' aria-label="Enable '+esc(department.name)+' department"></label></article>';
  }

  function jobPositionCard(position){
    const parentLabels=(position.reportsTo||[]).map(code=>(state.jobPositions||[]).find(item=>item.code===code)?.title||code);
    const department=position.departmentScope==='any_department'
      ?'Any department'
      :((state.departments||[]).find(item=>item.code===position.departmentScope)?.name||'Executive Management');
    const appointedCount=(state.appointments||[]).filter(item=>item.positionCode===position.code&&['appointed','suspended'].includes(item.status)).length;
    return '<article class="pab-roadmap-card"><strong>'+esc(position.title)+'</strong><p>'+esc(position.description||'')+'</p><span class="pab-tag">Level '+esc(position.level)+' · '+esc(String(position.group||'role').replaceAll('_',' '))+'</span><p><small>Department: '+esc(department)+'<br>Reports to: '+esc(parentLabels.join(', ')||'Board governance')+'<br>Recorded appointments: '+esc(appointedCount)+'</small></p><div class="pab-warning">Position template only · No permissions · No execution authority</div></article>';
  }

  function vacancyCard(vacancy){
    const statusOptions=['open','paused','closed'].map(status=>'<option value="'+status+'" '+(vacancy.status===status?'selected':'')+'>'+status+'</option>').join('');
    const filledSlots=Math.max(0,Number(vacancy.filledSlots||0));
    const remainingSlots=Math.max(0,Number(vacancy.remainingSlots??(Number(vacancy.slots||1)-filledSlots)));
    return '<article class="pab-category" data-vacancy-card="'+esc(vacancy.id)+'"><div class="pab-category-copy"><strong>'+esc(vacancy.title)+'</strong><p>'+esc(vacancy.positionTitle)+' · '+esc(vacancy.departmentName)+'</p><p class="pab-notice">Filled slots: '+esc(filledSlots)+' / '+esc(vacancy.slots)+' · Remaining: '+esc(remainingSlots)+'</p><label>Vacancy title<input class="pab-input pab-vacancy-title" maxlength="100" value="'+esc(vacancy.title)+'"></label><label>Slots<input class="pab-input pab-vacancy-slots" type="number" min="1" max="100" step="1" value="'+esc(vacancy.slots)+'"></label><label>Description<textarea class="pab-textarea pab-vacancy-description" maxlength="1200">'+esc(vacancy.description||'')+'</textarea></label><label>Required skills / qualifications<textarea class="pab-textarea pab-vacancy-requirements" maxlength="2000">'+esc(vacancy.requirements||'')+'</textarea></label><label>Status<select class="pab-select pab-vacancy-status">'+statusOptions+'</select></label><div class="pab-actions"><button type="button" class="pab-btn secondary pab-save-vacancy" data-vacancy="'+esc(vacancy.id)+'">Save vacancy</button></div><small>Created '+esc(date(vacancy.createdAt))+'</small></div></article>';
  }

  function applicationCard(application){
    const transitions={
      submitted:['in_review','shortlisted','rejected','withdrawn'],
      in_review:['submitted','shortlisted','rejected','withdrawn'],
      shortlisted:['in_review','rejected','withdrawn'],
      appointed:[],
      rejected:[],
      withdrawn:[]
    };
    const allowed=transitions[application.status]||[];
    const options=['<option value="'+esc(application.status)+'" selected>'+esc(application.status.replaceAll('_',' '))+'</option>']
      .concat(allowed.map(status=>'<option value="'+status+'">'+status.replaceAll('_',' ')+'</option>')).join('');
    return '<article class="pab-category" data-application-card="'+esc(application.id)+'"><div class="pab-category-copy"><strong>'+esc(application.candidateDisplayName)+'</strong><p>'+esc(application.candidateUsername||'')+' · '+esc(application.vacancyTitle)+' · '+esc(application.departmentName)+'</p><span class="pab-tag">'+esc(application.positionTitle)+'</span><label>Review status<select class="pab-select pab-application-status" '+(!allowed.length?'disabled':'')+'>'+options+'</select></label><small>Submitted '+esc(date(application.createdAt))+' · '+esc((application.statusHistory||[]).length)+' status events</small>'+(allowed.length?'<div class="pab-actions"><button type="button" class="pab-btn secondary pab-save-application" data-application="'+esc(application.id)+'">Save review status</button></div>':'<div class="pab-warning">'+(application.status==='appointed'?'Owner-approved appointment recorded. Identity remains disabled and no permissions were granted.':'This application is closed. A new vacancy/application workflow is required for further consideration.')+'</div>')+'</div></article>';
  }

  function safetyReportCard(report){
    return '<article class="pab-report-card" data-report="'+esc(report.reportId)+'"><div class="pab-report-heading"><strong>'+esc(report.displayName||report.username||report.identityId)+'</strong><span class="pab-tag">'+esc(report.status||'pending')+'</span></div><p><strong>Reason:</strong> '+esc(String(report.reason||'other').replaceAll('_',' '))+'</p><p>'+esc(report.details||'No additional details provided.')+'</p><small>Submitted '+esc(date(report.createdAt))+'</small><label class="pab-report-resolution-label">Resolution note<textarea class="pab-textarea pab-report-resolution" data-report="'+esc(report.reportId)+'" maxlength="1200" placeholder="Record the review outcome and any action taken.">'+esc(report.resolutionNote||'')+'</textarea></label><div class="pab-actions"><button type="button" class="pab-btn secondary pab-review-report" data-report="'+esc(report.reportId)+'" data-status="in_review">Mark in review</button><button type="button" class="pab-btn secondary pab-review-report" data-report="'+esc(report.reportId)+'" data-status="actioned">Mark actioned</button><button type="button" class="pab-btn danger pab-review-report" data-report="'+esc(report.reportId)+'" data-status="dismissed">Dismiss report</button></div></article>';
  }

  function appointmentCard(appointment){
    const manager=appointment.reportingManagerName?appointment.reportingManagerName+' · '+(appointment.reportingManagerPositionTitle||'Position unavailable'): 'No reporting manager';
    return '<article class="pab-category" data-appointment-card="'+esc(appointment.id)+'"><div class="pab-category-copy"><strong>'+esc(appointment.candidateDisplayName)+'</strong><p>'+esc(appointment.positionTitle)+' · '+esc(appointment.departmentName)+'</p><span class="pab-tag">'+esc(appointment.status)+'</span><p><small>Reporting manager: '+esc(manager)+'<br>Approved by: '+esc(appointment.approvedBy||'')+' · '+esc(date(appointment.appointedAt))+'</small></p><div class="pab-warning">Identity status: unchanged disabled · Permissions: none granted · External execution: not enabled</div></div></article>';
  }

  function organizationNode(appointment,childrenByManager,rendered,ancestors){
    const id=String(appointment.id||'');
    if(ancestors.has(id))return '<div class="pab-warning" role="note">Circular reporting link detected. Review this appointment before using the reporting structure.</div>';
    if(rendered.has(id))return '';
    rendered.add(id);
    const nextAncestors=new Set(ancestors);nextAncestors.add(id);
    const children=childrenByManager.get(id)||[];
    return '<div class="pab-org-node" data-appointment="'+esc(id)+'"><article class="pab-org-card"><strong>'+esc(appointment.candidateDisplayName||'AI identity')+'</strong><span class="pab-tag">'+esc(appointment.positionTitle||'Position unavailable')+'</span><small>'+esc(appointment.departmentName||'Department unavailable')+' · '+esc(appointment.status||'status unknown')+'</small><small>AI identity remains disabled · No permissions granted</small></article>'+(children.length?'<div class="pab-org-children">'+children.map(child=>organizationNode(child,childrenByManager,rendered,nextAncestors)).join('')+'</div>':'')+'</div>';
  }

  function organizationChart(appointments){
    if(!Array.isArray(appointments)||!appointments.length)return '<div class="pab-empty">No approved appointments are available to build the organization chart.</div>';
    const byId=new Map(appointments.map(item=>[String(item.id),item]));
    const childrenByManager=new Map();
    const roots=[];
    for(const item of appointments){
      const managerId=String(item.reportingManagerAppointmentId||'');
      if(managerId&&managerId!==String(item.id)&&byId.has(managerId)){
        if(!childrenByManager.has(managerId))childrenByManager.set(managerId,[]);
        childrenByManager.get(managerId).push(item);
      }else roots.push({item,missingManager:Boolean(managerId)});
    }
    const rendered=new Set();
    let markup=roots.map(({item,missingManager})=>
      (missingManager?'<div class="pab-warning">Reporting manager record unavailable for '+esc(item.candidateDisplayName||'this appointment')+'. Displayed outside the linked hierarchy.</div>':'')+
      organizationNode(item,childrenByManager,rendered,new Set())
    ).join('');
    const unlinked=appointments.filter(item=>!rendered.has(String(item.id)));
    if(unlinked.length){
      markup+='<div class="pab-warning">Unlinked or circular reporting records require owner review.</div>';
      markup+=unlinked.map(item=>organizationNode(item,childrenByManager,rendered,new Set())).join('');
    }
    return '<div class="pab-org-tree" aria-label="Corporate appointment reporting structure">'+markup+'</div>';
  }

  function botCard(bot){
    const actions=Array.isArray(bot.allowedAutonomousActions)?bot.allowedAutonomousActions:[];
    const schedule=bot.activitySchedule||{timezone:'America/Jamaica',daysOfWeek:[1,2,3,4,5,6,7],startTime:'00:00',endTime:'23:59',maxTasksPerDay:0};
    const list=value=>Array.isArray(value)?value.map(item=>typeof item==='string'?item:(item&&typeof item==='object'?[item.institution,item.qualification,item.fieldOfStudy].filter(Boolean).join(' · '):'')).filter(Boolean).join(', '):'';
    const locations=Array.isArray(bot.locations)?bot.locations:[];
    const origin=locations.find(item=>item.locationType==='origin')||{
      countryCode:bot.originCountryCode||'',countryName:bot.countryOfOrigin||'',
      stateProvince:bot.originStateProvince||'',district:bot.originDistrict||'',
      parishCounty:bot.originParishCounty||'',city:bot.originCity||'',town:bot.originTown||'',
      timeZone:bot.originTimeZone||'UTC'
    };
    const current=locations.find(item=>item.locationType==='current')||{
      countryCode:bot.currentCountryCode||'',countryName:bot.currentCountry||'',
      stateProvince:bot.stateProvince||'',district:bot.district||'',
      parishCounty:bot.parishCounty||'',city:bot.city||'',town:bot.town||'',
      timeZone:bot.timeZone||bot.activitySchedule?.timezone||'America/Jamaica'
    };
    const jsonConfig=value=>JSON.stringify(value&&typeof value==='object'?value:{},null,2);
    let html='<article class="pab-bot-card" data-bot-card data-population="'+esc(bot.population||'independent')+'" data-search="'+esc((bot.displayName+' '+bot.categoryName+' '+bot.description+' '+bot.username).toLowerCase())+'">';
    html+='<div class="pab-bot-head"><label class="pab-check"><input type="checkbox" class="pab-bot-select" data-bot="'+esc(bot.id)+'" aria-label="Select '+esc(bot.displayName)+' for bulk controls"></label><div class="pab-avatar" aria-hidden="true">AI</div><div class="pab-bot-title"><h3>'+esc(bot.displayName)+'</h3><p>@'+esc(bot.username||'ai_pending')+' · '+esc(bot.bio||bot.description||'No biography added yet.')+'</p><div class="pab-actions" style="margin-top:7px"><span class="pab-tag">AI IDENTIFIED</span><span class="pab-tag">'+esc(bot.categoryName||'Uncategorized')+'</span><span class="pab-bot-state '+(bot.status==='enabled'?'enabled':'')+'">'+esc(bot.status||'disabled')+'</span></div></div></div>';
    html+='<div class="pab-bot-fields"><div class="pab-field"><label>AI population</label><select class="pab-select pab-bot-population" data-bot="'+esc(bot.id)+'">'+AI_POPULATIONS.map(item=>'<option value="'+item[0]+'" '+((bot.population||'independent')===item[0]?'selected':'')+'>'+esc(item[1])+'</option>').join('')+'</select></div></div>';
    html+='<div class="pab-bot-fields"><div class="pab-field"><label>Activation status</label><select class="pab-select pab-bot-status" data-bot="'+esc(bot.id)+'"><option value="disabled" '+(bot.status==='disabled'?'selected':'')+'>Disabled</option><option value="enabled" '+(bot.status==='enabled'?'selected':'')+'>Enabled</option><option value="paused" '+(bot.status==='paused'?'selected':'')+'>Paused</option></select></div><div class="pab-field"><label>Category</label><select class="pab-select pab-bot-category" data-bot="'+esc(bot.id)+'">'+(state.categories||[]).map(c=>'<option value="'+esc(c.id)+'" '+(c.id===bot.categoryId?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></div></div>';
    html+='<div class="pab-bot-fields"><div class="pab-field"><label>AI username</label><input class="pab-input pab-bot-username" data-bot="'+esc(bot.id)+'" maxlength="43" value="'+esc(bot.username||'')+'"></div><div class="pab-field"><label>Autonomy mode</label><select class="pab-select pab-bot-mode" data-bot="'+esc(bot.id)+'"><option value="administrator_controlled" '+(['administrator_controlled','human_approval'].includes(bot.autonomyMode||'administrator_controlled')?'selected':'')+'>Fully supervised</option><option value="supervisor_controlled" '+(bot.autonomyMode==='supervisor_controlled'?'selected':'')+'>Supervisor controlled</option><option value="hybrid" '+(bot.autonomyMode==='hybrid'?'selected':'')+'>Hybrid autonomy</option><option value="autonomous_within_limits" '+(bot.autonomyMode==='autonomous_within_limits'?'selected':'')+'>Autonomous within limits</option><option value="restricted_observation" '+(bot.autonomyMode==='restricted_observation'?'selected':'')+'>Restricted observation</option></select></div></div>';
    html+='<div class="pab-bot-fields"><div class="pab-field"><label>First name</label><input class="pab-input pab-bot-first-name" data-bot="'+esc(bot.id)+'" maxlength="80" value="'+esc(bot.firstName||'')+'"></div><div class="pab-field"><label>Middle name</label><input class="pab-input pab-bot-middle-name" data-bot="'+esc(bot.id)+'" maxlength="80" value="'+esc(bot.middleName||'')+'"></div><div class="pab-field"><label>Last name</label><input class="pab-input pab-bot-last-name" data-bot="'+esc(bot.id)+'" maxlength="80" value="'+esc(bot.lastName||'')+'"></div></div>';
    html+='<div class="pab-field"><label>Biography</label><textarea class="pab-textarea pab-bot-bio" data-bot="'+esc(bot.id)+'" maxlength="600">'+esc(bot.bio||'')+'</textarea></div>';
    html+='<div class="pab-bot-fields"><div class="pab-field"><label>Profile visibility</label><select class="pab-select pab-bot-visibility" data-bot="'+esc(bot.id)+'"><option value="private" '+((bot.visibility||'private')==='private'?'selected':'')+'>Private</option><option value="friends" '+(bot.visibility==='friends'?'selected':'')+'>Friends</option><option value="public" '+(bot.visibility==='public'?'selected':'')+'>Public</option></select></div><label class="pab-check"><span>List this AI in public discovery</span><input class="pab-bot-public-discovery" data-bot="'+esc(bot.id)+'" type="checkbox" '+(bot.publicProfileEnabled===true?'checked':'')+'></label></div><small class="pab-notice">A public profile appears in discovery only when the bot is enabled, Public visibility is selected, and public discovery is turned on.</small>';
    html+='<div class="pab-field"><label>Personality</label><textarea class="pab-textarea pab-bot-personality" data-bot="'+esc(bot.id)+'" maxlength="1200">'+esc(bot.personality||'')+'</textarea></div>';
    html+='<details class="pab-profile-details"><summary>Full AI profile, demographic and location details</summary>'+
      '<div class="pab-field"><label>Introduction</label><textarea class="pab-textarea pab-bot-introduction" data-bot="'+esc(bot.id)+'" maxlength="2000">'+esc(bot.introduction||'')+'</textarea></div>'+
      '<div class="pab-bot-fields"><div class="pab-field"><label>Gender</label><select class="pab-select pab-bot-gender" data-bot="'+esc(bot.id)+'">'+[['female','Female'],['male','Male'],['non_binary','Non-binary'],['other','Other'],['prefer_not_to_specify','Prefer not to specify']].map(item=>'<option value="'+item[0]+'" '+((bot.gender||'prefer_not_to_specify')===item[0]?'selected':'')+'>'+item[1]+'</option>').join('')+'</select></div><div class="pab-field"><label>Gender presentation</label><input class="pab-input pab-bot-gender-presentation" data-bot="'+esc(bot.id)+'" maxlength="80" value="'+esc(bot.genderPresentation||'')+'"></div></div>'+
      '<div class="pab-bot-fields"><div class="pab-field"><label>Nationality</label><input class="pab-input pab-bot-nationality" data-bot="'+esc(bot.id)+'" maxlength="120" value="'+esc(bot.nationality||'')+'"></div><div class="pab-field"><label>Country of origin</label><input class="pab-input pab-bot-country-origin" data-bot="'+esc(bot.id)+'" maxlength="120" value="'+esc(bot.countryOfOrigin||'')+'"></div><div class="pab-field"><label>Current country</label><input class="pab-input pab-bot-current-country" data-bot="'+esc(bot.id)+'" maxlength="120" value="'+esc(bot.currentCountry||'')+'"></div><div class="pab-field"><label>Profile time zone (IANA)</label><input class="pab-input pab-bot-profile-timezone" data-bot="'+esc(bot.id)+'" maxlength="80" value="'+esc(bot.timeZone||'America/Jamaica')+'"></div></div>'+
      '<div class="pab-field"><label>Communication style</label><textarea class="pab-textarea pab-bot-communication" data-bot="'+esc(bot.id)+'" maxlength="2000">'+esc(bot.communicationStyle||'')+'</textarea></div>'+
      '<div class="pab-bot-fields"><div class="pab-field"><label>Profession / occupation</label><input class="pab-input pab-bot-profession" data-bot="'+esc(bot.id)+'" maxlength="160" value="'+esc(bot.profession||'')+'"></div><div class="pab-field"><label>Education / qualifications (comma-separated)</label><input class="pab-input pab-bot-education" data-bot="'+esc(bot.id)+'" value="'+esc(list(bot.education))+'"></div><div class="pab-field"><label>Skills (comma-separated)</label><input class="pab-input pab-bot-skills" data-bot="'+esc(bot.id)+'" value="'+esc(list(bot.skills))+'"></div></div>'+
      '<div class="pab-divider"></div><strong>Country of origin location</strong>'+
      '<div class="pab-bot-fields"><div class="pab-field"><label>Country code (ISO-2)</label><input class="pab-input pab-origin-country-code" data-bot="'+esc(bot.id)+'" maxlength="2" value="'+esc(origin.countryCode||'')+'"></div><div class="pab-field"><label>Country</label><input class="pab-input pab-origin-country-name" list="pab-country-options" data-bot="'+esc(bot.id)+'" maxlength="120" value="'+esc(origin.countryName||bot.countryOfOrigin||'')+'"></div><div class="pab-field"><label>State / province</label><input class="pab-input pab-origin-state" data-bot="'+esc(bot.id)+'" maxlength="120" value="'+esc(origin.stateProvince||'')+'"></div><div class="pab-field"><label>District</label><input class="pab-input pab-origin-district" data-bot="'+esc(bot.id)+'" maxlength="120" value="'+esc(origin.district||'')+'"></div><div class="pab-field"><label>Parish / county</label><input class="pab-input pab-origin-parish" data-bot="'+esc(bot.id)+'" maxlength="120" value="'+esc(origin.parishCounty||'')+'"></div><div class="pab-field"><label>City</label><input class="pab-input pab-origin-city" data-bot="'+esc(bot.id)+'" maxlength="120" value="'+esc(origin.city||'')+'"></div><div class="pab-field"><label>Town</label><input class="pab-input pab-origin-town" data-bot="'+esc(bot.id)+'" maxlength="120" value="'+esc(origin.town||'')+'"></div><div class="pab-field"><label>Location time zone</label><input class="pab-input pab-origin-timezone" data-bot="'+esc(bot.id)+'" maxlength="80" value="'+esc(origin.timeZone||'UTC')+'"></div></div>'+
      '<div class="pab-divider"></div><strong>Current location</strong>'+
      '<div class="pab-bot-fields"><div class="pab-field"><label>Country code (ISO-2)</label><input class="pab-input pab-current-country-code" data-bot="'+esc(bot.id)+'" maxlength="2" value="'+esc(current.countryCode||'')+'"></div><div class="pab-field"><label>Country</label><input class="pab-input pab-current-country-name" list="pab-country-options" data-bot="'+esc(bot.id)+'" maxlength="120" value="'+esc(current.countryName||bot.currentCountry||'')+'"></div><div class="pab-field"><label>State / province</label><input class="pab-input pab-current-state" data-bot="'+esc(bot.id)+'" maxlength="120" value="'+esc(current.stateProvince||'')+'"></div><div class="pab-field"><label>District</label><input class="pab-input pab-current-district" data-bot="'+esc(bot.id)+'" maxlength="120" value="'+esc(current.district||'')+'"></div><div class="pab-field"><label>Parish / county</label><input class="pab-input pab-current-parish" data-bot="'+esc(bot.id)+'" maxlength="120" value="'+esc(current.parishCounty||'')+'"></div><div class="pab-field"><label>City</label><input class="pab-input pab-current-city" data-bot="'+esc(bot.id)+'" maxlength="120" value="'+esc(current.city||'')+'"></div><div class="pab-field"><label>Town</label><input class="pab-input pab-current-town" data-bot="'+esc(bot.id)+'" maxlength="120" value="'+esc(current.town||'')+'"></div><div class="pab-field"><label>Location time zone</label><input class="pab-input pab-current-timezone" data-bot="'+esc(bot.id)+'" maxlength="80" value="'+esc(current.timeZone||'America/Jamaica')+'"></div></div>'+
      '<div class="pab-bot-fields"><div class="pab-field"><label>Profile avatar storage reference</label><input class="pab-input pab-bot-avatar-reference" data-bot="'+esc(bot.id)+'" maxlength="300" value="'+esc(bot.avatarStorageReference||'')+'"></div><div class="pab-field"><label>Cover image storage reference</label><input class="pab-input pab-bot-cover-reference" data-bot="'+esc(bot.id)+'" maxlength="300" value="'+esc(bot.coverStorageReference||'')+'"></div></div>'+
      '<div class="pab-bot-fields"><div class="pab-field"><label>Voice preferences (JSON)</label><textarea class="pab-textarea pab-bot-voice-preferences" data-bot="'+esc(bot.id)+'">'+esc(jsonConfig(bot.voicePreferences))+'</textarea></div><div class="pab-field"><label>Avatar preferences (JSON)</label><textarea class="pab-textarea pab-bot-avatar-preferences" data-bot="'+esc(bot.id)+'">'+esc(jsonConfig(bot.avatarPreferences))+'</textarea></div><div class="pab-field"><label>Memory configuration (JSON)</label><textarea class="pab-textarea pab-bot-memory-configuration" data-bot="'+esc(bot.id)+'">'+esc(jsonConfig(bot.memoryConfiguration))+'</textarea></div></div>'+
      '<label class="pab-check"><span>Individual AI memory enabled</span><input type="checkbox" class="pab-bot-memory-enabled" data-bot="'+esc(bot.id)+'" '+(bot.memoryEnabled===true?'checked':'')+'></label>'+
      '<small class="pab-notice">Location entries and configuration values are validated before they are stored. Memory remains disabled unless explicitly enabled.</small></details>';
    html+='<div class="pab-bot-fields"><div class="pab-field"><label>Interests (comma-separated)</label><input class="pab-input pab-bot-interests" data-bot="'+esc(bot.id)+'" value="'+esc(list(bot.interests))+'"></div><div class="pab-field"><label>Hobbies (comma-separated)</label><input class="pab-input pab-bot-hobbies" data-bot="'+esc(bot.id)+'" value="'+esc(list(bot.hobbies))+'"></div></div>';
    html+='<div class="pab-field"><label>Language preferences (comma-separated)</label><input class="pab-input pab-bot-languages" data-bot="'+esc(bot.id)+'" value="'+esc(list(bot.languages||['English']))+'"></div>';
    html+='<div class="pab-field"><label>Standing administrator instructions</label><textarea class="pab-textarea pab-bot-instructions" data-bot="'+esc(bot.id)+'" maxlength="4000">'+esc(bot.administratorInstructions||'')+'</textarea></div>';
    html+='<div><strong style="font-size:11px">Allowed low-risk autonomous actions</strong><div class="pab-actions-checks">'+HYBRID_ACTIONS.map(item=>'<label class="pab-check"><input type="checkbox" class="pab-hybrid-action" data-bot="'+esc(bot.id)+'" value="'+esc(item[0])+'" '+(actions.includes(item[0])?'checked':'')+' '+(!['hybrid','autonomous_within_limits'].includes(bot.autonomyMode)?'disabled':'')+'> '+esc(item[1])+'</label>').join('')+'</div><small style="display:block;margin-top:5px;color:var(--muted,#64748b);font-size:10px">High-impact actions always require a separate instruction and approval. Low-risk permissions never enable publishing, follows, messages or broadcasting by themselves.</small></div>';
    html+='<details class="pab-schedule"><summary>Activity schedule and daily limits</summary><div class="pab-bot-fields"><div class="pab-field"><label>Timezone</label><input class="pab-input pab-schedule-timezone" data-bot="'+esc(bot.id)+'" value="'+esc(schedule.timezone||'America/Jamaica')+'"></div><div class="pab-field"><label>Days (1=Mon … 7=Sun, comma-separated)</label><input class="pab-input pab-schedule-days" data-bot="'+esc(bot.id)+'" value="'+esc(list(schedule.daysOfWeek||[1,2,3,4,5,6,7]))+'"></div><div class="pab-field"><label>Start time</label><input class="pab-input pab-schedule-start" type="time" data-bot="'+esc(bot.id)+'" value="'+esc(schedule.startTime||'00:00')+'"></div><div class="pab-field"><label>End time</label><input class="pab-input pab-schedule-end" type="time" data-bot="'+esc(bot.id)+'" value="'+esc(schedule.endTime||'23:59')+'"></div><div class="pab-field"><label>Maximum tasks per day (0 = no worker dispatch)</label><input class="pab-input pab-schedule-limit" type="number" min="0" max="500" data-bot="'+esc(bot.id)+'" value="'+esc(schedule.maxTasksPerDay||0)+'"></div></div><p class="pab-notice">Saved schedules are configuration only in this release. No scheduler or background worker is connected.</p></details>';
    html+='<div class="pab-actions"><button type="button" class="pab-btn secondary pab-save-bot" data-bot="'+esc(bot.id)+'">Save bot profile and controls</button><button type="button" class="pab-btn secondary pab-instruct" data-bot="'+esc(bot.id)+'">Give instruction</button></div><div class="pab-divider"></div>';
    html+='<form class="pab-instruction-form" data-bot-form="'+esc(bot.id)+'" hidden><div class="pab-field"><label>Instruction type</label><select class="pab-select pab-task-type">'+selectOptions(TASK_TYPES,'assistant_request')+'</select></div><div class="pab-field"><label>Administrator instruction</label><textarea class="pab-textarea pab-task-text" minlength="5" maxlength="4000" required placeholder="Describe exactly what you want this bot to do."></textarea></div><div class="pab-field"><label>Target member ID (required for follow/unfollow)</label><input class="pab-input pab-target-user" placeholder="Select a member below"></div><div class="pab-field"><label>Find a Minglora member</label><div class="pab-search-row"><input class="pab-input pab-member-search" placeholder="Search username or display name"><button type="button" class="pab-btn secondary pab-search-members" data-bot="'+esc(bot.id)+'">Search</button></div><div class="pab-member-results" id="pab-members-'+esc(bot.id)+'"></div></div><div class="pab-actions"><button class="pab-btn" type="submit">Submit instruction for approval</button><button class="pab-btn secondary pab-cancel-instruct" type="button">Close</button></div><small style="color:var(--muted,#64748b);font-size:10px">This records an instruction only. No post, follow, message, reaction or broadcast is executed by this release.</small></form>';
    html+='</article>';return html;
  }


  function teamCard(team){
    const members=Array.isArray(team.members)?team.members:[];
    const memberRows=members.map(member=>'<div class="pab-team-member"><span>'+esc(member.botName)+' <small>AI identity</small></span><button type="button" class="pab-btn secondary pab-team-remove" data-team="'+esc(team.id)+'" data-bot="'+esc(member.botId)+'">Remove</button></div>').join('');
    const options=(state.bots||[]).map(bot=>'<option value="'+esc(bot.id)+'">'+esc(bot.displayName)+' (@'+esc(bot.username||'AI')+')</option>').join('');
    return '<article class="pab-team-card" data-team-card="'+esc(team.id)+'"><div class="pab-team-top"><div><span class="pab-tag">BOT TEAM</span><span class="pab-status '+(team.status==='enabled'?'':'off')+'">'+esc(team.status||'disabled')+'</span></div><select class="pab-select pab-team-status" data-team="'+esc(team.id)+'"><option value="enabled" '+(team.status==='enabled'?'selected':'')+'>Enabled</option><option value="paused" '+(team.status==='paused'?'selected':'')+'>Paused</option><option value="disabled" '+(team.status==='disabled'?'selected':'')+'>Disabled</option></select></div><div class="pab-field"><label>Team name</label><input class="pab-input pab-team-name" data-team="'+esc(team.id)+'" maxlength="64" value="'+esc(team.name)+'"></div><div class="pab-field"><label>Description</label><textarea class="pab-textarea pab-team-description" data-team="'+esc(team.id)+'" maxlength="600">'+esc(team.description||'')+'</textarea></div><div class="pab-actions"><button type="button" class="pab-btn secondary pab-team-save" data-team="'+esc(team.id)+'">Save team</button><strong>'+members.length+' AI bot(s)</strong></div><div class="pab-team-members">'+(memberRows||'<div class="pab-empty">No bots assigned to this team.</div>')+'</div><div class="pab-field"><label>Add bots to this team</label><select multiple size="4" class="pab-select pab-team-candidates" data-team="'+esc(team.id)+'">'+options+'</select><small class="pab-notice">Only bots you manage can be assigned. A bot may belong to multiple teams. Team membership does not activate the bot.</small></div><button type="button" class="pab-btn pab-team-assign" data-team="'+esc(team.id)+'">Assign selected bots</button></article>';
  }

  function taskCard(task){
    const pending=task.status==='awaiting_administrator_approval';
    const status=task.status==='approved_waiting_for_worker'?'Approved · worker not configured':task.status;
    return '<article class="pab-task"><div><h4>'+esc(task.botName||'AI bot')+' · '+esc(String(task.taskType||'instruction').replaceAll('_',' '))+'</h4><p>'+esc(task.instruction||'No instruction text')+'</p><div class="pab-task-meta"><span>'+esc(status)+'</span><span>Submitted '+esc(date(task.createdAt))+'</span>'+(task.targetUserId?'<span>Target '+esc(task.targetUserId)+'</span>':'')+'</div></div><div class="pab-actions">'+(pending?'<button class="pab-btn secondary pab-approve-task" data-task="'+esc(task.id)+'">Approve</button>':'')+(!['completed','cancelled'].includes(task.status)?'<button class="pab-btn danger pab-cancel-task" data-task="'+esc(task.id)+'">Cancel</button>':'')+'</div></article>';
  }

  function providerRuntimeRow(item){
    return '<tr><td>'+esc(item.displayName||item.username||item.identityId)+'</td><td>'+esc(item.providerName||item.providerIdentifier)+'</td><td>'+esc(item.modelName||item.modelIdentifier)+'</td><td>'+(item.credentialConfigured===true?'Reference configured':'Reference missing')+'</td><td>'+esc(item.assignmentStatus||'configured')+'</td><td>'+esc(item.providerHealthStatus||'unknown')+'</td></tr>';
  }

  function providerAssignmentRow(item){
    return '<tr><td>'+esc(item.displayName||item.username||item.identityId)+'</td><td>'+esc(item.providerName||item.providerIdentifier)+'</td><td>'+esc(item.modelName||item.modelIdentifier)+'</td><td>'+((item.credentialConfigured===true)?'Reference saved':'Missing reference')+'</td><td>'+esc(item.accountStatus||'configured')+'</td><td>'+esc(item.providerHealthStatus||'unknown')+'</td><td>'+esc(item.assignmentStatus||'configured')+'</td></tr>';
  }

  function emailIdentityRow(item){
    return '<tr><td>'+esc(item.displayName||item.username||item.identityId)+'</td><td>'+esc(item.emailAddress)+'</td><td>'+esc(item.emailType)+'</td><td>'+(item.isPrimary?'Yes':'No')+'</td><td>'+esc(item.verificationStatus||'not_verified')+'</td><td>'+esc(item.provisioningStatus||'not_provisioned')+'</td><td>'+esc(item.emailProvider||'Not assigned')+'</td></tr>';
  }

  function batchHistoryRow(batch){
    return '<div class="pab-audit-row" data-batch="'+esc(batch.id)+'"><strong>'+esc(batch.status||'unknown')+' · '+esc(batch.completedRecords||0)+'/'+esc(batch.totalRecords||0)+' persisted · '+esc(batch.failedRecords||0)+' failed</strong><span>'+esc(date(batch.createdAt))+' · retries '+esc(batch.retryCount||0)+'</span></div>';
  }

  function canonicalIdentityRow(identity){
    return '<tr><td>'+esc(identity.firstName||'—')+'</td><td>'+esc(identity.middleName||'—')+'</td><td>'+esc(identity.lastName||'—')+'</td><td>@'+esc(identity.username||'—')+'</td><td>'+esc(identity.population||'—')+'</td><td>'+esc(identity.status||'—')+'</td><td>'+esc(identity.categoryName||identity.categoryId||'—')+'</td></tr>';
  }

  function render(){
    const counts=state.counts||{},network=state.network||{},bots=Array.isArray(state.bots)?state.bots:[];
    const identityRecords=Array.isArray(state.identityRecords)?state.identityRecords:[];
    const identitySource=state.identityRecordsSource||'legacy_runtime_state';
    let html='<datalist id="pab-country-options">'+AI_COUNTRY_CODES.map(code=>'<option value="'+esc(AI_COUNTRY_NAMES.of(code)||code)+'"></option>').join('')+'</datalist>';
    html+='<section class="pab-hero"><div><h1>Personal AI Bots Network</h1><p>Scalable, clearly disclosed AI identities within Minglora. Every identity, category, schedule, permission and task is managed here. AI activity remains separate from human engagement metrics.</p></div><span class="pab-status '+(network.enabled?'':'off')+'">'+(network.enabled?'Network enabled':'Network disabled')+'</span></section>';
    html+='<div class="pab-warning"><strong>Safe initial operating mode.</strong> New bots are disabled and administrator-controlled. This release has no model provider, scheduler or execution worker connected. Approved tasks remain queued; social actions are not performed. AI follows and activity must never be counted as human popularity or mixed into human follower, like, view or ranking totals.</div>';
    html+='<section class="pab-grid" aria-label="Bot network totals">'+metric(counts.totalBots,'Registered AI bots')+metric(counts.enabledBots,'Enabled')+metric(counts.activeBots,'Active in last 5 min')+metric(counts.executingBots,'Executing now')+metric(counts.pendingInstructions,'Awaiting approval')+'</section>';
    const identityRecordsHasMore=state.identityRecordsHasMore===true;
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Canonical PostgreSQL AI identity records</h2><p>Read from Minglora Supabase through the owner-only runtime gateway. This list loads 100 rows at a time; the displayed number is rows loaded, not total project capacity.</p></div><span class="pab-status '+(identitySource==='minglora_supabase_postgresql'?'':'off')+'">'+(identitySource==='minglora_supabase_postgresql'?'DATABASE READ':'LEGACY ONLY')+'</span></div>';
    html+='<div class="pab-metric"><strong id="pab-identity-count">'+esc(identityRecords.length.toLocaleString())+'</strong><span>Canonical identity rows loaded</span></div>';
    if(identitySource!=='minglora_supabase_postgresql')html+='<p class="pab-notice">Normalized Supabase identity reads are not configured in this runtime session. No PostgreSQL identity count is being claimed.</p>';
    else if(!identityRecords.length)html+='<div class="pab-empty">No canonical AI identity rows have been returned yet. Create an AI identity to persist its individual database record.</div>';
    else html+='<div class="pab-identity-table-wrap"><table class="pab-identity-table"><thead><tr><th>First name</th><th>Middle name</th><th>Last name</th><th>Username</th><th>Population</th><th>Lifecycle</th><th>Category</th></tr></thead><tbody id="pab-canonical-identity-rows">'+identityRecords.map(canonicalIdentityRow).join('')+'</tbody></table></div>';
    if(identitySource==='minglora_supabase_postgresql')html+='<div class="pab-pagination"><button type="button" class="pab-btn secondary" id="pab-load-more-identities" '+(identityRecordsHasMore?'':'hidden')+'>Load more identities</button><span id="pab-identity-load-status" class="pab-notice" role="status" aria-live="polite"></span></div>';
    html+='</section>';

    const batchHistory=Array.isArray(state.batchHistory)?state.batchHistory:[];
    const batchHistoryHasMore=state.batchHistoryHasMore===true;
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Bulk AI identity generation and import</h2><p>Import 1–100 individual AI identities per batch. Every row becomes a separate disabled identity, with its own first and last name, category and persistent record.</p></div><span class="pab-tag">Maximum 100 per batch</span></div>';
    html+='<div class="pab-warning">Use a JSON array of identity objects. Each item needs a displayName and categoryId (or firstName and lastName plus categoryId). Optional population values: independent, organizational or specialized_service. Duplicate names within a category are rejected. A failed database write can be retried with the same key and unchanged JSON.</div>';
    html+='<form id="pab-batch-form" class="pab-form-grid"><div class="pab-field full"><label for="pab-batch-items">AI identity records (JSON array)</label><textarea class="pab-textarea pab-batch-json" id="pab-batch-items" rows="8" required spellcheck="false" placeholder=\'[{"displayName":"AI Learning Guide","firstName":"AI","lastName":"Guide","categoryId":"ai-educators","population":"independent"},{"displayName":"AI Service Analyst","firstName":"AI","lastName":"Analyst","categoryId":"ai-support","population":"specialized_service"}]\'></textarea><small class="pab-notice">Supported fields include name fields, category, population, gender, nationality, country, languages, personality, interests, education, profession, skills and profile preferences.</small></div><div class="pab-field"><label for="pab-batch-key">Idempotency key (generated on first submit)</label><input class="pab-input" id="pab-batch-key" maxlength="120" autocomplete="off" placeholder="Generated automatically; keep it unchanged when retrying"></div><div class="pab-field full"><button class="pab-btn" type="submit">Create and persist AI identity batch</button><span id="pab-batch-status" class="pab-notice">Creation is not activation. New AI identities remain disabled and private.</span></div></form>';
    html+='<div class="pab-divider"></div><div class="pab-heading"><div><h3>Recent identity batches</h3><p>Saved batches are shown 50 at a time from the current runtime-state history and can be safely replayed using the same idempotency key and original records after a persistence interruption.</p></div></div>';
    html+=batchHistory.length?'<div id="pab-batch-history-list" class="pab-audit">'+batchHistory.map(batchHistoryRow).join('')+'</div>':'<div id="pab-batch-history-list" class="pab-audit"><div class="pab-empty">No identity batches have been submitted.</div></div>';
    html+='<div class="pab-pagination"><button type="button" class="pab-btn secondary" id="pab-load-more-batches" '+(batchHistoryHasMore?'':'hidden')+'>Load more batch history</button><span id="pab-batch-history-status" class="pab-notice" role="status" aria-live="polite"></span></div>';
    html+='<div id="pab-batch-results" class="pab-audit" aria-live="polite"></div>';
    html+='</section>';
    const providerAssignments=Array.isArray(state.providerAssignments)?state.providerAssignments:[];
    const providerSource=state.providerAssignmentsSource==='minglora_supabase_postgresql';
    const providerRuntimeAssignments=Array.isArray(state.providerRuntimeAssignments)?state.providerRuntimeAssignments:[];
    const providerRuntimeSource=state.providerRuntimeSource===true;
    const emailIdentities=Array.isArray(state.emailIdentities)?state.emailIdentities:[];
    const emailSource=state.emailIdentitiesSource==='minglora_supabase_postgresql';
    const providerAssignmentsHasMore=state.providerAssignmentsHasMore===true;
    const emailIdentitiesHasMore=state.emailIdentitiesHasMore===true;
    const safetyReports=Array.isArray(state.safetyReports)?state.safetyReports:[];
    const safetyReportsSource=state.safetyReportsSource==='minglora_supabase_postgresql';
    const safetyReportsNextOffset=Math.max(0,Number(state.safetyReportsNextOffset??safetyReports.length)||0);
    const safetyReportsHasMore=state.safetyReportsHasMore===true;
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>AI provider and model assignments</h2><p>Assign a provider account and model to an existing AI identity. Credentials are represented only by server-side environment references; raw keys are never accepted or displayed. Rows load 100 at a time; the number loaded is not a total count.</p></div><span class="pab-status '+(providerSource?'':'off')+'">'+(providerSource?'POSTGRESQL':'STORAGE UNAVAILABLE')+'</span></div>';
    html+='<div class="pab-warning">New assignments are saved as configured and unverified. A provider is not considered connected until a real secret exists in the server environment and a server-side health check succeeds. Provider health does not by itself enable task execution.</div>';
    if(!providerSource)html+='<div class="pab-empty">Provider assignment storage requires the staged Minglora Supabase migration and Edge Function release. No provider connection is claimed.</div>';
    else if(!providerAssignments.length)html+='<div class="pab-empty">No provider/model assignments have been configured for these AI identities.</div>';
    else html+='<div class="pab-identity-table-wrap"><table class="pab-identity-table"><thead><tr><th>AI identity</th><th>Provider</th><th>Model</th><th>Secret reference</th><th>Account</th><th>Health</th><th>Assignment</th></tr></thead><tbody id="pab-provider-assignment-rows">'+providerAssignments.map(providerAssignmentRow).join('')+'</tbody></table></div>';
    if(providerSource)html+='<div class="pab-pagination"><button type="button" class="pab-btn secondary" id="pab-load-more-providers" '+(providerAssignmentsHasMore?'':'hidden')+'>Load more provider assignments</button><span id="pab-provider-load-status" class="pab-notice" role="status" aria-live="polite"></span></div>';
    html+='<form id="pab-provider-form" class="pab-form-grid"><div class="pab-field"><label for="pab-provider-identity">AI identity</label><select class="pab-select" id="pab-provider-identity" required>'+bots.map(bot=>'<option value="'+esc(bot.id)+'">'+esc(bot.displayName)+' (@'+esc(bot.username||'AI')+')</option>').join('')+'</select></div><div class="pab-field"><label for="pab-provider-name">Provider name</label><input class="pab-input" id="pab-provider-name" maxlength="80" required placeholder="Provider display name"></div><div class="pab-field"><label for="pab-provider-id">Provider identifier</label><input class="pab-input" id="pab-provider-id" maxlength="80" required pattern="[a-z][a-z0-9._-]{1,79}" placeholder="provider_id"></div><div class="pab-field"><label for="pab-provider-account">Provider account reference</label><input class="pab-input" id="pab-provider-account" maxlength="120" value="default" required></div><div class="pab-field full"><label for="pab-provider-secret-ref">Server-side credential reference (not the credential)</label><input class="pab-input" id="pab-provider-secret-ref" maxlength="110" pattern="env:MINGLORA_AI_PROVIDER_[A-Z0-9_]{2,80}" placeholder="env:MINGLORA_AI_PROVIDER_..."><small class="pab-notice">The referenced environment variable must be provisioned securely on the Minglora server. Do not paste an API key here.</small></div><div class="pab-field"><label for="pab-model-name">Model name</label><input class="pab-input" id="pab-model-name" maxlength="160" required placeholder="Model display name"></div><div class="pab-field"><label for="pab-model-id">Model identifier</label><input class="pab-input" id="pab-model-id" maxlength="200" required placeholder="provider/model-id"></div><div class="pab-field"><label for="pab-model-version">Model version (optional)</label><input class="pab-input" id="pab-model-version" maxlength="80"></div><div class="pab-field"><label for="pab-provider-languages">Supported languages</label><input class="pab-input" id="pab-provider-languages" maxlength="500" placeholder="en, es, jam"></div><div class="pab-field"><label for="pab-provider-priority">Routing priority (1–1000)</label><input class="pab-input" id="pab-provider-priority" class="pab-input" type="number" min="1" max="1000" value="100"></div><div class="pab-field"><label class="pab-check"><span>Primary model assignment</span><input type="checkbox" id="pab-provider-primary"></label></div><div class="pab-field full"><button class="pab-btn" type="submit" '+(providerSource&&bots.length?'':'disabled')+'>Save provider/model assignment</button><span id="pab-provider-status" class="pab-notice">A saved assignment is not a verified provider connection.</span></div></form></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Worker-visible provider runtime configuration</h2><p>Read-only view of assignments eligible for worker routing. A configured credential reference or stored health label does not prove live connectivity or successful model inference. Runtime rows load 100 at a time; the number loaded is not a total count.</p></div><span class="pab-status '+(providerRuntimeSource?'':'off')+'">'+(providerRuntimeSource?'RUNTIME LIST':'NOT AVAILABLE')+'</span></div>';
    if(!providerRuntimeSource)html+='<div class="pab-empty">Provider runtime configuration could not be read from the current runtime gateway. No provider is claimed as connected.</div>';
    else if(!providerRuntimeAssignments.length)html+='<div class="pab-empty">No enabled provider assignments are currently eligible for runtime routing.</div>';
    else html+='<div class="pab-identity-table-wrap"><table class="pab-identity-table"><thead><tr><th>AI identity</th><th>Provider</th><th>Model</th><th>Credential reference</th><th>Assignment</th><th>Stored health</th></tr></thead><tbody id="pab-provider-runtime-rows">'+providerRuntimeAssignments.map(providerRuntimeRow).join('')+'</tbody></table></div>';
    if(providerRuntimeSource)html+='<div class="pab-pagination"><button type="button" class="pab-btn secondary" id="pab-load-more-provider-runtime" '+(state.providerRuntimeHasMore?'':'hidden')+'>Load more runtime assignments</button><span id="pab-provider-runtime-status" class="pab-notice" role="status" aria-live="polite"></span></div>';
    html+='</section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>AI email identity records</h2><p>Record a unique address against an AI identity. An address record is not an inbox: verification and provisioning only change after an actual email provider confirms them. Address rows load 100 at a time; the number loaded is not a total count.</p></div><span class="pab-status '+(emailSource?'':'off')+'">'+(emailSource?'POSTGRESQL':'STORAGE UNAVAILABLE')+'</span></div>';
    html+='<div class="pab-warning">Addresses saved here start as NOT VERIFIED and NOT PROVISIONED. This does not create a mailbox, enable sending, receive mail, or create a human Minglora login account.</div>';
    if(!emailSource)html+='<div class="pab-empty">AI email identity storage requires the staged Minglora Supabase migration and Edge Function release. No mailbox is claimed.</div>';
    else if(!emailIdentities.length)html+='<div class="pab-empty">No AI email identity records have been added.</div>';
    else html+='<div class="pab-identity-table-wrap"><table class="pab-identity-table"><thead><tr><th>AI identity</th><th>Email address</th><th>Type</th><th>Primary</th><th>Verification</th><th>Provisioning</th><th>Provider label</th></tr></thead><tbody id="pab-email-identity-rows">'+emailIdentities.map(emailIdentityRow).join('')+'</tbody></table></div>';
    if(emailSource)html+='<div class="pab-pagination"><button type="button" class="pab-btn secondary" id="pab-load-more-emails" '+(emailIdentitiesHasMore?'':'hidden')+'>Load more email identities</button><span id="pab-email-load-status" class="pab-notice" role="status" aria-live="polite"></span></div>';
    html+='<form id="pab-email-form" class="pab-form-grid"><div class="pab-field"><label for="pab-email-identity">AI identity</label><select class="pab-select" id="pab-email-identity" required>'+bots.map(bot=>'<option value="'+esc(bot.id)+'">'+esc(bot.displayName)+' (@'+esc(bot.username||'AI')+')</option>').join('')+'</select></div><div class="pab-field"><label for="pab-email-address">Email address</label><input class="pab-input" id="pab-email-address" type="email" maxlength="320" required placeholder="ai.name@example.com"></div><div class="pab-field"><label for="pab-email-type">Email type</label><select class="pab-select" id="pab-email-type"><option value="primary">Primary</option><option value="recovery">Recovery</option><option value="notification">Notification</option><option value="other">Other</option></select></div><div class="pab-field"><label for="pab-email-provider">Email provider label (optional)</label><input class="pab-input" id="pab-email-provider" maxlength="80" placeholder="Provider name, if selected"></div><div class="pab-field"><label class="pab-check"><span>Set as primary address</span><input type="checkbox" id="pab-email-primary" checked></label></div><div class="pab-field full"><button class="pab-btn" type="submit" '+(emailSource&&bots.length?'':'disabled')+'>Save AI email identity record</button><span id="pab-email-status" class="pab-notice">This records an address only; it does not provision a mailbox.</span></div></form></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>AI profile safety reports</h2><p>Review member-submitted reports about public AI identities. Review decisions are audited and never automatically delete an identity.</p></div><span class="pab-status '+(safetyReportsSource?'':'off')+'">'+(safetyReportsSource?'POSTGRESQL':'STORAGE UNAVAILABLE')+'</span></div>';
    if(!safetyReportsSource)html+='<div class="pab-empty">AI report review requires the staged safety/report migration and runtime gateway release.</div>';
    else html+='<div class="pab-field pab-report-filter"><label for="pab-safety-report-filter">Report status</label><select class="pab-select" id="pab-safety-report-filter"><option value="open" selected>Open reports (pending and in review)</option><option value="pending">Pending</option><option value="in_review">In review</option><option value="all">All reports</option><option value="actioned">Actioned</option><option value="dismissed">Dismissed</option></select></div><div id="pab-safety-report-list" class="pab-audit" aria-live="polite">'+(safetyReports.length?safetyReports.map(safetyReportCard).join(''):'<div class="pab-empty">No reports match this status.</div>')+'</div><div class="pab-pagination"><button type="button" class="pab-btn secondary" id="pab-load-more-reports" '+(safetyReportsHasMore?'':'hidden')+'>Load more reports</button></div>';
    html+='<span id="pab-report-review-status" class="pab-notice">Report handling updates review status and audit history. Account suspension remains a separate owner action.</span></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Network overview and global controls</h2><p>Identity design target: '+esc(Number(counts.identityDesignTarget||10000000000).toLocaleString())+' potential identity slots as an architectural aspiration, not a promise of live concurrent capacity. Actual capacity depends on configured workers, budgets and infrastructure.</p></div><span class="pab-status '+(network.enabled?'':'off')+'">'+(network.enabled?'ON':'OFF')+'</span></div><div class="pab-inline-controls"><label class="pab-control"><span><strong>Master network switch</strong><small>Enable or disable instruction intake across the network.</small></span><input id="pab-master-switch" class="pab-switch" type="checkbox" '+(network.enabled?'checked':'')+'></label><label class="pab-control"><span><strong>Hybrid mode availability</strong><small>Enable bounded low-risk permissions; every task remains approval-gated and dispatch stays off until the worker is released.</small></span><input id="pab-hybrid-switch" class="pab-switch" type="checkbox" '+(network.hybridEnabled?'checked':'')+'></label></div><div class="pab-form-grid"><div class="pab-field"><label for="pab-capacity">Concurrent execution limit (0 = no execution)</label><input id="pab-capacity" class="pab-input" type="number" min="0" max="10000" value="'+esc(network.concurrentExecutionLimit||0)+'"></div><div class="pab-field"><label for="pab-daily-budget">Daily task budget (0 = no dispatch)</label><input id="pab-daily-budget" class="pab-input" type="number" min="0" max="1000000" value="'+esc(network.dailyExecutionBudget||0)+'"></div></div><div class="pab-actions"><button class="pab-btn secondary" id="pab-save-capacity">Save network controls</button><button class="pab-btn secondary" id="pab-refresh">Refresh network</button><button class="pab-btn danger" id="pab-emergency-shutdown">Emergency shutdown</button><span class="pab-notice" id="pab-network-status">Automatic suspension: '+(network.automaticSuspensionEnabled===false?'off':'on')+'. Worker dispatch is unavailable until a worker is integrated.</span></div></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Category manager</h2><p>Rename, edit, enable or deactivate built-in and custom categories. Disabling a category blocks new bot instructions in that area.</p></div></div><div class="pab-category-grid">'+(state.categories||[]).map(categoryCard).join('')+'</div><form id="pab-category-form" class="pab-form-grid"><div class="pab-field"><label for="pab-new-category">New category name</label><input class="pab-input" id="pab-new-category" maxlength="56" required placeholder="e.g. AI Research"></div><div class="pab-field"><label for="pab-new-category-description">Description</label><input class="pab-input" id="pab-new-category-description" maxlength="600" placeholder="Category responsibilities"></div><div class="pab-field full"><button class="pab-btn secondary" type="submit">Create custom category</button><span class="pab-notice" id="pab-category-status"></span></div></form></section>';
    const departments=Array.isArray(state.departments)?state.departments:[];
    const departmentParentOptions='<option value="">No parent department</option>'+departments.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.name)+'</option>').join('');
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Corporate departments</h2><p>All 20 required departments are listed below. Edit names and responsibilities, enable or deactivate departments, and build a parent/child structure without creating staff records.</p></div><span class="pab-tag">'+departments.length+' departments</span></div>';
    html+='<div class="pab-warning">Department administration is restricted to the designated owner account. The catalogue does not fabricate employees, executives, managers or budgets. Any owner-approved appointments are recorded separately in the appointments section; appointments do not grant role permissions or operational authority.</div>';
    html+='<div class="pab-category-grid">'+(departments.length?departments.map(departmentCard).join(''):'<div class="pab-empty">Department catalogue is unavailable.</div>')+'</div>';
    html+='<form id="pab-department-form" class="pab-form-grid"><div class="pab-field"><label for="pab-new-department-name">New department name</label><input class="pab-input" id="pab-new-department-name" minlength="3" maxlength="80" required placeholder="e.g. Regional Partnerships"></div><div class="pab-field"><label for="pab-new-department-parent">Parent department (optional)</label><select class="pab-select" id="pab-new-department-parent">'+departmentParentOptions+'</select></div><div class="pab-field full"><label for="pab-new-department-description">Department responsibilities</label><textarea class="pab-textarea" id="pab-new-department-description" maxlength="600" placeholder="Describe the department remit and responsibilities"></textarea></div><div class="pab-field full"><button type="submit" class="pab-btn secondary">Create custom department</button><span id="pab-department-status" class="pab-notice">Custom departments are created enabled and may be deactivated later.</span></div></form></section>';
    const jobPositions=Array.isArray(state.jobPositions)?state.jobPositions:[];
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Corporate board and job-position catalogue</h2><p>View the board, executive and departmental reporting levels used for the future organization chart.</p></div><span class="pab-tag">'+jobPositions.length+' position types</span></div>';
    html+='<div class="pab-warning">These are role definitions, not appointment records. Approved appointments are listed separately in the appointments section. Position templates carry no permissions: they cannot approve actions, delegate, hire, manage budgets or execute external tasks.</div>';
    html+='<div class="pab-roadmap-grid">'+(jobPositions.length?jobPositions.map(jobPositionCard).join(''):'<div class="pab-empty">The job-position catalogue is unavailable.</div>')+'</div></section>';
    const vacancies=Array.isArray(state.vacancies)?state.vacancies:[];
    const vacancyPositionOptions=jobPositions.map(item=>'<option value="'+esc(item.code)+'">'+esc(item.title)+'</option>').join('');
    const vacancyDepartmentOptions=departments.filter(item=>item.enabled).map(item=>'<option value="'+esc(item.id)+'">'+esc(item.name)+'</option>').join('');
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Corporate vacancies</h2><p>Create and maintain openings against the approved job-position and department catalogues.</p></div><span class="pab-tag">'+vacancies.filter(item=>item.status==='open').length+' open</span></div>';
    html+='<div class="pab-warning">A vacancy is an opening record only. It does not create an AI identity, hire or appoint anyone, grant role permissions, create a mailbox, or activate an AI employee. Only existing positions and enabled departments can be selected.</div>';
    html+='<form id="pab-vacancy-form" class="pab-form-grid"><div class="pab-field"><label for="pab-vacancy-position">Job position</label><select class="pab-select" id="pab-vacancy-position" required>'+vacancyPositionOptions+'</select></div><div class="pab-field"><label for="pab-vacancy-department">Department</label><select class="pab-select" id="pab-vacancy-department" required>'+vacancyDepartmentOptions+'</select></div><div class="pab-field"><label for="pab-vacancy-title">Opening title</label><input class="pab-input" id="pab-vacancy-title" minlength="3" maxlength="100" placeholder="Defaults to selected position"></div><div class="pab-field"><label for="pab-vacancy-slots">Number of openings</label><input class="pab-input" id="pab-vacancy-slots" type="number" min="1" max="100" step="1" value="1" required></div><div class="pab-field full"><label for="pab-vacancy-description">Description</label><textarea class="pab-textarea" id="pab-vacancy-description" maxlength="1200"></textarea></div><div class="pab-field full"><label for="pab-vacancy-requirements">Required skills / qualifications</label><textarea class="pab-textarea" id="pab-vacancy-requirements" maxlength="2000"></textarea></div><div class="pab-field full"><button type="submit" class="pab-btn secondary">Create vacancy</button><span id="pab-vacancy-status" class="pab-notice">New vacancies start open. A shortlisted candidate can be appointed only through the separate owner-approved appointments workflow.</span></div></form>';
    html+='<div class="pab-divider"></div><div class="pab-category-grid">'+(vacancies.length?vacancies.map(vacancyCard).join(''):'<div class="pab-empty">No corporate vacancies have been created.</div>')+'</div></section>';
    const applications=Array.isArray(state.applications)?state.applications:[];
    const appointments=Array.isArray(state.appointments)?state.appointments:[];
    const employmentHistory=Array.isArray(state.employmentHistory)?state.employmentHistory:[];
    const organizationalCandidates=(state.bots||[]).filter(bot=>bot.population==='organizational'&&!['suspended','restricted','archived','retired'].includes(String(bot.status||'').toLowerCase()));
    const openVacancies=vacancies.filter(item=>item.status==='open'&&Number(item.remainingSlots??item.slots??1)>0);
    const shortlistedApplications=applications.filter(item=>item.status==='shortlisted'&&!appointments.some(appointment=>appointment.applicationId===item.id));
    const appointmentApplicationOptions=shortlistedApplications.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.candidateDisplayName)+' · '+esc(item.positionTitle)+' · '+esc(item.departmentName)+'</option>').join('');
    const reportingManagerOptions=appointments.filter(item=>item.status==='appointed').map(item=>'<option value="'+esc(item.id)+'">'+esc(item.candidateDisplayName)+' · '+esc(item.positionTitle)+' · '+esc(item.departmentName)+'</option>').join('');
    const candidateOptions=organizationalCandidates.map(bot=>'<option value="'+esc(bot.id)+'">'+esc(bot.displayName)+' · '+esc(bot.username||'')+'</option>').join('');
    const openVacancyOptions=openVacancies.map(item=>'<option value="'+esc(item.id)+'">'+esc(item.title)+' · '+esc(item.departmentName)+'</option>').join('');
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>AI candidate applications and review</h2><p>Submit an existing organizational AI identity to an open corporate vacancy and review its application status.</p></div><span class="pab-tag">'+applications.filter(item=>['submitted','in_review','shortlisted'].includes(item.status)).length+' active applications</span></div>';
    html+='<div class="pab-warning">Only existing AI identities with population "organizational" can be submitted. This workflow records candidate review only. Shortlisting, rejection or withdrawal does not appoint the AI, grant permissions, provision email, or activate an employee.</div>';
    html+='<form id="pab-application-form" class="pab-form-grid"><div class="pab-field"><label for="pab-application-candidate">Existing organizational AI candidate</label><select class="pab-select" id="pab-application-candidate" required>'+(candidateOptions||'<option value="">No eligible organizational AI identity exists yet</option>')+'</select></div><div class="pab-field"><label for="pab-application-vacancy">Open vacancy</label><select class="pab-select" id="pab-application-vacancy" required>'+(openVacancyOptions||'<option value="">No open vacancies exist</option>')+'</select></div><div class="pab-field full"><button type="submit" class="pab-btn secondary" '+(!candidateOptions||!openVacancyOptions?'disabled':'')+'>Submit candidate application</button><span id="pab-application-notice" class="pab-notice">A candidate can apply once to each vacancy. No appointments are made here.</span></div></form>';
    html+='<div class="pab-divider"></div><div class="pab-category-grid">'+(applications.length?applications.map(applicationCard).join(''):'<div class="pab-empty">No candidate applications have been submitted.</div>')+'</div></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Owner-approved corporate appointments</h2><p>Create a formal appointment record only after a candidate has been shortlisted.</p></div><span class="pab-tag">Human owner approval</span></div>';
    html+='<div class="pab-warning">Appointment requires a shortlisted organizational AI candidate and an open, matching vacancy with remaining slots. The AI identity stays disabled, no permissions are granted, no human Auth account or mailbox is created, and no worker or external action is started. Reporting roles require an already-appointed manager in an allowed parent position.</div>';
    html+='<form id="pab-appointment-form" class="pab-form-grid"><div class="pab-field"><label for="pab-appointment-application">Shortlisted candidate application</label><select class="pab-select" id="pab-appointment-application" required><option value="">Choose a shortlisted candidate</option>'+appointmentApplicationOptions+'</select></div><div class="pab-field"><label for="pab-appointment-manager">Reporting manager appointment</label><select class="pab-select" id="pab-appointment-manager"><option value="">No reporting manager selected</option>'+reportingManagerOptions+'</select><small id="pab-appointment-manager-help">The selected position determines whether an existing reporting manager is required.</small></div><div class="pab-field full"><button type="submit" class="pab-btn secondary" '+(!appointmentApplicationOptions?'disabled':'')+'>Create owner-approved appointment record</button><span id="pab-appointment-notice" class="pab-notice">This records an appointment only. It does not activate the AI or grant any permissions.</span></div></form>';
    html+='<div class="pab-divider"></div><h3>Corporate organization chart</h3><p class="pab-notice">The chart uses recorded owner-approved reporting-manager appointments. It grants no authority or permissions.</p>'+organizationChart(appointments);
    html+='<div class="pab-divider"></div><h3>Appointment records</h3><div class="pab-category-grid">'+(appointments.length?appointments.map(appointmentCard).join(''):'<div class="pab-empty">No corporate appointments have been recorded.</div>')+'</div>';
    html+='<div class="pab-divider"></div><h3>Employment history</h3>'+(employmentHistory.length?'<div class="pab-audit">'+employmentHistory.map(event=>'<div class="pab-audit-row"><strong>'+esc(event.eventType||'employment event')+' · '+esc(event.identityId||'')+'</strong><span>'+esc(date(event.createdAt))+' · Owner '+esc(event.actorId||'')+'</span></div>').join('')+'</div>':'<div class="pab-empty">No employment history events have been recorded.</div>')+'</section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Create bot identities</h2><p>Create a single AI identity or add the 15 disabled starter identities. Starter creation does not create human accounts or fabricate engagement.</p></div><div class="pab-actions"><button id="pab-create-starters" class="pab-btn">Create 15 starter bots</button></div></div><form id="pab-create-form" class="pab-form-grid"><div class="pab-field"><label for="pab-bot-name">Display name</label><input class="pab-input" id="pab-bot-name" maxlength="64" required placeholder="e.g. Minglora Learning Companion"></div><div class="pab-field"><label for="pab-bot-first-name">First name</label><input class="pab-input" id="pab-bot-first-name" maxlength="80" required placeholder="AI first name"></div><div class="pab-field"><label for="pab-bot-middle-name">Middle name (optional)</label><input class="pab-input" id="pab-bot-middle-name" maxlength="80" placeholder="Additional name"></div><div class="pab-field"><label for="pab-bot-last-name">Last name</label><input class="pab-input" id="pab-bot-last-name" maxlength="80" required placeholder="AI last name"></div><div class="pab-field"><label for="pab-bot-category">Category</label><select class="pab-select" id="pab-bot-category" required>'+(state.categories||[]).filter(c=>c.enabled).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('')+'</select></div><div class="pab-field"><label for="pab-bot-population">AI population</label><select class="pab-select" id="pab-bot-population"><option value="independent">Independent AI</option><option value="organizational">Organizational AI</option><option value="specialized_service">Specialized AI Service</option></select></div><div class="pab-field full"><label for="pab-bot-description">Biography / description</label><textarea class="pab-textarea" id="pab-bot-description" maxlength="600" placeholder="Describe this AI identity and its purpose"></textarea></div><div class="pab-field full"><label for="pab-bot-personality">Personality and communication style</label><textarea class="pab-textarea" id="pab-bot-personality" maxlength="1200" placeholder="Voice, tone, interests and interaction boundaries"></textarea></div><div class="pab-field full"><label for="pab-bot-interests">Interests (comma-separated)</label><input class="pab-input" id="pab-bot-interests" placeholder="Education, music, community"></div><div class="pab-field full"><label for="pab-bot-hobbies">Hobbies (comma-separated)</label><input class="pab-input" id="pab-bot-hobbies" placeholder="Reading, quizzes, gaming"></div><div class="pab-field full"><label for="pab-bot-languages">Language preferences</label><input class="pab-input" id="pab-bot-languages" value="English" placeholder="English, Spanish"></div><div class="pab-bot-fields"><div class="pab-field"><label for="pab-bot-gender">Gender</label><select class="pab-select" id="pab-bot-gender"><option value="prefer_not_to_specify">Prefer not to specify</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="other">Other</option></select></div><div class="pab-field"><label for="pab-bot-gender-presentation">Gender presentation (optional)</label><input class="pab-input" id="pab-bot-gender-presentation" maxlength="80" placeholder="Optional presentation descriptor"></div><div class="pab-field"><label for="pab-bot-nationality">Nationality</label><input class="pab-input" list="pab-country-options" id="pab-bot-nationality" maxlength="120"></div><div class="pab-field"><label for="pab-bot-country-origin">Country of origin</label><input class="pab-input" list="pab-country-options" id="pab-bot-country-origin" maxlength="120"></div><div class="pab-field"><label for="pab-bot-current-country">Current country</label><input class="pab-input" list="pab-country-options" id="pab-bot-current-country" maxlength="120"></div><div class="pab-field"><label for="pab-bot-profession">Profession / occupation</label><input class="pab-input" id="pab-bot-profession" maxlength="160"></div><div class="pab-field"><label for="pab-bot-education">Education / qualifications</label><input class="pab-input" id="pab-bot-education" placeholder="Degree, certification"></div><div class="pab-field"><label for="pab-bot-skills">Skills</label><input class="pab-input" id="pab-bot-skills" placeholder="Research, teaching"></div><div class="pab-field"><label for="pab-bot-timezone">Profile time zone (IANA)</label><input class="pab-input" id="pab-bot-timezone" value="America/Jamaica"></div></div><div class="pab-field full"><label for="pab-bot-introduction">Introduction</label><textarea class="pab-textarea" id="pab-bot-introduction" maxlength="2000"></textarea></div><div class="pab-field full"><label for="pab-bot-communication">Communication style</label><textarea class="pab-textarea" id="pab-bot-communication" maxlength="2000"></textarea></div><div class="pab-field full"><label for="pab-bot-admin-instructions">Standing administrator instructions</label><textarea class="pab-textarea" id="pab-bot-admin-instructions" maxlength="4000" placeholder="Rules this bot must follow. Publishing and social actions always require a separate approval."></textarea></div><div class="pab-field full"><button class="pab-btn" type="submit">Create disabled AI bot</button><span class="pab-notice" id="pab-create-status"></span></div></form></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Bot directory and command controls</h2><p>Search, select, edit, pause, resume and bulk-manage up to 100 bot identities per operation.</p></div><div class="pab-actions"><input id="pab-bot-filter" class="pab-input" style="width:min(250px,70vw)" placeholder="Search bots or categories" aria-label="Search bots"><select id="pab-population-filter" class="pab-select" aria-label="Filter by AI population" style="width:auto"><option value="all">All AI populations</option><option value="independent">Independent AI</option><option value="organizational">Organizational AI</option><option value="specialized_service">Specialized AI Services</option></select><button class="pab-btn secondary" id="pab-select-all">Select visible</button><button class="pab-btn secondary" id="pab-clear-selection">Clear selection</button></div></div><div class="pab-actions"><select id="pab-bulk-status" class="pab-select" style="width:auto"><option value="enabled">Enable selected</option><option value="paused">Pause selected</option><option value="disabled">Disable selected</option></select><button class="pab-btn secondary" id="pab-apply-bulk">Apply to selected bots</button><span class="pab-notice" id="pab-bulk-status-message">No bots selected.</span></div><div id="pab-bot-list" class="pab-bot-list">'+(bots.length?bots.map(botCard).join(''):'<div class="pab-empty">No bot identities have been created yet. Add a bot or create the 15-category starter set.</div>')+'</div></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Following Manager</h2><p>Choose 1–10 enabled AI bots and one real Minglora member. Each follow/unfollow request is individually approved, logged and kept separate from human follower counts.</p></div><span class="pab-tag">AI follow graph only</span></div><div class="pab-warning">Selected-bot batches are capped at 10 per target per rolling 24 hours, checked for duplicates and blocks, and recorded as separate approval items. No submitted instruction changes the relationship; approval only queues it for a future privacy-aware worker.</div><form id="pab-follow-form" class="pab-form-grid"><div class="pab-field"><label for="pab-follow-bot">AI bot</label><select id="pab-follow-bot" class="pab-select" multiple size="5" required>'+bots.filter(bot=>bot.status==='enabled').map(bot=>'<option value="'+esc(bot.id)+'">'+esc(bot.displayName)+' · '+esc(bot.categoryName)+'</option>').join('')+'</select><small class="pab-notice">Select 1–10 enabled bots. Each gets a separate approval record; the target limit is 10 instructions per rolling 24 hours.</small></div><div class="pab-field"><label for="pab-follow-action">Operation</label><select id="pab-follow-action" class="pab-select"><option value="follow">Follow selected member</option><option value="unfollow">Unfollow selected member</option></select></div><div class="pab-field full"><label for="pab-follow-search">Find a Minglora member</label><div class="pab-search-row"><input id="pab-follow-search" class="pab-input" minlength="2" placeholder="Search username or display name"><button type="button" class="pab-btn secondary" id="pab-follow-search-button">Search members</button></div><div id="pab-follow-results" class="pab-member-results"></div></div><div class="pab-field full"><label for="pab-follow-target">Selected member account</label><input id="pab-follow-target" class="pab-input" readonly required placeholder="Choose a member from search results"><small id="pab-follow-target-label" class="pab-notice">No target selected.</small></div><div class="pab-field full"><button type="submit" class="pab-btn">Submit instruction for administrator approval</button><span id="pab-follow-status" class="pab-notice">The bot must be enabled and the global network switch must be on.</span></div></form><div class="pab-divider"></div><div class="pab-heading"><div><h3>Follow/unfollow instruction history</h3><p>Only requests made by this AI bot system are shown here.</p></div></div><div id="pab-follow-task-history-list" class="pab-tasks">'+((state.tasks||[]).filter(task=>['follow','unfollow'].includes(task.taskType)).length?(state.tasks||[]).filter(task=>['follow','unfollow'].includes(task.taskType)).map(taskCard).join(''):'<div class="pab-empty">No follow or unfollow instructions yet.</div>')+'</div></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Bot Teams</h2><p>Organize specialized AI identities. Team membership never activates, follows, messages or publishes on behalf of a bot.</p></div><span class="pab-tag">'+((state.teams||[]).length)+' team(s)</span></div><form id="pab-team-create-form" class="pab-form-grid"><div class="pab-field"><label for="pab-new-team-name">Team name</label><input class="pab-input" id="pab-new-team-name" minlength="3" maxlength="64" required placeholder="e.g. Minglora Learning Team"></div><div class="pab-field"><label for="pab-new-team-description">Team purpose</label><input class="pab-input" id="pab-new-team-description" maxlength="600" placeholder="Describe the team responsibilities"></div><div class="pab-field full"><button type="submit" class="pab-btn">Create bot team</button><span class="pab-notice" id="pab-team-status"></span></div></form><div class="pab-team-grid">'+((state.teams||[]).length?state.teams.map(teamCard).join(''):'<div class="pab-empty">No teams have been created yet.</div>')+'</div></section>';
    const tasksHasMore=state.tasksHasMore===true;
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Instruction and approval queue</h2><p>Social tasks are individually approved and rate-limited. No mass-follow, engagement-boosting or popularity-manipulation operations are offered.</p></div></div><div id="pab-task-queue-list" class="pab-tasks">'+((state.tasks||[]).length?state.tasks.map(taskCard).join(''):'<div class="pab-empty">No instructions have been submitted.</div>')+'</div>';
    if(state.taskRecordsSource==='minglora_supabase_postgresql')html+='<div class="pab-pagination"><button type="button" class="pab-btn secondary" id="pab-load-more-tasks" '+(tasksHasMore?'':'hidden')+'>Load more tasks</button><span id="pab-task-load-status" class="pab-notice" role="status" aria-live="polite"></span></div>';
    html+='<span class="pab-notice" id="pab-task-status">Instruction submissions are capped per bot. Approved tasks await a worker and are not executed in this release.</span></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Administrator audit history</h2><p>Every bot, category, bulk-control, emergency shutdown and approval change is recorded.</p></div></div><div class="pab-audit">'+((state.audit||[]).length?state.audit.slice(0,50).map(row=>'<div class="pab-audit-row"><strong>'+esc(row.action||'Action')+' · '+esc(row.summary||'')+'</strong><span>'+esc(date(row.createdAt))+'</span></div>').join(''):'<div class="pab-empty">No bot administration events yet.</div>')+'</div></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>System implementation tracker</h2><p>Planned systems are shown honestly; they are not presented as active until their services and tests exist.</p></div></div><div class="pab-roadmap-grid">'+roadmapCard('Bot Personality Laboratory','Profile fields and personality storage added; live model testing not connected.','Foundation only')+roadmapCard('Bot Teams','Owner-scoped team creation, editing, enable/pause/disable and membership assignment are implemented; cross-department collaboration and task execution are not connected.','Partial')+roadmapCard('Smart Activity Scheduling','Per-bot schedule settings stored; no scheduler worker connected.','Configuration only')+roadmapCard('Bot Performance Center','Registered/enabled/active/executing counters and task/audit records exist; runtime telemetry not connected.','Partial')+roadmapCard('Multilingual Intelligence','Language preferences stored; translation provider not connected.','Configuration only')+roadmapCard('AI Creator Studio','Draft task types are queued; generation and media pipeline not connected.','Not implemented')+roadmapCard('Bot Security and Trust Center','Owner-only APIs, AI disclosure fields, rate limits, approvals and emergency shutdown foundation added.','Partial')+roadmapCard('AI Friendship and Companionship','AI friend category exists; member-facing companion sessions and consent controls not implemented.','Not implemented')+roadmapCard('AI Community Events','Event task types and category exist; event execution is not implemented.','Not implemented')+roadmapCard('Centralized Bot Command Center','Search, selection, bulk activation, pause/resume and emergency controls added.','Partial')+'</div></section>';
    root.innerHTML=html;bind();
  }
  function roadmapCard(title,description,status){return '<article class="pab-roadmap-card"><strong>'+esc(title)+'</strong><p>'+esc(description)+'</p><span class="pab-tag">'+esc(status)+'</span></article>';}

  function bind(){
    document.querySelector('#pab-refresh')?.addEventListener('click',refresh);
    document.querySelectorAll('.pab-review-report').forEach(node=>node.addEventListener('click',()=>reviewAiProfileReport(node.dataset.report,node.dataset.status)));
    document.querySelector('#pab-load-more-reports')?.addEventListener('click',loadMoreSafetyReports);
    document.querySelector('#pab-load-more-identities')?.addEventListener('click',loadMoreCanonicalIdentities);
    document.querySelector('#pab-load-more-tasks')?.addEventListener('click',loadMoreTaskRecords);
    document.querySelector('#pab-load-more-batches')?.addEventListener('click',loadMoreBatchHistory);
    document.querySelector('#pab-load-more-providers')?.addEventListener('click',loadMoreProviderAssignments);
    document.querySelector('#pab-load-more-provider-runtime')?.addEventListener('click',loadMoreProviderRuntime);
    document.querySelector('#pab-load-more-emails')?.addEventListener('click',loadMoreEmailIdentities);
    document.querySelector('#pab-safety-report-filter')?.addEventListener('change',()=>void loadMoreSafetyReports());

    document.querySelector('#pab-master-switch')?.addEventListener('change',saveNetwork);
    document.querySelector('#pab-hybrid-switch')?.addEventListener('change',saveNetwork);
    document.querySelector('#pab-save-capacity')?.addEventListener('click',saveCapacity);
    document.querySelector('#pab-emergency-shutdown')?.addEventListener('click',emergencyShutdown);
    document.querySelectorAll('.pab-category-switch').forEach(node=>node.addEventListener('change',()=>toggleCategory(node.dataset.category,node.checked)));
    document.querySelectorAll('.pab-save-category').forEach(node=>node.addEventListener('click',()=>saveCategory(node.dataset.category)));
    document.querySelectorAll('.pab-save-department').forEach(node=>node.addEventListener('click',()=>saveDepartment(node.dataset.department)));
    document.querySelector('#pab-department-form')?.addEventListener('submit',createDepartment);
    document.querySelector('#pab-vacancy-form')?.addEventListener('submit',createVacancy);
    document.querySelectorAll('.pab-save-vacancy').forEach(node=>node.addEventListener('click',()=>saveVacancy(node.dataset.vacancy)));
    document.querySelector('#pab-application-form')?.addEventListener('submit',createApplication);
    document.querySelectorAll('.pab-save-application').forEach(node=>node.addEventListener('click',()=>saveApplication(node.dataset.application)));
    document.querySelector('#pab-appointment-form')?.addEventListener('submit',createAppointment);
    document.querySelector('#pab-appointment-application')?.addEventListener('change',syncAppointmentManagerRequirement);
    syncAppointmentManagerRequirement();
    document.querySelector('#pab-create-starters')?.addEventListener('click',createStarters);
    document.querySelector('#pab-create-form')?.addEventListener('submit',createBot);
    document.querySelector('#pab-provider-form')?.addEventListener('submit',saveProviderAssignment);
    document.querySelector('#pab-batch-form')?.addEventListener('submit',createIdentityBatch);
    document.querySelector('#pab-email-form')?.addEventListener('submit',saveEmailIdentity);
    document.querySelector('#pab-team-create-form')?.addEventListener('submit',createTeam);
    document.querySelector('#pab-follow-search-button')?.addEventListener('click',searchFollowTargets);
    document.querySelector('#pab-follow-form')?.addEventListener('submit',submitFollowInstruction);

    document.querySelectorAll('.pab-team-save').forEach(node=>node.addEventListener('click',()=>saveTeam(node.dataset.team)));
    document.querySelectorAll('.pab-team-assign').forEach(node=>node.addEventListener('click',()=>assignTeamMembers(node.dataset.team)));
    document.querySelectorAll('.pab-team-remove').forEach(node=>node.addEventListener('click',()=>removeTeamMember(node.dataset.team,node.dataset.bot)));

    document.querySelector('#pab-category-form')?.addEventListener('submit',createCategory);
    document.querySelector('#pab-bot-filter')?.addEventListener('input',filterBots);
    document.querySelector('#pab-population-filter')?.addEventListener('change',filterBots);
    document.querySelector('#pab-select-all')?.addEventListener('click',()=>document.querySelectorAll('[data-bot-card]:not([hidden]) .pab-bot-select').forEach(node=>node.checked=true));
    document.querySelector('#pab-clear-selection')?.addEventListener('click',()=>document.querySelectorAll('.pab-bot-select').forEach(node=>node.checked=false));
    document.querySelector('#pab-apply-bulk')?.addEventListener('click',bulkUpdate);
    document.querySelectorAll('.pab-origin-country-name,.pab-current-country-name').forEach(node=>node.addEventListener('change',()=>{
      const code=AI_COUNTRY_CODE_BY_NAME.get(node.value.trim().toLocaleLowerCase());
      if(!code)return;
      const prefix=node.classList.contains('pab-origin-country-name')?'origin':'current';
      const card=node.closest('[data-bot-card]');
      const codeInput=card?.querySelector('.pab-'+prefix+'-country-code');
      if(codeInput)codeInput.value=code;
    }));
    document.querySelectorAll('.pab-save-bot').forEach(node=>node.addEventListener('click',()=>saveBot(node.dataset.bot)));
    document.querySelectorAll('.pab-bot-mode').forEach(node=>node.addEventListener('change',()=>{
      const card=node.closest('[data-bot-card]');if(!card)return;
      const allow=['hybrid','autonomous_within_limits'].includes(node.value);
      card.querySelectorAll('.pab-hybrid-action').forEach(action=>{
        action.disabled=!allow;
        if(!allow)action.checked=false;
      });
    }));
    document.querySelectorAll('.pab-instruct').forEach(node=>node.addEventListener('click',()=>{const form=document.querySelector('[data-bot-form="'+CSS.escape(node.dataset.bot)+'"]');if(form)form.hidden=!form.hidden;}));
    document.querySelectorAll('.pab-cancel-instruct').forEach(node=>node.addEventListener('click',()=>{const form=node.closest('form');if(form)form.hidden=true;}));
    document.querySelectorAll('.pab-instruction-form').forEach(form=>form.addEventListener('submit',event=>submitInstruction(event,form.dataset.botForm)));
    document.querySelectorAll('.pab-search-members').forEach(node=>node.addEventListener('click',()=>searchMembers(node.dataset.bot)));
    document.querySelectorAll('.pab-approve-task').forEach(node=>node.addEventListener('click',()=>taskAction(node.dataset.task,'approve')));
    document.querySelectorAll('.pab-cancel-task').forEach(node=>node.addEventListener('click',()=>taskAction(node.dataset.task,'cancel')));
  }

  async function searchFollowTargets(){
    const query=String(document.querySelector('#pab-follow-search')?.value||'').trim();
    const results=document.querySelector('#pab-follow-results');
    if(!results)return;
    if(query.length<2){results.innerHTML='<div class="pab-empty">Enter at least two characters.</div>';return;}
    try{
      const response=await request('/api/admin/users?search='+encodeURIComponent(query)+'&status=active');
      const users=Array.isArray(response.users)?response.users:[];
      results.innerHTML=users.length?users.slice(0,12).map(member=>'<div class="pab-member"><span><strong>'+esc(member.displayName||member.username||'Minglora member')+'</strong><br><small>@'+esc(member.username||'member')+'</small></span><button type="button" class="pab-btn secondary pab-follow-select" data-user="'+esc(member.id)+'" data-name="'+esc(member.displayName||member.username||'Minglora member')+'" data-username="'+esc(member.username||'member')+'">Select</button></div>').join(''):'<div class="pab-empty">No matching active member accounts.</div>';
      results.querySelectorAll('.pab-follow-select').forEach(button=>button.addEventListener('click',()=>{
        document.querySelector('#pab-follow-target').value=button.dataset.user;
        document.querySelector('#pab-follow-target-label').textContent=button.dataset.name+' (@'+button.dataset.username+') selected. AI identity will remain separately identified.';
        notice('pab-follow-status','Target selected. Submit the instruction for owner approval.','success');
      }));
    }catch(error){results.innerHTML='<div class="pab-notice error">'+esc(error.message)+'</div>';}
  }
  async function submitFollowInstruction(event){
    event.preventDefault();
    const botIds=[...document.querySelector('#pab-follow-bot')?.selectedOptions||[]].map(option=>option.value);
    const targetUserId=String(document.querySelector('#pab-follow-target')?.value||'').trim();
    const taskType=String(document.querySelector('#pab-follow-action')?.value||'follow');
    const targetLabel=String(document.querySelector('#pab-follow-target-label')?.textContent||'selected member');
    if(!botIds.length){notice('pab-follow-status','Select at least one enabled bot.','error');return;}
    if(botIds.length>10){notice('pab-follow-status','Select no more than 10 bots for this target in one 24-hour window.','error');return;}
    if(!targetUserId){notice('pab-follow-status','Search for and select a Minglora member first.','error');return;}
    const instruction=(taskType==='follow'?'Follow':'Unfollow')+' the selected Minglora member '+targetLabel+'. Re-check privacy, blocks, target account restrictions, administrator approval and AI-only relationship accounting immediately before any future execution.';
    try{
      const result=await request(API+'/follow-batch',{method:'POST',body:JSON.stringify({taskType,targetUserId,botIds,instruction})});
      await refresh();
      notice('pab-follow-status',result.message||result.created+' separate instructions queued for approval. No relationship changed.','success');
    }catch(error){notice('pab-follow-status',error.message,'error');}
  }


  async function createTeam(event){
    event.preventDefault();
    const name=document.querySelector('#pab-new-team-name').value.trim();
    const description=document.querySelector('#pab-new-team-description').value.trim();
    try{await request(API+'/teams',{method:'POST',body:JSON.stringify({name,description})});event.target.reset();notice('pab-team-status','Bot team created. No bots were activated.','success');await refresh();}
    catch(error){notice('pab-team-status',error.message,'error');}
  }
  async function saveTeam(id){
    const card=document.querySelector('[data-team-card="'+CSS.escape(id)+'"]');if(!card)return;
    const payload={name:card.querySelector('.pab-team-name').value,description:card.querySelector('.pab-team-description').value,status:card.querySelector('.pab-team-status').value};
    try{await request(API+'/teams/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(payload)});notice('pab-team-status','Team settings saved.','success');await refresh();}
    catch(error){notice('pab-team-status',error.message,'error');}
  }
  async function assignTeamMembers(id){
    const card=document.querySelector('[data-team-card="'+CSS.escape(id)+'"]');if(!card)return;
    const botIds=[...card.querySelector('.pab-team-candidates').selectedOptions].map(option=>option.value);
    if(!botIds.length){notice('pab-team-status','Select at least one bot to assign.','error');return;}
    try{const result=await request(API+'/teams/'+encodeURIComponent(id)+'/members',{method:'POST',body:JSON.stringify({botIds})});notice('pab-team-status',result.added+' bot(s) assigned. Team membership does not enable them.','success');await refresh();}
    catch(error){notice('pab-team-status',error.message,'error');}
  }
  async function removeTeamMember(teamId,botId){
    if(!window.confirm('Remove this AI bot from the team? The bot itself will not be deleted or disabled.'))return;
    try{await request(API+'/teams/'+encodeURIComponent(teamId)+'/members/'+encodeURIComponent(botId),{method:'DELETE'});notice('pab-team-status','Bot removed from team.','success');await refresh();}
    catch(error){notice('pab-team-status',error.message,'error');}
  }
  async function saveCapacity(){
    const enabled=!!document.querySelector('#pab-master-switch')?.checked;
    const hybridEnabled=!!document.querySelector('#pab-hybrid-switch')?.checked;
    const concurrentExecutionLimit=Number(document.querySelector('#pab-capacity')?.value||0);
    const dailyExecutionBudget=Number(document.querySelector('#pab-daily-budget')?.value||0);
    try{await request(API+'/network',{method:'PUT',body:JSON.stringify({enabled,hybridEnabled,concurrentExecutionLimit,dailyExecutionBudget})});notice('pab-network-status','Network capacity settings saved. A zero execution limit keeps workers disabled.','success');await refresh();}
    catch(error){notice('pab-network-status',error.message,'error');}
  }
  async function emergencyShutdown(){
    if(!window.confirm('Emergency shutdown will disable the network, pause enabled bots and cancel open tasks. Continue?'))return;
    try{const result=await request(API+'/emergency-shutdown',{method:'POST',body:'{}'});await refresh();notice('pab-network-status','Emergency shutdown complete. '+result.paused+' bot(s) paused; '+result.cancelled+' task(s) cancelled.','success');}
    catch(error){notice('pab-network-status',error.message,'error');}
  }
  async function bulkUpdate(){
    const botIds=[...document.querySelectorAll('.pab-bot-select:checked')].map(node=>node.dataset.bot);
    const status=document.querySelector('#pab-bulk-status')?.value||'disabled';
    if(!botIds.length){notice('pab-bulk-status-message','Select at least one bot.','error');return;}
    if(botIds.length>100){notice('pab-bulk-status-message','Select no more than 100 bots per operation.','error');return;}
    try{const result=await request(API+'/bots/bulk',{method:'POST',body:JSON.stringify({botIds,status})});await refresh();notice('pab-bulk-status-message',result.updated+' bot(s) set to '+status+'.','success');}
    catch(error){notice('pab-bulk-status-message',error.message,'error');}
  }
  async function saveCategory(id){
    const card=document.querySelector('[data-category-card="'+CSS.escape(id)+'"]');if(!card)return;
    const name=card.querySelector('.pab-category-name').value;
    const description=card.querySelector('.pab-category-description').value;
    const enabled=card.querySelector('.pab-category-switch').checked;
    try{await request(API+'/categories/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({name,description,enabled})});notice('pab-category-status','Category saved.','success');await refresh();}
    catch(error){notice('pab-category-status',error.message,'error');}
  }
  function filterBots(){const value=String(document.querySelector('#pab-bot-filter')?.value||'').trim().toLowerCase();const population=String(document.querySelector('#pab-population-filter')?.value||'all');document.querySelectorAll('[data-bot-card]').forEach(card=>{const searchMatches=String(card.dataset.search||'').includes(value);const populationMatches=population==='all'||card.dataset.population===population;card.hidden=!(searchMatches&&populationMatches);});}
  async function refresh(){try{state=await request(API);const batchResult=await request(API+'/batches?limit=50&offset=0');state.batchHistory=Array.isArray(batchResult.batches)?batchResult.batches:[];state.batchHistoryNextOffset=Number(batchResult.nextOffset)||state.batchHistory.length;state.batchHistoryHasMore=batchResult.hasMore===true;await loadProviderRuntimeOverview();render();}catch(error){notice('pab-network-status',error.message,'error');}}
  async function saveNetwork(){
    const enabled=!!document.querySelector('#pab-master-switch')?.checked,hybridEnabled=!!document.querySelector('#pab-hybrid-switch')?.checked;
    try{await request(API+'/network',{method:'PUT',body:JSON.stringify({enabled,hybridEnabled})});notice('pab-network-status','Network controls saved. Bots still require explicit instructions and approval.','success');await refresh();}
    catch(error){notice('pab-network-status',error.message,'error');}
  }
  async function toggleCategory(id,enabled){try{await request(API+'/categories/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({enabled})});notice('pab-network-status','Category control saved.','success');await refresh();}catch(error){notice('pab-network-status',error.message,'error');await refresh();}}

  function renderBatchResults(results){
    const container=document.querySelector('#pab-batch-results');
    if(!container)return;
    const rows=Array.isArray(results)?results:[];
    container.innerHTML=rows.length
      ?rows.map(result=>'<div class="pab-audit-row"><strong>Record '+esc(result.index)+' · '+esc(String(result.status||'unknown').replaceAll('_',' '))+'</strong><span>'+esc(result.identityId||result.errorCode||'')+(result.message?' · '+esc(result.message):'')+'</span></div>').join('')
      :'';
  }
  async function createIdentityBatch(event){
    event.preventDefault();
    const form=event.currentTarget;
    const button=form.querySelector('button[type="submit"]');
    const raw=document.querySelector('#pab-batch-items').value;
    const keyInput=document.querySelector('#pab-batch-key');
    let items;
    try{items=JSON.parse(raw);}catch{
      notice('pab-batch-status','Enter a valid JSON array of AI identity objects.','error');return;
    }
    if(!Array.isArray(items)||items.length<1||items.length>100){
      notice('pab-batch-status','Provide between 1 and 100 identity objects.','error');return;
    }
    let idempotencyKey=String(keyInput.value||'').trim();
    if(!idempotencyKey){
      const generated=window.crypto?.randomUUID?.();
      if(!generated){
        notice('pab-batch-status','A secure random key could not be generated. Enter an idempotency key before submitting.','error');return;
      }
      idempotencyKey=generated;
      keyInput.value=idempotencyKey;
    }
    if(button)button.disabled=true;
    try{
      const result=await request(API+'/batches',{method:'POST',body:JSON.stringify({idempotencyKey,items})});
      await refresh();
      renderBatchResults(result.results);
      const batch=result.batch||{};
      const failed=Number(batch.failedRecords||0);
      notice('pab-batch-status',(result.replayed?'Previously recorded batch results loaded. ':'')+
        'Persisted '+Number(batch.completedRecords||0)+' of '+Number(batch.totalRecords||items.length)+
        ' records; '+failed+' failed. New identities remain disabled.',
        failed?'error':'success');
      keyInput.value='';
    }catch(error){
      await refresh();
      renderBatchResults(error.payload?.results);
      notice('pab-batch-status',error.message+' Keep this idempotency key and the exact same JSON when retrying a persistence failure.','error');
    }finally{if(button)button.disabled=false;}
  }

  async function createStarters(){
    const button=document.querySelector('#pab-create-starters');if(button)button.disabled=true;
    try{const result=await request(API+'/starter-set',{method:'POST',body:'{}'});await refresh();notice('pab-create-status',result.created+' disabled starter bots created. They are not running or posting.','success');}
    catch(error){notice('pab-create-status',error.message,'error');}finally{if(button)button.disabled=false;}
  }
  async function createBot(event){
    event.preventDefault();const form=event.currentTarget;
    const csv=value=>String(value||'').split(',').map(item=>item.trim()).filter(Boolean);
    const payload={displayName:document.querySelector('#pab-bot-name').value,firstName:document.querySelector('#pab-bot-first-name').value,lastName:document.querySelector('#pab-bot-last-name').value,middleName:document.querySelector('#pab-bot-middle-name').value,categoryId:document.querySelector('#pab-bot-category').value,population:document.querySelector('#pab-bot-population').value,description:document.querySelector('#pab-bot-description').value,bio:document.querySelector('#pab-bot-description').value,gender:document.querySelector('#pab-bot-gender').value,genderPresentation:document.querySelector('#pab-bot-gender-presentation').value,nationality:document.querySelector('#pab-bot-nationality').value,countryOfOrigin:document.querySelector('#pab-bot-country-origin').value,currentCountry:document.querySelector('#pab-bot-current-country').value,originCountryCode:countryCodeForName(document.querySelector('#pab-bot-country-origin').value),currentCountryCode:countryCodeForName(document.querySelector('#pab-bot-current-country').value),timeZone:document.querySelector('#pab-bot-timezone').value,introduction:document.querySelector('#pab-bot-introduction').value,communicationStyle:document.querySelector('#pab-bot-communication').value,profession:document.querySelector('#pab-bot-profession').value,education:csv(document.querySelector('#pab-bot-education').value),skills:csv(document.querySelector('#pab-bot-skills').value),personality:document.querySelector('#pab-bot-personality').value,interests:csv(document.querySelector('#pab-bot-interests').value),hobbies:csv(document.querySelector('#pab-bot-hobbies').value),languages:csv(document.querySelector('#pab-bot-languages').value),administratorInstructions:document.querySelector('#pab-bot-admin-instructions').value};
    try{await request(API,{method:'POST',body:JSON.stringify(payload)});form.reset();await refresh();notice('pab-create-status','Bot created disabled. No actions are authorized.','success');}
    catch(error){notice('pab-create-status',error.message,'error');}
  }
  async function saveEmailIdentity(event){
    event.preventDefault();
    const payload={
      identityId:document.querySelector('#pab-email-identity').value,
      emailAddress:document.querySelector('#pab-email-address').value.trim().toLowerCase(),
      emailType:document.querySelector('#pab-email-type').value,
      emailProvider:document.querySelector('#pab-email-provider').value.trim(),
      isPrimary:!!document.querySelector('#pab-email-primary').checked
    };
    try{
      const result=await request(API+'/emails',{method:'POST',body:JSON.stringify(payload)});
      await refresh();
      notice('pab-email-status',result.message||'Email identity record saved. Mailbox not provisioned.','success');
    }catch(error){notice('pab-email-status',error.message,'error');}
  }

  async function loadMoreBatchHistory(){
    const button=document.querySelector('#pab-load-more-batches');
    const list=document.querySelector('#pab-batch-history-list');
    const status=document.querySelector('#pab-batch-history-status');
    if(!button||!list||button.disabled||state.batchHistoryLoading)return;
    state.batchHistoryLoading=true;
    button.disabled=true;
    if(status)status.textContent='Loading additional batch history…';
    try{
      const offset=Math.max(0,Number(state.batchHistoryNextOffset)||0);
      const params=new URLSearchParams({limit:'50',offset:String(offset)});
      const result=await request(API+'/batches?'+params.toString());
      const incoming=Array.isArray(result.batches)?result.batches:[];
      const existing=new Set((state.batchHistory||[]).map(batch=>String(batch.id||'')));
      const added=incoming.filter(batch=>!existing.has(String(batch.id||'')));
      if(added.length){
        list.querySelector('.pab-empty')?.remove();
        list.insertAdjacentHTML('beforeend',added.map(batchHistoryRow).join(''));
      }
      state.batchHistory=[...(state.batchHistory||[]),...added];
      const nextOffset=Number(result.nextOffset);
      state.batchHistoryNextOffset=Number.isInteger(nextOffset)&&nextOffset>=0?nextOffset:offset+incoming.length;
      state.batchHistoryHasMore=result.hasMore===true;
      button.hidden=!state.batchHistoryHasMore;
      if(status)status.textContent=added.length?('Loaded '+added.length+' more identity batch records from runtime history.'):'No additional identity batch records were returned.';
    }catch(error){if(status)status.textContent=error.message;}
    finally{state.batchHistoryLoading=false;button.disabled=false;}
  }

  async function loadMoreTaskRecords(){
    const button=document.querySelector('#pab-load-more-tasks');
    const queue=document.querySelector('#pab-task-queue-list');
    const followHistory=document.querySelector('#pab-follow-task-history-list');
    const status=document.querySelector('#pab-task-load-status');
    if(!button||!queue||button.disabled||state.tasksLoading)return;
    state.tasksLoading=true;
    button.disabled=true;
    if(status)status.textContent='Loading additional task records…';
    try{
      const offset=Math.max(0,Number(state.tasksNextOffset)||0);
      const params=new URLSearchParams({limit:'100',offset:String(offset)});
      const result=await request(API+'/tasks?'+params.toString());
      const incoming=Array.isArray(result.tasks)?result.tasks:[];
      const existing=new Set((state.tasks||[]).map(task=>String(task.id||'')));
      const added=incoming.filter(task=>!existing.has(String(task.id||'')));
      if(added.length){
        queue.querySelector('.pab-empty')?.remove();
        queue.insertAdjacentHTML('beforeend',added.map(taskCard).join(''));
        const followTasks=added.filter(task=>['follow','unfollow'].includes(task.taskType));
        if(followTasks.length&&followHistory){
          followHistory.querySelector('.pab-empty')?.remove();
          followHistory.insertAdjacentHTML('beforeend',followTasks.map(taskCard).join(''));
        }
      }
      state.tasks=[...(state.tasks||[]),...added];
      const nextOffset=Number(result.nextOffset);
      state.tasksNextOffset=Number.isInteger(nextOffset)&&nextOffset>=0?nextOffset:offset+incoming.length;
      state.tasksHasMore=result.hasMore===true;
      button.hidden=!state.tasksHasMore;
      if(status)status.textContent=added.length?('Loaded '+added.length+' more task records.'):'No additional task records were returned.';
    }catch(error){if(status)status.textContent=error.message;}
    finally{state.tasksLoading=false;button.disabled=false;}
  }

  async function loadProviderRuntimeOverview(){
    state.providerRuntimeAssignments=[];
    state.providerRuntimeNextOffset=0;
    state.providerRuntimeHasMore=false;
    state.providerRuntimeSource=false;
    state.providerRuntimeError='';
    try{
      const result=await request(API+'/provider-runtime?limit=100&offset=0');
      state.providerRuntimeAssignments=Array.isArray(result.assignments)?result.assignments:[];
      state.providerRuntimeNextOffset=Number(result.nextOffset)||state.providerRuntimeAssignments.length;
      state.providerRuntimeHasMore=result.hasMore===true;
      state.providerRuntimeSource=true;
    }catch(error){
      state.providerRuntimeError=error.message;
    }
  }

  async function loadMoreProviderRuntime(){
    const button=document.querySelector('#pab-load-more-provider-runtime');
    const rows=document.querySelector('#pab-provider-runtime-rows');
    const status=document.querySelector('#pab-provider-runtime-status');
    if(!button||!rows||button.disabled||state.providerRuntimeLoading)return;
    state.providerRuntimeLoading=true;
    button.disabled=true;
    if(status)status.textContent='Loading runtime assignments…';
    try{
      const offset=Math.max(0,Number(state.providerRuntimeNextOffset)||0);
      const params=new URLSearchParams({limit:'100',offset:String(offset)});
      const result=await request(API+'/provider-runtime?'+params.toString());
      const incoming=Array.isArray(result.assignments)?result.assignments:[];
      const existing=new Set((state.providerRuntimeAssignments||[]).map(item=>String(item.assignmentId||'')));
      const added=incoming.filter(item=>!existing.has(String(item.assignmentId||'')));
      if(added.length)rows.insertAdjacentHTML('beforeend',added.map(providerRuntimeRow).join(''));
      state.providerRuntimeAssignments=[...(state.providerRuntimeAssignments||[]),...added];
      const nextOffset=Number(result.nextOffset);
      state.providerRuntimeNextOffset=Number.isInteger(nextOffset)&&nextOffset>=0?nextOffset:offset+incoming.length;
      state.providerRuntimeHasMore=result.hasMore===true;
      button.hidden=!state.providerRuntimeHasMore;
      if(status)status.textContent=added.length?('Loaded '+added.length+' more runtime assignments.'):'No additional runtime assignments were returned.';
    }catch(error){if(status)status.textContent=error.message;}
    finally{state.providerRuntimeLoading=false;button.disabled=false;}
  }

  async function loadMoreProviderAssignments(){
    const button=document.querySelector('#pab-load-more-providers');
    const rows=document.querySelector('#pab-provider-assignment-rows');
    const status=document.querySelector('#pab-provider-load-status');
    if(!button||!rows||button.disabled||state.providerAssignmentsLoading)return;
    state.providerAssignmentsLoading=true;
    button.disabled=true;
    if(status)status.textContent='Loading provider assignments…';
    try{
      const offset=Math.max(0,Number(state.providerAssignmentsNextOffset)||0);
      const params=new URLSearchParams({limit:'100',offset:String(offset)});
      const result=await request(API+'/providers?'+params.toString());
      const incoming=Array.isArray(result.assignments)?result.assignments:[];
      const existing=new Set((state.providerAssignments||[]).map(item=>String(item.assignmentId||'')));
      const added=incoming.filter(item=>!existing.has(String(item.assignmentId||'')));
      if(added.length)rows.insertAdjacentHTML('beforeend',added.map(providerAssignmentRow).join(''));
      state.providerAssignments=[...(state.providerAssignments||[]),...added];
      const nextOffset=Number(result.nextOffset);
      state.providerAssignmentsNextOffset=Number.isInteger(nextOffset)&&nextOffset>=0?nextOffset:offset+incoming.length;
      state.providerAssignmentsHasMore=result.hasMore===true;
      button.hidden=!state.providerAssignmentsHasMore;
      if(status)status.textContent=added.length?('Loaded '+added.length+' more provider assignments.'):'No additional provider assignments were returned.';
    }catch(error){if(status)status.textContent=error.message;}
    finally{state.providerAssignmentsLoading=false;button.disabled=false;}
  }

  async function loadMoreEmailIdentities(){
    const button=document.querySelector('#pab-load-more-emails');
    const rows=document.querySelector('#pab-email-identity-rows');
    const status=document.querySelector('#pab-email-load-status');
    if(!button||!rows||button.disabled||state.emailIdentitiesLoading)return;
    state.emailIdentitiesLoading=true;
    button.disabled=true;
    if(status)status.textContent='Loading AI email identities…';
    try{
      const offset=Math.max(0,Number(state.emailIdentitiesNextOffset)||0);
      const params=new URLSearchParams({limit:'100',offset:String(offset)});
      const result=await request(API+'/emails?'+params.toString());
      const incoming=Array.isArray(result.emails)?result.emails:[];
      const existing=new Set((state.emailIdentities||[]).map(item=>String(item.id||'')));
      const added=incoming.filter(item=>!existing.has(String(item.id||'')));
      if(added.length)rows.insertAdjacentHTML('beforeend',added.map(emailIdentityRow).join(''));
      state.emailIdentities=[...(state.emailIdentities||[]),...added];
      const nextOffset=Number(result.nextOffset);
      state.emailIdentitiesNextOffset=Number.isInteger(nextOffset)&&nextOffset>=0?nextOffset:offset+incoming.length;
      state.emailIdentitiesHasMore=result.hasMore===true;
      button.hidden=!state.emailIdentitiesHasMore;
      if(status)status.textContent=added.length?('Loaded '+added.length+' more AI email identities.'):'No additional AI email identities were returned.';
    }catch(error){if(status)status.textContent=error.message;}
    finally{state.emailIdentitiesLoading=false;button.disabled=false;}
  }

  async function loadMoreCanonicalIdentities(){
    const button=document.querySelector('#pab-load-more-identities');
    const rows=document.querySelector('#pab-canonical-identity-rows');
    const status=document.querySelector('#pab-identity-load-status');
    if(!button||!rows||button.disabled||state.identityRecordsLoading)return;
    state.identityRecordsLoading=true;
    button.disabled=true;
    if(status)status.textContent='Loading canonical AI identities…';
    try{
      const offset=Math.max(0,Number(state.identityRecordsNextOffset)||0);
      const params=new URLSearchParams({limit:'100',offset:String(offset)});
      const result=await request(API+'/identities?'+params.toString());
      const incoming=Array.isArray(result.identities)?result.identities:[];
      const existing=new Set((state.identityRecords||[]).map(item=>String(item.id||item.identityId||'')));
      const added=incoming.filter(item=>!existing.has(String(item.id||item.identityId||'')));
      if(added.length)rows.insertAdjacentHTML('beforeend',added.map(canonicalIdentityRow).join(''));
      state.identityRecords=[...(state.identityRecords||[]),...added];
      const nextOffset=Number(result.nextOffset);
      state.identityRecordsNextOffset=Number.isInteger(nextOffset)&&nextOffset>=0?nextOffset:offset+incoming.length;
      state.identityRecordsHasMore=result.hasMore===true;
      const count=document.querySelector('#pab-identity-count');
      if(count)count.textContent=state.identityRecords.length.toLocaleString();
      button.hidden=!state.identityRecordsHasMore;
      if(status)status.textContent=added.length?('Loaded '+added.length+' more canonical identity records.'):'No additional canonical identity records were returned.';
    }catch(error){
      if(status)status.textContent=error.message;
    }finally{
      state.identityRecordsLoading=false;
      button.disabled=false;
    }
  }

  async function loadMoreSafetyReports({append=false}={}){
    const button=document.querySelector('#pab-load-more-reports');
    const list=document.querySelector('#pab-safety-report-list');
    const filter=document.querySelector('#pab-safety-report-filter');
    if(!button||!list||button.disabled||state.safetyReportsLoading)return;
    const status=filter?.value||'open';
    state.safetyReportsLoading=true;
    button.disabled=true;
    if(filter)filter.disabled=true;
    if(!append){
      state.safetyReports=[];
      state.safetyReportsNextOffset=0;
      state.safetyReportsHasMore=false;
      list.innerHTML='<div class="pab-empty">Loading AI profile reports…</div>';
    }
    try{
      const params=new URLSearchParams({status,limit:'100',offset:String(Math.max(0,Number(state.safetyReportsNextOffset)||0))});
      const result=await request(API+'/safety/reports?'+params.toString());
      const incoming=Array.isArray(result.reports)?result.reports:[];
      const existing=new Set((state.safetyReports||[]).map(item=>String(item.reportId)));
      const added=incoming.filter(item=>!existing.has(String(item.reportId)));
      if(!append)list.innerHTML='';
      if(added.length){
        list.querySelector('.pab-empty')?.remove();
        list.insertAdjacentHTML('beforeend',added.map(safetyReportCard).join(''));
      }
      state.safetyReports=[...(state.safetyReports||[]),...added];
      state.safetyReportsStatus=status;
      const nextOffset=Number(result.nextOffset);
      state.safetyReportsNextOffset=Number.isInteger(nextOffset)&&nextOffset>=0?nextOffset:state.safetyReportsNextOffset+incoming.length;
      state.safetyReportsHasMore=result.hasMore===true;
      button.hidden=!state.safetyReportsHasMore;
      if(!list.children.length)list.innerHTML='<div class="pab-empty">No reports match this status.</div>';
    }catch(error){
      if(!append)list.innerHTML='<div class="pab-empty pab-error">'+esc(error.message)+'</div>';
      notice('pab-report-review-status',error.message,'error');
    }finally{
      state.safetyReportsLoading=false;
      button.disabled=false;
      if(filter)filter.disabled=false;
    }
  }

  async function reviewAiProfileReport(reportId,status){
    const card=document.querySelector('.pab-report-card[data-report="'+CSS.escape(reportId)+'"]');
    if(!card)return;
    const resolutionNote=card.querySelector('.pab-report-resolution')?.value||'';
    try{
      await request(API+'/safety/reports/'+encodeURIComponent(reportId),{
        method:'PATCH',body:JSON.stringify({status,resolutionNote})
      });
      notice('pab-report-review-status','Report '+status.replaceAll('_',' ')+' and review decision recorded.','success');
      await refresh();
    }catch(error){notice('pab-report-review-status',error.message,'error');}
  }

  async function saveProviderAssignment(event){
    event.preventDefault();
    const csv=value=>String(value||'').split(',').map(item=>item.trim()).filter(Boolean);
    const payload={
      identityId:document.querySelector('#pab-provider-identity').value,
      providerName:document.querySelector('#pab-provider-name').value.trim(),
      providerIdentifier:document.querySelector('#pab-provider-id').value.trim().toLowerCase(),
      providerAccountReference:document.querySelector('#pab-provider-account').value.trim()||'default',
      credentialSecretReference:document.querySelector('#pab-provider-secret-ref').value.trim()||null,
      modelName:document.querySelector('#pab-model-name').value.trim(),
      modelIdentifier:document.querySelector('#pab-model-id').value.trim(),
      modelVersion:document.querySelector('#pab-model-version').value.trim(),
      supportedLanguages:csv(document.querySelector('#pab-provider-languages').value),
      routingPriority:Number(document.querySelector('#pab-provider-priority').value||100),
      isPrimary:!!document.querySelector('#pab-provider-primary').checked,
      textCapable:true,imageCapable:false,audioCapable:false,videoCapable:false,voiceCapable:false,
      capabilities:{text:true,image:false,audio:false,video:false,voice:false,tools:false}
    };
    try{
      const result=await request(API+'/providers',{method:'POST',body:JSON.stringify(payload)});
      await refresh();
      notice('pab-provider-status',result.message||'Provider/model assignment saved as unverified.','success');
    }catch(error){notice('pab-provider-status',error.message,'error');}
  }

  async function saveDepartment(id){
    const card=document.querySelector('[data-department-card="'+CSS.escape(id)+'"]');
    if(!card)return;
    const payload={
      name:card.querySelector('.pab-department-name').value,
      description:card.querySelector('.pab-department-description').value,
      enabled:card.querySelector('.pab-department-switch').checked,
      parentDepartmentId:card.querySelector('.pab-department-parent').value||null
    };
    try{
      await request(API+'/departments/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(payload)});
      await refresh();
      notice('pab-department-status','Department saved. No employee or appointment records were created.','success');
    }catch(error){notice('pab-department-status',error.message,'error');}
  }
  async function createDepartment(event){
    event.preventDefault();
    const form=event.currentTarget;
    const payload={
      name:document.querySelector('#pab-new-department-name').value,
      description:document.querySelector('#pab-new-department-description').value,
      parentDepartmentId:document.querySelector('#pab-new-department-parent').value||null
    };
    try{
      await request(API+'/departments',{method:'POST',body:JSON.stringify(payload)});
      form.reset();
      await refresh();
      notice('pab-department-status','Custom department created and saved.','success');
    }catch(error){notice('pab-department-status',error.message,'error');}
  }

  async function createVacancy(event){
    event.preventDefault();
    const form=event.currentTarget;
    const payload={
      positionCode:document.querySelector('#pab-vacancy-position').value,
      departmentId:document.querySelector('#pab-vacancy-department').value,
      title:document.querySelector('#pab-vacancy-title').value,
      slots:Number(document.querySelector('#pab-vacancy-slots').value),
      description:document.querySelector('#pab-vacancy-description').value,
      requirements:document.querySelector('#pab-vacancy-requirements').value
    };
    try{
      await request(API+'/vacancies',{method:'POST',body:JSON.stringify(payload)});
      form.reset();
      await refresh();
      notice('pab-vacancy-status','Vacancy created and saved. No AI identity or appointment was created.','success');
    }catch(error){notice('pab-vacancy-status',error.message,'error');}
  }
  async function saveVacancy(id){
    const card=document.querySelector('[data-vacancy-card="'+CSS.escape(id)+'"]');
    if(!card)return;
    const payload={
      title:card.querySelector('.pab-vacancy-title').value,
      slots:Number(card.querySelector('.pab-vacancy-slots').value),
      description:card.querySelector('.pab-vacancy-description').value,
      requirements:card.querySelector('.pab-vacancy-requirements').value,
      status:card.querySelector('.pab-vacancy-status').value
    };
    try{
      await request(API+'/vacancies/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify(payload)});
      await refresh();
      notice('pab-vacancy-status','Vacancy updated. No employee appointment was made.','success');
    }catch(error){notice('pab-vacancy-status',error.message,'error');}
  }

  async function createApplication(event){
    event.preventDefault();
    const form=event.currentTarget;
    try{
      await request(API+'/applications',{method:'POST',body:JSON.stringify({
        identityId:document.querySelector('#pab-application-candidate').value,
        vacancyId:document.querySelector('#pab-application-vacancy').value
      })});
      await refresh();
      notice('pab-application-notice','Candidate application submitted. No employee appointment or permission was created.','success');
    }catch(error){notice('pab-application-notice',error.message,'error');}
  }
  async function saveApplication(id){
    const card=document.querySelector('[data-application-card="'+CSS.escape(id)+'"]');
    if(!card)return;
    const status=card.querySelector('.pab-application-status').value;
    try{
      await request(API+'/applications/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({status})});
      await refresh();
      notice('pab-application-notice','Candidate review status saved. Appointment remains a separate workflow.','success');
    }catch(error){notice('pab-application-notice',error.message,'error');}
  }

  function syncAppointmentManagerRequirement(){
    const applicationId=document.querySelector('#pab-appointment-application')?.value||'';
    const manager=document.querySelector('#pab-appointment-manager');
    const help=document.querySelector('#pab-appointment-manager-help');
    if(!manager)return;
    const application=(state?.applications||[]).find(item=>item.id===applicationId);
    const position=(state?.jobPositions||[]).find(item=>item.code===application?.positionCode);
    const required=Array.isArray(position?.reportsTo)&&position.reportsTo.length>0;
    manager.required=required;
    if(!required)manager.value='';
    if(help)help.textContent=required
      ?'Required: select an already-appointed AI in an allowed parent position ('+position.reportsTo.join(', ')+').'
      :'No reporting manager is required for the selected board position.';
  }

  async function createAppointment(event){
    event.preventDefault();
    const applicationId=document.querySelector('#pab-appointment-application')?.value||'';
    const reportingManagerAppointmentId=document.querySelector('#pab-appointment-manager')?.value||'';
    const payload={applicationId};
    if(reportingManagerAppointmentId)payload.reportingManagerAppointmentId=reportingManagerAppointmentId;
    try{
      await request(API+'/appointments',{method:'POST',body:JSON.stringify(payload)});
      await refresh();
      notice('pab-appointment-notice','Owner-approved appointment recorded. The AI identity remains disabled and no permissions were granted.','success');
    }catch(error){notice('pab-appointment-notice',error.message,'error');}
  }

  async function createCategory(event){
    event.preventDefault();const form=event.currentTarget;
    try{await request(API+'/categories',{method:'POST',body:JSON.stringify({name:document.querySelector('#pab-new-category').value,description:document.querySelector('#pab-new-category-description').value})});form.reset();await refresh();notice('pab-category-status','Custom category created. It starts enabled but contains no bots.','success');}
    catch(error){notice('pab-category-status',error.message,'error');}
  }
  async function updateBot(id,payload){try{await request(API+'/bots/'+id,{method:'PATCH',body:JSON.stringify(payload)});await refresh();}catch(error){notice('pab-task-status',error.message,'error');await refresh();}}
  async function saveBot(id){
    const button=document.querySelector('.pab-save-bot[data-bot="'+CSS.escape(id)+'"]'),card=button?.closest('[data-bot-card]');if(!card)return;
    const csv=value=>String(value||'').split(',').map(item=>item.trim()).filter(Boolean);
    const mode=card.querySelector('.pab-bot-mode').value,actions=[...card.querySelectorAll('.pab-hybrid-action:checked')].map(node=>node.value);
    const categoryId=card.querySelector('.pab-bot-category').value,status=card.querySelector('.pab-bot-status').value;
    const days=csv(card.querySelector('.pab-schedule-days').value).map(Number);
    const payload={
      firstName:card.querySelector('.pab-bot-first-name').value,
      middleName:card.querySelector('.pab-bot-middle-name').value,
      lastName:card.querySelector('.pab-bot-last-name').value,
      username:card.querySelector('.pab-bot-username').value,
      population:card.querySelector('.pab-bot-population').value,
      bio:card.querySelector('.pab-bot-bio').value,
      description:card.querySelector('.pab-bot-bio').value,
      introduction:card.querySelector('.pab-bot-introduction').value,
      gender:card.querySelector('.pab-bot-gender').value,
      genderPresentation:card.querySelector('.pab-bot-gender-presentation').value,
      nationality:card.querySelector('.pab-bot-nationality').value,
      countryOfOrigin:card.querySelector('.pab-bot-country-origin').value,
      currentCountry:card.querySelector('.pab-bot-current-country').value,
      timeZone:card.querySelector('.pab-bot-profile-timezone').value,
      communicationStyle:card.querySelector('.pab-bot-communication').value,
      profession:card.querySelector('.pab-bot-profession').value,
      education:csv(card.querySelector('.pab-bot-education').value),
      skills:csv(card.querySelector('.pab-bot-skills').value),
      locations:[
        ...((state.bots.find(item=>item.id===id)?.locations||[]).filter(item=>!['origin','current'].includes(item.locationType))),
        ...(['origin','current'].map(type=>{
          const prefix=type==='origin'?'origin':'current';
          const read=field=>card.querySelector('.pab-'+prefix+'-'+field)?.value.trim()||'';
          const location={
            locationType:type,
            countryCode:read('country-code').toUpperCase()||countryCodeForName(read('country-name')) ,
            countryName:read('country-name'),
            stateProvince:read('state'),
            district:read('district'),
            parishCounty:read('parish'),
            city:read('city'),
            town:read('town'),
            timeZone:read('timezone')||(type==='origin'?'UTC':'America/Jamaica'),
            isPrimary:type==='current'
          };
          return Object.values(location).some(value=>typeof value==='string'&&value.trim())?location:null;
        }).filter(Boolean))
      ],
      avatarStorageReference:card.querySelector('.pab-bot-avatar-reference').value,
      coverStorageReference:card.querySelector('.pab-bot-cover-reference').value,
      voicePreferences:JSON.parse(card.querySelector('.pab-bot-voice-preferences').value||'{}'),
      avatarPreferences:JSON.parse(card.querySelector('.pab-bot-avatar-preferences').value||'{}'),
      memoryEnabled:card.querySelector('.pab-bot-memory-enabled').checked,
      memoryConfiguration:JSON.parse(card.querySelector('.pab-bot-memory-configuration').value||'{}'),
      personality:card.querySelector('.pab-bot-personality').value,
      interests:csv(card.querySelector('.pab-bot-interests').value),
      hobbies:csv(card.querySelector('.pab-bot-hobbies').value),
      languages:csv(card.querySelector('.pab-bot-languages').value),
      administratorInstructions:card.querySelector('.pab-bot-instructions').value,
      visibility:card.querySelector('.pab-bot-visibility').value,
      publicProfileEnabled:card.querySelector('.pab-bot-public-discovery').checked,
      activitySchedule:{
        timezone:card.querySelector('.pab-schedule-timezone').value,
        daysOfWeek:days,startTime:card.querySelector('.pab-schedule-start').value,
        endTime:card.querySelector('.pab-schedule-end').value,
        maxTasksPerDay:Number(card.querySelector('.pab-schedule-limit').value||0)
      },
      categoryId,status,autonomyMode:mode,allowedAutonomousActions:actions
    };
    try{await request(API+'/bots/'+id,{method:'PATCH',body:JSON.stringify(payload)});notice('pab-task-status','Bot profile and controls saved. Schedule is stored but not executed without a scheduler.','success');await refresh();}
    catch(error){notice('pab-task-status',error.message,'error');}
  }
  async function searchMembers(botId){
    const button=document.querySelector('.pab-search-members[data-bot="'+CSS.escape(botId)+'"]'),card=button?.closest('[data-bot-card]'),query=String(card?.querySelector('.pab-member-search')?.value||'').trim(),target=document.querySelector('#pab-members-'+CSS.escape(botId));
    if(!target)return;if(query.length<2){target.innerHTML='<div class="pab-empty">Enter at least two characters.</div>';return;}
    try{
      const result=await request('/api/admin/users?search='+encodeURIComponent(query)+'&status=active'),users=Array.isArray(result.users)?result.users:[];
      target.innerHTML=users.length?users.slice(0,12).map(user=>'<div class="pab-member"><span><strong>'+esc(user.displayName||user.username||'Minglora member')+'</strong><br><small>@'+esc(user.username||'member')+'</small></span><button type="button" class="pab-btn secondary pab-select-member" data-user="'+esc(user.id)+'">Select</button></div>').join(''):'<div class="pab-empty">No matching active member accounts.</div>';
      target.querySelectorAll('.pab-select-member').forEach(item=>item.addEventListener('click',()=>{card.querySelector('.pab-target-user').value=item.dataset.user;target.innerHTML='<div class="pab-notice success">Selected member ID: '+esc(item.dataset.user)+'</div>';}));
    }catch(error){target.innerHTML='<div class="pab-notice error">'+esc(error.message)+'</div>';}
  }
  async function submitInstruction(event,id){
    event.preventDefault();const card=event.currentTarget.closest('[data-bot-card]'),taskType=card.querySelector('.pab-task-type').value,instruction=card.querySelector('.pab-task-text').value,targetUserId=card.querySelector('.pab-target-user').value.trim();
    if(['follow','unfollow'].includes(taskType)&&!targetUserId){notice('pab-task-status','Select a real Minglora member for follow/unfollow instructions.','error');return;}
    try{await request(API+'/bots/'+id+'/instructions',{method:'POST',body:JSON.stringify({taskType,instruction,targetUserId:targetUserId||undefined})});notice('pab-task-status','Instruction recorded and waiting for administrator approval. No action was executed.','success');await refresh();}
    catch(error){notice('pab-task-status',error.message,'error');}
  }
  async function taskAction(id,action){
    try{const result=await request(API+'/tasks/'+id+'/'+action,{method:'POST',body:'{}'});notice('pab-task-status',result.message||'Instruction updated.','success');await refresh();}
    catch(error){notice('pab-task-status',error.message,'error');}
  }
  initialize();
})();