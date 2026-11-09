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
  'personalAiBotTeams','personalAiBotTeamMembers','personalAiBotSchedules','personalAiBotBatches','personalAiBotDepartments','personalAiBotVacancies','personalAiBotApplications','personalAiBotAppointments','personalAiBotEmploymentHistory'
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
    team.status=status;team.enabled=status==='enabled';changes.push('status');
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
  audit(db,actorId,'team.member_removed','team',team.id,'Removed a bot from '+team.name+'.',timestamp,uid);
  return {ok:true,teamId,botId,memberCount:db.personalAiBotTeamMembers.filter(member=>member.teamId===teamId).length};
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
      identityDesignTarget:settings.identityDesignTarget||10000000000,
      concurrentExecutionLimit:settings.concurrentExecutionLimit||0,
      totalTeams:db.personalAiBotTeams.length,
      teamMemberships:db.personalAiBotTeamMembers.length
    }
  };
}
