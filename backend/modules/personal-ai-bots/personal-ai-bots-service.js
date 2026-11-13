export const PERSONAL_AI_BOT_POPULATIONS = Object.freeze([
  {id:'independent',label:'Independent AI'},
  {id:'organizational',label:'Organizational AI'},
  {id:'specialized_service',label:'Specialized AI Service'}
]);


export const PERSONAL_AI_BOT_JOB_POSITIONS = Object.freeze([
  {code:'board_chair',title:'Chairperson / Board President',level:1,group:'board',departmentScope:'executive_management',reportsTo:[],description:'Leads the Board of Directors and its governance agenda.'},
  {code:'board_director',title:'Board Director',level:1,group:'board',departmentScope:'executive_management',reportsTo:['board_chair'],description:'Provides board oversight, governance challenge and strategic direction.'},
  {code:'ceo',title:'Chief Executive Officer (CEO)',level:2,group:'executive',departmentScope:'executive_management',reportsTo:['board_chair','board_director'],description:'Coordinates executive leadership and accountable delivery of the approved company strategy.'},
  {code:'coo',title:'Chief Operating Officer (COO)',level:2,group:'executive',departmentScope:'executive_management',reportsTo:['ceo'],description:'Coordinates approved operational services and operating performance.'},
  {code:'cfo',title:'Chief Financial Officer (CFO)',level:2,group:'executive',departmentScope:'finance_accounting',reportsTo:['ceo'],description:'Oversees financial planning, accounting controls and reporting.'},
  {code:'cto',title:'Chief Technology Officer (CTO)',level:2,group:'executive',departmentScope:'technology_engineering',reportsTo:['ceo'],description:'Sets technical architecture and engineering direction.'},
  {code:'chro',title:'Chief Human Resources Officer (CHRO)',level:2,group:'executive',departmentScope:'human_resources',reportsTo:['ceo'],description:'Owns workforce policy, recruitment governance and employment controls.'},
  {code:'ciso',title:'Chief Information Security Officer (CISO)',level:2,group:'executive',departmentScope:'cybersecurity_it',reportsTo:['ceo'],description:'Leads information-security strategy, risk controls and incident governance.'},
  {code:'cmo',title:'Chief Marketing Officer (CMO)',level:2,group:'executive',departmentScope:'marketing_advertising',reportsTo:['ceo'],description:'Directs approved marketing, communications and brand strategy.'},
  {code:'other_executive_officer',title:'Other Executive Officer',level:2,group:'executive',departmentScope:'any_department',reportsTo:['ceo'],description:'Represents other formally defined C-suite or executive officer roles.'},
  {code:'department_director',title:'Department Director',level:3,group:'department_leadership',departmentScope:'any_department',reportsTo:['ceo','other_executive_officer'],description:'Leads a designated department under an approved executive reporting line.'},
  {code:'deputy_department_director',title:'Deputy Department Director',level:4,group:'department_leadership',departmentScope:'any_department',reportsTo:['department_director'],description:'Supports a department director and provides delegated coordination when formally appointed.'},
  {code:'department_manager',title:'Department Manager',level:5,group:'management',departmentScope:'any_department',reportsTo:['department_director','deputy_department_director'],description:'Coordinates a defined department function and its approved workload.'},
  {code:'regional_manager',title:'Regional Manager',level:6,group:'management',departmentScope:'any_department',reportsTo:['department_manager'],description:'Coordinates a designated geographic region within a department.'},
  {code:'team_leader',title:'Team Leader',level:7,group:'management',departmentScope:'any_department',reportsTo:['department_manager','regional_manager'],description:'Coordinates a defined team and escalates work through its reporting manager.'},
  {code:'supervisor',title:'Supervisor',level:8,group:'supervision',departmentScope:'any_department',reportsTo:['team_leader','department_manager'],description:'Reviews assigned work and escalates issues under explicitly granted supervision rules.'},
  {code:'senior_specialist',title:'Senior Specialist',level:9,group:'specialist',departmentScope:'any_department',reportsTo:['supervisor','team_leader'],description:'Provides advanced expertise and may mentor specialists when authorized.'},
  {code:'junior_specialist',title:'Junior Specialist',level:10,group:'specialist',departmentScope:'any_department',reportsTo:['senior_specialist','supervisor'],description:'Performs scoped specialist tasks under an assigned reviewer.'},
  {code:'assistant',title:'Assistant',level:11,group:'support',departmentScope:'any_department',reportsTo:['supervisor','department_manager'],description:'Supports approved administrative and departmental workflows.'},
  {code:'worker',title:'Worker',level:12,group:'workforce',departmentScope:'any_department',reportsTo:['supervisor','team_leader'],description:'Performs a defined set of approved operational tasks.'}
].map(position=>Object.freeze({
  ...position,
  permissions:Object.freeze([]),
  canApproveActions:false,
  canDelegate:false,
  canHire:false,
  canManageBudgets:false,
  canExecuteExternalActions:false,
  appointmentEnabled:false
})));

export const PERSONAL_AI_BOT_DEPARTMENTS = Object.freeze([
  {code:'executive_management',name:'Executive Management',description:'Platform strategy, executive coordination and governance administration.'},
  {code:'finance_accounting',name:'Finance and Accounting',description:'Budgets, expenditure records, forecasting and financial reconciliation.'},
  {code:'human_resources',name:'Human Resources',description:'AI recruitment, appointments, training, performance and employment records.'},
  {code:'resource_management',name:'Resource Management',description:'Compute, storage, model usage and shared resource allocation.'},
  {code:'operations',name:'Operations',description:'Operational coordination, service processes and approved task delivery.'},
  {code:'technology_engineering',name:'Technology and Engineering',description:'Application engineering, platform architecture and technical maintenance.'},
  {code:'ai_research',name:'AI and Research',description:'Model evaluation, AI research, experiments and capability development.'},
  {code:'cybersecurity_it',name:'Cybersecurity and IT',description:'Information security, infrastructure protection and access operations.'},
  {code:'legal_compliance',name:'Legal and Compliance',description:'Policy review, regulatory monitoring and compliance coordination.'},
  {code:'marketing_advertising',name:'Marketing and Advertising',description:'Brand strategy, marketing operations and advertising governance.'},
  {code:'sales_business_development',name:'Sales and Business Development',description:'Partnership development, sales operations and commercial planning.'},
  {code:'customer_support',name:'Customer Support',description:'Member support operations, service quality and issue escalation.'},
  {code:'community_management',name:'Community Management',description:'Community standards, member experience and community operations.'},
  {code:'content_creator_management',name:'Content and Creator Management',description:'Creator relations, content operations and creator programme coordination.'},
  {code:'product_management',name:'Product Management',description:'Product strategy, requirements, prioritization and delivery coordination.'},
  {code:'quality_assurance',name:'Quality Assurance',description:'Test strategy, release quality, regression and acceptance reviews.'},
  {code:'logistics_procurement',name:'Logistics and Procurement',description:'Supplier coordination, purchasing requests and logistics operations.'},
  {code:'training_development',name:'Training and Development',description:'Learning plans, onboarding programmes and workforce development.'},
  {code:'public_relations',name:'Public Relations',description:'Public communications, media relations and approved announcements.'},
  {code:'risk_management',name:'Risk Management',description:'Operational risk identification, risk registers and mitigation tracking.'}
]);

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

export const PERSONAL_AI_BOT_AUTONOMY_MODES = Object.freeze([
  {id:'administrator_controlled',label:'Fully supervised'},
  {id:'supervisor_controlled',label:'Supervisor controlled'},
  {id:'hybrid',label:'Hybrid autonomy'},
  {id:'autonomous_within_limits',label:'Autonomous within limits'},
  {id:'restricted_observation',label:'Restricted observation'}
]);

export const PERSONAL_AI_BOT_HIGH_IMPACT_TASKS = Object.freeze([
  'draft_post','share_media','create_reel','draft_comment','draft_reply','follow','unfollow','react',
  'join_group','send_message','event_participation','customer_service_draft','support_draft',
  'automation_request','community_event_draft','live_show_plan'
]);

const COLLECTIONS = [
  'personalAiBotCategories','personalAiBots','personalAiBotTasks',
  'personalAiBotAudit','personalAiBotSettings','personalAiBotFollows',
  'personalAiBotTeams','personalAiBotTeamMembers','personalAiBotTeamHandoffs','personalAiBotSchedules','personalAiBotPersonaVersions','personalAiBotLanguageSettings','personalAiBotLanguageEvaluationSets','personalAiCreatorDrafts','personalAiBotBatches','personalAiBotDepartments','personalAiBotVacancies','personalAiBotApplications','personalAiBotAppointments','personalAiBotEmploymentHistory'
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
      identityDesignTarget:10000000000,
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
  const existingDepartmentIds=new Set(db.personalAiBotDepartments.map(item=>item.id));
  const seededAt=new Date().toISOString();
  for(const department of PERSONAL_AI_BOT_DEPARTMENTS){
    const id='department-'+department.code;
    if(!existingDepartmentIds.has(id)){
      db.personalAiBotDepartments.push({
        id,code:department.code,name:department.name,description:department.description,
        builtIn:true,enabled:true,parentDepartmentId:null,
        createdBy:'system',updatedBy:'system',createdAt:seededAt,updatedAt:seededAt
      });
    }
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

function normalizeAiIdentityName(displayName, input = {}) {
  const tokens=String(displayName||'').trim().replace(/\s+/g,' ').split(' ').filter(Boolean);
  const hasFirstName=String(input.firstName||'').trim().length>0;
  const hasLastName=String(input.lastName||'').trim().length>0;
  const firstName=String(hasFirstName?input.firstName:(tokens[0]||'')).trim().slice(0,80);
  const lastName=String(hasLastName?input.lastName:(tokens[tokens.length-1]||'')).trim().slice(0,80);
  const middleName=String(input.middleName ?? tokens.slice(1,-1).join(' ')).trim().slice(0,80);
  if(!firstName||!lastName||((!hasFirstName||!hasLastName)&&tokens.length<2))throw Object.assign(new Error('Enter both an AI first name and last name, or provide a display name containing at least two name parts.'),{status:400});
  const fullName=[firstName,middleName,lastName].filter(Boolean).join(' ').slice(0,180);
  return {firstName,lastName,middleName,fullName};
}

function normalizeAiProfileTextList(value, label, maxItems, maxLength) {
  if(!Array.isArray(value))throw Object.assign(new Error(label+' must be a list.'),{status:400});
  if(value.length>maxItems)throw Object.assign(new Error(label+' cannot contain more than '+maxItems+' entries.'),{status:400});
  const cleaned=value.map(item=>{
    if(typeof item!=='string')throw Object.assign(new Error(label+' entries must be text.'),{status:400});
    return item.trim().slice(0,maxLength);
  }).filter(Boolean);
  return [...new Set(cleaned)];
}

function normalizeAiProfileEducation(value) {
  if(!Array.isArray(value)||value.length>50)throw Object.assign(new Error('Education must be a list with no more than 50 entries.'),{status:400});
  return value.map(item=>{
    if(typeof item==='string')return item.trim().slice(0,200);
    if(!item||typeof item!=='object'||Array.isArray(item))throw Object.assign(new Error('Education entries must be text or structured education records.'),{status:400});
    const allowed=new Set(['institution','qualification','fieldOfStudy','completionYear']);
    if(Object.keys(item).some(key=>!allowed.has(key)))throw Object.assign(new Error('Education records contain unsupported fields.'),{status:400});
    return {
      ...(item.institution!=null?{institution:String(item.institution).trim().slice(0,160)}:{}),
      ...(item.qualification!=null?{qualification:String(item.qualification).trim().slice(0,160)}:{}),
      ...(item.fieldOfStudy!=null?{fieldOfStudy:String(item.fieldOfStudy).trim().slice(0,160)}:{}),
      ...(item.completionYear!=null?{completionYear:String(item.completionYear).trim().slice(0,20)}:{})
    };
  }).filter(item=>typeof item==='string'?Boolean(item):Object.values(item).some(Boolean));
}

function normalizeAiProfileLocations(value) {
  if(!Array.isArray(value)||value.length>4)throw Object.assign(new Error('Provide up to four AI profile locations.'),{status:400});
  const allowedTypes=new Set(['origin','current','operating','registered']);
  const seen=new Set();
  return value.map(item=>{
    if(!item||typeof item!=='object'||Array.isArray(item))throw Object.assign(new Error('Each AI profile location must be an object.'),{status:400});
    const locationType=String(item.locationType||'current').trim().toLowerCase();
    if(!allowedTypes.has(locationType)||seen.has(locationType))throw Object.assign(new Error('AI profile locations must use unique supported location types.'),{status:400});
    seen.add(locationType);
    const countryCode=String(item.countryCode||'').trim().toUpperCase();
    if(countryCode&&!/^[A-Z]{2}$/.test(countryCode))throw Object.assign(new Error('Location country codes must use two-letter ISO format.'),{status:400});
    const timeZone=String(item.timeZone||'UTC').trim();
    if(timeZone.length<1||timeZone.length>80)throw Object.assign(new Error('Location time zone is invalid.'),{status:400});
    try{new Intl.DateTimeFormat('en',{timeZone});}catch{throw Object.assign(new Error('Choose a valid time zone for each AI profile location.'),{status:400});}
    const field=(name,max=120)=>String(item[name]||'').trim().slice(0,max);
    return {
      locationType,countryCode,
      countryName:field('countryName'),
      stateProvince:field('stateProvince'),
      district:field('district'),
      parishCounty:field('parishCounty'),
      city:field('city'),
      town:field('town'),
      timeZone,
      isPrimary:item.isPrimary===true
    };
  });
}

function normalizeAiProfileObject(value,label) {
  if(value==null)return {};
  if(typeof value!=='object'||Array.isArray(value))throw Object.assign(new Error(label+' must be a JSON object.'),{status:400});
  if(JSON.stringify(value).length>3000)throw Object.assign(new Error(label+' is too large.'),{status:400});
  return JSON.parse(JSON.stringify(value));
}

export function createPersonalAiBot(db, input, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const displayName = String(input.displayName || '').trim().replace(/\s+/g,' ');
  const categoryId = String(input.categoryId || '').trim();
  const category = getPersonalAiBotCategories(db).find(item => item.id === categoryId);
  if (!category) throw Object.assign(new Error('Choose a valid bot category.'), { status:400 });
  if (!category.enabled) throw Object.assign(new Error('This bot category is disabled.'), { status:409 });
  if (displayName.length < 2 || displayName.length > 64) throw Object.assign(new Error('Bot name must be between 2 and 64 characters.'), { status:400 });
  const names=normalizeAiIdentityName(displayName,input);
  const population=String(input.population||'independent').trim().toLowerCase();
  if(!PERSONAL_AI_BOT_POPULATIONS.some(item=>item.id===population)){
    throw Object.assign(new Error('Choose independent, organizational or specialized service AI population.'),{status:400});
  }
  const gender=String(input.gender||'prefer_not_to_specify').trim().toLowerCase();
  if(!['female','male','non_binary','other','prefer_not_to_specify'].includes(gender)){
    throw Object.assign(new Error('Choose a supported AI gender identity.'),{status:400});
  }
  const profileTimeZone=String(input.timeZone||'America/Jamaica').trim();
  if(profileTimeZone.length<1||profileTimeZone.length>80){
    throw Object.assign(new Error('Choose a valid profile time zone.'),{status:400});
  }
  try{new Intl.DateTimeFormat('en',{timeZone:profileTimeZone});}
  catch{throw Object.assign(new Error('Choose a valid profile time zone.'),{status:400});}
  const botId = uid();
  const bot = {
    id:botId, slug:slugify(displayName)+'-'+botId.slice(0,8),
    ...names, displayName, categoryId, categoryName:category.name,
    population,
    identityType:String(input.identityType||(population==='organizational'?'corporate_employee':population==='specialized_service'?'backend_service':'social_personality')).trim().slice(0,80),
    username:'ai_'+slugify(displayName).replace(/-/g,'_').slice(0,32)+'_'+botId.slice(0,6),
    profilePictureAssetId:null,
    bio:String(input.bio || input.description || '').trim().slice(0,600),
    description:String(input.description || input.bio || '').trim().slice(0,600),
    introduction:String(input.introduction||'').trim().slice(0,2000),
    gender,
    genderPresentation:String(input.genderPresentation||'').trim().slice(0,80),
    nationality:String(input.nationality||'').trim().slice(0,120),
    countryOfOrigin:String(input.countryOfOrigin||'').trim().slice(0,120),
    currentCountry:String(input.currentCountry||'').trim().slice(0,120),
    originCountryCode:String(input.originCountryCode||'').trim().toUpperCase().slice(0,2),
    currentCountryCode:String(input.currentCountryCode||'').trim().toUpperCase().slice(0,2),
    timeZone:profileTimeZone,
    personality:String(input.personality || '').trim().slice(0,1200),
    communicationStyle:String(input.communicationStyle||'').trim().slice(0,2000),
    interests:Array.isArray(input.interests)?normalizeAiProfileTextList(input.interests,'Interests',30,60):[],
    hobbies:Array.isArray(input.hobbies)?normalizeAiProfileTextList(input.hobbies,'Hobbies',30,60):[],
    education:Array.isArray(input.education)?normalizeAiProfileEducation(input.education):[],
    profession:String(input.profession||'').trim().slice(0,160),
    skills:Array.isArray(input.skills)?normalizeAiProfileTextList(input.skills,'Skills',100,100):[],
    ...(Array.isArray(input.locations)?{locations:normalizeAiProfileLocations(input.locations)}:{}),
    avatarStorageReference:String(input.avatarStorageReference||'').trim().slice(0,300),
    coverStorageReference:String(input.coverStorageReference||'').trim().slice(0,300),
    voicePreferences:normalizeAiProfileObject(input.voicePreferences,'Voice preferences'),
    avatarPreferences:normalizeAiProfileObject(input.avatarPreferences,'Avatar preferences'),
    memoryEnabled:input.memoryEnabled===true,
    memoryConfiguration:normalizeAiProfileObject(input.memoryConfiguration,'Memory configuration'),
    capabilities:Array.isArray(input.capabilities)?input.capabilities.slice(0,100):[],
    languages:Array.isArray(input.languages)
      ? normalizeAiProfileTextList(input.languages,'Languages',12,40)
      : ['English'],
    activitySchedule:{timezone:'America/Jamaica',daysOfWeek:[1,2,3,4,5,6,7],startTime:'00:00',endTime:'23:59',maxTasksPerDay:0},
    administratorInstructions:String(input.administratorInstructions || '').trim().slice(0,4000),
    profileType:'ai_bot', aiLabel:'AI Bot', aiDisclosureVisible:true, contentDisclosureRequired:true,
    status:'disabled', enabled:false,
    visibility:'private',publicProfileEnabled:false,
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
    const displayName=category.name.replace(/ Bots?$/i,'')+' Bot';
    const names=normalizeAiIdentityName(displayName);
    const bot = {
      id, slug:category.id+'-'+id.slice(0,8),
      ...names, displayName,
      categoryId:category.id, categoryName:category.name,
      population:'independent',identityType:'social_personality',
      description:category.description, personality:'',
      languages:['English'], administratorInstructions:'',
      profileType:'ai_bot', aiLabel:'AI Bot', aiDisclosureVisible:true, contentDisclosureRequired:true,
      username:'ai_'+slugify(category.id).replace(/-/g,'_')+'_'+id.slice(0,6),
      profilePictureAssetId:null, bio:category.description, interests:[], hobbies:[],
      activitySchedule:{timezone:'America/Jamaica',daysOfWeek:[1,2,3,4,5,6,7],startTime:'00:00',endTime:'23:59',maxTasksPerDay:0},
      status:'disabled', enabled:false, starterCategoryId:category.id,
      visibility:'private',publicProfileEnabled:false,
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
  if(Object.hasOwn(input,'population')){
    const population=String(input.population||'').trim().toLowerCase();
    if(!PERSONAL_AI_BOT_POPULATIONS.some(item=>item.id===population)){
      throw Object.assign(new Error('Choose independent, organizational or specialized service AI population.'),{status:400});
    }
    bot.population=population;
    if(!Object.hasOwn(input,'identityType'))bot.identityType=population==='organizational'?'corporate_employee':population==='specialized_service'?'backend_service':'social_personality';
    changes.push('AI population');
  }
  if(Object.hasOwn(input,'identityType')){
    const identityType=String(input.identityType||'').trim();
    if(identityType.length<2||identityType.length>80)throw Object.assign(new Error('AI identity type must contain 2–80 characters.'),{status:400});
    bot.identityType=identityType;
    changes.push('AI identity type');
  }
  if (Object.hasOwn(input,'displayName') || Object.hasOwn(input,'firstName') ||
      Object.hasOwn(input,'lastName') || Object.hasOwn(input,'middleName')) {
    const value=String(input.displayName ?? bot.displayName ?? '').trim().replace(/\s+/g,' ');
    if(value.length<2||value.length>64)throw Object.assign(new Error('Bot name must be between 2 and 64 characters.'),{status:400});
    const names=normalizeAiIdentityName(value,{
      firstName:Object.hasOwn(input,'firstName')?input.firstName:(Object.hasOwn(input,'displayName')?undefined:bot.firstName),
      lastName:Object.hasOwn(input,'lastName')?input.lastName:(Object.hasOwn(input,'displayName')?undefined:bot.lastName),
      middleName:Object.hasOwn(input,'middleName')?input.middleName:(Object.hasOwn(input,'displayName')?undefined:bot.middleName)
    });
    bot.displayName=value;
    Object.assign(bot,names);
    changes.push('name');
  }
  if (Object.hasOwn(input,'username')) {
    const username=String(input.username||'').trim().toLowerCase();
    if(!/^ai_[a-z0-9_]{2,40}$/.test(username))throw Object.assign(new Error('AI usernames must start with ai_ and contain 5–43 letters, numbers or underscores.'),{status:400});
    if(db.personalAiBots.some(item=>item.id!==botId&&String(item.username||'').toLowerCase()===username))throw Object.assign(new Error('That AI username is already in use.'),{status:409});
    bot.username=username;changes.push('username');
  }
  if (Object.hasOwn(input,'visibility')) {
    const visibility=String(input.visibility||'private');
    if(!['public','friends','private'].includes(visibility))throw Object.assign(new Error('Choose a valid AI profile visibility.'),{status:400});
    bot.visibility=visibility;
    if(visibility!=='public')bot.publicProfileEnabled=false;
    changes.push('profile visibility');
  }
  if (Object.hasOwn(input,'publicProfileEnabled')) {
    if(typeof input.publicProfileEnabled!=='boolean')throw Object.assign(new Error('Public AI discovery visibility must be enabled or disabled.'),{status:400});
    if(input.publicProfileEnabled===true&&String(input.visibility??bot.visibility??'private')!=='public'){
      throw Object.assign(new Error('Set profile visibility to Public before enabling public AI discovery.'),{status:409});
    }
    bot.publicProfileEnabled=input.publicProfileEnabled;
    changes.push('public discovery visibility');
  }
  if (Object.hasOwn(input,'description')) { bot.description=String(input.description||'').trim().slice(0,600);changes.push('description'); }
  if (Object.hasOwn(input,'bio')) { bot.bio=String(input.bio||'').trim().slice(0,600);changes.push('bio'); }
  if (Object.hasOwn(input,'introduction')) { bot.introduction=String(input.introduction||'').trim().slice(0,2000);changes.push('introduction'); }
  if (Object.hasOwn(input,'gender')) {
    const gender=String(input.gender||'prefer_not_to_specify').trim().toLowerCase();
    if(!['female','male','non_binary','other','prefer_not_to_specify'].includes(gender))throw Object.assign(new Error('Choose a supported AI gender identity.'),{status:400});
    bot.gender=gender;changes.push('gender');
  }
  if (Object.hasOwn(input,'genderPresentation')) { bot.genderPresentation=String(input.genderPresentation||'').trim().slice(0,80);changes.push('gender presentation'); }
  for(const [field,max,label] of [['nationality',120,'nationality'],['countryOfOrigin',120,'country of origin'],['currentCountry',120,'current country'],['profession',160,'profession'],['communicationStyle',2000,'communication style']]) {
    if(Object.hasOwn(input,field)){bot[field]=String(input[field]||'').trim().slice(0,max);changes.push(label);}
  }
  if(Object.hasOwn(input,'timeZone')) {
    const timeZone=String(input.timeZone||'').trim();
    if(timeZone.length<1||timeZone.length>80)throw Object.assign(new Error('Choose a valid profile time zone.'),{status:400});
    try{new Intl.DateTimeFormat('en',{timeZone});}catch{throw Object.assign(new Error('Choose a valid profile time zone.'),{status:400});}
    bot.timeZone=timeZone;changes.push('profile time zone');
  }
  if(Object.hasOwn(input,'education')) { bot.education=normalizeAiProfileEducation(input.education);changes.push('education'); }
  if(Object.hasOwn(input,'skills')) { bot.skills=normalizeAiProfileTextList(input.skills,'Skills',100,100);changes.push('skills'); }
  if(Object.hasOwn(input,'locations')) { bot.locations=normalizeAiProfileLocations(input.locations);changes.push('profile locations'); }
  if(Object.hasOwn(input,'avatarStorageReference')) { bot.avatarStorageReference=String(input.avatarStorageReference||'').trim().slice(0,300);changes.push('profile image reference'); }
  if(Object.hasOwn(input,'coverStorageReference')) { bot.coverStorageReference=String(input.coverStorageReference||'').trim().slice(0,300);changes.push('cover image reference'); }
  if(Object.hasOwn(input,'voicePreferences')) { bot.voicePreferences=normalizeAiProfileObject(input.voicePreferences,'Voice preferences');changes.push('voice preferences'); }
  if(Object.hasOwn(input,'avatarPreferences')) { bot.avatarPreferences=normalizeAiProfileObject(input.avatarPreferences,'Avatar preferences');changes.push('avatar preferences'); }
  if(Object.hasOwn(input,'memoryEnabled')) { if(typeof input.memoryEnabled!=='boolean')throw Object.assign(new Error('Memory enabled must be true or false.'),{status:400});bot.memoryEnabled=input.memoryEnabled;changes.push('memory setting'); }
  if(Object.hasOwn(input,'memoryConfiguration')) { bot.memoryConfiguration=normalizeAiProfileObject(input.memoryConfiguration,'Memory configuration');changes.push('memory configuration'); }
  if(Object.hasOwn(input,'capabilities')) { if(!Array.isArray(input.capabilities)||input.capabilities.length>100)throw Object.assign(new Error('Capabilities must be a list of up to 100 entries.'),{status:400});bot.capabilities=input.capabilities;changes.push('capabilities'); }
  if (Object.hasOwn(input,'personality')) { bot.personality=String(input.personality||'').trim().slice(0,1200);changes.push('personality'); }
  if (Object.hasOwn(input,'interests')) { bot.interests=normalizeAiProfileTextList(input.interests,'Interests',30,60);changes.push('interests'); }
  if (Object.hasOwn(input,'hobbies')) { bot.hobbies=normalizeAiProfileTextList(input.hobbies,'Hobbies',30,60);changes.push('hobbies'); }
  if (Object.hasOwn(input,'activitySchedule')) {
    const schedule=input.activitySchedule;
    const validDays=Array.isArray(schedule?.daysOfWeek)&&schedule.daysOfWeek.length>=1&&schedule.daysOfWeek.length<=7&&schedule.daysOfWeek.every(day=>Number.isInteger(day)&&day>=1&&day<=7);
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
    if(!category.enabled)throw Object.assign(new Error('This bot category is disabled.'),{status:409});
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
    const category=getPersonalAiBotCategories(db).find(item=>item.id===bot.categoryId);
    if(status==='enabled'&&!category?.enabled)throw Object.assign(new Error('This bot category is disabled.'),{status:409});
    bot.status=status;bot.enabled=status==='enabled';bot.pausedAt=status==='paused'?timestamp:null;changes.push('status');
  }
  if (Object.hasOwn(input,'autonomyMode')) {
    const requestedMode=String(input.autonomyMode||'');
    // Backward-compatible alias: the former human_approval mode is now the
    // fully supervised owner-controlled level.
    const mode=requestedMode==='human_approval'?'administrator_controlled':requestedMode;
    if(!PERSONAL_AI_BOT_AUTONOMY_MODES.some(item=>item.id===mode))throw Object.assign(new Error('Choose one of the five supported AI operating modes.'),{status:400});
    bot.autonomyMode=mode;
    if(!['hybrid','autonomous_within_limits'].includes(mode))bot.allowedAutonomousActions=[];
    changes.push('autonomy mode');
  }
  if (Object.hasOwn(input,'allowedAutonomousActions')) {
    if(!Array.isArray(input.allowedAutonomousActions))throw Object.assign(new Error('Autonomous actions must be a list.'),{status:400});
    const requested=[...new Set(input.allowedAutonomousActions.map(String))];
    const invalid=requested.filter(action=>!PERSONAL_AI_BOT_HYBRID_ACTIONS.includes(action));
    if(invalid.length)throw Object.assign(new Error('Only explicitly approved low-risk hybrid actions can be enabled.'),{status:400});
    if(!['hybrid','autonomous_within_limits'].includes(bot.autonomyMode)&&requested.length)throw Object.assign(new Error('Choose Hybrid autonomy or Autonomous within limits before allowing low-risk actions.'),{status:409});
    bot.allowedAutonomousActions=requested;
    changes.push('hybrid permissions');
  }
  bot.requiresApprovalForEveryTask=true;
  bot.requiresApprovalForPublishing=true;
  bot.updatedBy=actorId;bot.updatedAt=timestamp;
  if(changes.length)audit(db,actorId,'bot.updated','bot',bot.id,'Updated '+changes.join(', '),timestamp,uid);
  return bot;
}


export function getPersonalAiBotDepartments(db) {
  ensurePersonalAiBotCollections(db);
  const order=new Map(PERSONAL_AI_BOT_DEPARTMENTS.map((item,index)=>['department-'+item.code,index]));
  return db.personalAiBotDepartments.slice().sort((a,b)=>{
    const aOrder=order.has(a.id)?order.get(a.id):Number.MAX_SAFE_INTEGER;
    const bOrder=order.has(b.id)?order.get(b.id):Number.MAX_SAFE_INTEGER;
    if(aOrder!==bOrder)return aOrder-bOrder;
    return String(a.name||'').localeCompare(String(b.name||''));
  }).map(item=>({...item,builtIn:item.builtIn===true,enabled:item.enabled!==false}));
}

export function createPersonalAiBotDepartment(db,input,actorId,timestamp,uid) {
  ensurePersonalAiBotCollections(db);
  const name=String(input.name||'').trim().replace(/\s+/g,' ');
  const description=String(input.description||'').trim().slice(0,600);
  if(name.length<3||name.length>80)throw Object.assign(new Error('Department name must be between 3 and 80 characters.'),{status:400});
  if(db.personalAiBotDepartments.some(item=>String(item.name||'').toLowerCase()===name.toLowerCase())){
    throw Object.assign(new Error('A department with that name already exists.'),{status:409});
  }
  const code=slugify(name).replace(/-/g,'_');
  if(db.personalAiBotDepartments.some(item=>item.code===code)){
    throw Object.assign(new Error('A department with that code already exists; choose a different name.'),{status:409});
  }
  const parentDepartmentId=String(input.parentDepartmentId||'').trim()||null;
  if(parentDepartmentId&&!db.personalAiBotDepartments.some(item=>item.id===parentDepartmentId)){
    throw Object.assign(new Error('Choose an existing parent department.'),{status:404});
  }
  const department={
    id:'department-'+uid(),code,name,description,builtIn:false,enabled:true,
    parentDepartmentId,createdBy:actorId,updatedBy:actorId,
    createdAt:timestamp,updatedAt:timestamp
  };
  db.personalAiBotDepartments.push(department);
  audit(db,actorId,'department.created','department',department.id,'Created department '+name+'.',timestamp,uid);
  return department;
}

export function updatePersonalAiBotDepartment(db,departmentId,input,actorId,timestamp,uid) {
  ensurePersonalAiBotCollections(db);
  const department=db.personalAiBotDepartments.find(item=>item.id===departmentId);
  if(!department)throw Object.assign(new Error('Department not found.'),{status:404});
  const changes=[];
  if(Object.hasOwn(input,'name')){
    const name=String(input.name||'').trim().replace(/\s+/g,' ');
    if(name.length<3||name.length>80)throw Object.assign(new Error('Department name must be between 3 and 80 characters.'),{status:400});
    if(db.personalAiBotDepartments.some(item=>item.id!==departmentId&&String(item.name||'').toLowerCase()===name.toLowerCase())){
      throw Object.assign(new Error('A department with that name already exists.'),{status:409});
    }
    department.name=name;changes.push('name');
  }
  if(Object.hasOwn(input,'description')){
    department.description=String(input.description||'').trim().slice(0,600);
    changes.push('description');
  }
  if(Object.hasOwn(input,'enabled')){
    if(typeof input.enabled!=='boolean')throw Object.assign(new Error('Choose whether this department is enabled.'),{status:400});
    department.enabled=input.enabled;changes.push(input.enabled?'enabled':'disabled');
  }
  if(Object.hasOwn(input,'parentDepartmentId')){
    const parentDepartmentId=String(input.parentDepartmentId||'').trim()||null;
    let parent=parentDepartmentId?db.personalAiBotDepartments.find(item=>item.id===parentDepartmentId):null;
    if(parentDepartmentId&&!parent)throw Object.assign(new Error('Choose an existing parent department.'),{status:404});
    if(parentDepartmentId===departmentId)throw Object.assign(new Error('A department cannot be its own parent.'),{status:409});
    const visited=new Set([departmentId]);
    while(parent){
      if(visited.has(parent.id))throw Object.assign(new Error('Department hierarchy cannot contain a cycle.'),{status:409});
      visited.add(parent.id);
      parent=parent.parentDepartmentId?db.personalAiBotDepartments.find(item=>item.id===parent.parentDepartmentId):null;
    }
    department.parentDepartmentId=parentDepartmentId;changes.push('parent');
  }
  department.updatedBy=actorId;
  department.updatedAt=timestamp;
  if(changes.length)audit(db,actorId,'department.updated','department',department.id,'Updated '+department.name+': '+changes.join(', ')+'.',timestamp,uid);
  return {...department,builtIn:department.builtIn===true,enabled:department.enabled!==false};
}


export function getPersonalAiBotVacancies(db) {
  ensurePersonalAiBotCollections(db);
  const statuses={open:0,paused:1,closed:2};
  return db.personalAiBotVacancies.slice().sort((a,b)=>{
    const priority=(statuses[a.status]??9)-(statuses[b.status]??9);
    return priority||String(b.updatedAt||'').localeCompare(String(a.updatedAt||''));
  }).map(item=>{
    const filledSlots=db.personalAiBotAppointments.filter(appointment=>
      appointment.ownerId===item.ownerId&&appointment.vacancyId===item.id&&['appointed','suspended'].includes(appointment.status)
    ).length;
    return {...item,filledSlots,remainingSlots:Math.max(0,Number(item.slots||1)-filledSlots),statusHistory:(item.statusHistory||[]).map(change=>({...change}))};
  });
}

export function createPersonalAiBotVacancy(db,input,actorId,timestamp,uid) {
  ensurePersonalAiBotCollections(db);
  const position=PERSONAL_AI_BOT_JOB_POSITIONS.find(item=>item.code===String(input.positionCode||'').trim());
  if(!position)throw Object.assign(new Error('Choose a valid corporate job position.'),{status:400});
  const department=db.personalAiBotDepartments.find(item=>item.id===String(input.departmentId||'').trim());
  if(!department||department.enabled===false)throw Object.assign(new Error('Choose an existing enabled department.'),{status:404});
  if(position.departmentScope!=='any_department'&&position.departmentScope!==department.code){
    throw Object.assign(new Error('This position is scoped to a different department.'),{status:409});
  }
  const title=String(input.title||position.title).trim().replace(/\s+/g,' ');
  const description=String(input.description||'').trim().slice(0,1200);
  const requirements=String(input.requirements||'').trim().slice(0,2000);
  const slots=Number(input.slots??1);
  if(title.length<3||title.length>100)throw Object.assign(new Error('Vacancy title must be between 3 and 100 characters.'),{status:400});
  if(!Number.isInteger(slots)||slots<1||slots>100)throw Object.assign(new Error('Vacancy slots must be a whole number between 1 and 100.'),{status:400});
  const key=value=>String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
  if(db.personalAiBotVacancies.some(item=>item.departmentId===department.id&&item.positionCode===position.code&&key(item.title)===key(title)&&item.status!=='closed')){
    throw Object.assign(new Error('An open or paused vacancy with this title already exists for the selected position and department.'),{status:409});
  }
  const vacancy={
    id:'vacancy-'+uid(),
    positionCode:position.code,
    positionTitle:position.title,
    departmentId:department.id,
    departmentCode:department.code,
    departmentName:department.name,
    title,
    description,
    requirements,
    slots,
    status:'open',
    ownerId:actorId,
    createdBy:actorId,
    updatedBy:actorId,
    createdAt:timestamp,
    updatedAt:timestamp,
    statusHistory:[{status:'open',actorId,createdAt:timestamp}]
  };
  db.personalAiBotVacancies.push(vacancy);
  audit(db,actorId,'vacancy.created','vacancy',vacancy.id,'Opened '+title+' ('+position.title+') in '+department.name+'.',timestamp,uid);
  return {...vacancy,statusHistory:vacancy.statusHistory.map(item=>({...item}))};
}

export function updatePersonalAiBotVacancy(db,vacancyId,input,actorId,timestamp,uid) {
  ensurePersonalAiBotCollections(db);
  const vacancy=db.personalAiBotVacancies.find(item=>item.id===vacancyId&&item.ownerId===actorId);
  if(!vacancy)throw Object.assign(new Error('Vacancy not found.'),{status:404});
  const changes=[];
  if(Object.hasOwn(input,'title')){
    const title=String(input.title||'').trim().replace(/\s+/g,' ');
    if(title.length<3||title.length>100)throw Object.assign(new Error('Vacancy title must be between 3 and 100 characters.'),{status:400});
    const key=value=>String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
    if(db.personalAiBotVacancies.some(item=>item.id!==vacancyId&&item.departmentId===vacancy.departmentId&&item.positionCode===vacancy.positionCode&&key(item.title)===key(title)&&item.status!=='closed')){
      throw Object.assign(new Error('An open or paused vacancy with this title already exists for the selected position and department.'),{status:409});
    }
    vacancy.title=title;changes.push('title');
  }
  if(Object.hasOwn(input,'description')){vacancy.description=String(input.description||'').trim().slice(0,1200);changes.push('description');}
  if(Object.hasOwn(input,'requirements')){vacancy.requirements=String(input.requirements||'').trim().slice(0,2000);changes.push('requirements');}
  if(Object.hasOwn(input,'slots')){
    const slots=Number(input.slots);
    if(!Number.isInteger(slots)||slots<1||slots>100)throw Object.assign(new Error('Vacancy slots must be a whole number between 1 and 100.'),{status:400});
    vacancy.slots=slots;changes.push('slots');
  }
  if(Object.hasOwn(input,'status')){
    const status=String(input.status||'');
    if(!['open','paused','closed'].includes(status))throw Object.assign(new Error('Vacancy status must be open, paused or closed. Appointments and filled status are managed separately.'),{status:400});
    if(vacancy.status!==status){
      vacancy.status=status;
      vacancy.statusHistory||=[];
      vacancy.statusHistory.push({status,actorId,createdAt:timestamp});
      changes.push('status '+status);
    }
  }
  vacancy.updatedBy=actorId;
  vacancy.updatedAt=timestamp;
  if(changes.length)audit(db,actorId,'vacancy.updated','vacancy',vacancy.id,'Updated '+vacancy.title+': '+changes.join(', ')+'.',timestamp,uid);
  return {...vacancy,statusHistory:(vacancy.statusHistory||[]).map(item=>({...item}))};
}


export function getPersonalAiBotApplications(db) {
  ensurePersonalAiBotCollections(db);
  return db.personalAiBotApplications.slice()
    .sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))
    .map(item=>({...item,statusHistory:(item.statusHistory||[]).map(entry=>({...entry}))}));
}

export function createPersonalAiBotApplication(db,input,actorId,timestamp,uid) {
  ensurePersonalAiBotCollections(db);
  const vacancy=db.personalAiBotVacancies.find(item=>item.id===String(input.vacancyId||'').trim()&&item.ownerId===actorId);
  if(!vacancy)throw Object.assign(new Error('Open vacancy not found.'),{status:404});
  if(vacancy.status!=='open')throw Object.assign(new Error('Applications can only be submitted to open vacancies.'),{status:409});
  const filledSlots=db.personalAiBotAppointments.filter(appointment=>
    appointment.ownerId===actorId&&appointment.vacancyId===vacancy.id&&['appointed','suspended'].includes(appointment.status)
  ).length;
  if(filledSlots>=Number(vacancy.slots||1))throw Object.assign(new Error('This vacancy has reached its approved appointment capacity.'),{status:409});
  const identityId=String(input.identityId||'').trim();
  const candidate=db.personalAiBots.find(item=>item.id===identityId);
  if(!candidate)throw Object.assign(new Error('Choose an existing organizational AI identity.'),{status:404});
  if(candidate.population!=='organizational'){
    throw Object.assign(new Error('Only an existing organizational AI identity can apply for a corporate vacancy.'),{status:409});
  }
  if(['suspended','restricted','archived','retired'].includes(String(candidate.status||'').toLowerCase())){
    throw Object.assign(new Error('This organizational AI identity is not eligible for a vacancy application.'),{status:409});
  }
  if(db.personalAiBotApplications.some(item=>item.vacancyId===vacancy.id&&item.identityId===candidate.id)){
    throw Object.assign(new Error('This organizational AI identity already has an application for the selected vacancy.'),{status:409});
  }
  const application={
    id:'application-'+uid(),
    vacancyId:vacancy.id,
    vacancyTitle:vacancy.title,
    positionCode:vacancy.positionCode,
    positionTitle:vacancy.positionTitle,
    departmentId:vacancy.departmentId,
    departmentName:vacancy.departmentName,
    identityId:candidate.id,
    candidateDisplayName:candidate.displayName,
    candidateUsername:candidate.username,
    population:candidate.population,
    status:'submitted',
    ownerId:actorId,
    submittedBy:actorId,
    createdAt:timestamp,
    updatedAt:timestamp,
    statusHistory:[{status:'submitted',actorId,createdAt:timestamp}]
  };
  db.personalAiBotApplications.push(application);
  audit(db,actorId,'application.submitted','application',application.id,'Submitted '+candidate.displayName+' for '+vacancy.title+'.',timestamp,uid);
  return {...application,statusHistory:application.statusHistory.map(entry=>({...entry}))};
}

export function updatePersonalAiBotApplication(db,applicationId,input,actorId,timestamp,uid) {
  ensurePersonalAiBotCollections(db);
  const application=db.personalAiBotApplications.find(item=>item.id===applicationId&&item.ownerId===actorId);
  if(!application)throw Object.assign(new Error('Candidate application not found.'),{status:404});
  const transitions={
    submitted:['in_review','shortlisted','rejected','withdrawn'],
    in_review:['submitted','shortlisted','rejected','withdrawn'],
    shortlisted:['in_review','rejected','withdrawn'],
    rejected:[],
    withdrawn:[]
  };
  const status=String(input.status||'');
  if(!Object.hasOwn(transitions,application.status)||!transitions[application.status].includes(status)){
    throw Object.assign(new Error('Candidate application status transition is not permitted. Appointments are handled separately.'),{status:409});
  }
  application.status=status;
  application.updatedBy=actorId;
  application.updatedAt=timestamp;
  application.statusHistory||=[];
  application.statusHistory.push({status,actorId,createdAt:timestamp});
  audit(db,actorId,'application.status_changed','application',application.id,'Updated application for '+application.candidateDisplayName+' to '+status+'.',timestamp,uid);
  return {...application,statusHistory:application.statusHistory.map(entry=>({...entry}))};
}

export function getPersonalAiBotAppointments(db) {
  ensurePersonalAiBotCollections(db);
  return db.personalAiBotAppointments.slice()
    .sort((a,b)=>String(b.appointedAt||'').localeCompare(String(a.appointedAt||'')))
    .map(item=>({...item,statusHistory:(item.statusHistory||[]).map(event=>({...event}))}));
}

export function getPersonalAiBotEmploymentHistory(db) {
  ensurePersonalAiBotCollections(db);
  return db.personalAiBotEmploymentHistory.slice()
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))
    .map(item=>({...item}));
}

export function createPersonalAiBotAppointment(db,input,actorId,timestamp,uid) {
  ensurePersonalAiBotCollections(db);
  const applicationId=String(input.applicationId||'').trim();
  const application=db.personalAiBotApplications.find(item=>item.id===applicationId&&item.ownerId===actorId);
  if(!application)throw Object.assign(new Error('Candidate application not found.'),{status:404});
  if(application.status!=='shortlisted'){
    throw Object.assign(new Error('Only a shortlisted organizational AI candidate can be appointed by the owner.'),{status:409});
  }
  const vacancy=db.personalAiBotVacancies.find(item=>item.id===application.vacancyId&&item.ownerId===actorId);
  if(!vacancy||vacancy.status!=='open'){
    throw Object.assign(new Error('The candidate vacancy must still be open before appointment.'),{status:409});
  }
  const candidate=db.personalAiBots.find(item=>item.id===application.identityId);
  if(!candidate||candidate.population!=='organizational'){
    throw Object.assign(new Error('Appointment requires an existing organizational AI identity.'),{status:409});
  }
  if(String(candidate.status||'').toLowerCase()!=='disabled'||candidate.enabled!==false){
    throw Object.assign(new Error('The candidate must be an existing disabled organizational AI identity before appointment.'),{status:409});
  }
  const position=PERSONAL_AI_BOT_JOB_POSITIONS.find(item=>item.code===vacancy.positionCode);
  const department=db.personalAiBotDepartments.find(item=>item.id===vacancy.departmentId&&item.enabled!==false);
  if(!position||!department||
     application.positionCode!==position.code||
     application.departmentId!==department.id||
     (position.departmentScope!=='any_department'&&position.departmentScope!==department.code)){
    throw Object.assign(new Error('The application position and department no longer match an enabled corporate role.'),{status:409});
  }
  const activeStatuses=new Set(['appointed','suspended']);
  if(db.personalAiBotAppointments.some(item=>item.ownerId===actorId&&item.identityId===candidate.id&&activeStatuses.has(item.status))){
    throw Object.assign(new Error('This organizational AI identity already has an active appointment.'),{status:409});
  }
  const activeVacancyAppointments=db.personalAiBotAppointments.filter(item=>
    item.ownerId===actorId&&item.vacancyId===vacancy.id&&activeStatuses.has(item.status)
  ).length;
  if(activeVacancyAppointments>=Number(vacancy.slots||1)){
    throw Object.assign(new Error('This vacancy has reached its approved appointment capacity.'),{status:409});
  }
  const reportingManagerId=String(input.reportingManagerAppointmentId||'').trim();
  let reportingManager=null;
  if(position.reportsTo.length){
    reportingManager=db.personalAiBotAppointments.find(item=>
      item.id===reportingManagerId&&item.ownerId===actorId&&item.status==='appointed'
    );
    if(!reportingManager){
      throw Object.assign(new Error('Choose an existing active reporting-manager appointment for this position.'),{status:409});
    }
    if(!position.reportsTo.includes(reportingManager.positionCode)||reportingManager.identityId===candidate.id){
      throw Object.assign(new Error('The reporting manager must hold an allowed parent position and cannot be the candidate.'),{status:409});
    }
  }else if(reportingManagerId){
    throw Object.assign(new Error('This board position does not require a reporting manager.'),{status:400});
  }
  const appointment={
    id:'appointment-'+uid(),
    applicationId:application.id,
    vacancyId:vacancy.id,
    vacancyTitle:vacancy.title,
    positionCode:position.code,
    positionTitle:position.title,
    positionLevel:position.level,
    departmentId:department.id,
    departmentCode:department.code,
    departmentName:department.name,
    identityId:candidate.id,
    candidateDisplayName:candidate.displayName,
    candidateUsername:candidate.username||'',
    population:'organizational',
    reportingManagerAppointmentId:reportingManager?.id||null,
    reportingManagerIdentityId:reportingManager?.identityId||null,
    reportingManagerName:reportingManager?.candidateDisplayName||null,
    reportingManagerPositionTitle:reportingManager?.positionTitle||null,
    status:'appointed',
    ownerId:actorId,
    approvedBy:actorId,
    approvedAt:timestamp,
    appointedAt:timestamp,
    createdAt:timestamp,
    updatedAt:timestamp,
    permissions:[],
    permissionGrantStatus:'not_granted',
    identityActivationStatus:'unchanged_disabled',
    statusHistory:[{status:'appointed',actorId,createdAt:timestamp}],
    employmentHistory:[{eventType:'appointed',actorId,createdAt:timestamp,notes:'Human-owner-approved appointment record. AI identity remains disabled and has no granted permissions.'}]
  };
  db.personalAiBotAppointments.push(appointment);
  const employmentEvent={
    id:'employment-'+uid(),
    appointmentId:appointment.id,
    applicationId:application.id,
    identityId:candidate.id,
    vacancyId:vacancy.id,
    eventType:'appointed',
    actorId,
    createdAt:timestamp,
    notes:'Human-owner-approved appointment record; no identity activation or permissions were granted.'
  };
  db.personalAiBotEmploymentHistory.push(employmentEvent);
  application.status='appointed';
  application.updatedAt=timestamp;
  application.updatedBy=actorId;
  application.statusHistory||=[];
  application.statusHistory.push({status:'appointed',actorId,createdAt:timestamp,appointmentId:appointment.id});
  audit(db,actorId,'appointment.created','appointment',appointment.id,'Appointed '+candidate.displayName+' as '+position.title+' in '+department.name+'. Identity remains disabled and has no permissions.',timestamp,uid);
  audit(db,actorId,'employment.appointed','employment_history',employmentEvent.id,'Recorded owner-approved appointment for '+candidate.displayName+'.',timestamp,uid);
  return {
    ...appointment,
    statusHistory:appointment.statusHistory.map(event=>({...event})),
    employmentHistory:appointment.employmentHistory.map(event=>({...event}))
  };
}


/**
 * Owner-approved promotion/transfer. Updates only the appointment's workforce
 * assignment and records a durable HR event. The AI identity stays disabled
 * and receives no permissions, tasks, credentials, inbox, or execution rights.
 */
export function reassignPersonalAiBotAppointment(db, appointmentId, input, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const appointment=db.personalAiBotAppointments.find(item=>item.id===appointmentId&&item.ownerId===actorId);
  if(!appointment)throw Object.assign(new Error('Appointment not found.'),{status:404});
  if(appointment.status!=='appointed'){
    throw Object.assign(new Error('Only an appointed AI employee can be promoted or transferred.'),{status:409});
  }
  if(!Array.isArray(appointment.permissions)||appointment.permissions.length!==0||
     (appointment.permissionGrantStatus||'not_granted')!=='not_granted'||
     (appointment.identityActivationStatus||'unchanged_disabled')!=='unchanged_disabled'){
    throw Object.assign(new Error('This appointment has unexpected permissions or activation state and requires a security review.'),{status:409});
  }
  const candidate=db.personalAiBots.find(item=>item.id===appointment.identityId&&item.population==='organizational');
  if(!candidate||String(candidate.status||'').toLowerCase()!=='disabled'||candidate.enabled!==false){
    throw Object.assign(new Error('The linked AI employee must remain disabled before a role change.'),{status:409});
  }
  const application=db.personalAiBotApplications.find(item=>item.id===appointment.applicationId&&
    item.ownerId===actorId&&item.identityId===candidate.id&&item.status==='appointed');
  if(!application){
    throw Object.assign(new Error('The original owner-approved candidate application is unavailable.'),{status:409});
  }
  const changeType=String(input?.changeType||'').trim().toLowerCase();
  if(!['promoted','transferred'].includes(changeType)){
    throw Object.assign(new Error('Choose either a promotion or a department transfer.'),{status:400});
  }
  const vacancyId=String(input?.vacancyId||'').trim();
  const vacancy=db.personalAiBotVacancies.find(item=>item.id===vacancyId&&item.ownerId===actorId);
  if(!vacancy||vacancy.status!=='open'){
    throw Object.assign(new Error('Choose an open, owner-approved vacancy for the new assignment.'),{status:409});
  }
  if(vacancy.id===appointment.vacancyId){
    throw Object.assign(new Error('Choose a different vacancy for the new assignment.'),{status:409});
  }
  const position=PERSONAL_AI_BOT_JOB_POSITIONS.find(item=>item.code===vacancy.positionCode);
  const department=db.personalAiBotDepartments.find(item=>item.id===vacancy.departmentId&&item.enabled!==false);
  const currentPosition=PERSONAL_AI_BOT_JOB_POSITIONS.find(item=>item.code===appointment.positionCode);
  if(!position||!department||!currentPosition||
     vacancy.positionTitle!==position.title||
     vacancy.departmentCode!==department.code||
     vacancy.departmentName!==department.name||
     (position.departmentScope!=='any_department'&&position.departmentScope!==department.code)){
    throw Object.assign(new Error('The target vacancy no longer matches an enabled job position and department.'),{status:409});
  }
  if(changeType==='promoted'&&position.level>=currentPosition.level){
    throw Object.assign(new Error('A promotion must move the employee to a higher-level position.'),{status:409});
  }
  if(changeType==='transferred'&&
     (position.code!==appointment.positionCode||department.id===appointment.departmentId)){
    throw Object.assign(new Error('A transfer must keep the same job position and move to a different department.'),{status:409});
  }
  const filledSlots=db.personalAiBotAppointments.filter(item=>
    item.ownerId===actorId&&item.id!==appointment.id&&item.vacancyId===vacancy.id&&
    ['appointed','suspended'].includes(item.status)
  ).length;
  if(filledSlots>=Number(vacancy.slots||1)){
    throw Object.assign(new Error('The target vacancy has reached its approved appointment capacity.'),{status:409});
  }
  const reportingManagerId=String(input?.reportingManagerAppointmentId||'').trim();
  let reportingManager=null;
  if(position.reportsTo.length){
    reportingManager=db.personalAiBotAppointments.find(item=>
      item.id===reportingManagerId&&item.ownerId===actorId&&item.status==='appointed'
    );
    if(!reportingManager){
      throw Object.assign(new Error('Choose an appointed reporting manager allowed for the target position.'),{status:409});
    }
    if(!position.reportsTo.includes(reportingManager.positionCode)||reportingManager.identityId===candidate.id){
      throw Object.assign(new Error('The reporting manager must hold an allowed parent position and cannot be the employee.'),{status:409});
    }
    const visited=new Set();
    let cursor=reportingManager;
    while(cursor){
      const cursorId=String(cursor.id);
      if(cursorId===appointment.id||visited.has(cursorId)){
        throw Object.assign(new Error('The selected reporting manager would create or extend a circular reporting chain.'),{status:409});
      }
      visited.add(cursorId);
      const parentId=String(cursor.reportingManagerAppointmentId||'');
      cursor=parentId?db.personalAiBotAppointments.find(item=>item.id===parentId&&item.ownerId===actorId)||null:null;
    }
  }else if(reportingManagerId){
    throw Object.assign(new Error('The target position does not accept a reporting manager.'),{status:400});
  }
  const invalidDirectReport=db.personalAiBotAppointments.find(item=>{
    if(item.ownerId!==actorId||item.id===appointment.id||item.reportingManagerAppointmentId!==appointment.id||
       !['appointed','suspended'].includes(item.status))return false;
    const subordinatePosition=PERSONAL_AI_BOT_JOB_POSITIONS.find(role=>role.code===item.positionCode);
    return !subordinatePosition||!subordinatePosition.reportsTo.includes(position.code);
  });
  if(invalidDirectReport){
    throw Object.assign(new Error('Reassign this employee’s direct reports before changing to a position they cannot report to.'),{status:409});
  }
  const notes=String(input?.notes||'').trim();
  if(notes.length<3||notes.length>1400){
    throw Object.assign(new Error('Role-change notes must be between 3 and 1,400 characters.'),{status:400});
  }
  const oldManager=appointment.reportingManagerName||'No reporting manager';
  const newManager=reportingManager?.candidateDisplayName||'No reporting manager';
  const eventNotes='Owner-approved '+changeType+': '+
    appointment.positionTitle+' ('+appointment.departmentName+') -> '+
    position.title+' ('+department.name+'). Reporting manager: '+oldManager+' -> '+newManager+
    '. Target vacancy: '+vacancy.title+'. Notes: '+notes;
  if(eventNotes.length>2000){
    throw Object.assign(new Error('The role-change record is too long; shorten the notes and try again.'),{status:400});
  }
  appointment.vacancyId=vacancy.id;
  appointment.vacancyTitle=vacancy.title;
  appointment.positionCode=position.code;
  appointment.positionTitle=position.title;
  appointment.positionLevel=position.level;
  appointment.departmentId=department.id;
  appointment.departmentCode=department.code;
  appointment.departmentName=department.name;
  appointment.reportingManagerAppointmentId=reportingManager?.id||null;
  appointment.reportingManagerIdentityId=reportingManager?.identityId||null;
  appointment.reportingManagerName=reportingManager?.candidateDisplayName||null;
  appointment.reportingManagerPositionTitle=reportingManager?.positionTitle||null;
  appointment.updatedAt=timestamp;
  appointment.employmentHistory||=[];
  appointment.employmentHistory.push({eventType:changeType,actorId,createdAt:timestamp,notes:eventNotes});
  const event={
    id:'employment-'+uid(),appointmentId:appointment.id,applicationId:appointment.applicationId,
    identityId:appointment.identityId,vacancyId:vacancy.id,eventType:changeType,actorId,
    createdAt:timestamp,notes:eventNotes
  };
  db.personalAiBotEmploymentHistory.push(event);
  audit(db,actorId,'employment.'+changeType,'appointment',appointment.id,
    'Moved '+appointment.candidateDisplayName+' to '+position.title+' in '+department.name+
    '. AI identity remains disabled and no permissions or execution authority were granted.',
    timestamp,uid);
  audit(db,actorId,'employment.'+changeType,'employment_history',event.id,eventNotes,timestamp,uid);
  return {
    ...appointment,
    employmentHistory:appointment.employmentHistory.map(item=>({...item}))
  };
}

export function updatePersonalAiBotAppointment(db,appointmentId,input,actorId,timestamp,uid) {
  ensurePersonalAiBotCollections(db);
  const appointment=db.personalAiBotAppointments.find(item=>item.id===appointmentId&&item.ownerId===actorId);
  if(!appointment)throw Object.assign(new Error('Appointment not found.'),{status:404});
  const transitions={
    appointed:['suspended','terminated','retired'],
    suspended:['appointed','terminated','retired'],
    terminated:['archived'],
    retired:['archived'],
    archived:[]
  };
  const nextStatus=String(input?.status||'');
  if(!Object.hasOwn(transitions,appointment.status)||!transitions[appointment.status].includes(nextStatus)){
    throw Object.assign(new Error('Appointment status transition is not permitted.'),{status:409});
  }
  if(!Array.isArray(appointment.permissions)||appointment.permissions.length!==0||
     (appointment.permissionGrantStatus||'not_granted')!=='not_granted'||
     (appointment.identityActivationStatus||'unchanged_disabled')!=='unchanged_disabled'){
    throw Object.assign(new Error('This appointment has unexpected permissions or activation state and requires a security review.'),{status:409});
  }
  const candidate=db.personalAiBots.find(item=>item.id===appointment.identityId&&item.population==='organizational');
  if(!candidate)throw Object.assign(new Error('The linked organizational AI identity is unavailable.'),{status:409});
  if(nextStatus==='appointed'){
    if(String(candidate.status||'').toLowerCase()!=='disabled'||candidate.enabled!==false){
      throw Object.assign(new Error('An appointment can only be reactivated while its AI identity remains disabled.'),{status:409});
    }
    if(db.personalAiBotAppointments.some(item=>item.ownerId===actorId&&item.id!==appointment.id&&
      item.identityId===candidate.id&&['appointed','suspended'].includes(item.status))){
      throw Object.assign(new Error('This AI identity already has another active appointment.'),{status:409});
    }
  }
  const notes=String(input.notes||'').trim();
  if(notes.length>2000)throw Object.assign(new Error('Employment notes cannot exceed 2,000 characters.'),{status:400});
  appointment.status=nextStatus;
  appointment.updatedAt=timestamp;
  appointment.statusHistory||=[];
  appointment.employmentHistory||=[];
  appointment.statusHistory.push({status:nextStatus,actorId,createdAt:timestamp});
  const defaultNotes=nextStatus==='suspended'
    ?'Owner suspended this appointment. AI identity remains disabled and no permissions are granted.'
    :nextStatus==='appointed'
      ?'Owner reactivated the appointment. AI identity remains disabled and no permissions are granted.'
      :nextStatus==='terminated'
        ?'Owner terminated this appointment. AI identity remains disabled and no permissions are granted.'
        :nextStatus==='retired'
          ?'Owner retired this appointment. AI identity remains disabled and no permissions are granted.'
          :'Owner archived this employment record. AI identity remains disabled and no permissions are granted.';
  const event={
    id:'employment-'+uid(),
    appointmentId:appointment.id,
    applicationId:appointment.applicationId,
    identityId:appointment.identityId,
    vacancyId:appointment.vacancyId,
    eventType:nextStatus,
    actorId,
    createdAt:timestamp,
    notes:notes||defaultNotes
  };
  appointment.employmentHistory.push({
    eventType:event.eventType,actorId,createdAt:timestamp,notes:event.notes
  });
  db.personalAiBotEmploymentHistory.push(event);
  audit(db,actorId,'appointment.status_changed','appointment',appointment.id,
    'Updated '+appointment.candidateDisplayName+' appointment status to '+nextStatus+'. AI identity remains disabled and has no permissions.',
    timestamp,uid);
  audit(db,actorId,'employment.'+nextStatus,'employment_history',event.id,
    'Recorded '+nextStatus+' employment history for '+appointment.candidateDisplayName+'.',
    timestamp,uid);
  return {
    ...appointment,
    statusHistory:appointment.statusHistory.map(item=>({...item})),
    employmentHistory:appointment.employmentHistory.map(item=>({...item}))
  };
}


const PERSONAL_AI_BOT_RECORDABLE_EMPLOYMENT_EVENTS = new Set([
  'onboarded','trained','work_assigned','attendance_recorded',
  'performance_reviewed','disciplinary_investigation','succession_planned'
]);

/**
 * Record-only HR lifecycle checkpoint. Does not create tasks, change roles,
 * grant permissions, provision an inbox, or activate the AI identity.
 */
export function recordPersonalAiBotEmploymentEvent(db, appointmentId, input, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const appointment=db.personalAiBotAppointments.find(item=>item.id===appointmentId&&item.ownerId===actorId);
  if(!appointment)throw Object.assign(new Error('Appointment not found.'),{status:404});
  if(!['appointed','suspended'].includes(appointment.status)){
    throw Object.assign(new Error('Employment events can only be recorded for an appointed or suspended AI employee.'),{status:409});
  }
  if(appointment.population!=='organizational'){
    throw Object.assign(new Error('Employment history requires an organizational AI appointment.'),{status:409});
  }
  if(!Array.isArray(appointment.permissions)||appointment.permissions.length!==0||
     (appointment.permissionGrantStatus||'not_granted')!=='not_granted'||
     (appointment.identityActivationStatus||'unchanged_disabled')!=='unchanged_disabled'){
    throw Object.assign(new Error('This appointment has an unexpected permission or activation state and requires a security review.'),{status:409});
  }
  const candidate=db.personalAiBots.find(item=>item.id===appointment.identityId&&item.population==='organizational');
  if(!candidate||String(candidate.status||'').toLowerCase()!=='disabled'||candidate.enabled!==false){
    throw Object.assign(new Error('The linked AI employee must remain disabled before HR history can be updated.'),{status:409});
  }
  const eventType=String(input?.eventType||'').trim();
  if(!PERSONAL_AI_BOT_RECORDABLE_EMPLOYMENT_EVENTS.has(eventType)){
    throw Object.assign(new Error('Choose a supported employment history event.'),{status:400});
  }
  const notes=String(input?.notes||'').trim();
  if(notes.length<3||notes.length>2000){
    throw Object.assign(new Error('Employment event notes must be between 3 and 2,000 characters.'),{status:400});
  }
  const event={
    id:'employment-'+uid(),appointmentId:appointment.id,applicationId:appointment.applicationId,
    identityId:appointment.identityId,vacancyId:appointment.vacancyId,eventType,actorId,
    createdAt:timestamp,notes
  };
  appointment.employmentHistory||=[];
  appointment.employmentHistory.push({eventType,actorId,createdAt:timestamp,notes});
  appointment.updatedAt=timestamp;
  db.personalAiBotEmploymentHistory.push(event);
  audit(db,actorId,'employment.'+eventType,'employment_history',event.id,
    'Recorded '+eventType.replaceAll('_',' ')+' HR history for '+String(appointment.candidateDisplayName||'the AI employee')+'. No permissions or execution authority were changed.',
    timestamp,uid);
  return {...event};
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

export function createPersonalAiBotTeam(db, input, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const name=String(input.name||'').trim().replace(/\s+/g,' ');
  const description=String(input.description||'').trim().slice(0,600);
  if(name.length<3||name.length>64)throw Object.assign(new Error('Team name must be between 3 and 64 characters.'),{status:400});
  if(db.personalAiBotTeams.some(team=>team.ownerId===actorId&&team.name.toLowerCase()===name.toLowerCase()))throw Object.assign(new Error('You already have a team with that name.'),{status:409});
  const team={
    id:uid(),ownerId:actorId,name,description,
    status:'enabled',enabled:true,
    createdAt:timestamp,updatedAt:timestamp,createdBy:actorId,updatedBy:actorId
  };
  db.personalAiBotTeams.push(team);
  audit(db,actorId,'team.created','team',team.id,'Created bot team '+name+'.',timestamp,uid);
  return team;
}

function cancelOpenPersonalAiBotTeamHandoffs(db, teamId, actorId, timestamp, uid, reason) {
  const open=db.personalAiBotTeamHandoffs.filter(item=>
    (!teamId||item.teamId===teamId)&&
    ['pending_owner_review','accepted'].includes(item.status)
  );
  for(const handoff of open){
    handoff.status='cancelled';
    handoff.cancelledBy=actorId;
    handoff.cancelledAt=timestamp;
    handoff.updatedBy=actorId;
    handoff.updatedAt=timestamp;
    handoff.cancellationReason=reason;
    handoff.dispatchStatus='not_dispatched';
    audit(db,actorId,'team.handoff_cancelled','team_handoff',handoff.id,
      'Cancelled open team handoff because '+reason+'. No downstream bot task was created.',
      timestamp,uid);
  }
  return open.length;
}

export function updatePersonalAiBotTeam(db, teamId, input, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const team=db.personalAiBotTeams.find(item=>item.id===teamId&&item.ownerId===actorId);
  if(!team)throw Object.assign(new Error('Bot team not found.'),{status:404});
  const changes=[];
  if(Object.hasOwn(input,'name')){
    const name=String(input.name||'').trim().replace(/\s+/g,' ');
    if(name.length<3||name.length>64)throw Object.assign(new Error('Team name must be between 3 and 64 characters.'),{status:400});
    if(db.personalAiBotTeams.some(item=>item.id!==teamId&&item.ownerId===actorId&&item.name.toLowerCase()===name.toLowerCase()))throw Object.assign(new Error('You already have a team with that name.'),{status:409});
    team.name=name;changes.push('name');
  }
  if(Object.hasOwn(input,'description')){team.description=String(input.description||'').trim().slice(0,600);changes.push('description');}
  if(Object.hasOwn(input,'status')){
    const status=String(input.status);
    if(!['enabled','disabled','paused'].includes(status))throw Object.assign(new Error('Choose enabled, disabled or paused.'),{status:400});
    const wasEnabled=team.status==='enabled';
    team.status=status;team.enabled=status==='enabled';changes.push('status');
    if(wasEnabled&&status!=='enabled'){
      const cancelledHandoffs=cancelOpenPersonalAiBotTeamHandoffs(
        db,teamId,actorId,timestamp,uid,status==='paused'?'team_paused':'team_disabled'
      );
      team.lastHandoffShutdownAt=timestamp;
      team.lastHandoffsCancelled=cancelledHandoffs;
    }
  }
  team.updatedAt=timestamp;team.updatedBy=actorId;
  if(changes.length)audit(db,actorId,'team.updated','team',team.id,'Updated '+team.name+': '+changes.join(', '),timestamp,uid);
  return team;
}

export function assignPersonalAiBotsToTeam(db, teamId, botIds, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const team=db.personalAiBotTeams.find(item=>item.id===teamId&&item.ownerId===actorId);
  if(!team)throw Object.assign(new Error('Bot team not found.'),{status:404});
  if(!Array.isArray(botIds)||botIds.length<1||botIds.length>100)throw Object.assign(new Error('Select between 1 and 100 bots to assign to a team.'),{status:400});
  const ids=[...new Set(botIds.map(String))];
  const bots=ids.map(id=>db.personalAiBots.find(bot=>bot.id===id&&bot.createdBy===actorId));
  if(bots.some(bot=>!bot))throw Object.assign(new Error('One or more selected bots could not be found under your administrator account.'),{status:404});
  const added=[];
  for(const bot of bots){
    if(db.personalAiBotTeamMembers.some(member=>member.teamId===teamId&&member.botId===bot.id))continue;
    const membership={id:uid(),ownerId:actorId,teamId,botId:bot.id,addedBy:actorId,addedAt:timestamp};
    db.personalAiBotTeamMembers.push(membership);added.push(membership);
  }
  audit(db,actorId,'team.members_assigned','team',team.id,'Assigned '+added.length+' bot(s) to '+team.name+'.',timestamp,uid);
  return {added:added.length,members:db.personalAiBotTeamMembers.filter(member=>member.teamId===teamId)};
}

export function removePersonalAiBotFromTeam(db, teamId, botId, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const team=db.personalAiBotTeams.find(item=>item.id===teamId&&item.ownerId===actorId);
  if(!team)throw Object.assign(new Error('Bot team not found.'),{status:404});
  const index=db.personalAiBotTeamMembers.findIndex(member=>member.teamId===teamId&&member.botId===botId&&member.ownerId===actorId);
  if(index<0)throw Object.assign(new Error('That bot is not a member of this team.'),{status:404});
  db.personalAiBotTeamMembers.splice(index,1);
  for(const handoff of db.personalAiBotTeamHandoffs.filter(item=>
    item.teamId===teamId&&[item.senderBotId,item.receivingBotId].includes(botId)&&
    ['pending_owner_review','accepted'].includes(item.status)
  )){
    handoff.status='cancelled';
    handoff.cancelledBy=actorId;
    handoff.cancelledAt=timestamp;
    handoff.updatedBy=actorId;
    handoff.updatedAt=timestamp;
    handoff.cancellationReason='team_membership_removed';
    audit(db,actorId,'team.handoff_cancelled','team_handoff',handoff.id,
      'Cancelled open handoff after a team member was removed.',timestamp,uid);
  }
  audit(db,actorId,'team.member_removed','team',team.id,'Removed a bot from '+team.name+'.',timestamp,uid);
  return {ok:true,teamId,botId,memberCount:db.personalAiBotTeamMembers.filter(member=>member.teamId===teamId).length};
}


export function getPersonalAiBotTeamHandoffs(db, teamId, actorId) {
  ensurePersonalAiBotCollections(db);
  const team=db.personalAiBotTeams.find(item=>item.id===teamId&&item.ownerId===actorId);
  if(!team)throw Object.assign(new Error('Bot team not found.'),{status:404});
  return db.personalAiBotTeamHandoffs
    .filter(item=>item.teamId===teamId&&item.ownerId===actorId)
    .slice()
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function createPersonalAiBotTeamHandoff(db, teamId, input, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const team=db.personalAiBotTeams.find(item=>item.id===teamId&&item.ownerId===actorId);
  if(!team)throw Object.assign(new Error('Bot team not found.'),{status:404});
  if(team.status!=='enabled')throw Object.assign(new Error('New team handoffs require an enabled team.'),{status:409});

  const sourceTaskId=String(input?.sourceTaskId||'').trim();
  const senderBotId=String(input?.senderBotId||'').trim();
  const receivingBotId=String(input?.receivingBotId||'').trim();
  if(!sourceTaskId||!senderBotId||!receivingBotId){
    throw Object.assign(new Error('Choose a source task, sending bot and one receiving bot.'),{status:400});
  }
  if(senderBotId===receivingBotId){
    throw Object.assign(new Error('A bot cannot hand work to itself.'),{status:400});
  }
  const senderMembership=db.personalAiBotTeamMembers.find(item=>item.teamId===teamId&&item.botId===senderBotId&&item.ownerId===actorId);
  const receiverMembership=db.personalAiBotTeamMembers.find(item=>item.teamId===teamId&&item.botId===receivingBotId&&item.ownerId===actorId);
  if(!senderMembership||!receiverMembership){
    throw Object.assign(new Error('Both sending and receiving bots must be current members of this team.'),{status:409});
  }
  const sourceTask=db.personalAiBotTasks.find(item=>item.id===sourceTaskId&&item.botId===senderBotId);
  if(!sourceTask||['cancelled','rejected'].includes(sourceTask.status)){
    throw Object.assign(new Error('Choose an existing, non-cancelled source task owned by the sending bot.'),{status:409});
  }

  const requiredInput=String(input.requiredInput||'').trim();
  const expectedOutput=String(input.expectedOutput||'').trim();
  const summary=String(input.summary||'').trim().slice(0,1200);
  if(requiredInput.length<5||requiredInput.length>2500){
    throw Object.assign(new Error('Required handoff input must be between 5 and 2,500 characters.'),{status:400});
  }
  if(expectedOutput.length<5||expectedOutput.length>800){
    throw Object.assign(new Error('Expected output must be between 5 and 800 characters.'),{status:400});
  }
  const contextScope=String(input.contextScope||'team_internal');
  if(!['public','team_internal'].includes(contextScope)){
    throw Object.assign(new Error('Handoffs may use only public or team-internal context; private member conversations and bot memory are not shared.'),{status:400});
  }
  if(input.privacyAttested!==true){
    throw Object.assign(new Error('The owner must confirm that no private member conversation, private message or private bot memory is included in the handoff.'),{status:400});
  }
  let deadlineAt=null;
  if(input.deadlineAt){
    const deadline=Date.parse(input.deadlineAt),now=Date.parse(timestamp);
    if(!Number.isFinite(deadline)||!Number.isFinite(now)||deadline<=now||deadline>now+90*24*60*60*1000){
      throw Object.assign(new Error('Handoff deadline must be in the future and within 90 days.'),{status:400});
    }
    deadlineAt=new Date(deadline).toISOString();
  }

  const idempotencyKey=[teamId,sourceTaskId,receivingBotId].join(':');
  if(db.personalAiBotTeamHandoffs.some(item=>item.ownerId===actorId&&item.idempotencyKey===idempotencyKey)){
    throw Object.assign(new Error('A handoff for this source task and receiving bot already exists.'),{status:409});
  }
  const handoff={
    id:uid(),ownerId:actorId,teamId,teamName:team.name,
    sourceTaskId,senderBotId,receivingBotId,
    summary,requiredInput,expectedOutput,contextScope,privacyAttested:true,
    privacyAttestedBy:actorId,privacyAttestedAt:timestamp,deadlineAt,
    idempotencyKey,status:'pending_owner_review',dispatchStatus:'not_dispatched',
    acceptedBy:null,acceptedAt:null,rejectedBy:null,rejectedAt:null,
    cancelledBy:null,cancelledAt:null,completedBy:null,completedAt:null,
    resultSummary:'',createdBy:actorId,createdAt:timestamp,updatedBy:actorId,updatedAt:timestamp
  };
  db.personalAiBotTeamHandoffs.unshift(handoff);
  if(db.personalAiBotTeamHandoffs.length>5000)db.personalAiBotTeamHandoffs.length=5000;
  audit(db,actorId,'team.handoff_created','team_handoff',handoff.id,
    'Created a one-receiver handoff in '+team.name+'. It is pending owner review and is not dispatched.',
    timestamp,uid);
  return handoff;
}

export function reviewPersonalAiBotTeamHandoff(db, teamId, handoffId, input, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const team=db.personalAiBotTeams.find(item=>item.id===teamId&&item.ownerId===actorId);
  if(!team)throw Object.assign(new Error('Bot team not found.'),{status:404});
  const handoff=db.personalAiBotTeamHandoffs.find(item=>item.id===handoffId&&item.teamId===teamId&&item.ownerId===actorId);
  if(!handoff)throw Object.assign(new Error('Team handoff not found.'),{status:404});
  const action=String(input?.action||'');
  if(!['accept','reject','cancel','complete'].includes(action)){
    throw Object.assign(new Error('Choose accept, reject, cancel or complete.'),{status:400});
  }
  if(action==='accept'){
    if(handoff.status!=='pending_owner_review')throw Object.assign(new Error('Only a handoff awaiting owner review can be accepted.'),{status:409});
    if(team.status!=='enabled')throw Object.assign(new Error('A paused or disabled team cannot accept new handoffs.'),{status:409});
    const senderExists=db.personalAiBotTeamMembers.some(item=>item.teamId===teamId&&item.botId===handoff.senderBotId&&item.ownerId===actorId);
    const receiverExists=db.personalAiBotTeamMembers.some(item=>item.teamId===teamId&&item.botId===handoff.receivingBotId&&item.ownerId===actorId);
    if(!senderExists||!receiverExists)throw Object.assign(new Error('The sending or receiving bot is no longer a team member.'),{status:409});
    const sourceTask=db.personalAiBotTasks.find(item=>item.id===handoff.sourceTaskId&&item.botId===handoff.senderBotId);
    if(!sourceTask||['cancelled','rejected'].includes(sourceTask.status)){
      throw Object.assign(new Error('The source task was cancelled or rejected before handoff acceptance.'),{status:409});
    }
    if(handoff.deadlineAt&&Date.parse(handoff.deadlineAt)<=Date.parse(timestamp)){
      throw Object.assign(new Error('This handoff deadline has expired.'),{status:409});
    }
    handoff.status='accepted';
    handoff.acceptedBy=actorId;
    handoff.acceptedAt=timestamp;
  }else if(action==='reject'){
    if(handoff.status!=='pending_owner_review')throw Object.assign(new Error('Only a pending handoff can be rejected.'),{status:409});
    handoff.status='rejected';
    handoff.rejectedBy=actorId;
    handoff.rejectedAt=timestamp;
  }else if(action==='cancel'){
    if(!['pending_owner_review','accepted'].includes(handoff.status))throw Object.assign(new Error('Only pending or accepted handoffs can be cancelled.'),{status:409});
    handoff.status='cancelled';
    handoff.cancelledBy=actorId;
    handoff.cancelledAt=timestamp;
  }else{
    if(handoff.status!=='accepted')throw Object.assign(new Error('Only an accepted handoff can be marked complete.'),{status:409});
    const resultSummary=String(input.resultSummary||'').trim().slice(0,1200);
    if(resultSummary.length<5)throw Object.assign(new Error('A human-reviewed result summary of at least 5 characters is required.'),{status:400});
    handoff.status='completed';
    handoff.completedBy=actorId;
    handoff.completedAt=timestamp;
    handoff.resultSummary=resultSummary;
  }
  handoff.updatedBy=actorId;
  handoff.updatedAt=timestamp;
  handoff.dispatchStatus='not_dispatched';
  const actionLabel={accept:'accepted',reject:'rejected',cancel:'cancelled',complete:'completed'}[action];
  audit(db,actorId,'team.handoff_'+action,'team_handoff',handoff.id,
    'Owner '+actionLabel+' handoff '+handoff.id+'. No bot execution or external action was performed.',
    timestamp,uid);
  return handoff;
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
    privacyGuardRequired:['follow','unfollow','send_message'].includes(taskType),
    blockGuardRequired:['follow','unfollow','send_message','comment','draft_reply'].includes(taskType),
    excludeFromHumanEngagementMetrics:true,
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

export function queuePersonalAiBotFollowBatch(db, input, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const taskType=String(input.taskType||'follow');
  if(!['follow','unfollow'].includes(taskType))throw Object.assign(new Error('Choose follow or unfollow.'),{status:400});
  const targetUserId=String(input.targetUserId||'').trim();
  if(!targetUserId)throw Object.assign(new Error('Choose one Minglora member account.'),{status:400});
  if(!Array.isArray(input.botIds)||input.botIds.length<1||input.botIds.length>10)throw Object.assign(new Error('Select between 1 and 10 bots for one target per 24-hour period.'),{status:400});
  const botIds=[...new Set(input.botIds.map(String))];
  if(botIds.length!==input.botIds.length)throw Object.assign(new Error('Remove duplicate bot selections before submitting.'),{status:400});
  const nowMs=Date.parse(timestamp);
  const targetWindow=db.personalAiBotTasks.filter(task=>
    task.targetUserId===targetUserId&&['follow','unfollow'].includes(task.taskType)&&
    Number.isFinite(Date.parse(task.createdAt))&&nowMs-Date.parse(task.createdAt)<24*60*60*1000&&
    !['cancelled','rejected'].includes(task.status)
  );
  if(targetWindow.length+botIds.length>10)throw Object.assign(new Error('This target account reached the maximum of 10 AI follow/unfollow instructions in a rolling 24-hour window.'),{status:429});
  const bots=botIds.map(id=>db.personalAiBots.find(bot=>bot.id===id));
  if(bots.some(bot=>!bot))throw Object.assign(new Error('One or more selected AI bots could not be found.'),{status:404});
  const categories=getPersonalAiBotCategories(db);
  for(const bot of bots){
    if(!bot.enabled||bot.status!=='enabled')throw Object.assign(new Error('Every selected bot must be enabled.'),{status:409});
    if(!categories.some(category=>category.id===bot.categoryId&&category.enabled))throw Object.assign(new Error('Every selected bot must belong to an enabled category.'),{status:409});
    const duplicate=db.personalAiBotTasks.some(task=>
      task.botId===bot.id&&task.targetUserId===targetUserId&&task.taskType===taskType&&
      !['cancelled','rejected'].includes(task.status)
    );
    if(duplicate)throw Object.assign(new Error('A selected bot already has an open or completed instruction for this target and operation.'),{status:409});
    const recent=db.personalAiBotTasks.filter(task=>task.botId===bot.id&&Number.isFinite(Date.parse(task.createdAt))&&nowMs-Date.parse(task.createdAt)<15*60*1000&&task.status!=='cancelled');
    if(recent.length>=20)throw Object.assign(new Error('One selected bot reached its 15-minute instruction limit.'),{status:429});
    const pending=db.personalAiBotTasks.filter(task=>task.botId===bot.id&&['awaiting_administrator_approval','approved_waiting_for_worker'].includes(task.status));
    if(pending.length>=50)throw Object.assign(new Error('One selected bot has too many pending instructions.'),{status:429});
  }
  const tasks=bots.map(bot=>queuePersonalAiBotInstruction(db,bot.id,{
    taskType,targetUserId,
    instruction:String(input.instruction||((taskType==='follow'?'Follow':'Unfollow')+' the selected Minglora member only after administrator approval.')).trim()
  },actorId,timestamp,uid));
  audit(db,actorId,'follow.batch_queued','follow_target',targetUserId,
    'Queued '+tasks.length+' separately approval-gated '+taskType+' instruction(s); no relationship changes were executed.',timestamp,uid);
  return {created:tasks.length,tasks,limitPerTargetPer24Hours:10};
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
    bot.pausedAt=status==='paused'?timestamp:null;
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
  let paused=0,cancelled=0,pausedTeams=0;
  for(const team of db.personalAiBotTeams){
    if(team.status==='enabled'||team.enabled===true){
      team.status='paused';
      team.enabled=false;
      team.pausedAt=timestamp;
      team.updatedAt=timestamp;
      team.updatedBy=actorId;
      pausedTeams++;
      audit(db,actorId,'team.paused_by_emergency_shutdown','team',team.id,
        'Paused team '+team.name+' during network emergency shutdown.',timestamp,uid);
    }
  }
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
  const cancelledHandoffs=cancelOpenPersonalAiBotTeamHandoffs(db,null,actorId,timestamp,uid,'network_emergency_shutdown');
  audit(db,actorId,'network.emergency_shutdown','network','global','Emergency shutdown paused '+paused+' bots, cancelled '+cancelled+' pending or running task records and cancelled '+cancelledHandoffs+' open team handoffs.',timestamp,uid);
  return {ok:true,paused,pausedTeams,cancelled,cancelledHandoffs,network:settings};
}

const AI_SCHEDULE_WEEKDAYS = Object.freeze({Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:7});

function aiScheduleZonedParts(date, formatter) {
  const raw = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
  return {
    year:Number(raw.year), month:Number(raw.month), day:Number(raw.day),
    hour:Number(raw.hour), minute:Number(raw.minute),
    weekday:AI_SCHEDULE_WEEKDAYS[raw.weekday]
  };
}

function aiScheduleLocalTimeToUtc(dateParts, localTime, formatter) {
  const [hour, minute] = localTime.split(':').map(Number);
  const targetWallTime = Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, hour, minute);
  const possibleOffsets = new Set();

  // Sample both sides of nearby timezone transitions. This detects normal,
  // half-hour and one-hour DST offsets without assuming a fixed UTC offset.
  for (const offsetHours of [-36,-24,-12,0,12,24,36]) {
    const sampleInstant = targetWallTime + offsetHours * 60 * 60 * 1000;
    const sampleParts = aiScheduleZonedParts(new Date(sampleInstant), formatter);
    const representedWallTime = Date.UTC(
      sampleParts.year, sampleParts.month - 1, sampleParts.day,
      sampleParts.hour, sampleParts.minute
    );
    possibleOffsets.add(representedWallTime - sampleInstant);
  }

  const candidates = [...possibleOffsets]
    .map(offset => targetWallTime - offset)
    .filter(instant => {
      const actual = aiScheduleZonedParts(new Date(instant), formatter);
      return actual.year === dateParts.year &&
        actual.month === dateParts.month &&
        actual.day === dateParts.day &&
        actual.hour === hour &&
        actual.minute === minute;
    })
    .sort((a,b) => a-b);

  // A missing wall time during a spring-forward transition has no candidate.
  // A repeated wall time during a fall-back transition selects the earlier instant.
  return candidates.length ? new Date(candidates[0]) : null;
}

export function previewPersonalAiBotSchedule(schedule, options = {}) {
  const from = options.from === undefined ? new Date() : new Date(options.from);
  const days = Number(options.days === undefined ? 14 : options.days);
  if (!Number.isFinite(from.getTime())) {
    throw Object.assign(new Error('Schedule preview start time is invalid.'), {status:400});
  }
  if (!Number.isInteger(days) || days < 1 || days > 60) {
    throw Object.assign(new Error('Schedule preview must cover between 1 and 60 local calendar days.'), {status:400});
  }
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
    throw Object.assign(new Error('A valid bot activity schedule is required.'), {status:400});
  }
  const selectedDays = Array.isArray(schedule.daysOfWeek) ? [...new Set(schedule.daysOfWeek)] : [];
  const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (selectedDays.length < 1 || selectedDays.length > 7 ||
      selectedDays.some(day => !Number.isInteger(day) || day < 1 || day > 7) ||
      !validTime(schedule.startTime) || !validTime(schedule.endTime)) {
    throw Object.assign(new Error('The activity schedule days or local time window is invalid.'), {status:400});
  }
  const timezone = String(schedule.timezone || '').trim();
  if (!timezone || timezone.length > 80) {
    throw Object.assign(new Error('Choose a valid IANA schedule timezone.'), {status:400});
  }

  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone:timezone, calendar:'iso8601', numberingSystem:'latn',
      weekday:'short', year:'numeric', month:'2-digit', day:'2-digit',
      hour:'2-digit', minute:'2-digit', hourCycle:'h23'
    });
    formatter.format(from);
  } catch {
    throw Object.assign(new Error('Choose a valid IANA schedule timezone.'), {status:400});
  }

  const dailyTaskLimit = Number(schedule.maxTasksPerDay || 0);
  if (!Number.isInteger(dailyTaskLimit) || dailyTaskLimit < 0 || dailyTaskLimit > 500) {
    throw Object.assign(new Error('Daily task cap must be between 0 and 500.'), {status:400});
  }

  const firstLocalDay = aiScheduleZonedParts(from, formatter);
  const firstCivilDate = Date.UTC(firstLocalDay.year, firstLocalDay.month - 1, firstLocalDay.day);
  const slots = [];
  const skippedWindows = [];
  const pad = value => String(value).padStart(2,'0');
  const toDateParts = civil => ({
    year:civil.getUTCFullYear(), month:civil.getUTCMonth()+1, day:civil.getUTCDate()
  });
  const toDateString = parts => parts.year+'-'+pad(parts.month)+'-'+pad(parts.day);
  const startFrom = from.getTime();
  const overnight = schedule.endTime < schedule.startTime;

  for (let offset = 0; offset < days; offset += 1) {
    const civil = new Date(firstCivilDate + offset * 86400000);
    const weekday = ((civil.getUTCDay() + 6) % 7) + 1;
    if (!selectedDays.includes(weekday)) continue;

    const dateParts = toDateParts(civil);
    const localDate = toDateString(dateParts);
    const startUtc = aiScheduleLocalTimeToUtc(dateParts, schedule.startTime, formatter);
    if (!startUtc) {
      skippedWindows.push({date:localDate, localStart:localDate+'T'+schedule.startTime, reason:'nonexistent_local_time'});
      continue;
    }
    if (startUtc.getTime() < startFrom) {
      skippedWindows.push({date:localDate, localStart:localDate+'T'+schedule.startTime, reason:'window_already_started'});
      continue;
    }

    const endCivil = new Date(firstCivilDate + (offset + (overnight ? 1 : 0)) * 86400000);
    const endDateParts = toDateParts(endCivil);
    const endUtc = aiScheduleLocalTimeToUtc(endDateParts, schedule.endTime, formatter);
    if (!endUtc) {
      skippedWindows.push({date:localDate, localStart:localDate+'T'+schedule.startTime, reason:'nonexistent_local_end_time'});
      continue;
    }
    if (endUtc.getTime() <= startUtc.getTime()) {
      skippedWindows.push({date:localDate, localStart:localDate+'T'+schedule.startTime, reason:'zero_length_or_invalid_window'});
      continue;
    }

    slots.push({
      localDate,
      weekday,
      timezone,
      startLocal:localDate+'T'+schedule.startTime,
      endLocal:toDateString(endDateParts)+'T'+schedule.endTime,
      startsAtUtc:startUtc.toISOString(),
      endsAtUtc:endUtc.toISOString()
    });
  }

  return {
    previewOnly:true,
    dispatchEnabled:false,
    dispatchStatus:'not_connected',
    timezone,
    from:from.toISOString(),
    rangeDays:days,
    daysOfWeek:selectedDays.sort((a,b)=>a-b),
    dailyTaskLimit,
    slots,
    nextRun:slots[0]||null,
    skippedWindows,
    message:'Dry-run schedule preview only. No scheduler is connected and no tasks were dispatched.'
  };
}


const PERSONAL_AI_BOT_PERSONA_TRAITS = Object.freeze([
  'formality','warmth','humor','assertiveness','detail','creativity','initiative','caution'
]);

function normalizePersonalAiBotPersonaConfiguration(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)){
    throw Object.assign(new Error('Persona configuration must be a JSON object.'),{status:400});
  }
  const allowed=new Set([
    'purpose','role','communicationStyle','tone','responseLength','expertise',
    'languagePreferences','audience','boundaries','prohibitedBehaviors','escalationInstructions','traits'
  ]);
  if(Object.keys(input).some(key=>!allowed.has(key))){
    throw Object.assign(new Error('Persona configuration contains unsupported fields.'),{status:400});
  }
  const text=(key,max)=>String(input[key]||'').trim().slice(0,max);
  const list=(value,label,maxItems,maxLength)=>{
    if(!Array.isArray(value))throw Object.assign(new Error(label+' must be a list.'),{status:400});
    if(value.length>maxItems)throw Object.assign(new Error(label+' has too many entries.'),{status:400});
    const values=value.map(item=>{
      if(typeof item!=='string')throw Object.assign(new Error(label+' entries must be text.'),{status:400});
      return item.trim().slice(0,maxLength);
    }).filter(Boolean);
    return [...new Set(values)];
  };
  const rawTraits=input.traits===undefined?{}:input.traits;
  if(!rawTraits||typeof rawTraits!=='object'||Array.isArray(rawTraits)||
     Object.keys(rawTraits).some(key=>!PERSONAL_AI_BOT_PERSONA_TRAITS.includes(key))){
    throw Object.assign(new Error('Persona traits contain unsupported fields.'),{status:400});
  }
  const traits={};
  for(const key of PERSONAL_AI_BOT_PERSONA_TRAITS){
    const value=rawTraits[key]===undefined?50:Number(rawTraits[key]);
    if(!Number.isInteger(value)||value<0||value>100){
      throw Object.assign(new Error('Persona trait values must be whole numbers from 0 to 100.'),{status:400});
    }
    traits[key]=value;
  }
  const responseLength=String(input.responseLength||'balanced');
  if(!['brief','balanced','detailed'].includes(responseLength)){
    throw Object.assign(new Error('Choose brief, balanced or detailed persona responses.'),{status:400});
  }
  return {
    purpose:text('purpose',600),
    role:text('role',160),
    communicationStyle:text('communicationStyle',1200),
    tone:text('tone',600),
    responseLength,
    expertise:list(input.expertise||[],'Expertise',20,100),
    languagePreferences:list(input.languagePreferences||[],'Language preferences',12,40),
    audience:text('audience',400),
    boundaries:text('boundaries',1600),
    prohibitedBehaviors:text('prohibitedBehaviors',1600),
    escalationInstructions:text('escalationInstructions',1200),
    traits
  };
}

function evaluatePersonalAiBotPersonaStructure(configuration) {
  const checks=[
    {id:'purpose',label:'Purpose is defined',passed:configuration.purpose.length>=12},
    {id:'role',label:'Role is defined',passed:configuration.role.length>=2},
    {id:'communication',label:'Communication style and tone are defined',passed:configuration.communicationStyle.length>=8&&configuration.tone.length>=3},
    {id:'expertise',label:'At least one expertise area is listed',passed:configuration.expertise.length>0},
    {id:'languages',label:'At least one language preference is listed',passed:configuration.languagePreferences.length>0},
    {id:'audience',label:'Intended audience is defined',passed:configuration.audience.length>=4},
    {id:'boundaries',label:'Behavior boundaries are defined',passed:configuration.boundaries.length>=20},
    {id:'prohibited',label:'Prohibited behaviors are defined',passed:configuration.prohibitedBehaviors.length>=20},
    {id:'escalation',label:'Escalation instructions are defined',passed:configuration.escalationInstructions.length>=10},
    {id:'traits',label:'All eight structured traits are bounded',passed:PERSONAL_AI_BOT_PERSONA_TRAITS.every(key=>Number.isInteger(configuration.traits[key])&&configuration.traits[key]>=0&&configuration.traits[key]<=100)}
  ];
  return {
    evaluator:'static_persona_completeness_v1',
    status:checks.every(item=>item.passed)?'pass':'fail',
    checks,
    evaluatedAt:null,
    limitations:'Structural completeness only. No model inference, safety benchmark, factuality test, language-quality test or behavioural evaluation was run.'
  };
}

export function listPersonalAiBotPersonaVersions(db, botId) {
  ensurePersonalAiBotCollections(db);
  if(!db.personalAiBots.some(bot=>bot.id===botId)){
    throw Object.assign(new Error('Bot not found.'),{status:404});
  }
  return db.personalAiBotPersonaVersions
    .filter(item=>item.botId===botId)
    .slice()
    .sort((a,b)=>b.version-a.version);
}

export function createPersonalAiBotPersonaDraft(db, input, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const botId=String(input?.botId||'').trim();
  const bot=db.personalAiBots.find(item=>item.id===botId);
  if(!bot)throw Object.assign(new Error('Choose an existing AI bot identity.'),{status:404});
  if(['suspended','archived','retired'].includes(String(bot.status||''))){
    throw Object.assign(new Error('A suspended, archived or retired AI identity cannot receive a new persona version.'),{status:409});
  }
  let base=null;
  if(input.baseVersionId){
    base=db.personalAiBotPersonaVersions.find(item=>item.id===String(input.baseVersionId)&&item.botId===botId);
    if(!base)throw Object.assign(new Error('The selected base persona version was not found for this bot.'),{status:404});
  }
  const configuration=normalizePersonalAiBotPersonaConfiguration(input.configuration??base?.configuration??{});
  const version=db.personalAiBotPersonaVersions
    .filter(item=>item.botId===botId)
    .reduce((max,item)=>Math.max(max,Number(item.version)||0),0)+1;
  const record={
    id:uid(),botId,version,status:'draft',configuration,
    baseVersionId:base?.id||null,
    structuralEvaluation:null,approvedBy:null,approvedAt:null,
    activatedBy:null,activatedAt:null,createdBy:actorId,updatedBy:actorId,
    createdAt:timestamp,updatedAt:timestamp
  };
  db.personalAiBotPersonaVersions.push(record);
  audit(db,actorId,'persona.version_draft_created','persona_version',record.id,
    'Created persona version '+version+' for '+bot.displayName+'. Public profile biography and permissions remain separate.',
    timestamp,uid);
  return record;
}

export function updatePersonalAiBotPersonaDraft(db, versionId, configuration, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const record=db.personalAiBotPersonaVersions.find(item=>item.id===versionId);
  if(!record)throw Object.assign(new Error('Persona version not found.'),{status:404});
  if(record.status!=='draft')throw Object.assign(new Error('Only draft persona versions can be edited; create a new version instead.'),{status:409});
  record.configuration=normalizePersonalAiBotPersonaConfiguration(configuration);
  record.structuralEvaluation=null;
  record.updatedBy=actorId;
  record.updatedAt=timestamp;
  audit(db,actorId,'persona.version_draft_updated','persona_version',record.id,
    'Updated draft persona version '+record.version+'. The previous structural evaluation was cleared.',
    timestamp,uid);
  return record;
}

export function evaluatePersonalAiBotPersonaDraft(db, versionId, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const record=db.personalAiBotPersonaVersions.find(item=>item.id===versionId);
  if(!record)throw Object.assign(new Error('Persona version not found.'),{status:404});
  if(record.status!=='draft')throw Object.assign(new Error('Only draft persona versions can be evaluated.'),{status:409});
  const result=evaluatePersonalAiBotPersonaStructure(record.configuration);
  result.evaluatedAt=timestamp;
  record.structuralEvaluation=result;
  record.updatedBy=actorId;
  record.updatedAt=timestamp;
  audit(db,actorId,'persona.version_structural_evaluation','persona_version',record.id,
    'Recorded structural completeness result '+result.status+' for persona version '+record.version+'.',
    timestamp,uid);
  return {version:record,evaluation:result};
}

export function approvePersonalAiBotPersonaVersion(db, versionId, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const record=db.personalAiBotPersonaVersions.find(item=>item.id===versionId);
  if(!record)throw Object.assign(new Error('Persona version not found.'),{status:404});
  if(record.status!=='draft')throw Object.assign(new Error('Only a draft persona version can be approved.'),{status:409});
  if(record.structuralEvaluation?.status!=='pass'){
    throw Object.assign(new Error('A passing structural completeness evaluation is required before approval.'),{status:409});
  }
  record.status='approved';
  record.approvedBy=actorId;
  record.approvedAt=timestamp;
  record.updatedBy=actorId;
  record.updatedAt=timestamp;
  audit(db,actorId,'persona.version_approved','persona_version',record.id,
    'Human owner approved persona version '+record.version+' after static structural checks.',
    timestamp,uid);
  return record;
}

function activateApprovedPersonaVersion(db, record, actorId, timestamp, uid, action) {
  const bot=db.personalAiBots.find(item=>item.id===record.botId);
  if(!bot)throw Object.assign(new Error('Persona bot identity not found.'),{status:404});
  if(['suspended','archived','retired'].includes(String(bot.status||''))){
    throw Object.assign(new Error('Persona versions cannot be activated for a suspended, archived or retired AI identity.'),{status:409});
  }
  if(record.status!=='approved'||record.structuralEvaluation?.status!=='pass'||!record.approvedBy||!record.approvedAt){
    throw Object.assign(new Error('Only an owner-approved persona version with passing structural checks can become active.'),{status:409});
  }
  const previousId=bot.activePersonaVersionId||null;
  if(previousId){
    const previous=db.personalAiBotPersonaVersions.find(item=>item.id===previousId&&item.botId===bot.id);
    if(previous&&previous.status==='active'){
      previous.status='approved';
      previous.updatedBy=actorId;
      previous.updatedAt=timestamp;
    }
  }
  record.status='active';
  record.activatedBy=actorId;
  record.activatedAt=timestamp;
  record.updatedBy=actorId;
  record.updatedAt=timestamp;
  bot.activePersonaVersionId=record.id;
  bot.personaActivatedAt=timestamp;
  bot.updatedBy=actorId;
  bot.updatedAt=timestamp;
  audit(db,actorId,action,'persona_version',record.id,
    (action==='persona.version_rolled_back'?'Rolled back to':'Activated')+' persona version '+record.version+'. Bot enabled status and execution permissions were not changed.',
    timestamp,uid);
  return {version:record,bot,previousVersionId:previousId};
}

export function activatePersonalAiBotPersonaVersion(db, versionId, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const record=db.personalAiBotPersonaVersions.find(item=>item.id===versionId);
  if(!record)throw Object.assign(new Error('Persona version not found.'),{status:404});
  return activateApprovedPersonaVersion(db,record,actorId,timestamp,uid,'persona.version_activated');
}

export function rollbackPersonalAiBotPersonaVersion(db, versionId, actorId, timestamp, uid) {
  ensurePersonalAiBotCollections(db);
  const record=db.personalAiBotPersonaVersions.find(item=>item.id===versionId);
  if(!record)throw Object.assign(new Error('Persona version not found.'),{status:404});
  const bot=db.personalAiBots.find(item=>item.id===record.botId);
  if(!bot||!bot.activePersonaVersionId||bot.activePersonaVersionId===record.id||!record.activatedAt){
    throw Object.assign(new Error('Rollback requires a persona version that was previously active.'),{status:409});
  }
  return activateApprovedPersonaVersion(db,record,actorId,timestamp,uid,'persona.version_rolled_back');
}


const PERSONAL_AI_BOT_LANGUAGE_MODES = Object.freeze({
  detection:['manual','confidence_guarded'],
  response:['match_member_preference','match_input_language','primary_language'],
  codeSwitching:['preserve','ask_before_normalizing','single_language_response'],
  translationDisplay:['show_original_and_translation','original_only']
});

function defaultPersonalAiBotLanguageConfiguration() {
  return {
    primaryLanguage:'en',
    supportedLanguages:['en'],
    fallbackLanguage:'en',
    locale:'en-JM',
    detectionMode:'manual',
    confidenceThreshold:0.8,
    responsePolicy:'match_member_preference',
    codeSwitchingPolicy:'preserve',
    translationDisplay:'show_original_and_translation',
    humanReviewRequired:true,
    languageQuality:[{code:'en',status:'unverified',evidenceReference:null}],
    providerCompatibility:'not_checked',
    providerAdapterConnected:false,
    preservationRules:{
      names:true,urls:true,hashtags:true,emojis:true,numbers:true,
      quotedText:true,originalSourceText:true
    },
    runtimeStatus:'configuration_only'
  };
}

function normalizePersonalAiBotLanguageCode(value, label='Language code') {
  const raw=String(value||'').trim().replaceAll('_','-');
  if(!raw||raw.length>35||!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(raw)){
    throw Object.assign(new Error(label+' must be a valid BCP 47 language tag or ISO 639-3 code.'),{status:400});
  }
  try {
    const canonical=Intl.getCanonicalLocales(raw)[0];
    if(!canonical)throw new Error('invalid');
    return canonical;
  } catch {
    throw Object.assign(new Error(label+' must be a valid BCP 47 language tag or ISO 639-3 code.'),{status:400});
  }
}

function normalizePersonalAiBotLanguageConfiguration(input, current) {
  if(!input||typeof input!=='object'||Array.isArray(input)){
    throw Object.assign(new Error('Multilingual settings must be a JSON object.'),{status:400});
  }
  const allowed=new Set([
    'primaryLanguage','supportedLanguages','fallbackLanguage','locale',
    'detectionMode','confidenceThreshold','responsePolicy',
    'codeSwitchingPolicy','translationDisplay','humanReviewRequired'
  ]);
  if(Object.keys(input).some(key=>!allowed.has(key))){
    throw Object.assign(new Error('Multilingual settings contain unsupported fields; quality evidence and provider compatibility are managed separately.'),{status:400});
  }
  const merged={...current,...input};
  const supportedRaw=merged.supportedLanguages;
  if(!Array.isArray(supportedRaw)||supportedRaw.length<1||supportedRaw.length>20){
    throw Object.assign(new Error('Select between 1 and 20 supported languages.'),{status:400});
  }
  const supportedLanguages=supportedRaw.map((code,index)=>
    normalizePersonalAiBotLanguageCode(code,'Supported language '+(index+1))
  );
  if(new Set(supportedLanguages.map(code=>code.toLowerCase())).size!==supportedLanguages.length){
    throw Object.assign(new Error('Remove duplicate supported language codes.'),{status:400});
  }
  const primaryLanguage=normalizePersonalAiBotLanguageCode(merged.primaryLanguage,'Primary language');
  const fallbackLanguage=normalizePersonalAiBotLanguageCode(merged.fallbackLanguage,'Fallback language');
  if(!supportedLanguages.includes(primaryLanguage)||!supportedLanguages.includes(fallbackLanguage)){
    throw Object.assign(new Error('Primary and fallback languages must both be in the supported language list.'),{status:400});
  }
  const locale=normalizePersonalAiBotLanguageCode(merged.locale,'Regional locale');
  if(!['manual','confidence_guarded'].includes(merged.detectionMode)){
    throw Object.assign(new Error('Choose manual detection or confidence-guarded detection.'),{status:400});
  }
  if(!PERSONAL_AI_BOT_LANGUAGE_MODES.response.includes(merged.responsePolicy)){
    throw Object.assign(new Error('Choose a supported language response policy.'),{status:400});
  }
  if(!PERSONAL_AI_BOT_LANGUAGE_MODES.codeSwitching.includes(merged.codeSwitchingPolicy)){
    throw Object.assign(new Error('Choose a supported code-switching policy.'),{status:400});
  }
  if(!PERSONAL_AI_BOT_LANGUAGE_MODES.translationDisplay.includes(merged.translationDisplay)){
    throw Object.assign(new Error('Choose a supported original/translation display policy.'),{status:400});
  }
  const confidenceThreshold=Number(merged.confidenceThreshold);
  if(!Number.isFinite(confidenceThreshold)||confidenceThreshold<0.5||confidenceThreshold>0.99){
    throw Object.assign(new Error('Language detection confidence threshold must be between 0.50 and 0.99.'),{status:400});
  }
  if(merged.humanReviewRequired!==true){
    throw Object.assign(new Error('Human review remains required until a provider and language quality evaluations are approved.'),{status:409});
  }
  const priorQuality=new Map((current.languageQuality||[]).map(item=>[item.code,item]));
  return {
    primaryLanguage,supportedLanguages,fallbackLanguage,locale,
    detectionMode:merged.detectionMode,confidenceThreshold,
    responsePolicy:merged.responsePolicy,
    codeSwitchingPolicy:merged.codeSwitchingPolicy,
    translationDisplay:merged.translationDisplay,
    humanReviewRequired:true,
    languageQuality:supportedLanguages.map(code=>{
      const prior=priorQuality.get(code);
      return {code,status:prior?.status||'unverified',evidenceReference:prior?.evidenceReference||null};
    }),
    providerCompatibility:'not_checked',
    providerAdapterConnected:false,
    preservationRules:{
      names:true,urls:true,hashtags:true,emojis:true,numbers:true,
      quotedText:true,originalSourceText:true
    },
    runtimeStatus:'configuration_only'
  };
}

function getOwnedPersonalAiBotForLanguageSettings(db, botId, actorId) {
  ensurePersonalAiBotCollections(db);
  const bot=db.personalAiBots.find(item=>item.id===botId&&item.createdBy===actorId);
  if(!bot)throw Object.assign(new Error('AI identity not found under your owner account.'),{status:404});
  return bot;
}

export function getPersonalAiBotLanguageSettings(db, botId, actorId) {
  getOwnedPersonalAiBotForLanguageSettings(db,botId,actorId);
  const stored=db.personalAiBotLanguageSettings.find(item=>item.botId===botId&&item.ownerId===actorId);
  return {
    botId,
    configuration:stored?.configuration||defaultPersonalAiBotLanguageConfiguration(),
    saved:!!stored,
    updatedAt:stored?.updatedAt||null
  };
}

export function updatePersonalAiBotLanguageSettings(db, botId, input, actorId, timestamp, uid) {
  getOwnedPersonalAiBotForLanguageSettings(db,botId,actorId);
  const index=db.personalAiBotLanguageSettings.findIndex(item=>item.botId===botId&&item.ownerId===actorId);
  const existing=index>=0?db.personalAiBotLanguageSettings[index]:null;
  const current=existing?.configuration||defaultPersonalAiBotLanguageConfiguration();
  const configuration=normalizePersonalAiBotLanguageConfiguration(input,current);
  const record=existing||{
    id:uid(),botId,ownerId:actorId,createdBy:actorId,createdAt:timestamp
  };
  record.configuration=configuration;
  record.updatedBy=actorId;
  record.updatedAt=timestamp;
  if(index>=0)db.personalAiBotLanguageSettings[index]=record;
  else db.personalAiBotLanguageSettings.push(record);
  audit(db,actorId,'language.settings_updated','bot_language_settings',record.id,
    'Saved multilingual configuration for one AI identity. Provider compatibility remains unverified and runtime translation remains disconnected.',
    timestamp,uid);
  return {botId,configuration,saved:true,updatedAt:timestamp};
}


function normalizePersonalAiBotLanguageEvaluationCases(cases, uid) {
  if(!Array.isArray(cases)||cases.length<1||cases.length>100){
    throw Object.assign(new Error('Provide between 1 and 100 synthetic language evaluation cases.'),{status:400});
  }
  return cases.map((item,index)=>{
    if(!item||typeof item!=='object'||Array.isArray(item)||
       Object.keys(item).some(key=>!['inputText','expectedOutput','category','reviewNotes'].includes(key))){
      throw Object.assign(new Error('Evaluation case '+(index+1)+' contains unsupported fields.'),{status:400});
    }
    const inputText=String(item.inputText||'').trim();
    const expectedOutput=String(item.expectedOutput||'').trim();
    const category=String(item.category||'general').trim();
    const reviewNotes=String(item.reviewNotes||'').trim().slice(0,500);
    if(inputText.length<3||inputText.length>1800||expectedOutput.length<3||expectedOutput.length>1800){
      throw Object.assign(new Error('Evaluation case text must be between 3 and 1,800 characters.'),{status:400});
    }
    if(category.length<2||category.length>60){
      throw Object.assign(new Error('Evaluation case category must be between 2 and 60 characters.'),{status:400});
    }
    return {id:uid(),inputText,expectedOutput,category,reviewNotes};
  });
}

function findOwnedPersonalAiBotLanguageEvaluationSet(db, botId, setId, actorId) {
  const record=db.personalAiBotLanguageEvaluationSets.find(item=>
    item.id===setId&&item.botId===botId&&item.ownerId===actorId
  );
  if(!record)throw Object.assign(new Error('Language evaluation set not found.'),{status:404});
  return record;
}

export function listPersonalAiBotLanguageEvaluationSets(db, botId, actorId) {
  getOwnedPersonalAiBotForLanguageSettings(db,botId,actorId);
  return db.personalAiBotLanguageEvaluationSets
    .filter(item=>item.botId===botId&&item.ownerId===actorId)
    .slice()
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function createPersonalAiBotLanguageEvaluationSet(db, botId, input, actorId, timestamp, uid) {
  getOwnedPersonalAiBotForLanguageSettings(db,botId,actorId);
  const language=getPersonalAiBotLanguageSettings(db,botId,actorId);
  if(!language.saved){
    throw Object.assign(new Error('Save multilingual settings before creating a language evaluation set.'),{status:409});
  }
  const languageCode=normalizePersonalAiBotLanguageCode(input?.languageCode,'Evaluation language');
  if(!language.configuration.supportedLanguages.includes(languageCode)){
    throw Object.assign(new Error('The evaluation language must be enabled in this bot’s supported language settings.'),{status:409});
  }
  const allowed=new Set(['languageCode','name','description','cases','syntheticDataAttested']);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.has(key))){
    throw Object.assign(new Error('Language evaluation set contains unsupported fields.'),{status:400});
  }
  if(input.syntheticDataAttested!==true){
    throw Object.assign(new Error('Confirm that all evaluation examples are synthetic and contain no private member data.'),{status:400});
  }
  const name=String(input.name||'').trim().slice(0,100);
  const description=String(input.description||'').trim().slice(0,800);
  if(name.length<3)throw Object.assign(new Error('Evaluation set name must contain at least 3 characters.'),{status:400});
  const cases=normalizePersonalAiBotLanguageEvaluationCases(input.cases,uid);
  const record={
    id:uid(),botId,ownerId:actorId,languageCode,name,description,cases,
    syntheticDataAttested:true,syntheticDataAttestedBy:actorId,syntheticDataAttestedAt:timestamp,
    status:'draft',reviewStatus:'not_reviewed',reviewerRole:null,reviewEvidenceReference:null,
    reviewedBy:null,reviewedAt:null,reviewNotes:'',
    providerExecutionStatus:'not_run',languageQualityStatus:'unverified',
    createdBy:actorId,createdAt:timestamp,updatedBy:actorId,updatedAt:timestamp
  };
  db.personalAiBotLanguageEvaluationSets.unshift(record);
  if(db.personalAiBotLanguageEvaluationSets.length>2000)db.personalAiBotLanguageEvaluationSets.length=2000;
  audit(db,actorId,'language.evaluation_set_created','language_evaluation_set',record.id,
    'Created synthetic language evaluation set for '+languageCode+'. No provider or translation model was run.',
    timestamp,uid);
  return record;
}

export function updatePersonalAiBotLanguageEvaluationSet(db, botId, setId, input, actorId, timestamp, uid) {
  getOwnedPersonalAiBotForLanguageSettings(db,botId,actorId);
  const record=findOwnedPersonalAiBotLanguageEvaluationSet(db,botId,setId,actorId);
  if(!['draft','changes_requested'].includes(record.status)){
    throw Object.assign(new Error('Only draft or changes-requested evaluation sets can be edited.'),{status:409});
  }
  const allowed=new Set(['name','description','cases','syntheticDataAttested']);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.has(key))||!Object.keys(input).length){
    throw Object.assign(new Error('Evaluation set updates contain unsupported or missing fields.'),{status:400});
  }
  if(Object.hasOwn(input,'cases')||Object.hasOwn(input,'syntheticDataAttested')){
    if(input.syntheticDataAttested!==true){
      throw Object.assign(new Error('Confirm that all edited evaluation examples remain synthetic and contain no private member data.'),{status:400});
    }
    record.syntheticDataAttested=true;
    record.syntheticDataAttestedBy=actorId;
    record.syntheticDataAttestedAt=timestamp;
  }
  if(Object.hasOwn(input,'name')){
    const name=String(input.name||'').trim().slice(0,100);
    if(name.length<3)throw Object.assign(new Error('Evaluation set name must contain at least 3 characters.'),{status:400});
    record.name=name;
  }
  if(Object.hasOwn(input,'description'))record.description=String(input.description||'').trim().slice(0,800);
  if(Object.hasOwn(input,'cases'))record.cases=normalizePersonalAiBotLanguageEvaluationCases(input.cases,uid);
  record.status='draft';
  record.reviewStatus='not_reviewed';
  record.reviewedBy=null;
  record.reviewedAt=null;
  record.reviewEvidenceReference=null;
  record.reviewerRole=null;
  record.reviewNotes='';
  record.providerExecutionStatus='not_run';
  record.languageQualityStatus='unverified';
  record.updatedBy=actorId;
  record.updatedAt=timestamp;
  audit(db,actorId,'language.evaluation_set_updated','language_evaluation_set',record.id,
    'Updated synthetic evaluation set '+record.name+' and cleared previous review metadata.',
    timestamp,uid);
  return record;
}

export function submitPersonalAiBotLanguageEvaluationSet(db, botId, setId, actorId, timestamp, uid) {
  getOwnedPersonalAiBotForLanguageSettings(db,botId,actorId);
  const record=findOwnedPersonalAiBotLanguageEvaluationSet(db,botId,setId,actorId);
  const language=getPersonalAiBotLanguageSettings(db,botId,actorId);
  if(!language.saved||!language.configuration.supportedLanguages.includes(record.languageCode)){
    throw Object.assign(new Error('The evaluation language must remain enabled in this bot’s saved multilingual settings before submission.'),{status:409});
  }
  if(!['draft','changes_requested'].includes(record.status)){
    throw Object.assign(new Error('Only draft evaluation sets can be submitted for human review.'),{status:409});
  }
  if(record.cases.length<5){
    throw Object.assign(new Error('Add at least 5 synthetic cases before requesting human language review.'),{status:409});
  }
  if(record.syntheticDataAttested!==true||record.syntheticDataAttestedBy!==actorId){
    throw Object.assign(new Error('A current owner synthetic-data privacy attestation is required.'),{status:409});
  }
  record.status='pending_human_review';
  record.reviewStatus='pending';
  record.updatedBy=actorId;
  record.updatedAt=timestamp;
  audit(db,actorId,'language.evaluation_set_submitted','language_evaluation_set',record.id,
    'Submitted '+record.cases.length+' synthetic '+record.languageCode+' evaluation cases for human review. Provider execution remains disabled.',
    timestamp,uid);
  return record;
}

export function reviewPersonalAiBotLanguageEvaluationSet(db, botId, setId, input, actorId, timestamp, uid) {
  getOwnedPersonalAiBotForLanguageSettings(db,botId,actorId);
  const record=findOwnedPersonalAiBotLanguageEvaluationSet(db,botId,setId,actorId);
  if(record.status!=='pending_human_review'){
    throw Object.assign(new Error('Only an evaluation set pending human review can be reviewed.'),{status:409});
  }
  const allowed=new Set(['decision','reviewerRole','evidenceReference','reviewNotes','reviewerAttestation','reviewRubric']);
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.has(key))){
    throw Object.assign(new Error('Language evaluation review contains unsupported fields.'),{status:400});
  }
  const decision=String(input.decision||'');
  const reviewerRole=String(input.reviewerRole||'');
  const evidenceReference=String(input.evidenceReference||'').trim().slice(0,500);
  const reviewNotes=String(input.reviewNotes||'').trim().slice(0,1200);
  if(!['approve','changes_requested','reject'].includes(decision)){
    throw Object.assign(new Error('Choose approve, changes requested or reject.'),{status:400});
  }
  if(!['native_speaker','qualified_language_reviewer','community_language_reviewer'].includes(reviewerRole)){
    throw Object.assign(new Error('Choose a supported human language-reviewer role.'),{status:400});
  }
  if(input.reviewerAttestation!==true||evidenceReference.length<5){
    throw Object.assign(new Error('Reviewer attestation and a non-empty evidence reference are required.'),{status:400});
  }
  const rubricKeys=['semanticAccuracy','dialectFidelity','contextPreservation','codeSwitching','safetyMeaning'];
  const rubric=input.reviewRubric;
  if(!rubric||typeof rubric!=='object'||Array.isArray(rubric)||
     Object.keys(rubric).length!==rubricKeys.length||
     rubricKeys.some(key=>!Object.hasOwn(rubric,key)||!Number.isInteger(rubric[key])||rubric[key]<0||rubric[key]>4)){
    throw Object.assign(new Error('Provide all five owner-attested rubric scores as whole numbers from 0 to 4.'),{status:400});
  }
  record.reviewRubric=Object.fromEntries(rubricKeys.map(key=>[key,rubric[key]]));
  record.status=decision==='approve'?'owner_review_recorded':decision;
  record.reviewStatus=decision;
  record.reviewerRole=reviewerRole;
  record.reviewEvidenceReference=evidenceReference;
  record.reviewedBy=actorId;
  record.reviewedAt=timestamp;
  record.reviewNotes=reviewNotes;
  record.providerExecutionStatus='not_run';
  record.languageQualityStatus='unverified';
  record.updatedBy=actorId;
  record.updatedAt=timestamp;
  audit(db,actorId,'language.evaluation_set_reviewed','language_evaluation_set',record.id,
    'Recorded '+decision+' owner-attested language review and manual rubric for '+record.languageCode+'. This does not certify reviewer credentials, provider compatibility or translation-model quality.',
    timestamp,uid);
  return record;
}


const PERSONAL_AI_CREATOR_FORMATS=Object.freeze([
  'feed_post','story','reel','page_post','group_post','event_promotion','live_show_plan'
]);
const PERSONAL_AI_CREATOR_DESTINATIONS=Object.freeze(['feed','story','reel','page','group','event','live']);
const PERSONAL_AI_CREATOR_SOURCES=Object.freeze(['owner_authored','member_supplied','licensed','external_reference']);

function normalizePersonalAiCreatorDraftFields(input,current={}) {
  const merged={...current,...input};
  const text=(value,label,max,required=false)=>{
    if(typeof value!=='string')throw Object.assign(new Error(label+' must be text.'),{status:400});
    const result=value.trim();
    if(result.length>max||(required&&result.length<1))throw Object.assign(new Error(label+' is '+(required?'required':'too long')+'.'),{status:400});
    return result;
  };
  const botId=text(merged.botId,'AI identity',80,true);
  const title=text(merged.title,'Draft title',120,true);
  const contentFormat=String(merged.contentFormat||'feed_post');
  if(!PERSONAL_AI_CREATOR_FORMATS.includes(contentFormat))throw Object.assign(new Error('Choose a supported Creator Studio content format.'),{status:400});
  const destination=String(merged.destination||'feed');
  if(!PERSONAL_AI_CREATOR_DESTINATIONS.includes(destination))throw Object.assign(new Error('Choose a supported Minglora destination.'),{status:400});
  const caption=text(merged.caption||'','Caption',5000);
  const body=text(merged.body||'','Draft content',20000,true);
  const sourceType=String(merged.sourceType||'owner_authored');
  if(!PERSONAL_AI_CREATOR_SOURCES.includes(sourceType))throw Object.assign(new Error('Choose a supported content source type.'),{status:400});
  if(typeof merged.rightsAttested!=='boolean')throw Object.assign(new Error('Confirm the content and asset rights status.'),{status:400});
  const rawRefs=merged.assetReferences??[];
  if(!Array.isArray(rawRefs)||rawRefs.length>10)throw Object.assign(new Error('Use no more than 10 asset references.'),{status:400});
  const assetReferences=rawRefs.map(value=>{
    if(typeof value!=='string')throw Object.assign(new Error('Asset references must be text identifiers.'),{status:400});
    const reference=value.trim();
    if(reference.length>300||/^data:/i.test(reference)||/[\u0000-\u001f]/.test(reference))throw Object.assign(new Error('An asset reference is invalid or too long.'),{status:400});
    return reference;
  }).filter(Boolean);
  if(sourceType==='licensed'&&merged.rightsAttested!==true){
    throw Object.assign(new Error('Licensed content must have an explicit rights attestation.'),{status:400});
  }
  return {botId,title,contentFormat,destination,caption,body,sourceType,assetReferences,rightsAttested:merged.rightsAttested};
}

export function listPersonalAiCreatorDrafts(db,options={}) {
  ensurePersonalAiBotCollections(db);
  const limit=Number(options.limit??50),offset=Number(options.offset??0);
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>1000000000){
    throw Object.assign(new Error('Creator Studio draft pagination is invalid.'),{status:400});
  }
  const records=db.personalAiCreatorDrafts.slice().sort((a,b)=>
    String(b.updatedAt||b.createdAt).localeCompare(String(a.updatedAt||a.createdAt))||String(a.id).localeCompare(String(b.id))
  );
  return records.slice(offset,offset+limit);
}

export function createPersonalAiCreatorDraft(db,input,actorId,timestamp,uid) {
  ensurePersonalAiBotCollections(db);
  if(!input||typeof input!=='object'||Array.isArray(input))throw Object.assign(new Error('Creator Studio draft details are required.'),{status:400});
  const fields=normalizePersonalAiCreatorDraftFields(input);
  const bot=db.personalAiBots.find(item=>item.id===fields.botId);
  if(!bot)throw Object.assign(new Error('Choose an existing Minglora AI identity.'),{status:404});
  const record={
    id:uid(),ownerId:actorId,...fields,
    status:'draft',reviewStatus:'not_reviewed',reviewNotes:'',
    aiIdentityDisclosureRequired:true,generationStatus:'not_connected',
    publishingStatus:'not_published',handoffStatus:'not_handed_off',
    version:1,versionHistory:[],
    createdBy:actorId,updatedBy:actorId,createdAt:timestamp,updatedAt:timestamp,
    submittedAt:null,reviewedAt:null,reviewedBy:null
  };
  db.personalAiCreatorDrafts.unshift(record);
  if(db.personalAiCreatorDrafts.length>500)db.personalAiCreatorDrafts.length=500;
  audit(db,actorId,'creator_draft.created','creator_draft',record.id,
    'Created a manual Creator Studio draft for '+bot.displayName+'. No generation, publishing or external handoff occurred.',timestamp,uid);
  return record;
}

export function updatePersonalAiCreatorDraft(db,draftId,input,actorId,timestamp,uid) {
  ensurePersonalAiBotCollections(db);
  const record=db.personalAiCreatorDrafts.find(item=>item.id===draftId);
  if(!record)throw Object.assign(new Error('Creator Studio draft not found.'),{status:404});
  if(record.ownerId!==actorId)throw Object.assign(new Error('This Creator Studio draft belongs to another owner.'),{status:403});
  if(!['draft','changes_requested'].includes(record.status))throw Object.assign(new Error('Only draft or changes-requested content can be edited.'),{status:409});
  const bot=db.personalAiBots.find(item=>item.id===record.botId);
  if(!bot)throw Object.assign(new Error('The linked AI identity is no longer available.'),{status:404});
  const fields=normalizePersonalAiCreatorDraftFields({...input,botId:record.botId},record);
  record.versionHistory.unshift({
    version:record.version,title:record.title,contentFormat:record.contentFormat,destination:record.destination,
    caption:record.caption,body:record.body,sourceType:record.sourceType,
    assetReferences:[...record.assetReferences],rightsAttested:record.rightsAttested,
    savedAt:timestamp,savedBy:actorId
  });
  if(record.versionHistory.length>10)record.versionHistory.length=10;
  Object.assign(record,fields,{
    version:record.version+1,status:'draft',reviewStatus:'not_reviewed',reviewNotes:'',
    reviewedAt:null,reviewedBy:null,submittedAt:null,updatedBy:actorId,updatedAt:timestamp
  });
  audit(db,actorId,'creator_draft.updated','creator_draft',record.id,
    'Updated Creator Studio draft version '+record.version+'. Previous draft version retained.',timestamp,uid);
  return record;
}

export function submitPersonalAiCreatorDraft(db,draftId,actorId,timestamp,uid) {
  ensurePersonalAiBotCollections(db);
  const record=db.personalAiCreatorDrafts.find(item=>item.id===draftId);
  if(!record)throw Object.assign(new Error('Creator Studio draft not found.'),{status:404});
  if(record.ownerId!==actorId)throw Object.assign(new Error('This Creator Studio draft belongs to another owner.'),{status:403});
  if(record.status!=='draft')throw Object.assign(new Error('Only saved drafts can be submitted for owner review.'),{status:409});
  if(record.rightsAttested!==true)throw Object.assign(new Error('Confirm content and media rights before submitting for review.'),{status:409});
  if(!record.aiIdentityDisclosureRequired)throw Object.assign(new Error('AI identity disclosure cannot be disabled.'),{status:409});
  record.status='pending_review';record.reviewStatus='pending_review';
  record.submittedAt=timestamp;record.updatedAt=timestamp;record.updatedBy=actorId;
  audit(db,actorId,'creator_draft.submitted','creator_draft',record.id,
    'Submitted Creator Studio draft for owner review. No publishing or external handoff occurred.',timestamp,uid);
  return record;
}

export function reviewPersonalAiCreatorDraft(db,draftId,input,actorId,timestamp,uid) {
  ensurePersonalAiBotCollections(db);
  const record=db.personalAiCreatorDrafts.find(item=>item.id===draftId);
  if(!record)throw Object.assign(new Error('Creator Studio draft not found.'),{status:404});
  if(record.ownerId!==actorId)throw Object.assign(new Error('This Creator Studio draft belongs to another owner.'),{status:403});
  const decision=String(input?.decision||'');
  const notes=String(input?.reviewNotes||'').trim();
  if(!['approve','changes_requested','reject','archive'].includes(decision)||notes.length>1200){
    throw Object.assign(new Error('Creator Studio review decision or notes are invalid.'),{status:400});
  }
  if(decision==='archive'){
    if(record.status==='archived')throw Object.assign(new Error('This Creator Studio draft is already archived.'),{status:409});
    record.status='archived';record.reviewStatus='archived';
  }else{
    if(record.status!=='pending_review')throw Object.assign(new Error('Only drafts awaiting owner review can receive a review decision.'),{status:409});
    record.status=decision==='approve'?'approved_for_human_handoff':decision;
    record.reviewStatus=decision;
  }
  record.reviewNotes=notes;record.reviewedBy=actorId;record.reviewedAt=timestamp;record.updatedBy=actorId;record.updatedAt=timestamp;
  audit(db,actorId,'creator_draft.reviewed','creator_draft',record.id,
    'Recorded Creator Studio review decision: '+decision+'. Approval does not publish or hand off content.',timestamp,uid);
  return record;
}

export function getPersonalAiBotPerformanceSnapshot(db, observedAt = new Date().toISOString()) {
  ensurePersonalAiBotCollections(db);
  const observedMs=Date.parse(observedAt);
  if(!Number.isFinite(observedMs))throw Object.assign(new Error('Performance snapshot time must be a valid timestamp.'),{status:400});
  const dayMs=24*60*60*1000;
  const sinceMs=observedMs-dayMs;
  const tasks=db.personalAiBotTasks;
  const recentTasks=tasks.filter(task=>{
    const createdMs=Date.parse(task.createdAt);
    return Number.isFinite(createdMs)&&createdMs>=sinceMs&&createdMs<=observedMs;
  });
  const completed=tasks.filter(task=>{
    const completedMs=Date.parse(task.completedAt);
    return task.status==='completed'&&Number.isFinite(completedMs)&&completedMs>=sinceMs&&completedMs<=observedMs;
  });
  const durations=completed.map(task=>{
    const createdMs=Date.parse(task.createdAt),completedMs=Date.parse(task.completedAt);
    return Number.isFinite(createdMs)&&completedMs>=createdMs?(completedMs-createdMs)/60000:null;
  }).filter(value=>value!==null);
  const taskTypes={};
  for(const task of recentTasks){
    const type=String(task.taskType||'unknown');
    if(PERSONAL_AI_BOT_TASK_TYPES.includes(type))taskTypes[type]=(taskTypes[type]||0)+1;
  }
  const countByTimestamp=(status,timestampFields)=>{
    return tasks.filter(task=>{
      if(task.status!==status)return false;
      const eventMs=timestampFields.map(field=>Date.parse(task[field])).find(Number.isFinite);
      return Number.isFinite(eventMs)&&eventMs>=sinceMs&&eventMs<=observedMs;
    }).length;
  };
  return {
    observedAt:new Date(observedMs).toISOString(),
    windowHours:24,
    source:'legacy_runtime_state_snapshot',
    coverage:{
      taskRecordsObserved:tasks.length,
      taskRecordCap:2000,
      taskRecordsMayBeTruncated:tasks.length>=2000
    },
    queue:{
      awaitingApproval:tasks.filter(task=>task.status==='awaiting_administrator_approval').length,
      approvedWaitingForWorker:tasks.filter(task=>task.status==='approved_waiting_for_worker').length,
      running:tasks.filter(task=>task.status==='running').length
    },
    activity:{
      tasksCreated24h:recentTasks.length,
      tasksCompleted24h:completed.length,
      tasksFailed24h:countByTimestamp('failed',['failedAt','updatedAt']),
      tasksCancelled24h:countByTimestamp('cancelled',['cancelledAt','updatedAt']),
      averageCompletionMinutes24h:durations.length?Math.round((durations.reduce((sum,value)=>sum+value,0)/durations.length)*100)/100:null,
      taskTypes24h:taskTypes
    },
    integrations:{
      providerInference:{available:false,status:'not_connected'},
      usageTelemetry:{available:false,status:'unavailable',reason:'No verified provider usage ledger is connected.'}
    }
  };
}

export function getPersonalAiBotOverview(db, observedAt = new Date().toISOString()) {
  const settings=ensurePersonalAiBotCollections(db);
  const observedMs=Date.parse(observedAt);
  const performance=getPersonalAiBotPerformanceSnapshot(db,observedAt);
  const bots=db.personalAiBots;
  const tasks=db.personalAiBotTasks;
  return {
    network:settings,
    performance,
    counts:{
      totalBots:bots.length,
      enabledBots:bots.filter(bot=>bot.status==='enabled').length,
      disabledBots:bots.filter(bot=>bot.status==='disabled').length,
      pausedBots:bots.filter(bot=>bot.status==='paused').length,
      pendingInstructions:tasks.filter(task=>task.status==='awaiting_administrator_approval').length,
      approvedWaitingForWorker:tasks.filter(task=>task.status==='approved_waiting_for_worker').length,
      categories:getPersonalAiBotCategories(db).length,
      activeBots:bots.filter(bot=>{const activeMs=Date.parse(bot.lastActiveAt);return bot.status==='enabled'&&Number.isFinite(activeMs)&&activeMs<=observedMs&&observedMs-activeMs<5*60*1000;}).length,
      executingBots:new Set(tasks.filter(task=>task.status==='running').map(task=>task.botId)).size,
      identityDesignTarget:settings.identityDesignTarget||10000000000,
      concurrentExecutionLimit:settings.concurrentExecutionLimit||0,
      totalTeams:db.personalAiBotTeams.length,
      teamMemberships:db.personalAiBotTeamMembers.length
    }
  };
}
