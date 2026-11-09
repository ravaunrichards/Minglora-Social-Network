(()=> {
  const API='/api/admin/personal-ai-bots';
  const HYBRID_ACTIONS=[['analytics_read','Read-only analytics'],['moderation_flag','Flag content for review'],['draft_content','Prepare drafts (never publish)'],['translate_content','Translate approved text'],['prepare_faq_draft','Prepare FAQ drafts']];
  const TASK_TYPES=[['assistant_request','Assistant request'],['draft_post','Draft a post'],['draft_comment','Draft a comment'],['draft_reply','Draft a reply'],['follow','Follow a member'],['unfollow','Unfollow a member'],['customer_service_draft','Prepare customer service reply'],['support_draft','Prepare support response'],['moderation_review','Review reported content'],['analytics_report','Prepare analytics report'],['automation_request','Automation request'],['community_event_draft','Prepare community event'],['live_show_plan','Prepare live show plan'],['translation','Translate content'],['other','Other administrator instruction']];
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
    return '<label class="pab-category"><span><strong>'+esc(category.name)+'</strong><small>'+esc(category.description||'Custom AI bot category')+'</small></span><input class="pab-switch pab-category-switch" data-category="'+esc(category.id)+'" type="checkbox" '+(category.enabled?'checked':'')+' aria-label="Enable '+esc(category.name)+' category"></label>';
  }
  function botCard(bot){
    const actions=Array.isArray(bot.allowedAutonomousActions)?bot.allowedAutonomousActions:[];
    let html='<article class="pab-bot-card" data-bot-card data-search="'+esc((bot.displayName+' '+bot.categoryName+' '+bot.description).toLowerCase())+'">';
    html+='<div class="pab-bot-head"><div class="pab-avatar" aria-hidden="true">'+esc((bot.displayName||'AI').slice(0,1).toUpperCase())+'</div><div class="pab-bot-title"><h3>'+esc(bot.displayName)+'</h3><p>'+esc(bot.description||'No description added yet.')+'</p><div class="pab-actions" style="margin-top:7px"><span class="pab-tag">'+esc(bot.aiLabel||'AI Bot')+'</span><span class="pab-tag">'+esc(bot.categoryName||'Uncategorized')+'</span><span class="pab-bot-state '+(bot.status==='enabled'?'enabled':'')+'">'+esc(bot.status||'disabled')+'</span></div></div><label class="pab-check"><input type="checkbox" class="pab-switch pab-bot-switch" data-bot="'+esc(bot.id)+'" '+(bot.enabled?'checked':'')+' aria-label="Enable '+esc(bot.displayName)+'"></label></div>';
    html+='<div class="pab-bot-fields"><div class="pab-field"><label>Category</label><select class="pab-select pab-bot-category" data-bot="'+esc(bot.id)+'">'+(state.categories||[]).map(c=>'<option value="'+esc(c.id)+'" '+(c.id===bot.categoryId?'selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></div><div class="pab-field"><label>Autonomy mode</label><select class="pab-select pab-bot-mode" data-bot="'+esc(bot.id)+'"><option value="administrator_controlled" '+(bot.autonomyMode!=='hybrid'?'selected':'')+'>Administrator-controlled</option><option value="hybrid" '+(bot.autonomyMode==='hybrid'?'selected':'')+'>Hybrid (restricted)</option></select></div></div>';
    html+='<div><strong style="font-size:11px">Allowed low-risk hybrid actions</strong><div class="pab-actions-checks">'+HYBRID_ACTIONS.map(item=>'<label class="pab-check"><input type="checkbox" class="pab-hybrid-action" data-bot="'+esc(bot.id)+'" value="'+esc(item[0])+'" '+(actions.includes(item[0])?'checked':'')+'> '+esc(item[1])+'</label>').join('')+'</div><small style="display:block;margin-top:5px;color:var(--muted,#64748b);font-size:10px">Publishing, following, unfollowing, messaging and live broadcasting are never autonomous permissions.</small></div>';
    html+='<div class="pab-actions"><button type="button" class="pab-btn secondary pab-save-bot" data-bot="'+esc(bot.id)+'">Save bot settings</button><button type="button" class="pab-btn secondary pab-instruct" data-bot="'+esc(bot.id)+'">Give instruction</button></div><div class="pab-divider"></div>';
    html+='<form class="pab-instruction-form" data-bot-form="'+esc(bot.id)+'" hidden><div class="pab-field"><label>Instruction type</label><select class="pab-select pab-task-type">'+selectOptions(TASK_TYPES,'assistant_request')+'</select></div><div class="pab-field"><label>Administrator instruction</label><textarea class="pab-textarea pab-task-text" minlength="5" maxlength="4000" required placeholder="Describe exactly what you want this bot to do."></textarea></div><div class="pab-field"><label>Target member ID (required for follow/unfollow)</label><input class="pab-input pab-target-user" placeholder="Select a member below"></div><div class="pab-field"><label>Find a Minglora member</label><div class="pab-search-row"><input class="pab-input pab-member-search" placeholder="Search username or display name"><button type="button" class="pab-btn secondary pab-search-members" data-bot="'+esc(bot.id)+'">Search</button></div><div class="pab-member-results" id="pab-members-'+esc(bot.id)+'"></div></div><div class="pab-actions"><button class="pab-btn" type="submit">Submit instruction for approval</button><button class="pab-btn secondary pab-cancel-instruct" type="button">Close</button></div><small style="color:var(--muted,#64748b);font-size:10px">This records your instruction only. Approval is required and no real follow, post, message or broadcast is performed by this release.</small></form>';
    html+='</article>';return html;
  }
  function taskCard(task){
    const pending=task.status==='awaiting_administrator_approval';
    const status=task.status==='approved_waiting_for_worker'?'Approved · worker not configured':task.status;
    return '<article class="pab-task"><div><h4>'+esc(task.botName||'AI bot')+' · '+esc(String(task.taskType||'instruction').replaceAll('_',' '))+'</h4><p>'+esc(task.instruction||'No instruction text')+'</p><div class="pab-task-meta"><span>'+esc(status)+'</span><span>Submitted '+esc(date(task.createdAt))+'</span>'+(task.targetUserId?'<span>Target '+esc(task.targetUserId)+'</span>':'')+'</div></div><div class="pab-actions">'+(pending?'<button class="pab-btn secondary pab-approve-task" data-task="'+esc(task.id)+'">Approve</button>':'')+(!['completed','cancelled'].includes(task.status)?'<button class="pab-btn danger pab-cancel-task" data-task="'+esc(task.id)+'">Cancel</button>':'')+'</div></article>';
  }

  function render(){
    const counts=state.counts||{},network=state.network||{},bots=Array.isArray(state.bots)?state.bots:[];
    let html='<section class="pab-hero"><div><h1>Personal AI Bots Network</h1><p>Create and manage your own Minglora AI bots. Every bot has a clear AI identity, category, permissions and instruction history. Ordinary bots are instruction-driven and publishing, following, messaging and live actions remain approval-gated.</p></div><span class="pab-status '+(network.enabled?'':'off')+'">'+(network.enabled?'Network enabled':'Network disabled')+'</span></section>';
    html+='<div class="pab-warning"><strong>Administrator-controlled mode is the default.</strong> Creating or enabling a bot does not authorize it to act. Bot instructions are saved for your review; approval currently queues the task only. No AI execution worker is connected, so posts, follows, messages and live broadcasts are not performed by this first release.</div>';
    html+='<section class="pab-grid" aria-label="Bot network totals">'+metric(counts.totalBots,'Bot identities')+metric(counts.enabledBots,'Enabled bots')+metric(counts.disabledBots,'Disabled bots')+metric(counts.pendingInstructions,'Pending approvals')+metric(counts.approvedWaitingForWorker,'Approved · worker pending')+'</section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Network controls</h2><p>Global controls apply to every category and bot. Turning the network off stops new task instructions.</p></div><span class="pab-status '+(network.enabled?'':'off')+'">'+(network.enabled?'ON':'OFF')+'</span></div><div class="pab-inline-controls"><label class="pab-control"><span><strong>Master network switch</strong><small>Enable or disable the entire Personal AI Bots Network.</small></span><input id="pab-master-switch" class="pab-switch" type="checkbox" '+(network.enabled?'checked':'')+'></label><label class="pab-control"><span><strong>Hybrid mode availability</strong><small>Permit only the low-risk actions selected per bot. Administrator instructions remain required.</small></span><input id="pab-hybrid-switch" class="pab-switch" type="checkbox" '+(network.hybridEnabled?'checked':'')+'></label></div><div class="pab-actions"><button class="pab-btn secondary" id="pab-refresh">Refresh network</button><span class="pab-notice" id="pab-network-status">Default: disabled, administrator-controlled and approval required.</span></div></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Bot categories</h2><p>Enable or disable a whole category without deleting its bots. Disabled categories cannot receive new instructions.</p></div></div><div class="pab-category-grid">'+(state.categories||[]).map(categoryCard).join('')+'</div><form id="pab-category-form" class="pab-form-grid"><div class="pab-field"><label for="pab-new-category">New category name</label><input class="pab-input" id="pab-new-category" maxlength="56" required placeholder="e.g. AI Research Assistants"></div><div class="pab-field"><label for="pab-new-category-description">Description</label><input class="pab-input" id="pab-new-category-description" maxlength="600" placeholder="What this category is responsible for"></div><div class="pab-field full"><button class="pab-btn secondary" type="submit">Create custom category</button><span class="pab-notice" id="pab-category-status"></span></div></form></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Create your first bots</h2><p>The starter set creates one disabled, individually manageable AI bot in each of the 15 categories. No human accounts or engagement are fabricated.</p></div><div class="pab-actions"><button id="pab-create-starters" class="pab-btn">Create 15 starter bots</button></div></div><form id="pab-create-form" class="pab-form-grid"><div class="pab-field"><label for="pab-bot-name">Bot display name</label><input class="pab-input" id="pab-bot-name" maxlength="64" required placeholder="e.g. Minglora Help Assistant"></div><div class="pab-field"><label for="pab-bot-category">Category</label><select class="pab-select" id="pab-bot-category" required>'+(state.categories||[]).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>').join('')+'</select></div><div class="pab-field full"><label for="pab-bot-description">Description</label><textarea class="pab-textarea" id="pab-bot-description" maxlength="600" placeholder="Describe the bot's specific role"></textarea></div><div class="pab-field full"><label for="pab-bot-personality">Personality and communication style</label><textarea class="pab-textarea" id="pab-bot-personality" maxlength="1200" placeholder="Voice, tone, interests and interaction boundaries"></textarea></div><div class="pab-field full"><label for="pab-bot-admin-instructions">Standing administrator instructions</label><textarea class="pab-textarea" id="pab-bot-admin-instructions" maxlength="4000" placeholder="Rules this bot must follow. No autonomous publishing or following."></textarea></div><div class="pab-field full"><button class="pab-btn" type="submit">Create disabled bot</button><span class="pab-notice" id="pab-create-status"></span></div></form></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Bot directory</h2><p>Manage each bot, its category, operating mode and permitted hybrid actions.</p></div><div class="pab-actions"><input id="pab-bot-filter" class="pab-input" style="width:min(250px,70vw)" placeholder="Search bots or categories" aria-label="Search bots"></div></div><div id="pab-bot-list" class="pab-bot-list">'+(bots.length?bots.map(botCard).join(''):'<div class="pab-empty">No bot identities have been created yet. Create the 15-bot starter set or add an individual bot above.</div>')+'</div></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Instruction and approval queue</h2><p>Send a specific instruction to a bot. Every instruction is recorded. Approving it does not execute the task until a secure worker is implemented and configured.</p></div></div><div class="pab-tasks">'+((state.tasks||[]).length?state.tasks.map(taskCard).join(''):'<div class="pab-empty">No instructions have been submitted.</div>')+'</div><span class="pab-notice" id="pab-task-status">All instructions require administrator approval. No external actions are currently dispatched.</span></section>';
    html+='<section class="pab-panel"><div class="pab-heading"><div><h2>Administrator audit history</h2><p>Records bot creation, configuration changes, category controls and instruction approvals.</p></div></div><div class="pab-audit">'+((state.audit||[]).length?state.audit.slice(0,30).map(row=>'<div class="pab-audit-row"><strong>'+esc(row.action||'Action')+' · '+esc(row.summary||'')+'</strong><span>'+esc(date(row.createdAt))+'</span></div>').join(''):'<div class="pab-empty">No bot administration events yet.</div>')+'</div></section>';
    root.innerHTML=html;bind();
  }
  function bind(){
    document.querySelector('#pab-refresh')?.addEventListener('click',refresh);
    document.querySelector('#pab-master-switch')?.addEventListener('change',saveNetwork);
    document.querySelector('#pab-hybrid-switch')?.addEventListener('change',saveNetwork);
    document.querySelectorAll('.pab-category-switch').forEach(node=>node.addEventListener('change',()=>toggleCategory(node.dataset.category,node.checked)));
    document.querySelector('#pab-create-starters')?.addEventListener('click',createStarters);
    document.querySelector('#pab-create-form')?.addEventListener('submit',createBot);
    document.querySelector('#pab-category-form')?.addEventListener('submit',createCategory);
    document.querySelector('#pab-bot-filter')?.addEventListener('input',filterBots);
    document.querySelectorAll('.pab-bot-switch').forEach(node=>node.addEventListener('change',()=>updateBot(node.dataset.bot,{status:node.checked?'enabled':'disabled'})));
    document.querySelectorAll('.pab-save-bot').forEach(node=>node.addEventListener('click',()=>saveBot(node.dataset.bot)));
    document.querySelectorAll('.pab-instruct').forEach(node=>node.addEventListener('click',()=>{const form=document.querySelector('[data-bot-form="'+CSS.escape(node.dataset.bot)+'"]');if(form)form.hidden=!form.hidden;}));
    document.querySelectorAll('.pab-cancel-instruct').forEach(node=>node.addEventListener('click',()=>{const form=node.closest('form');if(form)form.hidden=true;}));
    document.querySelectorAll('.pab-instruction-form').forEach(form=>form.addEventListener('submit',event=>submitInstruction(event,form.dataset.botForm)));
    document.querySelectorAll('.pab-search-members').forEach(node=>node.addEventListener('click',()=>searchMembers(node.dataset.bot)));
    document.querySelectorAll('.pab-approve-task').forEach(node=>node.addEventListener('click',()=>taskAction(node.dataset.task,'approve')));
    document.querySelectorAll('.pab-cancel-task').forEach(node=>node.addEventListener('click',()=>taskAction(node.dataset.task,'cancel')));
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
    const payload={displayName:document.querySelector('#pab-bot-name').value,categoryId:document.querySelector('#pab-bot-category').value,description:document.querySelector('#pab-bot-description').value,personality:document.querySelector('#pab-bot-personality').value,administratorInstructions:document.querySelector('#pab-bot-admin-instructions').value};
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
    const mode=card.querySelector('.pab-bot-mode').value,actions=[...card.querySelectorAll('.pab-hybrid-action:checked')].map(node=>node.value),categoryId=card.querySelector('.pab-bot-category').value;
    try{await request(API+'/bots/'+id,{method:'PATCH',body:JSON.stringify({categoryId,autonomyMode:mode,allowedAutonomousActions:actions})});notice('pab-task-status','Bot settings saved. All high-impact tasks remain approval-gated.','success');await refresh();}
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