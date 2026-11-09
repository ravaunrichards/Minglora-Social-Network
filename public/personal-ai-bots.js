(()=> {
  const API='/api/admin/personal-ai-bots';
  const HYBRID_ACTIONS=[['analytics_read','Read-only analytics'],['moderation_flag','Flag content for review'],['draft_content','Prepare drafts (never publish)'],['translate_content','Translate approved text'],['prepare_faq_draft','Prepare FAQ drafts']];
  const TASK_TYPES=[['assistant_request','Assistant request'],['draft_post','Draft a post'],['share_media','Share photo or video'],['create_reel','Create a reel'],['draft_comment','Draft a comment'],['draft_reply','Draft a reply'],['follow','Follow a member'],['unfollow','Unfollow a member'],['react','React to content'],['join_group','Join a group'],['send_message','Prepare a message'],['event_participation','Prepare event participation'],['customer_service_draft','Prepare customer service reply'],['support_draft','Prepare support response'],['moderation_review','Review reported content'],['analytics_report','Prepare analytics report'],['automation_request','Automation request'],['community_event_draft','Prepare community event'],['live_show_plan','Prepare live show plan'],['translation','Translate content'],['other','Other administrator instruction']];
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const root=document.querySelector('#pab-root');
  let state=null;
  const request=async(path,options={})=>{
    const response=await fetch(path.startsWith('/api/')?path:API+path,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json','Content-Type':'application/json',...(options.headers||{})},...options});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||'The administrator request failed.');
    return payload;
  };
  const notice=(id,message,type='')=>{const node=document.querySelector('#'+id);if(node){node.textContent=message;node.className='pab-notice'+(type?' '+type:'');}};
  const date=value=>{const d=new Date(value);return value&&!Number.isNaN(d.getTime())?d.toLocaleString():'Time unavailable';};
  const selectOptions=(items,selected)=>items.map(item=>'<option value="'+esc(item[0])+'" '+(item[0]===selected?'selected':'')+'>'+esc(item[1])+'</option>').join('');

  async function initialize(){
    if(!root)return;
    try{
      const access=await request('/api/admin/access');
      if(!access.canAccess){
        root.innerHTML='<section class="pab-access-denied"><h1>Private Personal AI Bots Network</h1><p>Sign in with the designated Minglora owner account and complete authenticator verification in Admin Centre.</p><a class="pab-btn secondary" href="/admin-centre.html">Return to Admin Centre</a></section>';
        return;
      }
      state=await request(API);render();
    }catch(error){
      root.innerHTML='<section class="pab-access-denied"><h1>Could not open Personal AI Bots Network</h1><p>'+esc(error.message)+'</p><a class="pab-btn secondary" href="/admin-centre.html">Return to Admin Centre</a></section>';
    }
  }
  function metric(value,label){return '<div class="pab-metric"><strong>'+esc(Number(value||0).toLocaleString())+'</strong><span>'+esc(label)+'</span></div>';}
  function categoryCard(category){
    return '<article class="pab-category" data-category-card="'+esc(category.id)+'"><div class="pab-category-copy"><strong>'+esc(category.builtIn?'Built-in category':'Custom category')+'</strong><input class="pab-input pab-category-name" data-category="'+esc(category.id)+'" maxlength="56" value="'+esc(category.name)+'"><textarea class="pab-textarea pab-category-description" data-category="'+esc(category.id)+'" maxlength="600">'+esc(category.description||'')+'</textarea><div class="pab-actions"><button type="button" class="pab-btn secondary pab-save-category" data-category="'+esc(category.id)+'">Save category</button></div></div><label class="pab-check"><span>Enabled</span><input class="pab-switch pab-category-switch" data-category="'+esc(category.id)+'" type="checkbox" '+(category.enabled?'checked':'')+' aria-label="Enable '+esc(category.name)+' category"></label></article>';
  }

  function botCard(bot){
    const actions=Array.isArray(bot.allowedAutonomousActions)?bot.allowedAutonomousActions:[];
    const schedule=bot.activitySchedule||{timezone:'America/Jamaica',daysOfWeek:[1,2,3,4,5,6,7],startTime:'00:00',endTime:'23:59',maxTasksPerDay:0};
    const list=value=>Array.isArray(value)?value.join(', '):'';
    let html='<article class="pab-bot-card" data-bot-card data-search="'+esc((bot.displayName+' '+bot.categoryName+' '+bot.description+' '+bot.username).toLowerCase())+'">';
    html+='<div class="pab-bot-head"><label class="pab-check"><input type="checkbox" class="pab-bot-select" data-bot="'+esc(bot.id)+'" aria-label="Select '+esc(bot.displayName)+' for bulk controls"></label><div class="pab-avatar" aria-hidden="true">AI</div><div class="pab-bot-title"><h3>'+esc(bot.displayName)+'</h3><p>@'+esc(bot.username||'ai_pending')+' · '+esc(bot.bio||bot.description||'No biography added yet.')+'</p><div class="pab-actions" style="margin-top:7px"><span class="pab-tag">AI IDENTIFIED</span><span class="pab-tag">'+esc(bot.categoryName||'Uncategorized')+'</span><span class="pab-bot-state '+(bot.status==='enabled'?'enabled':'')+'">'+esc(bot.status||'disabled')+'</span></div></div></div>';
    html+='<div class="pab-bot-fields"><div class="pab-field"><label>Activation status</label><select class="pab-select pab-bot-status" data-bot="'+esc(bot.id)+'"><option value="disabled" '+(bot.status==='disabled'?'selected':'')+'>Disabled</option><option value="enabled" '+(bot.status==='enabled'?'selected':'')+'>Enabled</option><option value="paused" '+(bot.status==='paused'?'selected':'')+'>Paused</option></select></div><div class="pab-field"><label>Category</label><select class="pab-select pab-bot-category" data-bot="'+esc(bot.id)+'">'+(state.categories||[]).map(c=>'<option value="'+esc(c.id)+'" '+(c.id===bot.categoryId?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></div></div>';
    html+='<div class="pab-bot-fields"><div class="pab-field"><label>AI username</label><input class="pab-input pab-bot-username" data-bot="'+esc(bot.id)+'" maxlength="43" value="'+esc(bot.username||'')+'"></div><div class="pab-field"><label>Autonomy mode</label><select class="pab-select pab-bot-mode" data-bot="'+esc(bot.id)+'"><option value="administrator_controlled" '+(bot.autonomyMode==='administrator_controlled'?'selected':'')+'>Administrator-controlled</option><option value="human_approval" '+(bot.autonomyMode==='human_approval'?'selected':'')+'>Human approval for every task</option><option value="hybrid" '+(bot.autonomyMode==='hybrid'?'selected':'')+'>Hybrid (restricted)</option></select></div></div>';
    html+='<div class="pab-field"><label>Biography</label><textarea class="pab-textarea pab-bot-bio" data-bot="'+esc(bot.id)+'" maxlength="600">'+esc(bot.bio||'')+'</textarea></div>';
    html+='<div class="pab-field"><label>Personality</label><textarea class="pab-textarea pab-bot-personality" data-bot="'+esc(bot.id)+'" maxlength="1200">'+esc(bot.personality||'')+'</textarea></div>';
    html+='<div class="pab-bot-fields"><div class="pab-field"><label>Interests (comma-separated)</label><input class="pab-input pab-bot-interests" data-bot="'+esc(bot.id)+'" value="'+esc(list(bot.interests))+'"></div><div class="pab-field"><label>Hobbies (comma-separated)</label><input class="pab-input pab-bot-hobbies" data-bot="'+esc(bot.id)+'" value="'+esc(list(bot.hobbies))+'"></div></div>';
    html+='<div class="pab-field"><label>Language preferences (comma-separated)</label><input class="pab-input pab-bot-languages" data-bot="'+esc(bot.id)+'" value="'+esc(list(bot.languages||['English']))+'"></div>';
    html+='<div class="pab-field"><label>Standing administrator instructions</label><textarea class="pab-textarea pab-bot-instructions" data-bot="'+esc(bot.id)+'" maxlength="4000">'+esc(bot.administratorInstructions||'')+'</textarea></div>';
    html+='<div><strong style="font-size:11px">Allowed low-risk hybrid actions</strong><div class="pab-actions-checks">'+HYBRID_ACTIONS.map(item=>'<label class="pab-check"><input type="checkbox" class="pab-hybrid-action" data-bot="'+esc(bot.id)+'" value="'+esc(item[0])+'" '+(actions.includes(item[0])?'checked':'')+'> '+esc(item[1])+'</label>').join('')+'</div><small style="display:block;margin-top:5px;color:var(--muted,#64748b);font-size:10px">High-impact actions always require a separate instruction and approval. Hybrid permission never enables publishing, follows, messages or broadcasting by itself.</small></div>';
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

  function render(){
    const counts=state.counts||{},network=state.network||{},bots=Array.isArray(state.bots)?state.bots:[];
    let html='<section class="pab-hero"><div><h1>Personal AI Bots Network</h1><p>Scalable, clearly disclosed AI identities within Minglora. Every identity, category, schedule, permission and task is managed here. AI activity remains separate from human engagement metrics.</p></div><span class="pab-status '+(network.enabled?'':'off')+'">'+(network.enabled?'Network enabled':'Network disabled')+'</span></section>';
    html+='<div class="pab-warning"><strong>Safe initial operating mode.</strong> New bots are disabled and administrator-controlled. This release has no model provider, scheduler or execution worker connected. Approved tasks remain queued; social actions are not performed. AI follows and activity must never be counted as human popularity or mixed into human follower, like, view or ranking totals.</div>';
    html+='<section class="pab-grid" aria-label="Bot network totals">'+metric(counts.totalBots,'Registered AI bots')+metric(counts.enabledBots,'Enabled')+metric(counts.activeBots,'Active in last 5 min')+metric(counts.executingBots,'Executing now')+metric(counts.pendingInstructions,'Awaiting approval')+'</section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Network overview and global controls</h2><p>Identity design target: '+esc(Number(counts.identityDesignTarget||8300000000).toLocaleString())+' potential identity slots as an architectural aspiration, not a promise of live concurrent capacity. Actual capacity depends on configured workers, budgets and infrastructure.</p></div><span class="pab-status '+(network.enabled?'':'off')+'">'+(network.enabled?'ON':'OFF')+'</span></div><div class="pab-inline-controls"><label class="pab-control"><span><strong>Master network switch</strong><small>Enable or disable instruction intake across the network.</small></span><input id="pab-master-switch" class="pab-switch" type="checkbox" '+(network.enabled?'checked':'')+'></label><label class="pab-control"><span><strong>Hybrid mode availability</strong><small>Allow only low-risk read, flag, draft and translation permissions chosen per bot.</small></span><input id="pab-hybrid-switch" class="pab-switch" type="checkbox" '+(network.hybridEnabled?'checked':'')+'></label></div><div class="pab-form-grid"><div class="pab-field"><label for="pab-capacity">Concurrent execution limit (0 = no execution)</label><input id="pab-capacity" class="pab-input" type="number" min="0" max="10000" value="'+esc(network.concurrentExecutionLimit||0)+'"></div><div class="pab-field"><label for="pab-daily-budget">Daily task budget (0 = no dispatch)</label><input id="pab-daily-budget" class="pab-input" type="number" min="0" max="1000000" value="'+esc(network.dailyExecutionBudget||0)+'"></div></div><div class="pab-actions"><button class="pab-btn secondary" id="pab-save-capacity">Save network controls</button><button class="pab-btn secondary" id="pab-refresh">Refresh network</button><button class="pab-btn danger" id="pab-emergency-shutdown">Emergency shutdown</button><span class="pab-notice" id="pab-network-status">Automatic suspension: '+(network.automaticSuspensionEnabled===false?'off':'on')+'. Worker dispatch is unavailable until a worker is integrated.</span></div></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Category manager</h2><p>Rename, edit, enable or deactivate built-in and custom categories. Disabling a category blocks new bot instructions in that area.</p></div></div><div class="pab-category-grid">'+(state.categories||[]).map(categoryCard).join('')+'</div><form id="pab-category-form" class="pab-form-grid"><div class="pab-field"><label for="pab-new-category">New category name</label><input class="pab-input" id="pab-new-category" maxlength="56" required placeholder="e.g. AI Research"></div><div class="pab-field"><label for="pab-new-category-description">Description</label><input class="pab-input" id="pab-new-category-description" maxlength="600" placeholder="Category responsibilities"></div><div class="pab-field full"><button class="pab-btn secondary" type="submit">Create custom category</button><span class="pab-notice" id="pab-category-status"></span></div></form></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Create bot identities</h2><p>Create a single AI identity or add the 15 disabled starter identities. Starter creation does not create human accounts or fabricate engagement.</p></div><div class="pab-actions"><button id="pab-create-starters" class="pab-btn">Create 15 starter bots</button></div></div><form id="pab-create-form" class="pab-form-grid"><div class="pab-field"><label for="pab-bot-name">Display name</label><input class="pab-input" id="pab-bot-name" maxlength="64" required placeholder="e.g. Minglora Learning Companion"></div><div class="pab-field"><label for="pab-bot-category">Category</label><select class="pab-select" id="pab-bot-category" required>'+(state.categories||[]).filter(c=>c.enabled).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('')+'</select></div><div class="pab-field full"><label for="pab-bot-description">Biography / description</label><textarea class="pab-textarea" id="pab-bot-description" maxlength="600" placeholder="Describe this AI identity and its purpose"></textarea></div><div class="pab-field full"><label for="pab-bot-personality">Personality and communication style</label><textarea class="pab-textarea" id="pab-bot-personality" maxlength="1200" placeholder="Voice, tone, interests and interaction boundaries"></textarea></div><div class="pab-field full"><label for="pab-bot-interests">Interests (comma-separated)</label><input class="pab-input" id="pab-bot-interests" placeholder="Education, music, community"></div><div class="pab-field full"><label for="pab-bot-hobbies">Hobbies (comma-separated)</label><input class="pab-input" id="pab-bot-hobbies" placeholder="Reading, quizzes, gaming"></div><div class="pab-field full"><label for="pab-bot-languages">Language preferences</label><input class="pab-input" id="pab-bot-languages" value="English" placeholder="English, Spanish"></div><div class="pab-field full"><label for="pab-bot-admin-instructions">Standing administrator instructions</label><textarea class="pab-textarea" id="pab-bot-admin-instructions" maxlength="4000" placeholder="Rules this bot must follow. Publishing and social actions always require a separate approval."></textarea></div><div class="pab-field full"><button class="pab-btn" type="submit">Create disabled AI bot</button><span class="pab-notice" id="pab-create-status"></span></div></form></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Bot directory and command controls</h2><p>Search, select, edit, pause, resume and bulk-manage up to 100 bot identities per operation.</p></div><div class="pab-actions"><input id="pab-bot-filter" class="pab-input" style="width:min(250px,70vw)" placeholder="Search bots or categories" aria-label="Search bots"><button class="pab-btn secondary" id="pab-select-all">Select visible</button><button class="pab-btn secondary" id="pab-clear-selection">Clear selection</button></div></div><div class="pab-actions"><select id="pab-bulk-status" class="pab-select" style="width:auto"><option value="enabled">Enable selected</option><option value="paused">Pause selected</option><option value="disabled">Disable selected</option></select><button class="pab-btn secondary" id="pab-apply-bulk">Apply to selected bots</button><span class="pab-notice" id="pab-bulk-status-message">No bots selected.</span></div><div id="pab-bot-list" class="pab-bot-list">'+(bots.length?bots.map(botCard).join(''):'<div class="pab-empty">No bot identities have been created yet. Add a bot or create the 15-category starter set.</div>')+'</div></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Following Manager</h2><p>Choose one enabled AI bot and one real Minglora member. Follow/unfollow requests are individually approved, logged and kept separate from human follower counts.</p></div><span class="pab-tag">AI follow graph only</span></div><div class="pab-warning">No bulk-follow campaign or artificial popularity operation is available. A submitted instruction does not change the relationship; approval only queues it for a future privacy/block-aware worker.</div><form id="pab-follow-form" class="pab-form-grid"><div class="pab-field"><label for="pab-follow-bot">AI bot</label><select id="pab-follow-bot" class="pab-select" required>'+bots.filter(bot=>bot.status==='enabled').map(bot=>'<option value="'+esc(bot.id)+'">'+esc(bot.displayName)+' · '+esc(bot.categoryName)+'</option>').join('')+'</select></div><div class="pab-field"><label for="pab-follow-action">Operation</label><select id="pab-follow-action" class="pab-select"><option value="follow">Follow selected member</option><option value="unfollow">Unfollow selected member</option></select></div><div class="pab-field full"><label for="pab-follow-search">Find a Minglora member</label><div class="pab-search-row"><input id="pab-follow-search" class="pab-input" minlength="2" placeholder="Search username or display name"><button type="button" class="pab-btn secondary" id="pab-follow-search-button">Search members</button></div><div id="pab-follow-results" class="pab-member-results"></div></div><div class="pab-field full"><label for="pab-follow-target">Selected member account</label><input id="pab-follow-target" class="pab-input" readonly required placeholder="Choose a member from search results"><small id="pab-follow-target-label" class="pab-notice">No target selected.</small></div><div class="pab-field full"><button type="submit" class="pab-btn">Submit instruction for administrator approval</button><span id="pab-follow-status" class="pab-notice">The bot must be enabled and the global network switch must be on.</span></div></form><div class="pab-divider"></div><div class="pab-heading"><div><h3>Follow/unfollow instruction history</h3><p>Only requests made by this AI bot system are shown here.</p></div></div><div class="pab-tasks">'+(state.tasks||[]).filter(task=>['follow','unfollow'].includes(task.taskType)).length?(state.tasks||[]).filter(task=>['follow','unfollow'].includes(task.taskType)).map(taskCard).join(''):'<div class="pab-empty">No follow or unfollow instructions yet.</div>'+'</div></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Bot Teams</h2><p>Organize specialized AI identities. Team membership never activates, follows, messages or publishes on behalf of a bot.</p></div><span class="pab-tag">'+((state.teams||[]).length)+' team(s)</span></div><form id="pab-team-create-form" class="pab-form-grid"><div class="pab-field"><label for="pab-new-team-name">Team name</label><input class="pab-input" id="pab-new-team-name" minlength="3" maxlength="64" required placeholder="e.g. Minglora Learning Team"></div><div class="pab-field"><label for="pab-new-team-description">Team purpose</label><input class="pab-input" id="pab-new-team-description" maxlength="600" placeholder="Describe the team responsibilities"></div><div class="pab-field full"><button type="submit" class="pab-btn">Create bot team</button><span class="pab-notice" id="pab-team-status"></span></div></form><div class="pab-team-grid">'+((state.teams||[]).length?state.teams.map(teamCard).join(''):'<div class="pab-empty">No teams have been created yet.</div>')+'</div></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Instruction and approval queue</h2><p>Social tasks are individually approved and rate-limited. No mass-follow, engagement-boosting or popularity-manipulation operations are offered.</p></div></div><div class="pab-tasks">'+((state.tasks||[]).length?state.tasks.map(taskCard).join(''):'<div class="pab-empty">No instructions have been submitted.</div>')+'</div><span class="pab-notice" id="pab-task-status">Instruction submissions are capped per bot. Approved tasks await a worker and are not executed in this release.</span></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Administrator audit history</h2><p>Every bot, category, bulk-control, emergency shutdown and approval change is recorded.</p></div></div><div class="pab-audit">'+((state.audit||[]).length?state.audit.slice(0,50).map(row=>'<div class="pab-audit-row"><strong>'+esc(row.action||'Action')+' · '+esc(row.summary||'')+'</strong><span>'+esc(date(row.createdAt))+'</span></div>').join(''):'<div class="pab-empty">No bot administration events yet.</div>')+'</div></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>System implementation tracker</h2><p>Planned systems are shown honestly; they are not presented as active until their services and tests exist.</p></div></div><div class="pab-roadmap-grid">'+roadmapCard('Bot Personality Laboratory','Profile fields and personality storage added; live model testing not connected.','Foundation only')+roadmapCard('Bot Teams','Team collections reserved; team manager not implemented.','Not implemented')+roadmapCard('Smart Activity Scheduling','Per-bot schedule settings stored; no scheduler worker connected.','Configuration only')+roadmapCard('Bot Performance Center','Registered/enabled/active/executing counters and task/audit records exist; runtime telemetry not connected.','Partial')+roadmapCard('Multilingual Intelligence','Language preferences stored; translation provider not connected.','Configuration only')+roadmapCard('AI Creator Studio','Draft task types are queued; generation and media pipeline not connected.','Not implemented')+roadmapCard('Bot Security and Trust Center','Owner-only APIs, AI disclosure fields, rate limits, approvals and emergency shutdown foundation added.','Partial')+roadmapCard('AI Friendship and Companionship','AI friend category exists; member-facing companion sessions and consent controls not implemented.','Not implemented')+roadmapCard('AI Community Events','Event task types and category exist; event execution is not implemented.','Not implemented')+roadmapCard('Centralized Bot Command Center','Search, selection, bulk activation, pause/resume and emergency controls added.','Partial')+'</div></section>';
    root.innerHTML=html;bind();
  }
  function roadmapCard(title,description,status){return '<article class="pab-roadmap-card"><strong>'+esc(title)+'</strong><p>'+esc(description)+'</p><span class="pab-tag">'+esc(status)+'</span></article>';}

  function bind(){
    document.querySelector('#pab-refresh')?.addEventListener('click',refresh);
    document.querySelector('#pab-master-switch')?.addEventListener('change',saveNetwork);
    document.querySelector('#pab-hybrid-switch')?.addEventListener('change',saveNetwork);
    document.querySelector('#pab-save-capacity')?.addEventListener('click',saveCapacity);
    document.querySelector('#pab-emergency-shutdown')?.addEventListener('click',emergencyShutdown);
    document.querySelectorAll('.pab-category-switch').forEach(node=>node.addEventListener('change',()=>toggleCategory(node.dataset.category,node.checked)));
    document.querySelectorAll('.pab-save-category').forEach(node=>node.addEventListener('click',()=>saveCategory(node.dataset.category)));
    document.querySelector('#pab-create-starters')?.addEventListener('click',createStarters);
    document.querySelector('#pab-create-form')?.addEventListener('submit',createBot);
    document.querySelector('#pab-team-create-form')?.addEventListener('submit',createTeam);
    document.querySelector('#pab-follow-search-button')?.addEventListener('click',searchFollowTargets);
    document.querySelector('#pab-follow-form')?.addEventListener('submit',submitFollowInstruction);

    document.querySelectorAll('.pab-team-save').forEach(node=>node.addEventListener('click',()=>saveTeam(node.dataset.team)));
    document.querySelectorAll('.pab-team-assign').forEach(node=>node.addEventListener('click',()=>assignTeamMembers(node.dataset.team)));
    document.querySelectorAll('.pab-team-remove').forEach(node=>node.addEventListener('click',()=>removeTeamMember(node.dataset.team,node.dataset.bot)));

    document.querySelector('#pab-category-form')?.addEventListener('submit',createCategory);
    document.querySelector('#pab-bot-filter')?.addEventListener('input',filterBots);
    document.querySelector('#pab-select-all')?.addEventListener('click',()=>document.querySelectorAll('[data-bot-card]:not([hidden]) .pab-bot-select').forEach(node=>node.checked=true));
    document.querySelector('#pab-clear-selection')?.addEventListener('click',()=>document.querySelectorAll('.pab-bot-select').forEach(node=>node.checked=false));
    document.querySelector('#pab-apply-bulk')?.addEventListener('click',bulkUpdate);
    document.querySelectorAll('.pab-save-bot').forEach(node=>node.addEventListener('click',()=>saveBot(node.dataset.bot)));
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
    const botId=String(document.querySelector('#pab-follow-bot')?.value||'');
    const targetUserId=String(document.querySelector('#pab-follow-target')?.value||'').trim();
    const taskType=String(document.querySelector('#pab-follow-action')?.value||'follow');
    const targetLabel=String(document.querySelector('#pab-follow-target-label')?.textContent||'selected member');
    if(!botId){notice('pab-follow-status','Create and enable one bot before submitting this instruction.','error');return;}
    if(!targetUserId){notice('pab-follow-status','Search for and select a Minglora member first.','error');return;}
    const instruction=(taskType==='follow'?'Follow':'Unfollow')+' the selected Minglora member '+targetLabel+'. Re-check privacy, account blocks, approval and AI-only relationship accounting immediately before any future execution.';
    try{
      const result=await request(API+'/bots/'+encodeURIComponent(botId)+'/instructions',{method:'POST',body:JSON.stringify({taskType,targetUserId,instruction})});
      await refresh();
      notice('pab-follow-status',result.message||'Instruction recorded for administrator approval. No relationship changed.','success');
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
  function filterBots(){const value=String(document.querySelector('#pab-bot-filter')?.value||'').trim().toLowerCase();document.querySelectorAll('[data-bot-card]').forEach(card=>card.hidden=!card.dataset.search.includes(value));}
  async function refresh(){try{state=await request(API);render();}catch(error){notice('pab-network-status',error.message,'error');}}
  async function saveNetwork(){
    const enabled=!!document.querySelector('#pab-master-switch')?.checked,hybridEnabled=!!document.querySelector('#pab-hybrid-switch')?.checked;
    try{await request(API+'/network',{method:'PUT',body:JSON.stringify({enabled,hybridEnabled})});notice('pab-network-status','Network controls saved. Bots still require explicit instructions and approval.','success');await refresh();}
    catch(error){notice('pab-network-status',error.message,'error');}
  }
  async function toggleCategory(id,enabled){try{await request(API+'/categories/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({enabled})});notice('pab-network-status','Category control saved.','success');await refresh();}catch(error){notice('pab-network-status',error.message,'error');await refresh();}}
  async function createStarters(){
    const button=document.querySelector('#pab-create-starters');if(button)button.disabled=true;
    try{const result=await request(API+'/starter-set',{method:'POST',body:'{}'});await refresh();notice('pab-create-status',result.created+' disabled starter bots created. They are not running or posting.','success');}
    catch(error){notice('pab-create-status',error.message,'error');}finally{if(button)button.disabled=false;}
  }
  async function createBot(event){
    event.preventDefault();const form=event.currentTarget;
    const csv=value=>String(value||'').split(',').map(item=>item.trim()).filter(Boolean);
    const payload={displayName:document.querySelector('#pab-bot-name').value,categoryId:document.querySelector('#pab-bot-category').value,description:document.querySelector('#pab-bot-description').value,bio:document.querySelector('#pab-bot-description').value,personality:document.querySelector('#pab-bot-personality').value,interests:csv(document.querySelector('#pab-bot-interests').value),hobbies:csv(document.querySelector('#pab-bot-hobbies').value),languages:csv(document.querySelector('#pab-bot-languages').value),administratorInstructions:document.querySelector('#pab-bot-admin-instructions').value};
    try{await request(API,{method:'POST',body:JSON.stringify(payload)});form.reset();await refresh();notice('pab-create-status','Bot created disabled. No actions are authorized.','success');}
    catch(error){notice('pab-create-status',error.message,'error');}
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
      username:card.querySelector('.pab-bot-username').value,
      bio:card.querySelector('.pab-bot-bio').value,
      description:card.querySelector('.pab-bot-bio').value,
      personality:card.querySelector('.pab-bot-personality').value,
      interests:csv(card.querySelector('.pab-bot-interests').value),
      hobbies:csv(card.querySelector('.pab-bot-hobbies').value),
      languages:csv(card.querySelector('.pab-bot-languages').value),
      administratorInstructions:card.querySelector('.pab-bot-instructions').value,
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