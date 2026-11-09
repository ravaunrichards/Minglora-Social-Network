export const PERSONAL_AI_BOT_CATEGORIES = Object.freeze([
  { id:'assistant-bots', name:'Assistant Bots', description:'General-purpose personal assistants that act only on direct instructions.' },
  { id:'moderation-bots', name:'Moderation Bots', description:'Review content, identify possible policy issues and prepare moderation recommendations.' },
  { id:'customer-service-bots', name:'Customer Service Bots', description:'Prepare account, product and service responses for administrator or staff review.' },
  { id:'automation-bots', name:'Automation Bots', description:'Manage explicitly configured, approved and time-bounded workflows.' },
  { id:'analytics-bots', name:'Analytics Bots', description:'Prepare read-only reports and explain platform metrics.' },
  { id:'companion-bots', name:'Companion Bots', description:'Optional AI companions for members who choose to interact with them.' },
  { id:'creators', name:'Creators', description:'Prepare original posts, creative concepts, captions and media briefs.' },
  { id:'influencers', name:'Influencers', description:'Prepare trend ideas and creator campaign drafts; no undisclosed endorsements.' },
  { id:'friends', name:'Friends', description:'Conversational AI friends that clearly identify as AI.' },
  { id:'news', name:'News', description:'Prepare sourced news summaries for editorial review.' },
  { id:'entertainers', name:'Entertainers', description:'Prepare jokes, quizzes, games and entertainment activities.' },
  { id:'musicians', name:'Musicians', description:'Support music discovery, discussion and original music planning.' },
  { id:'community-hosts', name:'Community Hosts', description:'Prepare and coordinate community discussions and events.' },
  { id:'supports', name:'Supports', description:'Help members navigate Minglora and prepare troubleshooting guidance.' },
  { id:'live-hosts', name:'Live Hosts', description:'Prepare AI-led live show plans; live broadcasting always requires explicit approval.' }
]);

export const PERSONAL_AI_BOT_TASK_TYPES = Object.freeze([
  'assistant_request','draft_post','draft_comment','draft_reply','follow','unfollow',
  'customer_service_draft','support_draft','moderation_review','analytics_report',
  'automation_request','community_event_draft','live_show_plan','translation','other'
]);

export const PERSONAL_AI_BOT_HYBRID_ACTIONS = Object.freeze([
  'analytics_read','moderation_flag','draft_content','translate_content','prepare_faq_draft'
]);

export const PERSONAL_AI_BOT_HIGH_IMPACT_TASKS = Object.freeze([
  'draft_post','draft_comment','draft_reply','follow','unfollow','customer_service_draft',
  'support_draft','automation_request','community_event_draft','live_show_plan'
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
  return [
    ...PERSONAL_AI_BOT_CATEGORIES.map(item => ({ ...item, builtIn:true, enabled:true })),
    ...db.personalAiBotCategories.map(item => ({ ...item, builtIn:false }))
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
  if (displayName.length < 2 || displayName.length > 64) throw Object.assign(new Error('Bot name must be between 2 and 64 characters.'), { status:400 });
  if (!category) throw Object.assign(new Error('Choose a valid bot category.'), { status:400 });
  const botId = uid();
  const bot = {
    id:botId, slug:slugify(displayName)+'-'+botId.slice(0,8),
    displayName, categoryId, categoryName:category.name,
    description:String(input.description || '').trim().slice(0,600),
    personality:String(input.personality || '').trim().slice(0,1200),
    languages:Array.isArray(input.languages)
      ? [...new Set(input.languages.map(value=>String(value).trim().slice(0,40)).filter(Boolean))].slice(0,12)
      : ['English'],
    administratorInstructions:String(input.administratorInstructions || '').trim().slice(0,4000),
    profileType:'ai_bot', aiLabel:'AI Bot',
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
      profileType:'ai_bot', aiLabel:'AI Bot',
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

export function queuePersonalAiBotInstruction(db, botId, input, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const bot=db.personalAiBots.find(item=>item.id===botId);
  if(!bot)throw Object.assign(new Error('Bot not found.'),{status:404});
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
  if(Object.hasOwn(input,'hybridEnabled')){
    if(typeof input.hybridEnabled!=='boolean')throw Object.assign(new Error('Hybrid enablement must be true or false.'),{status:400});
    settings.hybridEnabled=input.hybridEnabled;
  }
  settings.requireAdministratorApproval=true;
  settings.defaultAutonomyMode='administrator_controlled';
  settings.updatedBy=actorId;settings.updatedAt=timestamp;
  audit(db,actorId,'network.settings_updated','network','global','Updated Personal AI Bots Network controls.',timestamp,uid);
  return settings;
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
      categories:getPersonalAiBotCategories(db).length
    }
  };
}
