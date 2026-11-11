import { createHash } from 'node:crypto';
import { isRelationshipBlocked } from '../relationships/friends.js';

function safeProviderAssignmentRecords(records){
  return records.map(item=>{
    const {credentialSecretReference,...safeItem}=item||{};
    const configured=typeof credentialSecretReference==='string'&&credentialSecretReference.trim().length>0;
    return {...safeItem,credentialConfigured:configured||safeItem.credentialConfigured===true};
  });
}

function assertAiPersistenceResult(result,resource){
  if(result&&typeof result==='object'&&(result.skipped===true||result.ok===false)){
    throw Object.assign(new Error(resource+' were not persisted to Minglora Supabase PostgreSQL.'),{status:503});
  }
  return result;
}

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
    public_profile_enabled:bot.publicProfileEnabled===true && bot.visibility==='public' && bot.status==='enabled',
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
    time_zone:String(bot.timeZone||bot.activitySchedule?.timezone||'America/Jamaica'),
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
  const result=await persistAiIdentities(bots.map(canonicalAiIdentity));
  assertAiPersistenceResult(result,'Canonical AI identities');
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
    const result=await persistAiBotTasks(normalized.slice(offset,offset+100));
    assertAiPersistenceResult(result,'Canonical AI task records');
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
  const result=await persistAiBotSettings(canonicalAiBotSettings(settings));
  assertAiPersistenceResult(result,'Canonical AI network settings');
}
import {
  ensurePersonalAiBotCollections,
  getPersonalAiBotCategories,
  getPersonalAiBotDepartments,
  PERSONAL_AI_BOT_JOB_POSITIONS,
  getPersonalAiBotVacancies,
  createPersonalAiBotVacancy,
  updatePersonalAiBotVacancy,
  getPersonalAiBotApplications,
  createPersonalAiBotApplication,
  updatePersonalAiBotApplication,
  getPersonalAiBotAppointments,
  getPersonalAiBotEmploymentHistory,
  createPersonalAiBotAppointment,
  createPersonalAiBotDepartment,
  updatePersonalAiBotDepartment,
  getPersonalAiBotOverview,
  createPersonalAiBot,
  createPersonalAiBotStarterSet,
  updatePersonalAiBot,
  previewPersonalAiBotSchedule,
  listPersonalAiBotPersonaVersions,
  createPersonalAiBotPersonaDraft,
  updatePersonalAiBotPersonaDraft,
  evaluatePersonalAiBotPersonaDraft,
  approvePersonalAiBotPersonaVersion,
  activatePersonalAiBotPersonaVersion,
  rollbackPersonalAiBotPersonaVersion,
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
  getPersonalAiBotTeamHandoffs,
  createPersonalAiBotTeamHandoff,
  reviewPersonalAiBotTeamHandoff,
  PERSONAL_AI_BOT_CATEGORIES
} from './personal-ai-bots-service.js';

export async function handlePersonalAiBotsAdminApi(context) {
  const {req,res,url,method,path,user,input,db,saveStore,uid,now,json,isOwnerAdmin,isSameOriginWrite,lookupAdminMember,persistAiIdentities,listAiIdentities,persistAiBotTasks,listAiBotTasks,getAiBotTaskStats,persistAiBotSettings,persistAiProviderAssignment,listAiProviderAssignments,listAiProviderRuntime,persistAiEmailIdentity,listAiEmailIdentities,listAiIdentityReports,reviewAiIdentityReport}=context;
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
      const identityRecords=typeof listAiIdentities==='function'?await listAiIdentities({limit:100,offset:0}):null;
      const durableTasks=typeof listAiBotTasks==='function'?await listAiBotTasks({limit:100,offset:0}):null;
      const durableTaskStats=typeof getAiBotTaskStats==='function'?await getAiBotTaskStats():null;
      const providerAssignments=typeof listAiProviderAssignments==='function'?await listAiProviderAssignments({limit:100,offset:0}):null;
      const emailIdentities=typeof listAiEmailIdentities==='function'?await listAiEmailIdentities({limit:100,offset:0}):null;
      const safetyReports=typeof listAiIdentityReports==='function'?await listAiIdentityReports({status:'open',limit:100,offset:0}):null;
      return (json(res,200,{
        ...overview,
        identityRecords:Array.isArray(identityRecords)?identityRecords:[],
        identityRecordsSource:Array.isArray(identityRecords)?'minglora_supabase_postgresql':'legacy_runtime_state',
        identityRecordsNextOffset:Array.isArray(identityRecords)?identityRecords.length:0,
        identityRecordsHasMore:Array.isArray(identityRecords)&&identityRecords.length===100,
        taskRecordsSource:Array.isArray(durableTasks)?'minglora_supabase_postgresql':'legacy_runtime_state',
        tasksNextOffset:Array.isArray(durableTasks)?durableTasks.length:0,
        tasksHasMore:Array.isArray(durableTasks)&&durableTasks.length===100,
        taskQueueStats:durableTaskStats&&typeof durableTaskStats==='object'?durableTaskStats:null,
        providerAssignments:Array.isArray(providerAssignments)?safeProviderAssignmentRecords(providerAssignments):[],
        providerAssignmentsSource:Array.isArray(providerAssignments)?'minglora_supabase_postgresql':'unavailable',
        emailIdentities:Array.isArray(emailIdentities)?emailIdentities:[],
        emailIdentitiesSource:Array.isArray(emailIdentities)?'minglora_supabase_postgresql':'unavailable',
        providerAssignmentsNextOffset:Array.isArray(providerAssignments)?providerAssignments.length:0,
        providerAssignmentsHasMore:Array.isArray(providerAssignments)&&providerAssignments.length===100,
        emailIdentitiesNextOffset:Array.isArray(emailIdentities)?emailIdentities.length:0,
        emailIdentitiesHasMore:Array.isArray(emailIdentities)&&emailIdentities.length===100,
        safetyReports:Array.isArray(safetyReports)?safetyReports:[],
        safetyReportsSource:Array.isArray(safetyReports)?'minglora_supabase_postgresql':'unavailable',
        safetyReportsNextOffset:Array.isArray(safetyReports)?safetyReports.length:0,
        safetyReportsHasMore:Array.isArray(safetyReports)&&safetyReports.length===100,
        categories:getPersonalAiBotCategories(db),
        departments:getPersonalAiBotDepartments(db),
        jobPositions:PERSONAL_AI_BOT_JOB_POSITIONS,
        vacancies:getPersonalAiBotVacancies(db),
        applications:getPersonalAiBotApplications(db),
        appointments:getPersonalAiBotAppointments(db),
        employmentHistory:getPersonalAiBotEmploymentHistory(db),
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

    if(method==='GET'&&path===root+'/tasks'){
      if(typeof listAiBotTasks!=='function')return (json(res,503,{error:'Durable AI task storage is unavailable.'}),true);
      const limit=Number(url.searchParams.get('limit')||100);
      const offset=Number(url.searchParams.get('offset')||0);
      if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>1000000000){
        return (json(res,400,{error:'AI task pagination is invalid.'}),true);
      }
      const result=await listAiBotTasks({limit,offset});
      if(!Array.isArray(result))return (json(res,503,{error:'Durable AI task storage is unavailable.'}),true);
      return (json(res,200,{ok:true,tasks:result,nextOffset:offset+result.length,hasMore:result.length===limit}),true);
    }
    if(method==='GET'&&path===root+'/tasks'){
      if(typeof listAiBotTasks!=='function')return (json(res,503,{error:'Durable AI task storage is unavailable.'}),true);
      const limit=Number(url.searchParams.get('limit')||100);
      const offset=Number(url.searchParams.get('offset')||0);
      if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>1000000000){
        return (json(res,400,{error:'AI task pagination is invalid.'}),true);
      }
      const result=await listAiBotTasks({limit,offset});
      if(!Array.isArray(result))return (json(res,503,{error:'Durable AI task storage is unavailable.'}),true);
      return (json(res,200,{ok:true,tasks:result,nextOffset:offset+result.length,hasMore:result.length===limit}),true);
    }
    if(method==='GET'&&path===root+'/batches'){
      const limit=Number(url.searchParams.get('limit')||50);
      const offset=Number(url.searchParams.get('offset')||0);
      if(!Number.isInteger(limit)||limit<1||limit>100||
         !Number.isInteger(offset)||offset<0||offset>1000000000){
        return (json(res,400,{error:'AI identity batch history pagination is invalid.'}),true);
      }
      const ownedBatches=db.personalAiBotBatches
        .filter(batch=>batch.ownerId===user.id)
        .slice()
        .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||String(b.id||'').localeCompare(String(a.id||'')));
      const batches=ownedBatches.slice(offset,offset+limit);
      return (json(res,200,{
        ok:true,batches,nextOffset:offset+batches.length,hasMore:offset+batches.length<ownedBatches.length
      }),true);
    }
    if(method==='POST'&&path===root+'/batches'){
      if(typeof persistAiIdentities!=='function'){
        return (json(res,503,{error:'Canonical AI identity persistence is unavailable; no batch was created.'}),true);
      }
      const allowedRequestKeys=new Set(['idempotencyKey','items']);
      if(!input||typeof input!=='object'||Array.isArray(input)||
         Object.keys(input).some(key=>!allowedRequestKeys.has(key))){
        return (json(res,400,{error:'AI identity batch request contains unsupported fields.'}),true);
      }
      const idempotencyKey=String(input.idempotencyKey||'').trim();
      const items=input.items;
      if(!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$/.test(idempotencyKey)||
         !Array.isArray(items)||items.length<1||items.length>100){
        return (json(res,400,{error:'Provide an idempotency key and between 1 and 100 AI identity records.'}),true);
      }
      const requestHash=createHash('sha256').update(JSON.stringify(items)).digest('hex');
      let batch=db.personalAiBotBatches.find(item=>item.ownerId===user.id&&item.idempotencyKey===idempotencyKey)||null;
      let bots=[];
      let isNewBatch=false;
      let previousBatch=null;
      let previousCollections=null;
      if(batch){
        if(batch.requestHash!==requestHash){
          return (json(res,409,{error:'This idempotency key was already used for a different AI identity batch.'}),true);
        }
        const identityIds=Array.isArray(batch.identityIds)?batch.identityIds:[];
        const identitiesById=new Map(db.personalAiBots.map(item=>[String(item.id),item]));
        bots=identityIds.map(id=>identitiesById.get(String(id))).filter(Boolean);
        if(bots.length!==identityIds.length){
          return (json(res,409,{error:'One or more saved AI identity records are missing; this batch cannot be retried safely.'}),true);
        }
        if(['completed','completed_with_errors'].includes(batch.status)){
          return (json(res,200,{ok:true,replayed:true,batch,results:Array.isArray(batch.results)?batch.results:[]}),true);
        }
        previousBatch={...batch,results:Array.isArray(batch.results)?batch.results.map(item=>({...item})):[]};
        batch.status='pending_persistence';
        batch.retryCount=Number(batch.retryCount||0)+1;
        batch.updatedAt=stamp;
        batch.lastErrorCode=null;
        batch.results=(batch.results||[]).map(result=>result.status==='retryable_failed'
          ?{...result,status:'created_pending_persistence'}:result);
      }else{
        const allowedItemKeys=new Set([
          'displayName','firstName','middleName','lastName','categoryId','population','identityType',
          'bio','description','introduction','gender','genderPresentation','nationality',
          'countryOfOrigin','currentCountry','originCountryCode','currentCountryCode','timeZone',
          'personality','communicationStyle','interests','hobbies','education','profession','skills',
          'locations','avatarStorageReference','coverStorageReference','voicePreferences',
          'avatarPreferences','memoryEnabled','memoryConfiguration','capabilities','languages',
          'administratorInstructions'
        ]);
        const normalizeName=value=>String(value||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('en');
        const names=new Set(db.personalAiBots.map(bot=>String(bot.categoryId||'')+'::'+normalizeName(bot.displayName)));
        const stagedDb={
          ...db,
          personalAiBots:db.personalAiBots.slice(),
          personalAiBotAudit:db.personalAiBotAudit.slice(),
          personalAiBotBatches:db.personalAiBotBatches.slice()
        };
        const batchId=uid();
        const results=[];
        bots=[];
        for(let index=0;index<items.length;index++){
          const item=items[index];
          const fail=(errorCode,message,status=400)=>results.push({
            index:index+1,status:'failed',errorCode,message:String(message||'This identity record is invalid.').slice(0,240),httpStatus:status
          });
          if(!item||typeof item!=='object'||Array.isArray(item)){
            fail('INVALID_RECORD','Each batch item must be a JSON object.');
            continue;
          }
          if(Object.keys(item).some(key=>!allowedItemKeys.has(key))){
            fail('UNSUPPORTED_FIELDS','This record contains unsupported or sensitive fields.');
            continue;
          }
          const normalized={...item};
          if(!String(normalized.displayName||'').trim()&&normalized.firstName&&normalized.lastName){
            normalized.displayName=[normalized.firstName,normalized.middleName,normalized.lastName].filter(Boolean).join(' ');
          }
          if(!String(normalized.displayName||'').trim()||!String(normalized.categoryId||'').trim()){
            fail('REQUIRED_FIELDS','A display name and category are required.');
            continue;
          }
          const signature=String(normalized.categoryId)+'::'+normalizeName(normalized.displayName);
          if(names.has(signature)){
            fail('DUPLICATE_IDENTITY','An identity with this name already exists in the selected category.',409);
            continue;
          }
          try{
            const bot=createPersonalAiBot(stagedDb,normalized,user.id,stamp,uid);
            bot.batchId=batchId;
            bots.push(bot);
            names.add(signature);
            results.push({index:index+1,status:'created_pending_persistence',identityId:bot.id});
          }catch(error){
            fail(error.status===409?'CONFLICT':'VALIDATION_FAILED',error.message||'Identity validation failed.',error.status||400);
          }
        }
        batch={
          id:batchId,ownerId:user.id,idempotencyKey,requestHash,
          identityIds:bots.map(bot=>bot.id),
          totalRecords:items.length,createdRecords:bots.length,
          completedRecords:0,failedRecords:results.filter(result=>result.status==='failed').length,
          retryCount:0,status:'pending_persistence',results,
          lastErrorCode:null,createdAt:stamp,updatedAt:stamp,completedAt:null
        };
        stagedDb.personalAiBotBatches.push(batch);
        previousCollections={
          personalAiBots:db.personalAiBots,
          personalAiBotAudit:db.personalAiBotAudit,
          personalAiBotBatches:db.personalAiBotBatches
        };
        db.personalAiBots=stagedDb.personalAiBots;
        db.personalAiBotAudit=stagedDb.personalAiBotAudit;
        db.personalAiBotBatches=stagedDb.personalAiBotBatches;
        isNewBatch=true;
      }
      const batchSummary=()=>{
        const {id,totalRecords,createdRecords,completedRecords,failedRecords,retryCount,status,identityIds,createdAt,completedAt}=batch;
        return {id,totalRecords,createdRecords,completedRecords,failedRecords,retryCount,status,identityIds,createdAt,completedAt};
      };
      try{
        await saveStore();
      }catch(error){
        if(isNewBatch&&previousCollections){
          db.personalAiBots=previousCollections.personalAiBots;
          db.personalAiBotAudit=previousCollections.personalAiBotAudit;
          db.personalAiBotBatches=previousCollections.personalAiBotBatches;
        }else if(batch&&previousBatch){
          Object.assign(batch,previousBatch);
        }
        return (json(res,503,{error:'AI identity batch checkpoint could not be saved; canonical persistence was not attempted.'}),true);
      }
      try{
        if(bots.length)await persistCanonicalIdentities(bots,persistAiIdentities);
      }catch(error){
        batch.status='retryable_failed';
        batch.lastErrorCode='CANONICAL_PERSISTENCE_FAILED';
        batch.updatedAt=now();
        batch.results=(batch.results||[]).map(result=>result.status==='created_pending_persistence'
          ?{...result,status:'retryable_failed',errorCode:'CANONICAL_PERSISTENCE_FAILED',message:'Canonical PostgreSQL persistence failed; retry the same batch.'}
          :result);
        batch.failedRecords=batch.results.filter(result=>['failed','retryable_failed'].includes(result.status)).length;
        try{await saveStore();}catch{}
        return (json(res,503,{
          error:'AI identity batch was saved for recovery, but canonical PostgreSQL persistence failed. Retry with the same idempotency key and identical records.',
          batch:batchSummary(),results:batch.results
        }),true);
      }
      batch.results=(batch.results||[]).map(result=>result.status==='created_pending_persistence'
        ?{...result,status:'persisted'}:result);
      batch.completedRecords=bots.length;
      batch.failedRecords=batch.results.filter(result=>result.status==='failed').length;
      batch.status=batch.failedRecords?'completed_with_errors':'completed';
      batch.lastErrorCode=null;
      batch.completedAt=now();
      batch.updatedAt=batch.completedAt;
      await saveStore();
      return (json(res,isNewBatch?201:200,{
        ok:true,replayed:false,batch:batchSummary(),results:batch.results,bots
      }),true);
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
    const teamHandoffsMatch=path.match(/^\/api\/admin\/personal-ai-bots\/teams\/([0-9a-f-]{36})\/handoffs$/i);
    if(teamHandoffsMatch&&method==='GET'){
      const handoffs=getPersonalAiBotTeamHandoffs(db,teamHandoffsMatch[1],user.id);
      return (json(res,200,{ok:true,handoffs}),true);
    }
    if(teamHandoffsMatch&&method==='POST'){
      const allowed=new Set(['sourceTaskId','senderBotId','receivingBotId','summary','requiredInput','expectedOutput','contextScope','deadlineAt']);
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.has(key))){
        return (json(res,400,{error:'Team handoff payload contains unsupported fields.'}),true);
      }
      const handoff=createPersonalAiBotTeamHandoff(db,teamHandoffsMatch[1],input,user.id,stamp,uid);
      await saveStore();
      return (json(res,201,{ok:true,handoff}),true);
    }
    const teamHandoffActionMatch=path.match(/^\/api\/admin\/personal-ai-bots\/teams\/([0-9a-f-]{36})\/handoffs\/([0-9a-f-]{36})\/(accept|reject|cancel|complete)$/i);
    if(teamHandoffActionMatch&&method==='POST'){
      const action=teamHandoffActionMatch[3];
      const allowed=action==='complete'?new Set(['resultSummary']):new Set();
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.has(key))){
        return (json(res,400,{error:'Team handoff action contains unsupported fields.'}),true);
      }
      const handoff=reviewPersonalAiBotTeamHandoff(
        db,teamHandoffActionMatch[1],teamHandoffActionMatch[2],
        {action,...input},user.id,stamp,uid
      );
      await saveStore();
      return (json(res,200,{ok:true,handoff}),true);
    }

    if(method==='GET'&&path===root+'/applications'){
      return (json(res,200,{ok:true,applications:getPersonalAiBotApplications(db)}),true);
    }
    if(method==='POST'&&path===root+'/applications'){
      const allowed=new Set(['vacancyId','identityId']);
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.has(key))){
        return (json(res,400,{error:'Candidate application payload contains unsupported fields.'}),true);
      }
      const application=createPersonalAiBotApplication(db,input,user.id,stamp,uid);
      await saveStore();
      return (json(res,201,{ok:true,application}),true);
    }
    const applicationMatch=path.match(/^\/api\/admin\/personal-ai-bots\/applications\/([a-z0-9_-]+)$/i);
    if(applicationMatch&&method==='PATCH'){
      const allowed=new Set(['status']);
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.has(key))||!Object.keys(input).length){
        return (json(res,400,{error:'Candidate application update contains unsupported or missing fields.'}),true);
      }
      const application=updatePersonalAiBotApplication(db,applicationMatch[1],input,user.id,stamp,uid);
      await saveStore();
      return (json(res,200,{ok:true,application}),true);
    }

    if(method==='GET'&&path===root+'/appointments'){
      return (json(res,200,{ok:true,appointments:getPersonalAiBotAppointments(db)}),true);
    }
    if(method==='GET'&&path===root+'/employment-history'){
      return (json(res,200,{ok:true,events:getPersonalAiBotEmploymentHistory(db)}),true);
    }
    if(method==='POST'&&path===root+'/appointments'){
      const allowed=new Set(['applicationId','reportingManagerAppointmentId']);
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.has(key))||
         !String(input.applicationId||'').trim()){
        return (json(res,400,{error:'Appointment requests require a shortlisted candidate application and only supported reporting fields.'}),true);
      }
      const appointment=createPersonalAiBotAppointment(db,input,user.id,stamp,uid);
      await saveStore();
      return (json(res,201,{ok:true,appointment}),true);
    }

    if(method==='GET'&&path===root+'/vacancies'){
      return (json(res,200,{ok:true,vacancies:getPersonalAiBotVacancies(db)}),true);
    }
    if(method==='POST'&&path===root+'/vacancies'){
      const allowed=new Set(['positionCode','departmentId','title','description','requirements','slots']);
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.has(key))){
        return (json(res,400,{error:'Vacancy payload contains unsupported fields.'}),true);
      }
      const vacancy=createPersonalAiBotVacancy(db,input,user.id,stamp,uid);
      await saveStore();
      return (json(res,201,{ok:true,vacancy}),true);
    }
    const vacancyMatch=path.match(/^\/api\/admin\/personal-ai-bots\/vacancies\/([a-z0-9_-]+)$/i);
    if(vacancyMatch&&method==='PATCH'){
      const allowed=new Set(['title','description','requirements','slots','status']);
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.has(key))||!Object.keys(input).length){
        return (json(res,400,{error:'Vacancy update contains unsupported or missing fields.'}),true);
      }
      const vacancy=updatePersonalAiBotVacancy(db,vacancyMatch[1],input,user.id,stamp,uid);
      await saveStore();
      return (json(res,200,{ok:true,vacancy}),true);
    }
    if(vacancyMatch&&method==='DELETE'){
      const vacancy=updatePersonalAiBotVacancy(db,vacancyMatch[1],{status:'closed'},user.id,stamp,uid);
      await saveStore();
      return (json(res,200,{ok:true,vacancy}),true);
    }

    if(method==='GET'&&path===root+'/departments'){
      return (json(res,200,{ok:true,departments:getPersonalAiBotDepartments(db)}),true);
    }
    if(method==='POST'&&path===root+'/departments'){
      const allowed=new Set(['name','description','parentDepartmentId']);
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.has(key))){
        return (json(res,400,{error:'Department payload contains unsupported fields.'}),true);
      }
      const department=createPersonalAiBotDepartment(db,input,user.id,stamp,uid);
      await saveStore();
      return (json(res,201,{ok:true,department}),true);
    }
    const departmentMatch=path.match(/^\/api\/admin\/personal-ai-bots\/departments\/([a-z0-9_-]+)$/i);
    if(departmentMatch&&method==='PATCH'){
      const allowed=new Set(['name','description','enabled','parentDepartmentId']);
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!allowed.has(key))||!Object.keys(input).length){
        return (json(res,400,{error:'Department update contains unsupported or missing fields.'}),true);
      }
      const department=updatePersonalAiBotDepartment(db,departmentMatch[1],input,user.id,stamp,uid);
      await saveStore();
      return (json(res,200,{ok:true,department}),true);
    }
    if(departmentMatch&&method==='DELETE'){
      const department=updatePersonalAiBotDepartment(db,departmentMatch[1],{enabled:false},user.id,stamp,uid);
      await saveStore();
      return (json(res,200,{ok:true,department}),true);
    }

    if(method==='POST'&&path===root+'/categories'){
      const category=createPersonalAiBotCategory(db,input||{},user.id,stamp,uid);
      await saveStore();
      return (json(res,201,{ok:true,category}),true);
    }
    if(method==='GET'&&path===root+'/identities'){
      if(typeof listAiIdentities!=='function')return (json(res,503,{error:'Canonical AI identity storage is unavailable.'}),true);
      const limit=Number(url.searchParams.get('limit')||100);
      const offset=Number(url.searchParams.get('offset')||0);
      if(!Number.isInteger(limit)||limit<1||limit>1000||!Number.isInteger(offset)||offset<0||offset>1000000000){
        return (json(res,400,{error:'Canonical AI identity pagination is invalid.'}),true);
      }
      const result=await listAiIdentities({limit,offset});
      if(!Array.isArray(result))return (json(res,503,{error:'Canonical AI identity storage is unavailable.'}),true);
      return (json(res,200,{ok:true,identities:result,nextOffset:offset+result.length,hasMore:result.length===limit}),true);
    }
    if(method==='GET'&&path===root+'/safety/reports'){
      if(typeof listAiIdentityReports!=='function')return (json(res,503,{error:'AI report review storage is unavailable.'}),true);
      const status=String(url.searchParams.get('status')||'pending');
      const limit=Number(url.searchParams.get('limit')||100);
      const offset=Number(url.searchParams.get('offset')||0);
      if(!['all','open','pending','in_review','actioned','dismissed'].includes(status)||
         !Number.isInteger(limit)||limit<1||limit>200||
         !Number.isInteger(offset)||offset<0||offset>1000000000){
        return (json(res,400,{error:'AI report status filter or pagination is invalid.'}),true);
      }
      const result=await listAiIdentityReports({status,limit,offset});
      const reports=Array.isArray(result)?result:[];
      return (json(res,200,{ok:true,reports,nextOffset:offset+reports.length,hasMore:reports.length===limit}),true);
    }
    const safetyReportMatch=path.match(/^\/api\/admin\/personal-ai-bots\/safety\/reports\/([0-9a-f-]{36})$/i);
    if(safetyReportMatch&&method==='PATCH'){
      if(typeof reviewAiIdentityReport!=='function')return (json(res,503,{error:'AI report review storage is unavailable.'}),true);
      const status=String(input?.status||'');
      const resolutionNote=String(input?.resolutionNote||'').trim();
      if(!['in_review','actioned','dismissed'].includes(status)||resolutionNote.length>1200){
        return (json(res,400,{error:'AI report review fields are invalid.'}),true);
      }
      const report=await reviewAiIdentityReport({reportId:safetyReportMatch[1],status,resolutionNote});
      await saveStore();
      return (json(res,200,{ok:true,report}),true);
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
    if(method==='GET'&&path===root+'/provider-runtime'){
      if(typeof listAiProviderRuntime!=='function')return (json(res,503,{error:'Provider runtime configuration is unavailable.'}),true);
      const limit=Number(url.searchParams.get('limit')||100);
      const offset=Number(url.searchParams.get('offset')||0);
      if(!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(offset)||offset<0||offset>1000000000){
        return (json(res,400,{error:'Provider runtime pagination is invalid.'}),true);
      }
      const result=await listAiProviderRuntime({limit,offset});
      if(!Array.isArray(result))return (json(res,503,{error:'Provider runtime configuration is unavailable.'}),true);
      const assignments=safeProviderAssignmentRecords(result);
      return (json(res,200,{ok:true,assignments,nextOffset:offset+assignments.length,hasMore:assignments.length===limit}),true);
    }
    if(method==='GET'&&path===root+'/providers'){
      if(typeof listAiProviderAssignments!=='function')return (json(res,503,{error:'AI provider assignment storage is unavailable.'}),true);
      const limit=Number(url.searchParams.get('limit')||100);
      const offset=Number(url.searchParams.get('offset')||0);
      if(!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(offset)||offset<0||offset>1000000000){
        return (json(res,400,{error:'AI provider assignment pagination is invalid.'}),true);
      }
      const result=await listAiProviderAssignments({limit,offset});
      if(!Array.isArray(result))return (json(res,503,{error:'AI provider assignment storage is unavailable.'}),true);
      // Never return a server-side secret reference to the browser.
      const assignments=safeProviderAssignmentRecords(result);
      return (json(res,200,{ok:true,assignments,nextOffset:offset+assignments.length,hasMore:assignments.length===limit}),true);
    }
    if(method==='GET'&&path===root+'/emails'){
      if(typeof listAiEmailIdentities!=='function')return (json(res,503,{error:'AI email identity storage is unavailable.'}),true);
      const limit=Number(url.searchParams.get('limit')||100);
      const offset=Number(url.searchParams.get('offset')||0);
      if(!Number.isInteger(limit)||limit<1||limit>500||!Number.isInteger(offset)||offset<0||offset>1000000000){
        return (json(res,400,{error:'AI email identity pagination is invalid.'}),true);
      }
      const result=await listAiEmailIdentities({limit,offset});
      if(!Array.isArray(result))return (json(res,503,{error:'AI email identity storage is unavailable.'}),true);
      return (json(res,200,{ok:true,emails:result,nextOffset:offset+result.length,hasMore:result.length===limit}),true);
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
      return (json(res,201,{ok:true,assignment:safeProviderAssignmentRecords([saved])[0], message:'Provider/model assignment saved as unverified. A real provider credential and server-side health check are still required before dispatch.'}),true);
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
    const schedulePreviewMatch=path.match(/^\/api\/admin\/personal-ai-bots\/bots\/([0-9a-f-]{36})\/schedule-preview$/i);
    if(schedulePreviewMatch&&method==='GET'){
      const bot=db.personalAiBots.find(item=>item.id===schedulePreviewMatch[1]);
      if(!bot)return (json(res,404,{error:'Bot not found.'}),true);
      const days=Number(url.searchParams.get('days')||14);
      const from=url.searchParams.get('from')||stamp;
      const preview=previewPersonalAiBotSchedule(bot.activitySchedule||{
        timezone:'America/Jamaica',daysOfWeek:[1,2,3,4,5,6,7],
        startTime:'00:00',endTime:'23:59',maxTasksPerDay:0
      },{from,days});
      const network=db.personalAiBotSettings.find(item=>item.id==='global');
      return (json(res,200,{
        ok:true,botId:bot.id,botStatus:bot.status,preview,
        configurationGates:{
          botEnabled:bot.status==='enabled',
          globalNetworkEnabled:network?.enabled===true,
          dailyTaskLimitConfigured:preview.dailyTaskLimit>0,
          schedulerConnected:false,
          dispatchEnabled:false
        }
      }),true);
    }
    if(method==='GET'&&path===root+'/personas'){
      const botId=String(url.searchParams.get('botId')||'').trim();
      if(!botId)return (json(res,400,{error:'A bot ID is required to list persona versions.'}),true);
      const versions=listPersonalAiBotPersonaVersions(db,botId);
      const bot=db.personalAiBots.find(item=>item.id===botId);
      return (json(res,200,{
        ok:true,botId,activePersonaVersionId:bot.activePersonaVersionId||null,
        versions
      }),true);
    }
    if(method==='POST'&&path===root+'/personas'){
      const allowed=new Set(['botId','baseVersionId','configuration']);
      if(!input||typeof input!=='object'||Array.isArray(input)||
         Object.keys(input).some(key=>!allowed.has(key))||
         !String(input.botId||'').trim()){
        return (json(res,400,{error:'Persona draft payload contains unsupported or missing fields.'}),true);
      }
      const version=createPersonalAiBotPersonaDraft(db,input,user.id,stamp,uid);
      await saveStore();
      return (json(res,201,{ok:true,version}),true);
    }
    const personaVersionMatch=path.match(/^\/api\/admin\/personal-ai-bots\/personas\/([0-9a-f-]{36})$/i);
    if(personaVersionMatch&&method==='PATCH'){
      const allowed=new Set(['configuration']);
      if(!input||typeof input!=='object'||Array.isArray(input)||
         Object.keys(input).some(key=>!allowed.has(key))||!input.configuration){
        return (json(res,400,{error:'Persona draft update must contain only a configuration object.'}),true);
      }
      const version=updatePersonalAiBotPersonaDraft(db,personaVersionMatch[1],input.configuration,user.id,stamp,uid);
      await saveStore();
      return (json(res,200,{ok:true,version}),true);
    }
    const personaActionMatch=path.match(/^\/api\/admin\/personal-ai-bots\/personas\/([0-9a-f-]{36})\/(evaluate|approve|activate|rollback)$/i);
    if(personaActionMatch&&method==='POST'){
      if(input&&typeof input==='object'&&Object.keys(input).length){
        return (json(res,400,{error:'Persona lifecycle actions do not accept additional fields.'}),true);
      }
      const versionId=personaActionMatch[1],action=personaActionMatch[2];
      let result;
      if(action==='evaluate')result=evaluatePersonalAiBotPersonaDraft(db,versionId,user.id,stamp,uid);
      else if(action==='approve')result={version:approvePersonalAiBotPersonaVersion(db,versionId,user.id,stamp,uid)};
      else if(action==='activate')result=activatePersonalAiBotPersonaVersion(db,versionId,user.id,stamp,uid);
      else result=rollbackPersonalAiBotPersonaVersion(db,versionId,user.id,stamp,uid);
      await saveStore();
      return (json(res,200,{ok:true,action,...result}),true);
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
