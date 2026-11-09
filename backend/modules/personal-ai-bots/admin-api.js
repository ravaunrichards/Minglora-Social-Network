import { isRelationshipBlocked } from '../relationships/friends.js';

function canonicalAiIdentity(bot) {
  const parts=String(bot.displayName||'').trim().split(/\s+/).filter(Boolean);
  const firstName=String(bot.firstName||parts[0]||'AI').trim();
  const lastName=String(bot.lastName||parts[parts.length-1]||'Identity').trim();
  const middleName=String(bot.middleName||parts.slice(1,-1).join(' ')).trim();
  const lifecycleStatus=bot.status==='enabled'?'active'
    :bot.status==='paused'?'restricted'
      :bot.status==='suspended'?'suspended'
        :bot.status==='archived'?'archived':'created';
  const supportedGenders=new Set(['female','male','non_binary','other','prefer_not_to_specify']);
  const gender=String(bot.gender||'prefer_not_to_specify').toLowerCase();
  const locations=Array.isArray(bot.locations)?bot.locations:[
    ...((bot.countryOfOrigin||bot.originCountryCode||bot.originStateProvince||bot.originParishCounty||bot.originCity||bot.originTown)?[{
      locationType:'origin',countryCode:bot.originCountryCode||'',countryName:bot.countryOfOrigin||'',
      stateProvince:bot.originStateProvince||'',district:bot.originDistrict||'',
      parishCounty:bot.originParishCounty||'',city:bot.originCity||'',town:bot.originTown||'',
      timeZone:bot.originTimeZone||'UTC',isPrimary:false
    }]:[]),
    ...((bot.currentCountry||bot.currentCountryCode||bot.stateProvince||bot.parishCounty||bot.city||bot.town)?[{
      locationType:'current',countryCode:bot.currentCountryCode||'',countryName:bot.currentCountry||'',
      stateProvince:bot.stateProvince||'',district:bot.district||'',
      parishCounty:bot.parishCounty||'',city:bot.city||'',town:bot.town||'',
      timeZone:bot.timeZone||bot.activitySchedule?.timezone||'UTC',isPrimary:true
    }]:[])
  ];
  return {
    id:String(bot.id),
    population:String(bot.population||'independent'),
    identity_type:String(bot.identityType||'social_personality'),
    category_id:String(bot.categoryId||''),
    category_name:String(bot.categoryName||'AI Social Member'),
    category_description:String(bot.categoryDescription||''),
    status:lifecycleStatus,
    parent_identity_id:bot.parentIdentityId||null,
    public_profile_slug:String(bot.slug||('ai-'+String(bot.id).replace(/-/g,'').slice(0,12))),
    public_profile_enabled:false,
    first_name:firstName,
    last_name:lastName,
    middle_name:middleName,
    full_name:[firstName,middleName,lastName].filter(Boolean).join(' '),
    display_name:String(bot.displayName||[firstName,middleName,lastName].filter(Boolean).join(' ')),
    username:String(bot.username||''),
    biography:String(bot.bio||bot.description||''),
    introduction:String(bot.introduction||''),
    gender:supportedGenders.has(gender)?gender:'prefer_not_to_specify',
    gender_presentation:String(bot.genderPresentation||''),
    nationality:String(bot.nationality||''),
    country_of_origin:String(bot.countryOfOrigin||''),
    current_country:String(bot.currentCountry||''),
    time_zone:String(bot.activitySchedule?.timezone||bot.timeZone||'America/Jamaica'),
    personality:String(bot.personality||''),
    communication_style:String(bot.communicationStyle||bot.communicationStyleDescription||''),
    interests:Array.isArray(bot.interests)?bot.interests:[],
    hobbies:Array.isArray(bot.hobbies)?bot.hobbies:[],
    education:Array.isArray(bot.education)?bot.education:[],
    languages:Array.isArray(bot.languages)?bot.languages:[],
    profession:String(bot.profession||''),
    skills:Array.isArray(bot.skills)?bot.skills:[],
    avatar_storage_reference:String(bot.avatarStorageReference||''),
    cover_storage_reference:String(bot.coverStorageReference||''),
    voice_preferences:bot.voicePreferences&&typeof bot.voicePreferences==='object'?bot.voicePreferences:{},
    avatar_preferences:bot.avatarPreferences&&typeof bot.avatarPreferences==='object'?bot.avatarPreferences:{},
    ...(locations.length?{locations}:{}),
    ...(Array.isArray(bot.capabilities)?{capabilities:bot.capabilities}:{}),
    memory_enabled:bot.memoryEnabled===true,
    memory_configuration:bot.memoryConfiguration&&typeof bot.memoryConfiguration==='object'?bot.memoryConfiguration:{},
    visibility:['public','friends','private'].includes(bot.visibility)?bot.visibility:'private',
    created_at:bot.createdAt||new Date().toISOString()
  };
}

async function persistCanonicalIdentities(bots,persistAiIdentities) {
  if(typeof persistAiIdentities!=='function'||!Array.isArray(bots)||!bots.length)return;
  await persistAiIdentities(bots.map(canonicalAiIdentity));
}

function canonicalAiBotTask(task) {
  return {
    id:String(task.id),
    idempotencyKey:String(task.id),
    botId:String(task.botId),
    taskType:String(task.taskType||'other'),
    instruction:String(task.instruction||''),
    targetUserId:task.targetUserId||null,
    highImpact:task.highImpact!==false,
    status:String(task.status||'awaiting_administrator_approval'),
    approvedBy:task.approvedBy||null,
    approvedAt:task.approvedAt||null,
    cancelledBy:task.cancelledBy||null,
    cancelledAt:task.cancelledAt||null,
    createdBy:task.createdBy||null,
    createdAt:task.createdAt||new Date().toISOString(),
    privacyGuardRequired:task.privacyGuardRequired===true,
    blockGuardRequired:task.blockGuardRequired===true,
    excludeFromHumanEngagementMetrics:true,
    executionStatus:String(task.executionStatus||'not_dispatched')
  };
}

async function persistCanonicalTasks(tasks,persistAiBotTasks,bots,persistAiIdentities) {
  if(typeof persistAiBotTasks!=='function'||!Array.isArray(tasks)||!tasks.length)return;
  const normalized=tasks.map(canonicalAiBotTask);
  if(typeof persistAiIdentities==='function'&&Array.isArray(bots)){
    const requiredBotIds=new Set(normalized.map(task=>task.botId));
    const dependencies=bots.filter(bot=>requiredBotIds.has(String(bot.id)));
    if(dependencies.length!==requiredBotIds.size){
      throw Object.assign(new Error('One or more AI bot identity dependencies are unavailable.'),{status:409});
    }
    await persistCanonicalIdentities(dependencies,persistAiIdentities);
  }
  for(let offset=0;offset<normalized.length;offset+=100){
    await persistAiBotTasks(normalized.slice(offset,offset+100));
  }
}

function canonicalAiBotSettings(settings) {
  return {
    enabled:settings.enabled===true,
    hybridEnabled:settings.hybridEnabled===true,
    maxConcurrentExecutions:Number(settings.concurrentExecutionLimit||0),
    dailyExecutionBudget:Number(settings.dailyExecutionBudget||0),
    automaticSuspensionEnabled:settings.automaticSuspensionEnabled!==false,
    emergencyShutdownAt:settings.emergencyShutdownAt||null
  };
}

async function persistCanonicalBotSettings(settings,persistAiBotSettings) {
  if(typeof persistAiBotSettings!=='function')return;
  await persistAiBotSettings(canonicalAiBotSettings(settings));
}
import {
  ensurePersonalAiBotCollections,
  getPersonalAiBotCategories,
  getPersonalAiBotOverview,
  createPersonalAiBot,
  createPersonalAiBotStarterSet,
  updatePersonalAiBot,
  createPersonalAiBotCategory,
  queuePersonalAiBotInstruction,
  queuePersonalAiBotFollowBatch,
  approvePersonalAiBotTask,
  cancelPersonalAiBotTask,
  setPersonalAiBotNetworkSettings,
  updatePersonalAiBotCategory,
  bulkUpdatePersonalAiBots,
  emergencyShutdownPersonalAiBots,
  createPersonalAiBotTeam,
  updatePersonalAiBotTeam,
  assignPersonalAiBotsToTeam,
  removePersonalAiBotFromTeam,
  PERSONAL_AI_BOT_CATEGORIES
} from './personal-ai-bots-service.js';

export async function handlePersonalAiBotsAdminApi(context) {
  const {req,res,url,method,path,user,input,db,saveStore,uid,now,json,isOwnerAdmin,isSameOriginWrite,lookupAdminMember,persistAiIdentities,listAiIdentities,persistAiBotTasks,listAiBotTasks,getAiBotTaskStats,persistAiBotSettings,persistAiProviderAssignment,listAiProviderAssignments,persistAiEmailIdentity,listAiEmailIdentities}=context;
  const root='/api/admin/personal-ai-bots';
  if(path!==root&&!path.startsWith(root+'/'))return false;
  if(!isOwnerAdmin)return (json(res,403,{error:'Only the designated MFA-verified Minglora owner can manage the Personal AI Bots Network.'}),true);
  const write=['POST','PUT','PATCH','DELETE'].includes(method);
  if(write&&!isSameOriginWrite)return (json(res,403,{error:'This bot-management request must come from Minglora.'}),true);
  ensurePersonalAiBotCollections(db);
  const stamp=now();
  try{
    if(method==='GET'&&path===root){
      const overview=getPersonalAiBotOverview(db);
      const identityRecords=typeof listAiIdentities==='function'?await listAiIdentities({limit:1000,offset:0}):null;
      const durableTasks=typeof listAiBotTasks==='function'?await listAiBotTasks({limit:100,offset:0}):null;
      const durableTaskStats=typeof getAiBotTaskStats==='function'?await getAiBotTaskStats():null;
      const providerAssignments=typeof listAiProviderAssignments==='function'?await listAiProviderAssignments({limit:200,offset:0}):null;
      const emailIdentities=typeof listAiEmailIdentities==='function'?await listAiEmailIdentities({limit:200,offset:0}):null;
      return (json(res,200,{
        ...overview,
        identityRecords:Array.isArray(identityRecords)?identityRecords:[],
        identityRecordsSource:Array.isArray(identityRecords)?'minglora_supabase_postgresql':'legacy_runtime_state',
        taskRecordsSource:Array.isArray(durableTasks)?'minglora_supabase_postgresql':'legacy_runtime_state',
        taskQueueStats:durableTaskStats&&typeof durableTaskStats==='object'?durableTaskStats:null,
        providerAssignments:Array.isArray(providerAssignments)?providerAssignments:[],
        providerAssignmentsSource:Array.isArray(providerAssignments)?'minglora_supabase_postgresql':'unavailable',
        emailIdentities:Array.isArray(emailIdentities)?emailIdentities:[],
        emailIdentitiesSource:Array.isArray(emailIdentities)?'minglora_supabase_postgresql':'unavailable',
        categories:getPersonalAiBotCategories(db),
        bots:db.personalAiBots.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),
        tasks:Array.isArray(durableTasks)?durableTasks:db.personalAiBotTasks.slice(0,100),
        audit:db.personalAiBotAudit.slice(0,100),
        teams:db.personalAiBotTeams.map(team=>({...team,members:db.personalAiBotTeamMembers.filter(member=>member.teamId===team.id).map(member=>({botId:member.botId,botName:db.personalAiBots.find(bot=>bot.id===member.botId)?.displayName||'Unknown bot'}))})),
        templates:PERSONAL_AI_BOT_CATEGORIES
      }),true);
    }
    if(method==='POST'&&path===root){
      const bot=createPersonalAiBot(db,input||{},user.id,stamp,uid);
      await persistCanonicalIdentities([bot],persistAiIdentities);
      await saveStore();
      return (json(res,201,{ok:true,bot}),true);
    }
    if(method==='POST'&&path===root+'/starter-set'){
      const bots=createPersonalAiBotStarterSet(db,user.id,stamp,uid);
      await persistCanonicalIdentities(bots,persistAiIdentities);
      await saveStore();
      return (json(res,201,{ok:true,created:bots.length,bots}),true);
    }
    if(method==='POST'&&path===root+'/teams'){
      const team=createPersonalAiBotTeam(db,input||{},user.id,stamp,uid);
      await saveStore();
      return (json(res,201,{ok:true,team}),true);
    }
    const teamMatch=path.match(/^\/api\/admin\/personal-ai-bots\/teams\/([0-9a-f-]{36})$/i);
    if(teamMatch&&method==='PATCH'){
      const team=updatePersonalAiBotTeam(db,teamMatch[1],input||{},user.id,stamp,uid);
      await saveStore();
      return (json(res,200,{ok:true,team}),true);
    }
    const teamMembersMatch=path.match(/^\/api\/admin\/personal-ai-bots\/teams\/([0-9a-f-]{36})\/members$/i);
    if(teamMembersMatch&&method==='POST'){
      const result=assignPersonalAiBotsToTeam(db,teamMembersMatch[1],input?.botIds,user.id,stamp,uid);
      await saveStore();
      return (json(res,200,{ok:true,...result}),true);
    }
    const teamMemberRemoveMatch=path.match(/^\/api\/admin\/personal-ai-bots\/teams\/([0-9a-f-]{36})\/members\/([0-9a-f-]{36})$/i);
    if(teamMemberRemoveMatch&&method==='DELETE'){
      const result=removePersonalAiBotFromTeam(db,teamMemberRemoveMatch[1],teamMemberRemoveMatch[2],user.id,stamp,uid);
      await saveStore();
      return (json(res,200,result),true);
    }
    if(method==='POST'&&path===root+'/categories'){
      const category=createPersonalAiBotCategory(db,input||{},user.id,stamp,uid);
      await saveStore();
      return (json(res,201,{ok:true,category}),true);
    }
    if(method==='POST'&&path===root+'/emails'){
      const allowedEmailFields=new Set(['identityId','emailAddress','emailType','emailProvider','isPrimary']);
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowedEmailFields.has(key))){
        return (json(res,400,{error:'AI email payload contains unsupported or sensitive fields.'}),true);
      }
      if(typeof persistAiEmailIdentity!=='function')return (json(res,503,{error:'AI email identity storage is not available in this runtime.'}),true);
      const identityId=String(input?.identityId||'').trim();
      const bot=db.personalAiBots.find(item=>item.id===identityId);
      if(!bot)return (json(res,404,{error:'Choose an existing Minglora AI identity before recording an email address.'}),true);
      const email={
        identityId,
        emailAddress:String(input?.emailAddress||'').trim().toLowerCase(),
        emailType:String(input?.emailType||'primary'),
        emailProvider:String(input?.emailProvider||'').trim(),
        isPrimary:input?.isPrimary===true
      };
      if(!/^[0-9a-f-]{36}$/i.test(email.identityId)||
         email.emailAddress.length<3||email.emailAddress.length>320||
         !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.emailAddress)||
         !['primary','recovery','notification','other'].includes(email.emailType)||
         email.emailProvider.length>80){
        return (json(res,400,{error:'AI email identity fields are invalid.'}),true);
      }
      // The canonical AI identity must exist before its child email row is inserted.
      await persistCanonicalIdentities([bot],persistAiIdentities);
      const saved=await persistAiEmailIdentity(email);
      return (json(res,201,{
        ok:true,email:saved,
        message:'Email identity record saved. The address is not a verified mailbox and no email provider has provisioned an inbox.'
      }),true);
    }
    if(method==='POST'&&path===root+'/providers'){
      const allowedProviderFields=new Set([
        'identityId','providerName','providerIdentifier','providerAccountReference',
        'credentialSecretReference','modelName','modelIdentifier','modelVersion',
        'supportedLanguages','capabilities','textCapable','imageCapable','audioCapable',
        'videoCapable','voiceCapable','routingPriority','isPrimary'
      ]);
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowedProviderFields.has(key))){
        return (json(res,400,{error:'Provider payload contains unsupported or sensitive fields.'}),true);
      }
      if(typeof persistAiProviderAssignment!=='function')return (json(res,503,{error:'Provider assignment storage is not available in this runtime.'}),true);
      const identityId=String(input?.identityId||'').trim();
      const bot=db.personalAiBots.find(item=>item.id===identityId);
      if(!bot)return (json(res,404,{error:'Choose an existing Minglora AI identity before assigning a provider.'}),true);
      const assignment={
        identityId,
        providerName:String(input?.providerName||'').trim(),
        providerIdentifier:String(input?.providerIdentifier||'').trim().toLowerCase(),
        providerAccountReference:String(input?.providerAccountReference||'default').trim(),
        credentialSecretReference:String(input?.credentialSecretReference||'').trim()||null,
        modelName:String(input?.modelName||'').trim(),
        modelIdentifier:String(input?.modelIdentifier||'').trim(),
        modelVersion:String(input?.modelVersion||'').trim(),
        supportedLanguages:Array.isArray(input?.supportedLanguages)?input.supportedLanguages:[],
        capabilities:input?.capabilities&&typeof input.capabilities==='object'?input.capabilities:{},
        textCapable:input?.textCapable!==false,
        imageCapable:input?.imageCapable===true,
        audioCapable:input?.audioCapable===true,
        videoCapable:input?.videoCapable===true,
        voiceCapable:input?.voiceCapable===true,
        routingPriority:Number(input?.routingPriority||100),
        isPrimary:input?.isPrimary===true
      };
      if(!assignment.identityId.match(/^[0-9a-f-]{36}$/i)||
         assignment.providerName.length<2||assignment.providerName.length>80||
         !/^[A-Za-z0-9][A-Za-z0-9 ._-]{1,78}$/.test(assignment.providerName)||
         !/^[a-z][a-z0-9._-]{1,79}$/.test(assignment.providerIdentifier)||
         !/^[A-Za-z0-9._:-]{1,120}$/.test(assignment.providerAccountReference)||
         (assignment.credentialSecretReference&&!/^env:MINGLORA_AI_PROVIDER_[A-Z0-9_]{2,80}$/.test(assignment.credentialSecretReference))||
         !assignment.modelName||assignment.modelName.length>160||
         !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(assignment.modelIdentifier)||
         assignment.modelVersion.length>80||assignment.supportedLanguages.length>100||
         assignment.supportedLanguages.some(value=>typeof value!=='string'||value.trim().length<2||value.length>20)||
         !Number.isInteger(assignment.routingPriority)||assignment.routingPriority<1||assignment.routingPriority>1000){
        return (json(res,400,{error:'Provider/model fields are invalid. Use a secret reference, never a raw API credential.'}),true);
      }
      await persistCanonicalIdentities([bot],persistAiIdentities);
      const saved=await persistAiProviderAssignment(assignment);
      return (json(res,201,{ok:true,assignment:saved, message:'Provider/model assignment saved as unverified. A real provider credential and server-side health check are still required before dispatch.'}),true);
    }
    if(method==='PUT'&&path===root+'/network'){
      const network=setNetwork(input||{});
      await persistCanonicalBotSettings(network,persistAiBotSettings);
      await saveStore();
      return (json(res,200,{ok:true,network}),true);
    }
    if(method==='POST'&&path===root+'/emergency-shutdown'){
      const result=emergencyShutdownPersonalAiBots(db,user.id,stamp,uid);
      // Turn off the durable dispatch gate before synchronizing cancelled tasks.
      await persistCanonicalBotSettings(result.network,persistAiBotSettings);
      await persistCanonicalIdentities(db.personalAiBots,persistAiIdentities);
      await persistCanonicalTasks(db.personalAiBotTasks.filter(task=>task.status==='cancelled'&&task.cancelledBy===user.id&&task.cancelledAt===stamp),persistAiBotTasks,db.personalAiBots,null);
      await saveStore();
      return (json(res,200,{...result,message:'Emergency shutdown complete. Enabled bots were paused and open tasks were cancelled.'}),true);
    }
    const categoryMatch=path.match(/^\/api\/admin\/personal-ai-bots\/categories\/([a-z0-9-]+)$/i);
    if(categoryMatch&&method==='PATCH'){
      const category=updatePersonalAiBotCategory(db,categoryMatch[1],input||{},user.id,stamp,uid);
      await saveStore();
      return (json(res,200,{ok:true,category}),true);
    }
    if(method==='POST'&&path===root+'/bots/bulk'){
      const result=bulkUpdatePersonalAiBots(db,input?.botIds,input?.status,user.id,stamp,uid);
      await persistCanonicalIdentities(result.bots,persistAiIdentities);
      await saveStore();
      return (json(res,200,{ok:true,...result}),true);
    }
    const botMatch=path.match(/^\/api\/admin\/personal-ai-bots\/bots\/([0-9a-f-]{36})$/i);
    if(botMatch&&method==='PATCH'){
      const bot=updatePersonalAiBot(db,botMatch[1],input||{},user.id,stamp,uid);
      await persistCanonicalIdentities([bot],persistAiIdentities);
      await saveStore();
      return (json(res,200,{ok:true,bot}),true);
    }
    if(method==='POST'&&path===root+'/follow-batch'){
      const network=db.personalAiBotSettings.find(item=>item.id==='global');
      if(!network?.enabled)return (json(res,409,{error:'Enable the global bot network before submitting follow instructions.'}),true);
      const targetUserId=String(input?.targetUserId||'').trim();
      const targetMember=typeof lookupAdminMember==='function'?await lookupAdminMember(targetUserId):(db.users||[]).find(member=>member.id===targetUserId);
      if(!targetMember)return (json(res,404,{error:'The selected Minglora member account could not be found.'}),true);
      if(['banned','suspended','deactivated','deleted'].includes(String(targetMember.status||'').toLowerCase())){
        return (json(res,409,{error:'This member account is not eligible for following operations.'}),true);
      }
      if(isRelationshipBlocked(db.blocks||[],user.id,targetUserId)){
        return (json(res,409,{error:'A block exists between the administrator account and this target. Follow operations are not allowed.'}),true);
      }
      const result=queuePersonalAiBotFollowBatch(db,input||{},user.id,stamp,uid);
      await persistCanonicalTasks(result.tasks,persistAiBotTasks,db.personalAiBots,persistAiIdentities);
      await saveStore();
      return (json(res,201,{ok:true,...result,message:result.created+' separate instructions created. Each requires approval; no follow or unfollow action was executed.'}),true);
    }
    const instructionMatch=path.match(/^\/api\/admin\/personal-ai-bots\/bots\/([0-9a-f-]{36})\/instructions$/i);
    if(instructionMatch&&method==='POST'){
      const bot= db.personalAiBots.find(item=>item.id===instructionMatch[1]);
      if(!bot)return (json(res,404,{error:'Bot not found.'}),true);
      const network=db.personalAiBotSettings.find(item=>item.id==='global');
      if(!network?.enabled||!bot.enabled||bot.status!=='enabled')return (json(res,409,{error:'Enable the network and this bot before assigning an instruction.'}),true);
      const taskType=String(input?.taskType||'other');
      if(['follow','unfollow'].includes(taskType)){
        const targetUserId=String(input?.targetUserId||'');
        const targetMember=(db.users||[]).find(member=>member.id===targetUserId);
        if(!targetMember)return (json(res,404,{error:'The selected Minglora member account could not be found.'}),true);
        if(['banned','suspended','deactivated','deleted'].includes(String(targetMember.status||'').toLowerCase())){
          return (json(res,409,{error:'This member account is not eligible for following operations.'}),true);
        }
        if(isRelationshipBlocked(db.blocks||[],user.id,targetUserId)){
          return (json(res,409,{error:'A block exists between the administrator account and this target. Follow operations are not allowed.'}),true);
        }
      }
      const task=queuePersonalAiBotInstruction(db,instructionMatch[1],input||{},user.id,stamp,uid);
      await persistCanonicalTasks([task],persistAiBotTasks,db.personalAiBots,persistAiIdentities);
      await saveStore();
      return (json(res,201,{ok:true,task,message:'Instruction saved for administrator approval. No bot action has been executed.'}),true);
    }
    const taskMatch=path.match(/^\/api\/admin\/personal-ai-bots\/tasks\/([0-9a-f-]{36})\/(approve|cancel)$/i);
    if(taskMatch&&method==='POST'){
      const action=taskMatch[2];
      if(action==='approve'){
        const existing=db.personalAiBotTasks.find(item=>item.id===taskMatch[1]);
        const bot=existing?db.personalAiBots.find(item=>item.id===existing.botId):null;
        const network=db.personalAiBotSettings.find(item=>item.id==='global');
        const category=bot?getPersonalAiBotCategories(db).find(item=>item.id===bot.categoryId):null;
        if(!existing||!bot)return (json(res,404,{error:'Instruction or bot not found.'}),true);
        if(!network?.enabled||!bot.enabled||bot.status!=='enabled'||!category?.enabled)return (json(res,409,{error:'The network, bot and category must all be enabled before an instruction can be approved.'}),true);
        if(['follow','unfollow'].includes(existing.taskType)){
          const target=typeof lookupAdminMember==='function'
            ?await lookupAdminMember(existing.targetUserId)
            :(db.users||[]).find(member=>member.id===existing.targetUserId);
          if(!target)return (json(res,404,{error:'The follow target no longer exists or is unavailable.'}),true);
          if(['banned','suspended','deactivated','deleted'].includes(String(target.status||'').toLowerCase()))return (json(res,409,{error:'The follow target is no longer an active Minglora member.'}),true);
          if(isRelationshipBlocked(db.blocks||[],user.id,existing.targetUserId))return (json(res,409,{error:'A Minglora block now prevents this follow operation.'}),true);
        }
      }
      const task=action==='approve'
        ?approvePersonalAiBotTask(db,taskMatch[1],user.id,stamp,uid)
        :cancelPersonalAiBotTask(db,taskMatch[1],user.id,stamp,uid);
      await persistCanonicalTasks([task],persistAiBotTasks,db.personalAiBots,persistAiIdentities);
      await saveStore();
      return (json(res,200,{ok:true,task,message:action==='approve'?'Instruction approved and queued, but no worker is configured to execute it yet.':'Instruction cancelled.'}),true);
    }
    if(method==='POST'&&path.startsWith(root+'/')){
      return (json(res,404,{error:'Unknown Personal AI Bots operation.'}),true);
    }
    return (json(res,405,{error:'Method not allowed for Personal AI Bots.'}),true);
  }catch(error){
    return (json(res,error.status||400,{error:error.message||'The bot-management operation could not be completed.'}),true);
  }

  function setNetwork(payload){
    return setPersonalAiBotNetworkSettings(db,payload,user.id,stamp,uid);
  }
}
