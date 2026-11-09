export const PERSONAL_AI_BOT_CATEGORIES = Object.freeze([
  { id:'ai-friends', name:'AI Friends', description:'Clearly identified AI companions and conversational friends.' },
  { id:'ai-creators', name:'AI Creators', description:'Prepare original posts, creative concepts, captions and media briefs.' },
  { id:'ai-influencers', name:'AI Influencers', description:'Create disclosed AI creator campaigns and trend commentary; never fake endorsements or engagement.' },
  { id:'ai-news', name:'AI News', description:'Prepare sourced news summaries for editorial review and publication approval.' },
  { id:'ai-musicians', name:'AI Musicians', description:'Support music discovery, original music planning and disclosed musical content.' },
  { id:'ai-entertainers', name:'AI Entertainers', description:'Prepare jokes, quizzes, games and entertainment activities.' },
  { id:'ai-gamers', name:'AI Gamers', description:'Support gaming communities, game guides, challenges and event planning.' },
  { id:'ai-community-hosts', name:'AI Community Hosts', description:'Prepare and coordinate community discussions and events.' },
  { id:'ai-live-hosts', name:'AI Live Hosts', description:'Prepare clearly identified AI-led live show plans; broadcasts require explicit approval.' },
  { id:'ai-moderators', name:'AI Moderators', description:'Identify possible policy issues and prepare moderation recommendations for human review.' },
  { id:'ai-support', name:'AI Support', description:'Help members navigate Minglora and prepare support responses for review.' },
  { id:'ai-educators', name:'AI Educators', description:'Prepare learning activities, explanations and quizzes with source-aware guidance.' },
  { id:'ai-sports', name:'AI Sports', description:'Prepare sports information, explainers and community discussion prompts.' },
  { id:'ai-travel', name:'AI Travel', description:'Prepare travel inspiration, destination explainers and itinerary drafts.' },
  { id:'ai-business', name:'AI Business', description:'Prepare business education, customer-service drafts and small-business resources.' }
]);

export const PERSONAL_AI_BOT_TASK_TYPES = Object.freeze([
  'assistant_request','draft_post','share_media','create_reel','draft_comment','draft_reply','follow','unfollow',
  'react','join_group','send_message','event_participation','customer_service_draft','support_draft',
  'moderation_review','analytics_report','automation_request','community_event_draft','live_show_plan','translation','other'
]);

export const PERSONAL_AI_BOT_HYBRID_ACTIONS = Object.freeze([
  'analytics_read','moderation_flag','draft_content','translate_content','prepare_faq_draft'
]);

export const PERSONAL_AI_BOT_HIGH_IMPACT_TASKS = Object.freeze([
  'draft_post','share_media','create_reel','draft_comment','draft_reply','follow','unfollow','react',
  'join_group','send_message','event_participation','customer_service_draft','support_draft',
  'automation_request','community_event_draft','live_show_plan'
]);

const COLLECTIONS = [
  'personalAiBotCategories','personalAiBots','personalAiBotTasks',
  'personalAiBotAudit','personalAiBotSettings','personalAiBotFollows',
  'personalAiBotTeams','personalAiBotTeamMembers','personalAiBotSchedules'
];

export function ensurePersonalAiBotCollections(db) {
  for (const key of COLLECTIONS) if (!Array.isArray(db[key])) db[key] = [];
  let settings = db.personalAiBotSettings.find(item => item.id === 'global');
  if (!settings) {
    settings = {
      id:'global', enabled:false, hybridEnabled:false,
      defaultAutonomyMode:'administrator_controlled',
      requireAdministratorApproval:true,
      disabledCategoryIds:[],
      identityDesignTarget:8300000000,
      concurrentExecutionLimit:0,
      dailyExecutionBudget:0,
      automaticSuspensionEnabled:true,
      executionProviderConfigured:false,
      executionWorkersConfigured:false,
      createdAt:new Date().toISOString(),
      updatedAt:new Date().toISOString()
    };
    db.personalAiBotSettings.push(settings);
  }
  return settings;
}

export function getPersonalAiBotCategories(db) {
  ensurePersonalAiBotCollections(db);
  const settings=ensurePersonalAiBotCollections(db);
  const disabled=new Set(settings.disabledCategoryIds || []);
  const overrides=settings.categoryOverrides||{};
  return [
    ...PERSONAL_AI_BOT_CATEGORIES.map(item => ({ ...item, ...(overrides[item.id]||{}), builtIn:true, enabled:!disabled.has(item.id) })),
    ...db.personalAiBotCategories.map(item => ({ ...item, builtIn:false, enabled:!disabled.has(item.id) }))
  ];
}

function audit(db, actorId, action, targetType, targetId, summary, timestamp, uid) {
  db.personalAiBotAudit.unshift({
    id:uid(), actorId, action, targetType, targetId:String(targetId || ''),
    summary:String(summary || '').slice(0,500), createdAt:timestamp
  });
  if (db.personalAiBotAudit.length > 1000) db.personalAiBotAudit.length = 1000;
}

function slugify(value) {
  return String(value || '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'').slice(0,48) || 'ai-bot';
}

export function createPersonalAiBot(db, input, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const displayName = String(input.displayName || '').trim().replace(/\s+/g,' ');
  const categoryId = String(input.categoryId || '').trim();
  const category = getPersonalAiBotCategories(db).find(item => item.id === categoryId);
  if (!category?.enabled) throw Object.assign(new Error('This bot category is disabled.'), { status:409 });
  if (displayName.length < 2 || displayName.length > 64) throw Object.assign(new Error('Bot name must be between 2 and 64 characters.'), { status:400 });
  if (!category) throw Object.assign(new Error('Choose a valid bot category.'), { status:400 });
  const botId = uid();
  const bot = {
    id:botId, slug:slugify(displayName)+'-'+botId.slice(0,8),
    displayName, categoryId, categoryName:category.name,
    username:'ai_'+slugify(displayName).replace(/-/g,'_').slice(0,36)+'_'+botId.slice(0,6),
    profilePictureAssetId:null,
    bio:String(input.bio || input.description || '').trim().slice(0,600),
    description:String(input.description || input.bio || '').trim().slice(0,600),
    personality:String(input.personality || '').trim().slice(0,1200),
    interests:Array.isArray(input.interests)?[...new Set(input.interests.map(value=>String(value).trim().slice(0,60)).filter(Boolean))].slice(0,30):[],
    hobbies:Array.isArray(input.hobbies)?[...new Set(input.hobbies.map(value=>String(value).trim().slice(0,60)).filter(Boolean))].slice(0,30):[],
    languages:Array.isArray(input.languages)
      ? [...new Set(input.languages.map(value=>String(value).trim().slice(0,40)).filter(Boolean))].slice(0,12)
      : ['English'],
    activitySchedule:{timezone:'America/Jamaica',daysOfWeek:[1,2,3,4,5,6,7],startTime:'00:00',endTime:'23:59',maxTasksPerDay:0},
    administratorInstructions:String(input.administratorInstructions || '').trim().slice(0,4000),
    profileType:'ai_bot', aiLabel:'AI Bot', aiDisclosureVisible:true, contentDisclosureRequired:true,
    status:'disabled', enabled:false,
    autonomyMode:'administrator_controlled',
    allowedAutonomousActions:[],
    requiresApprovalForEveryTask:true,
    requiresApprovalForPublishing:true,
    createdBy:actorId, updatedBy:actorId,
    createdAt:timestamp, updatedAt:timestamp
  };
  db.personalAiBots.push(bot);
  audit(db,actorId,'bot.created','bot',bot.id,'Created disabled AI bot in '+category.name,timestamp,uid);
  return bot;
}

export function createPersonalAiBotStarterSet(db, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const created = [];
  for (const category of PERSONAL_AI_BOT_CATEGORIES) {
    const existing = db.personalAiBots.find(bot => bot.starterCategoryId === category.id);
    if (existing) continue;
    const id = uid();
    const bot = {
      id, slug:category.id+'-'+id.slice(0,8),
      displayName:category.name.replace(/ Bots?$/i,'')+' Bot',
      categoryId:category.id, categoryName:category.name,
      description:category.description, personality:'',
      languages:['English'], administratorInstructions:'',
      profileType:'ai_bot', aiLabel:'AI Bot', aiDisclosureVisible:true, contentDisclosureRequired:true,
      username:'ai_'+slugify(category.id).replace(/-/g,'_')+'_'+id.slice(0,6),
      profilePictureAssetId:null, bio:category.description, interests:[], hobbies:[],
      activitySchedule:{timezone:'America/Jamaica',daysOfWeek:[1,2,3,4,5,6,7],startTime:'00:00',endTime:'23:59',maxTasksPerDay:0},
      status:'disabled', enabled:false, starterCategoryId:category.id,
      autonomyMode:'administrator_controlled', allowedAutonomousActions:[],
      requiresApprovalForEveryTask:true, requiresApprovalForPublishing:true,
      createdBy:actorId, updatedBy:actorId, createdAt:timestamp, updatedAt:timestamp
    };
    db.personalAiBots.push(bot);
    created.push(bot);
  }
  if (created.length) audit(db,actorId,'bot.starter_set_created','bot',created.map(bot=>bot.id).join(','),'Created '+created.length+' disabled starter bots; no human accounts or activity were created.',timestamp,uid);
  return created;
}

export function updatePersonalAiBot(db, botId, input, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const bot = db.personalAiBots.find(item=>item.id===botId);
  if (!bot) throw Object.assign(new Error('Bot not found.'),{status:404});
  const changes = [];
  if (Object.hasOwn(input,'displayName')) {
    const value=String(input.displayName || '').trim().replace(/\s+/g,' ');
    if(value.length<2||value.length>64)throw Object.assign(new Error('Bot name must be between 2 and 64 characters.'),{status:400});
    bot.displayName=value;changes.push('name');
  }
  if (Object.hasOwn(input,'description')) { bot.description=String(input.description||'').trim().slice(0,600);changes.push('description'); }
  if (Object.hasOwn(input,'personality')) { bot.personality=String(input.personality||'').trim().slice(0,1200);changes.push('personality'); }
  if (Object.hasOwn(input,'bio')) { bot.bio=String(input.bio||'').trim().slice(0,600);changes.push('bio'); }
  if (Object.hasOwn(input,'interests')) {
    if(!Array.isArray(input.interests))throw Object.assign(new Error('Interests must be a list.'),{status:400});
    bot.interests=[...new Set(input.interests.map(value=>String(value).trim().slice(0,60)).filter(Boolean))].slice(0,30);
    changes.push('interests');
  }
  if (Object.hasOwn(input,'hobbies')) {
    if(!Array.isArray(input.hobbies))throw Object.assign(new Error('Hobbies must be a list.'),{status:400});
    bot.hobbies=[...new Set(input.hobbies.map(value=>String(value).trim().slice(0,60)).filter(Boolean))].slice(0,30);
    changes.push('hobbies');
  }
  if (Object.hasOwn(input,'activitySchedule')) {
    const schedule=input.activitySchedule;
    const validDays=Array.isArray(schedule?.daysOfWeek)&&schedule.daysOfWeek.every(day=>Number.isInteger(day)&&day>=1&&day<=7);
    const validTime=value=>typeof value==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    if(!schedule||!validDays||!validTime(schedule.startTime)||!validTime(schedule.endTime)||typeof schedule.timezone!=='string'||schedule.timezone.length>80)throw Object.assign(new Error('Enter a valid activity schedule, timezone and days of week.'),{status:400});
    try{new Intl.DateTimeFormat('en',{timeZone:schedule.timezone});}catch{throw Object.assign(new Error('Choose a valid activity schedule timezone.'),{status:400});}
    const maxTasksPerDay=Number(schedule.maxTasksPerDay||0);
    if(!Number.isInteger(maxTasksPerDay)||maxTasksPerDay<0||maxTasksPerDay>500)throw Object.assign(new Error('Daily task cap must be between 0 and 500.'),{status:400});
    bot.activitySchedule={timezone:schedule.timezone,daysOfWeek:[...new Set(schedule.daysOfWeek)],startTime:schedule.startTime,endTime:schedule.endTime,maxTasksPerDay};
    changes.push('activity schedule');
  }
  if (Object.hasOwn(input,'scheduledActivationAt')) {
    const value=input.scheduledActivationAt?Date.parse(input.scheduledActivationAt):null;
    if(value!==null&&!Number.isFinite(value))throw Object.assign(new Error('Enter a valid scheduled activation time.'),{status:400});
    bot.scheduledActivationAt=value===null?null:new Date(value).toISOString();changes.push('scheduled activation');
  }
  if (Object.hasOwn(input,'scheduledDeactivationAt')) {
    const value=input.scheduledDeactivationAt?Date.parse(input.scheduledDeactivationAt):null;
    if(value!==null&&!Number.isFinite(value))throw Object.assign(new Error('Enter a valid scheduled deactivation time.'),{status:400});
    bot.scheduledDeactivationAt=value===null?null:new Date(value).toISOString();changes.push('scheduled deactivation');
  }
  if (Object.hasOwn(input,'administratorInstructions')) { bot.administratorInstructions=String(input.administratorInstructions||'').trim().slice(0,4000);changes.push('instructions'); }
  if (Object.hasOwn(input,'categoryId')) {
    const category=getPersonalAiBotCategories(db).find(item=>item.id===String(input.categoryId));
    if(!category)throw Object.assign(new Error('Choose a valid bot category.'),{status:400});
    bot.categoryId=category.id;bot.categoryName=category.name;changes.push('category');
  }
  if (Object.hasOwn(input,'languages')) {
    if(!Array.isArray(input.languages))throw Object.assign(new Error('Languages must be a list.'),{status:400});
    bot.languages=[...new Set(input.languages.map(value=>String(value).trim().slice(0,40)).filter(Boolean))].slice(0,12);
    changes.push('languages');
  }
  if (Object.hasOwn(input,'status')) {
    const status=String(input.status);
    if(!['enabled','disabled','paused'].includes(status))throw Object.assign(new Error('Choose enabled, disabled or paused.'),{status:400});
    bot.status=status;bot.enabled=status==='enabled';changes.push('status');
  }
  if (Object.hasOwn(input,'autonomyMode')) {
    const mode=String(input.autonomyMode);
    if(!['administrator_controlled','hybrid'].includes(mode))throw Object.assign(new Error('Choose administrator-controlled or hybrid mode.'),{status:400});
    bot.autonomyMode=mode;
    if(mode==='administrator_controlled')bot.allowedAutonomousActions=[];
    changes.push('autonomy mode');
  }
  if (Object.hasOwn(input,'allowedAutonomousActions')) {
    if(!Array.isArray(input.allowedAutonomousActions))throw Object.assign(new Error('Autonomous actions must be a list.'),{status:400});
    const requested=[...new Set(input.allowedAutonomousActions.map(String))];
    const invalid=requested.filter(action=>!PERSONAL_AI_BOT_HYBRID_ACTIONS.includes(action));
    if(invalid.length)throw Object.assign(new Error('Only explicitly approved low-risk hybrid actions can be enabled.'),{status:400});
    if(bot.autonomyMode!=='hybrid'&&requested.length)throw Object.assign(new Error('Switch the bot to hybrid mode before allowing routine actions.'),{status:409});
    bot.allowedAutonomousActions=requested;
    changes.push('hybrid permissions');
  }
  bot.requiresApprovalForEveryTask=true;
  bot.requiresApprovalForPublishing=true;
  bot.updatedBy=actorId;bot.updatedAt=timestamp;
  if(changes.length)audit(db,actorId,'bot.updated','bot',bot.id,'Updated '+changes.join(', '),timestamp,uid);
  return bot;
}

export function createPersonalAiBotCategory(db, input, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const name=String(input.name||'').trim().replace(/\s+/g,' ');
  const description=String(input.description||'').trim().slice(0,600);
  if(name.length<3||name.length>56)throw Object.assign(new Error('Category name must be between 3 and 56 characters.'),{status:400});
  const normalized=name.toLowerCase();
  if(getPersonalAiBotCategories(db).some(item=>item.name.toLowerCase()===normalized))throw Object.assign(new Error('That category already exists.'),{status:409});
  const category={id:'custom-'+uid(),name,description,builtIn:false,createdBy:actorId,createdAt:timestamp};
  db.personalAiBotCategories.push(category);
  audit(db,actorId,'category.created','category',category.id,'Created category '+name,timestamp,uid);
  return category;
}

export function updatePersonalAiBotCategory(db, categoryId, input, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const category=getPersonalAiBotCategories(db).find(item=>item.id===categoryId);
  if(!category)throw Object.assign(new Error('Bot category not found.'),{status:404});
  const settings=ensurePersonalAiBotCollections(db);
  let stored;
  if(category.builtIn){
    settings.categoryOverrides ||= {};
    stored=settings.categoryOverrides[categoryId] ||= {id:categoryId,name:category.name,description:category.description};
  } else {
    stored=db.personalAiBotCategories.find(item=>item.id===categoryId);
  }
  const changes=[];
  if(Object.hasOwn(input,'name')){
    const name=String(input.name||'').trim().replace(/\s+/g,' ');
    if(name.length<3||name.length>56)throw Object.assign(new Error('Category name must be between 3 and 56 characters.'),{status:400});
    if(getPersonalAiBotCategories(db).some(item=>item.id!==categoryId&&item.name.toLowerCase()===name.toLowerCase()))throw Object.assign(new Error('That category name is already in use.'),{status:409});
    stored.name=name;changes.push('name');
    for(const bot of db.personalAiBots.filter(item=>item.categoryId===categoryId))bot.categoryName=name;
  }
  if(Object.hasOwn(input,'description')){
    stored.description=String(input.description||'').trim().slice(0,600);
    changes.push('description');
  }
  if(Object.hasOwn(input,'enabled')){
    if(typeof input.enabled!=='boolean')throw Object.assign(new Error('Choose whether this category is enabled.'),{status:400});
    const disabled=new Set(settings.disabledCategoryIds||[]);
    if(input.enabled)disabled.delete(categoryId);else disabled.add(categoryId);
    settings.disabledCategoryIds=[...disabled];
    changes.push(input.enabled?'enabled':'disabled');
  }
  if(changes.length)audit(db,actorId,'category.updated','category',categoryId,'Updated '+stored.name+': '+changes.join(', '),timestamp,uid);
  return getPersonalAiBotCategories(db).find(item=>item.id===categoryId);
}

export function setPersonalAiBotCategoryEnabled(db, categoryId, enabled, actorId, timestamp, uid) {
  const settings=ensurePersonalAiBotCollections(db);
  if(typeof enabled!=='boolean')throw Object.assign(new Error('Choose whether this category is enabled.'),{status:400});
  const category=getPersonalAiBotCategories(db).find(item=>item.id===categoryId);
  if(!category)throw Object.assign(new Error('Bot category not found.'),{status:404});
  const disabled=new Set(settings.disabledCategoryIds || []);
  if(enabled)disabled.delete(categoryId);else disabled.add(categoryId);
  settings.disabledCategoryIds=[...disabled];
  settings.updatedBy=actorId;settings.updatedAt=timestamp;
  audit(db,actorId,enabled?'category.enabled':'category.disabled','category',categoryId,
    (enabled?'Enabled ':'Disabled ')+category.name+' category.',timestamp,uid);
  return {...category,enabled};
}

export function queuePersonalAiBotInstruction(db, botId, input, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const bot=db.personalAiBots.find(item=>item.id===botId);
  if(!bot)throw Object.assign(new Error('Bot not found.'),{status:404});
  const category=getPersonalAiBotCategories(db).find(item=>item.id===bot.categoryId);
  if(!category?.enabled)throw Object.assign(new Error('This bot category is disabled.'),{status:409});
  const nowMs=Date.parse(timestamp);
  const recentTasks=db.personalAiBotTasks.filter(task=>task.botId===botId&&Number.isFinite(Date.parse(task.createdAt))&&nowMs-Date.parse(task.createdAt)<15*60*1000&&task.status!=='cancelled');
  if(recentTasks.length>=20)throw Object.assign(new Error('This bot reached its instruction rate limit. Try again after the 15-minute window.'),{status:429});
  const pendingTasks=db.personalAiBotTasks.filter(task=>task.botId===botId&&['awaiting_administrator_approval','approved_waiting_for_worker'].includes(task.status));
  if(pendingTasks.length>=50)throw Object.assign(new Error('This bot has too many pending instructions. Review or cancel existing tasks first.'),{status:429});
  const taskType=String(input.taskType||'other');
  if(!PERSONAL_AI_BOT_TASK_TYPES.includes(taskType))throw Object.assign(new Error('Choose a supported task type.'),{status:400});
  const instruction=String(input.instruction||'').trim();
  if(instruction.length<5||instruction.length>4000)throw Object.assign(new Error('Enter an instruction between 5 and 4,000 characters.'),{status:400});
  const targetUserId=input.targetUserId?String(input.targetUserId):null;
  if(['follow','unfollow'].includes(taskType)&&!targetUserId)throw Object.assign(new Error('Choose the Minglora member account for this following instruction.'),{status:400});
  const task={
    id:uid(),botId,botName:bot.displayName,categoryId:bot.categoryId,
    taskType,instruction,targetUserId,
    highImpact:PERSONAL_AI_BOT_HIGH_IMPACT_TASKS.includes(taskType),
    status:'awaiting_administrator_approval',
    executionStatus:'not_dispatched',
    createdBy:actorId,createdAt:timestamp,
    approvedBy:null,approvedAt:null,completedAt:null
  };
  db.personalAiBotTasks.unshift(task);
  if(db.personalAiBotTasks.length>2000)db.personalAiBotTasks.length=2000;
  audit(db,actorId,'task.instruction_submitted','task',task.id,'Instruction submitted for '+bot.displayName+'; awaiting approval.',timestamp,uid);
  return task;
}

export function approvePersonalAiBotTask(db, taskId, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const task=db.personalAiBotTasks.find(item=>item.id===taskId);
  if(!task)throw Object.assign(new Error('Instruction not found.'),{status:404});
  if(task.status!=='awaiting_administrator_approval')throw Object.assign(new Error('Only pending instructions can be approved.'),{status:409});
  task.status='approved_waiting_for_worker';
  task.executionStatus='worker_not_configured';
  task.approvedBy=actorId;task.approvedAt=timestamp;
  audit(db,actorId,'task.approved','task',task.id,'Approved instruction. Execution is waiting for a configured worker.',timestamp,uid);
  return task;
}

export function cancelPersonalAiBotTask(db, taskId, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const task=db.personalAiBotTasks.find(item=>item.id===taskId);
  if(!task)throw Object.assign(new Error('Instruction not found.'),{status:404});
  if(['completed','cancelled'].includes(task.status))throw Object.assign(new Error('This instruction is already closed.'),{status:409});
  task.status='cancelled';task.executionStatus='cancelled';task.cancelledBy=actorId;task.cancelledAt=timestamp;
  audit(db,actorId,'task.cancelled','task',task.id,'Cancelled instruction.',timestamp,uid);
  return task;
}

export function setPersonalAiBotNetworkSettings(db, input, actorId, timestamp, uid) {
  const settings=ensurePersonalAiBotCollections(db);
  if(typeof input.enabled!=='boolean')throw Object.assign(new Error('Choose whether the bot network is enabled.'),{status:400});
  settings.enabled=input.enabled;
  if(input.enabled)settings.emergencyShutdownAt=null;
  if(Object.hasOwn(input,'hybridEnabled')){
    if(typeof input.hybridEnabled!=='boolean')throw Object.assign(new Error('Hybrid enablement must be true or false.'),{status:400});
    settings.hybridEnabled=input.hybridEnabled;
  }
  if(Object.hasOwn(input,'concurrentExecutionLimit')){
    const value=Number(input.concurrentExecutionLimit);
    if(!Number.isInteger(value)||value<0||value>10000)throw Object.assign(new Error('Concurrent execution limit must be between 0 and 10,000.'),{status:400});
    settings.concurrentExecutionLimit=value;
  }
  if(Object.hasOwn(input,'dailyExecutionBudget')){
    const value=Number(input.dailyExecutionBudget);
    if(!Number.isInteger(value)||value<0||value>1000000)throw Object.assign(new Error('Daily execution budget must be between 0 and 1,000,000 tasks.'),{status:400});
    settings.dailyExecutionBudget=value;
  }
  if(Object.hasOwn(input,'automaticSuspensionEnabled')){
    if(typeof input.automaticSuspensionEnabled!=='boolean')throw Object.assign(new Error('Automatic suspension must be true or false.'),{status:400});
    settings.automaticSuspensionEnabled=input.automaticSuspensionEnabled;
  }
  settings.requireAdministratorApproval=true;
  settings.defaultAutonomyMode='administrator_controlled';
  settings.updatedBy=actorId;settings.updatedAt=timestamp;
  audit(db,actorId,'network.settings_updated','network','global','Updated Personal AI Bots Network controls.',timestamp,uid);
  return settings;
}

export function bulkUpdatePersonalAiBots(db, botIds, status, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  if(!Array.isArray(botIds)||botIds.length<1||botIds.length>100)throw Object.assign(new Error('Select between 1 and 100 bots for a bulk control operation.'),{status:400});
  if(!['enabled','disabled','paused'].includes(status))throw Object.assign(new Error('Choose enabled, disabled or paused.'),{status:400});
  const uniqueIds=[...new Set(botIds.map(String))];
  const bots=uniqueIds.map(id=>db.personalAiBots.find(bot=>bot.id===id));
  if(bots.some(bot=>!bot))throw Object.assign(new Error('One or more selected bots could not be found.'),{status:404});
  if(status==='enabled'){
    const categories=getPersonalAiBotCategories(db);
    if(bots.some(bot=>!categories.some(category=>category.id===bot.categoryId&&category.enabled)))throw Object.assign(new Error('One or more selected bots belong to a disabled category.'),{status:409});
  }
  for(const bot of bots){
    bot.status=status;bot.enabled=status==='enabled';bot.updatedBy=actorId;bot.updatedAt=timestamp;
    if(status!=='enabled')bot.pausedAt=status==='paused'?timestamp:null;
  }
  audit(db,actorId,'bot.bulk_status_updated','bot',uniqueIds.join(','),'Set '+bots.length+' selected bots to '+status+'.',timestamp,uid);
  return {updated:bots.length,bots};
}

export function emergencyShutdownPersonalAiBots(db, actorId, timestamp, uid) {
  const settings=ensurePersonalAiBotCollections(db);
  settings.enabled=false;
  settings.hybridEnabled=false;
  settings.emergencyShutdownAt=timestamp;
  settings.emergencyShutdownBy=actorId;
  let paused=0,cancelled=0;
  for(const bot of db.personalAiBots){
    if(bot.status==='enabled'||bot.enabled){
      bot.status='paused';bot.enabled=false;bot.pausedAt=timestamp;bot.updatedAt=timestamp;bot.updatedBy=actorId;paused++;
    }
  }
  for(const task of db.personalAiBotTasks){
    if(['awaiting_administrator_approval','approved_waiting_for_worker','running'].includes(task.status)){
      task.status='cancelled';task.executionStatus='cancelled_by_emergency_shutdown';
      task.cancelledAt=timestamp;task.cancelledBy=actorId;cancelled++;
    }
  }
  audit(db,actorId,'network.emergency_shutdown','network','global','Emergency shutdown paused '+paused+' bots and cancelled '+cancelled+' pending or running task records.',timestamp,uid);
  return {ok:true,paused,cancelled,network:settings};
}

export function getPersonalAiBotOverview(db) {
  const settings=ensurePersonalAiBotCollections(db);
  const bots=db.personalAiBots;
  const tasks=db.personalAiBotTasks;
  return {
    network:settings,
    counts:{
      totalBots:bots.length,
      enabledBots:bots.filter(bot=>bot.status==='enabled').length,
      disabledBots:bots.filter(bot=>bot.status==='disabled').length,
      pausedBots:bots.filter(bot=>bot.status==='paused').length,
      pendingInstructions:tasks.filter(task=>task.status==='awaiting_administrator_approval').length,
      approvedWaitingForWorker:tasks.filter(task=>task.status==='approved_waiting_for_worker').length,
      categories:getPersonalAiBotCategories(db).length,
      activeBots:bots.filter(bot=>bot.status==='enabled'&&bot.lastActiveAt&&Date.parse(bot.lastActiveAt)>Date.now()-5*60*1000).length,
      executingBots:new Set(tasks.filter(task=>task.status==='running').map(task=>task.botId)).size,
      identityDesignTarget:settings.identityDesignTarget||8300000000,
      concurrentExecutionLimit:settings.concurrentExecutionLimit||0
    }
  };
}
