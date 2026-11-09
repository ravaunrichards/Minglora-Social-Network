import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePersonalAiBotsAdminApi } from '../../backend/modules/personal-ai-bots/admin-api.js';

const makeContext=(overrides={})=>{
  const response={statusCode:null,payload:null};
  const context={
    req:{},res:response,url:new URL('https://minglora.test/api/admin/personal-ai-bots'),
    method:'GET',path:'/api/admin/personal-ai-bots',user:{id:'owner-1'},
    input:{},db:{},saveStore:async()=>{},uid:()=> '00000000-0000-4000-8000-000000000001',
    now:()=> '2026-11-09T10:00:00.000Z',
    json:(res,status,payload)=>{res.statusCode=status;res.payload=payload;return true;},
    isOwnerAdmin:true,isSameOriginWrite:true,
    ...overrides
  };
  return context;
};

test('Personal AI Bots admin API denies non-owner identities before initializing data',async()=>{
  const context=makeContext({isOwnerAdmin:false});
  const handled=await handlePersonalAiBotsAdminApi(context);
  assert.equal(handled,true);
  assert.equal(context.res.statusCode,403);
  assert.match(context.res.payload.error,/designated MFA-verified Minglora owner/);
  assert.equal(context.db.personalAiBots,undefined);
});

test('Personal AI Bots admin API blocks cross-origin writes',async()=>{
  const context=makeContext({method:'POST',path:'/api/admin/personal-ai-bots',isSameOriginWrite:false});
  const handled=await handlePersonalAiBotsAdminApi(context);
  assert.equal(handled,true);
  assert.equal(context.res.statusCode,403);
  assert.equal(context.db.personalAiBots,undefined);
});

test('owner overview returns the requested categories without fabricated bots or activity',async()=>{
  const context=makeContext();
  const handled=await handlePersonalAiBotsAdminApi(context);
  assert.equal(handled,true);
  assert.equal(context.res.statusCode,200);
  assert.equal(context.res.payload.categories.length,15);
  assert.equal(context.res.payload.bots.length,0);
  assert.equal(context.res.payload.tasks.length,0);
  assert.equal(context.res.payload.network.enabled,false);
});

test('owner creation persists a normalized identity record with separate name fields',async()=>{
  let persisted=null,saves=0;
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots',
    input:{
      displayName:'Minglora AI Companion',
      firstName:'Minglora',middleName:'AI',lastName:'Companion',
      categoryId:'ai-friends',languages:['English','Jamaican Patois']
    },
    persistAiIdentities:async identities=>{persisted=identities;},
    saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,201);
  assert.equal(persisted.length,1);
  assert.equal(persisted[0].first_name,'Minglora');
  assert.equal(persisted[0].middle_name,'AI');
  assert.equal(persisted[0].last_name,'Companion');
  assert.equal(persisted[0].population,'independent');
  assert.equal(persisted[0].status,'created');
  assert.deepEqual(persisted[0].languages,['English','Jamaican Patois']);
  assert.equal(context.db.users,undefined);
  assert.equal(saves,1);
});

test('owner overview reads canonical identity rows from the persistence callback',async()=>{
  const row={id:'ai-1',firstName:'Minglora',middleName:'AI',lastName:'Companion',username:'ai_minglora_companion',population:'independent',status:'created'};
  const context=makeContext({listAiIdentities:async options=>{
    assert.deepEqual(options,{limit:1000,offset:0});
    return [row];
  }});
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,200);
  assert.equal(context.res.payload.identityRecordsSource,'minglora_supabase_postgresql');
  assert.deepEqual(context.res.payload.identityRecords,[row]);
});

test('identity persistence failure prevents the admin API from reporting successful creation',async()=>{
  let saves=0;
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots',
    input:{displayName:'Minglora AI',firstName:'Minglora',lastName:'AI',categoryId:'ai-friends'},
    persistAiIdentities:async()=>{throw Object.assign(new Error('Canonical identity storage unavailable.'),{status:503});},
    saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,503);
  assert.equal(saves,0);
});

test('owner can create the disabled starter set; no runtime worker is started',async()=>{
  let saves=0;
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/starter-set',
    saveStore:async()=>{saves++;}
  });
  const handled=await handlePersonalAiBotsAdminApi(context);
  assert.equal(handled,true);
  assert.equal(context.res.statusCode,201);
  assert.equal(context.res.payload.created,15);
  assert.equal(context.res.payload.bots.every(bot=>bot.status==='disabled'&&bot.enabled===false),true);
  assert.equal(context.res.payload.bots.every(bot=>bot.requiresApprovalForPublishing===true),true);
  assert.equal(saves,1);
});


test('owner emergency shutdown pauses configured bots and cancels queued instructions',async()=>{
  let saves=0;
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/emergency-shutdown',
    db:{
      personalAiBots:[{id:'bot-1',status:'enabled',enabled:true}],
      personalAiBotTasks:[{id:'task-1',botId:'bot-1',status:'awaiting_administrator_approval'}]
    },
    saveStore:async()=>{saves++;}
  });
  const handled=await handlePersonalAiBotsAdminApi(context);
  assert.equal(handled,true);
  assert.equal(context.res.statusCode,200);
  assert.equal(context.res.payload.paused,1);
  assert.equal(context.res.payload.cancelled,1);
  assert.equal(context.db.personalAiBots[0].status,'paused');
  assert.equal(context.db.personalAiBotTasks[0].status,'cancelled');
  assert.equal(saves,1);
});

test('owner bulk bot controls are limited to selected bot records',async()=>{
  let saves=0;
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/bots/bulk',
    input:{botIds:['bot-1'],status:'paused'},
    db:{personalAiBots:[{id:'bot-1',status:'enabled',enabled:true}]},
    saveStore:async()=>{saves++;}
  });
  const handled=await handlePersonalAiBotsAdminApi(context);
  assert.equal(handled,true);
  assert.equal(context.res.statusCode,200);
  assert.equal(context.res.payload.updated,1);
  assert.equal(context.db.personalAiBots[0].status,'paused');
  assert.equal(saves,1);
});


test('owner can create and retrieve a bot team without activating bots',async()=>{
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/teams',
    input:{name:'Learning Team',description:'Multilingual education assistants.'}
  });
  const handled=await handlePersonalAiBotsAdminApi(context);
  assert.equal(handled,true);
  assert.equal(context.res.statusCode,201);
  assert.equal(context.res.payload.team.name,'Learning Team');
  assert.equal(context.db.personalAiBotTeams.length,1);
  assert.equal(context.res.payload.team.enabled,true);
});

test('owner can assign and remove team members using owner-scoped routes',async()=>{
  const owner='owner-1';
  const teamId='00000000-0000-4000-8000-000000000010';
  const botId='00000000-0000-4000-8000-000000000011';
  const db={
    personalAiBotTeams:[{id:teamId,ownerId:owner,name:'Learning Team',status:'enabled',enabled:true}],
    personalAiBots:[{id:botId,createdBy:owner,displayName:'AI Tutor',status:'disabled',enabled:false}],
    personalAiBotTeamMembers:[]
  };
  let saves=0;
  const add=makeContext({method:'POST',path:'/api/admin/personal-ai-bots/teams/'+teamId+'/members',input:{botIds:[botId]},db,saveStore:async()=>{saves++;}});
  await handlePersonalAiBotsAdminApi(add);
  assert.equal(add.res.statusCode,200);
  assert.equal(add.res.payload.added,1);
  assert.equal(add.db.personalAiBots[0].enabled,false);
  const remove=makeContext({method:'DELETE',path:'/api/admin/personal-ai-bots/teams/'+teamId+'/members/'+botId,db,saveStore:async()=>{saves++;}});
  await handlePersonalAiBotsAdminApi(remove);
  assert.equal(remove.res.statusCode,200);
  assert.equal(remove.db.personalAiBotTeamMembers.length,0);
  assert.equal(saves,2);
});


test('owner can queue selected AI bot follow instructions with separate approval and no human follow records',async()=>{
  let saves=0;
  const owner='owner-1', target='member-target';
  const botIds=[
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000102'
  ];
  const db={
    personalAiBotSettings:[{id:'global',enabled:true,hybridEnabled:false}],
    personalAiBots:botIds.map((id,index)=>({id,createdBy:owner,displayName:'AI Friend '+index,categoryId:'ai-friends',categoryName:'AI Friends',status:'enabled',enabled:true})),
    users:[{id:target,username:'target_member',displayName:'Target Member',status:'active'}],
    blocks:[],personalAiBotTasks:[],personalAiBotAudit:[],personalAiBotCategories:[]
  };
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/follow-batch',
    input:{taskType:'follow',targetUserId:target,botIds,instruction:'Follow this member only after review.'},
    db,saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,201);
  assert.equal(context.res.payload.created,2);
  assert.ok(context.res.payload.tasks.every(task=>task.status==='awaiting_administrator_approval'));
  assert.ok(context.res.payload.tasks.every(task=>task.executionStatus==='not_dispatched'));
  assert.equal(context.db.follows,undefined);
  assert.equal(saves,1);
});

test('owner follow batch rejects a target blocked by the administrator account',async()=>{
  const owner='owner-1',target='blocked-member';
  const botId='00000000-0000-4000-8000-000000000103';
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/follow-batch',
    input:{taskType:'follow',targetUserId:target,botIds:[botId]},
    db:{
      personalAiBotSettings:[{id:'global',enabled:true}],
      personalAiBots:[{id:botId,createdBy:owner,displayName:'AI Friend',categoryId:'ai-friends',status:'enabled',enabled:true}],
      users:[{id:target,status:'active'}],
      blocks:[{blockerId:owner,blockedId:target}]
    }
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,409);
  assert.match(context.res.payload.error,/block exists/);
  assert.equal(context.db.personalAiBotTasks.length,0);
});


test('follow batch resolves remote Supabase members through the existing owner-authorized lookup',async()=>{
  const owner='owner-1',target='remote-member';
  const botId='00000000-0000-4000-8000-000000000104';
  let lookedUp='';
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/follow-batch',
    input:{taskType:'follow',targetUserId:target,botIds:[botId]},
    db:{
      personalAiBotSettings:[{id:'global',enabled:true}],
      personalAiBots:[{id:botId,createdBy:owner,displayName:'AI Friend',categoryId:'ai-friends',status:'enabled',enabled:true}],
      users:[],blocks:[]
    },
    lookupAdminMember:async id=>{lookedUp=id;return id===target?{id,username:'remote_user',status:'active'}:null;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(lookedUp,target);
  assert.equal(context.res.statusCode,201);
  assert.equal(context.res.payload.created,1);
});


test('follow approval re-checks live relationship blocks before approving',async()=>{
  const taskId='00000000-0000-4000-8000-000000000201';
  const botId='00000000-0000-4000-8000-000000000202';
  const target='member-now-blocked';
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/tasks/'+taskId+'/approve',
    db:{
      personalAiBotSettings:[{id:'global',enabled:true}],
      personalAiBots:[{id:botId,displayName:'AI Friend',categoryId:'ai-friends',enabled:true,status:'enabled'}],
      personalAiBotTasks:[{id:taskId,botId,taskType:'follow',targetUserId:target,status:'awaiting_administrator_approval'}],
      users:[{id:target,status:'active'}],
      blocks:[{blockerId:'owner-1',blockedId:target}]
    }
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,409);
  assert.match(context.res.payload.error,/block now prevents/);
  assert.equal(context.db.personalAiBotTasks[0].status,'awaiting_administrator_approval');
});


test('owner instruction creation writes an idempotent task record to the durable queue before success',async()=>{
  const botId='00000000-0000-4000-8000-000000000301';
  let persisted=null,saves=0;
  const context=makeContext({
    method:'POST',
    path:'/api/admin/personal-ai-bots/bots/'+botId+'/instructions',
    input:{taskType:'assistant_request',instruction:'Explain the current Minglora help centre process.'},
    db:{
      personalAiBotSettings:[{id:'global',enabled:true}],
      personalAiBots:[{id:botId,createdBy:'owner-1',displayName:'AI Help Guide',categoryId:'ai-support',categoryName:'AI Support',enabled:true,status:'enabled'}],
      personalAiBotTasks:[]
    },
    persistAiBotTasks:async tasks=>{persisted=tasks;},
    saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,201);
  assert.equal(persisted.length,1);
  assert.equal(persisted[0].id,context.res.payload.task.id);
  assert.equal(persisted[0].idempotencyKey,persisted[0].id);
  assert.equal(persisted[0].botId,botId);
  assert.equal(persisted[0].taskType,'assistant_request');
  assert.equal(persisted[0].status,'awaiting_administrator_approval');
  assert.equal(persisted[0].highImpact,false);
  assert.equal(persisted[0].excludeFromHumanEngagementMetrics,true);
  assert.equal(saves,1);
});

test('approval and cancellation update durable queue records with separate audit actors',async()=>{
  const botId='00000000-0000-4000-8000-000000000302';
  const approveId='00000000-0000-4000-8000-000000000303';
  const cancelId='00000000-0000-4000-8000-000000000304';
  const task=(id)=>({id,botId,taskType:'assistant_request',instruction:'Review the Minglora help centre policy.',highImpact:false,status:'awaiting_administrator_approval',createdBy:'owner-1',createdAt:'2026-11-09T10:00:00.000Z'});
  const db={
    personalAiBotSettings:[{id:'global',enabled:true}],
    personalAiBots:[{id:botId,createdBy:'owner-1',displayName:'AI Help Guide',categoryId:'ai-support',enabled:true,status:'enabled'}],
    personalAiBotTasks:[task(approveId),task(cancelId)]
  };
  const persisted=[];
  const persistAiBotTasks=async tasks=>{persisted.push(...tasks);};
  const approve=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/tasks/'+approveId+'/approve',
    db,persistAiBotTasks
  });
  await handlePersonalAiBotsAdminApi(approve);
  assert.equal(approve.res.statusCode,200);
  const durableApproval=persisted.at(-1);
  assert.equal(durableApproval.id,approveId);
  assert.equal(durableApproval.status,'approved_waiting_for_worker');
  assert.equal(durableApproval.approvedBy,'owner-1');
  assert.equal(durableApproval.approvedAt,'2026-11-09T10:00:00.000Z');

  const cancel=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/tasks/'+cancelId+'/cancel',
    db,persistAiBotTasks
  });
  await handlePersonalAiBotsAdminApi(cancel);
  assert.equal(cancel.res.statusCode,200);
  const durableCancellation=persisted.at(-1);
  assert.equal(durableCancellation.id,cancelId);
  assert.equal(durableCancellation.status,'cancelled');
  assert.equal(durableCancellation.cancelledBy,'owner-1');
  assert.equal(durableCancellation.cancelledAt,'2026-11-09T10:00:00.000Z');
});

test('owner task overview prefers durable PostgreSQL rows and queue statistics',async()=>{
  const taskRow={id:'task-1',botId:'bot-1',taskType:'translation',status:'approved_waiting_for_worker'};
  const stats={pendingApproval:0,approvedWaiting:1,running:0,completedToday:0};
  const context=makeContext({
    listAiBotTasks:async options=>{
      assert.deepEqual(options,{limit:100,offset:0});
      return [taskRow];
    },
    getAiBotTaskStats:async()=>stats
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,200);
  assert.equal(context.res.payload.taskRecordsSource,'minglora_supabase_postgresql');
  assert.deepEqual(context.res.payload.tasks,[taskRow]);
  assert.deepEqual(context.res.payload.taskQueueStats,stats);
});

test('durable task persistence failure does not report a queued task or save legacy state',async()=>{
  const botId='00000000-0000-4000-8000-000000000305';
  let saves=0;
  const context=makeContext({
    method:'POST',
    path:'/api/admin/personal-ai-bots/bots/'+botId+'/instructions',
    input:{taskType:'assistant_request',instruction:'Explain the Minglora community rules.'},
    db:{
      personalAiBotSettings:[{id:'global',enabled:true}],
      personalAiBots:[{id:botId,createdBy:'owner-1',displayName:'AI Help Guide',categoryId:'ai-support',enabled:true,status:'enabled'}],
      personalAiBotTasks:[]
    },
    persistAiBotTasks:async()=>{throw Object.assign(new Error('Canonical task storage unavailable.'),{status:503});},
    saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,503);
  assert.match(context.res.payload.error,/Canonical task storage unavailable/);
  assert.equal(saves,0);
});

test('emergency shutdown synchronizes every cancelled task to the durable queue',async()=>{
  const botId='00000000-0000-4000-8000-000000000306';
  const taskId='00000000-0000-4000-8000-000000000307';
  let persisted=null,saves=0;
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/emergency-shutdown',
    db:{
      personalAiBotSettings:[{id:'global',enabled:true}],
      personalAiBots:[{id:botId,displayName:'AI Help Guide',enabled:true,status:'enabled'}],
      personalAiBotTasks:[{id:taskId,botId,taskType:'assistant_request',instruction:'Answer the current FAQ.',status:'approved_waiting_for_worker'}]
    },
    persistAiBotTasks:async tasks=>{persisted=tasks;},
    saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,200);
  assert.equal(persisted.length,1);
  assert.equal(persisted[0].id,taskId);
  assert.equal(persisted[0].status,'cancelled');
  assert.equal(persisted[0].cancelledBy,'owner-1');
  assert.equal(saves,1);
});


test('owner instruction persistence stores the AI identity before inserting its foreign-key task',async()=>{
  const botId='00000000-0000-4000-8000-000000000401';
  const order=[];
  let identityPayload=null,taskPayload=null;
  const context=makeContext({
    method:'POST',
    path:'/api/admin/personal-ai-bots/bots/'+botId+'/instructions',
    input:{taskType:'assistant_request',instruction:'Explain how members can manage account privacy.'},
    db:{
      personalAiBotSettings:[{id:'global',enabled:true}],
      personalAiBots:[{
        id:botId,createdBy:'owner-1',displayName:'Minglora AI Guide',
        categoryId:'ai-support',categoryName:'AI Support',
        username:'ai_minglora_guide',enabled:true,status:'enabled'
      }],
      personalAiBotTasks:[]
    },
    persistAiIdentities:async identities=>{order.push('identity');identityPayload=identities;},
    persistAiBotTasks:async tasks=>{order.push('task');taskPayload=tasks;},
    saveStore:async()=>{order.push('save');}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,201);
  assert.deepEqual(order,['identity','task','save']);
  assert.equal(identityPayload[0].id,botId);
  assert.equal(taskPayload[0].botId,botId);
});

test('owner network controls synchronize to PostgreSQL without opening provider dispatch gates',async()=>{
  let persisted=null,saves=0;
  const context=makeContext({
    method:'PUT',path:'/api/admin/personal-ai-bots/network',
    input:{
      enabled:true,hybridEnabled:true,concurrentExecutionLimit:3,
      dailyExecutionBudget:75,automaticSuspensionEnabled:false
    },
    persistAiBotSettings:async settings=>{persisted=settings;},
    saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,200);
  assert.deepEqual(persisted,{
    enabled:true,hybridEnabled:true,maxConcurrentExecutions:3,
    dailyExecutionBudget:75,automaticSuspensionEnabled:false,
    emergencyShutdownAt:null
  });
  assert.equal(persisted.executionEnabled,undefined);
  assert.equal(persisted.providerReady,undefined);
  assert.equal(saves,1);
});

test('network settings persistence failure does not report a successful control change',async()=>{
  let saves=0;
  const context=makeContext({
    method:'PUT',path:'/api/admin/personal-ai-bots/network',
    input:{enabled:true,hybridEnabled:false},
    persistAiBotSettings:async()=>{throw Object.assign(new Error('Durable network settings unavailable.'),{status:503});},
    saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,503);
  assert.match(context.res.payload.error,/Durable network settings unavailable/);
  assert.equal(saves,0);
});

test('emergency shutdown closes the PostgreSQL dispatch gate before syncing identity and task cancellations',async()=>{
  const botId='00000000-0000-4000-8000-000000000402';
  const taskId='00000000-0000-4000-8000-000000000403';
  const order=[];
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/emergency-shutdown',
    db:{
      personalAiBotSettings:[{id:'global',enabled:true}],
      personalAiBots:[{
        id:botId,createdBy:'owner-1',displayName:'Minglora AI Guide',
        categoryId:'ai-support',categoryName:'AI Support',
        username:'ai_minglora_guide',enabled:true,status:'enabled'
      }],
      personalAiBotTasks:[{
        id:taskId,botId,taskType:'assistant_request',
        instruction:'Prepare an answer about privacy settings.',
        status:'approved_waiting_for_worker'
      }]
    },
    persistAiBotSettings:async settings=>{order.push('settings');assert.equal(settings.enabled,false);assert.ok(settings.emergencyShutdownAt);},
    persistAiIdentities:async identities=>{order.push('identity');assert.equal(identities[0].status,'restricted');},
    persistAiBotTasks:async tasks=>{order.push('tasks');assert.equal(tasks[0].status,'cancelled');},
    saveStore:async()=>{order.push('save');}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,200);
  assert.deepEqual(order,['settings','identity','tasks','save']);
});


test('owner can save a provider/model assignment only as configured and unverified',async()=>{
  const botId='00000000-0000-4000-8000-000000000501';
  const order=[];
  let assignmentSaved=null,identitySaved=null;
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/providers',
    input:{
      identityId:botId,providerName:'Example Provider',providerIdentifier:'example_provider',
      providerAccountReference:'default',credentialSecretReference:'env:MINGLORA_AI_PROVIDER_EXAMPLE_KEY',
      modelName:'Example Text Model',modelIdentifier:'example/model-v1',modelVersion:'v1',
      supportedLanguages:['en','jam'],routingPriority:10,isPrimary:true,
      capabilities:{text:true,image:false,audio:false,video:false,voice:false,tools:false}
    },
    db:{
      personalAiBotSettings:[{id:'global',enabled:false}],
      personalAiBots:[{
        id:botId,createdBy:'owner-1',displayName:'Minglora AI Guide',
        firstName:'Minglora',lastName:'Guide',categoryId:'ai-support',
        categoryName:'AI Support',username:'ai_minglora_guide',enabled:false,status:'disabled'
      }]
    },
    persistAiIdentities:async identities=>{order.push('identity');identitySaved=identities[0];},
    persistAiProviderAssignment:async assignment=>{
      order.push('provider');
      assignmentSaved={assignmentId:'assignment-1',...assignment,accountStatus:'configured',providerHealthStatus:'unknown',assignmentStatus:'configured',credentialConfigured:true};
      return assignmentSaved;
    }
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,201);
  assert.deepEqual(order,['identity','provider']);
  assert.equal(identitySaved.id,botId);
  assert.equal(assignmentSaved.identityId,botId);
  assert.equal(assignmentSaved.providerIdentifier,'example_provider');
  assert.equal(assignmentSaved.modelIdentifier,'example/model-v1');
  assert.equal(assignmentSaved.assignmentStatus,'configured');
  assert.equal(assignmentSaved.providerHealthStatus,'unknown');
  assert.equal(context.res.payload.assignment.assignmentStatus,'configured');
  assert.match(context.res.payload.message,/unverified/);
});

test('provider assignment endpoint rejects raw credentials instead of storing them',async()=>{
  const botId='00000000-0000-4000-8000-000000000502';
  let persistenceCalls=0;
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/providers',
    input:{
      identityId:botId,providerName:'Example Provider',providerIdentifier:'example_provider',
      providerAccountReference:'default',credentialSecretReference:'sk-live-THIS-IS-NOT-A-REFERENCE',
      modelName:'Example Text Model',modelIdentifier:'example/model-v1'
    },
    db:{
      personalAiBotSettings:[{id:'global',enabled:false}],
      personalAiBots:[{id:botId,createdBy:'owner-1',displayName:'Minglora AI Guide',categoryId:'ai-support',categoryName:'AI Support',username:'ai_minglora_guide'}]
    },
    persistAiIdentities:async()=>{persistenceCalls++;},
    persistAiProviderAssignment:async()=>{persistenceCalls++;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,400);
  assert.match(context.res.payload.error,/secret reference/);
  assert.equal(persistenceCalls,0);
});

test('owner provider overview reads canonical assignments without exposing credential values',async()=>{
  const row={
    assignmentId:'assignment-1',identityId:'bot-1',displayName:'AI Guide',
    providerName:'Example Provider',modelName:'Example Text Model',
    credentialConfigured:true,providerHealthStatus:'unknown',assignmentStatus:'configured'
  };
  const context=makeContext({listAiProviderAssignments:async options=>{
    assert.deepEqual(options,{limit:200,offset:0});
    return [row];
  }});
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,200);
  assert.equal(context.res.payload.providerAssignmentsSource,'minglora_supabase_postgresql');
  assert.deepEqual(context.res.payload.providerAssignments,[row]);
  assert.equal(JSON.stringify(context.res.payload).includes('sk-live'),false);
});


test('owner can record an AI email address and receives explicit unprovisioned status',async()=>{
  const botId='00000000-0000-4000-8000-000000000601';
  const order=[];
  let emailSaved=null,identitySaved=null;
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/emails',
    input:{
      identityId:botId,emailAddress:'ai.guide@minglora.example',
      emailType:'primary',emailProvider:'example-provider',isPrimary:true
    },
    db:{
      personalAiBotSettings:[{id:'global',enabled:false}],
      personalAiBots:[{
        id:botId,createdBy:'owner-1',displayName:'Minglora AI Guide',
        firstName:'Minglora',lastName:'Guide',categoryId:'ai-support',
        categoryName:'AI Support',username:'ai_minglora_guide',enabled:false,status:'disabled'
      }]
    },
    persistAiIdentities:async identities=>{order.push('identity');identitySaved=identities[0];},
    persistAiEmailIdentity:async email=>{
      order.push('email');
      emailSaved={
        id:'email-record-1',...email,verificationStatus:'not_verified',
        provisioningStatus:'not_provisioned',status:'active'
      };
      return emailSaved;
    },
    saveStore:async()=>{order.push('save');}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,201);
  assert.deepEqual(order,['identity','email']);
  assert.equal(identitySaved.id,botId);
  assert.equal(emailSaved.identityId,botId);
  assert.equal(emailSaved.emailAddress,'ai.guide@minglora.example');
  assert.equal(emailSaved.verificationStatus,'not_verified');
  assert.equal(emailSaved.provisioningStatus,'not_provisioned');
  assert.match(context.res.payload.message,/not a verified mailbox/);
  assert.match(context.res.payload.message,/no email provider has provisioned an inbox/);
});

test('AI email API rejects verification, provisioning and credential fields from clients',async()=>{
  const botId='00000000-0000-4000-8000-000000000602';
  let calls=0;
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/emails',
    input:{
      identityId:botId,emailAddress:'ai.guide@minglora.example',
      verificationStatus:'verified',provisioningStatus:'provisioned',
      password:'do-not-store',apiKey:'never-accept'
    },
    db:{
      personalAiBotSettings:[{id:'global',enabled:false}],
      personalAiBots:[{id:botId,createdBy:'owner-1',displayName:'AI Guide',categoryId:'ai-support',username:'ai_guide'}]
    },
    persistAiIdentities:async()=>{calls++;},
    persistAiEmailIdentity:async()=>{calls++;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,400);
  assert.match(context.res.payload.error,/invalid/);
  assert.equal(calls,0);
});

test('AI email overview reads PostgreSQL records and preserves provisioning truth',async()=>{
  const row={
    id:'email-record-1',identityId:'bot-1',emailAddress:'ai.guide@minglora.example',
    verificationStatus:'not_verified',provisioningStatus:'not_provisioned'
  };
  const context=makeContext({
    listAiEmailIdentities:async options=>{
      assert.deepEqual(options,{limit:200,offset:0});
      return [row];
    }
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,200);
  assert.equal(context.res.payload.emailIdentitiesSource,'minglora_supabase_postgresql');
  assert.deepEqual(context.res.payload.emailIdentities,[row]);
  assert.equal(context.res.payload.emailIdentities[0].provisioningStatus,'not_provisioned');
});


test('provider assignment API rejects unsupported raw credential fields before persistence',async()=>{
  const botId='00000000-0000-4000-8000-000000000503';
  let calls=0;
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/providers',
    input:{
      identityId:botId,providerName:'Example Provider',providerIdentifier:'example_provider',
      providerAccountReference:'default',modelName:'Example Model',modelIdentifier:'example/model',
      apiKey:'must-not-be-accepted'
    },
    db:{
      personalAiBotSettings:[{id:'global',enabled:false}],
      personalAiBots:[{id:botId,createdBy:'owner-1',displayName:'AI Guide',categoryId:'ai-support',username:'ai_guide'}]
    },
    persistAiIdentities:async()=>{calls++;},
    persistAiProviderAssignment:async()=>{calls++;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,400);
  assert.match(context.res.payload.error,/unsupported or sensitive/);
  assert.equal(calls,0);
});
