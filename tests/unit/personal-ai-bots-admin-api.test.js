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
  assert.equal(context.res.payload.departments.length,20);
  assert.equal(context.res.payload.departments.filter(item=>item.builtIn).length,20);
  assert.equal(context.res.payload.jobPositions.length,20);
  assert.deepEqual(context.res.payload.vacancies,[]);
  assert.deepEqual(context.res.payload.applications,[]);
  assert.ok(context.res.payload.jobPositions.every(item=>item.permissions.length===0&&item.appointmentEnabled===false));
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

test('owner overview redacts provider credential references from initial dashboard data',async()=>{
  const context=makeContext({
    listAiProviderAssignments:async()=>[
      {id:'assignment-overview',providerName:'Example Provider',credentialSecretReference:'env:MINGLORA_AI_PROVIDER_PRIVATE'}
    ]
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,200);
  assert.equal(context.res.payload.providerAssignments[0].credentialConfigured,true);
  assert.ok(!Object.hasOwn(context.res.payload.providerAssignments[0],'credentialSecretReference'));
  assert.doesNotMatch(JSON.stringify(context.res.payload),'env:MINGLORA_AI_PROVIDER_PRIVATE');
});

test('provider runtime listing redacts server-side credential references',async()=>{
  const context=makeContext({
    path:'/api/admin/personal-ai-bots/provider-runtime',
    url:new URL('https://minglora.test/api/admin/personal-ai-bots/provider-runtime?limit=5&offset=0'),
    listAiProviderRuntime:async options=>{
      assert.deepEqual(options,{limit:5,offset:0});
      return [{id:'runtime-1',providerName:'Example Provider',credentialSecretReference:'env:MINGLORA_AI_PROVIDER_RUNTIME_PRIVATE'}];
    }
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,200);
  assert.equal(context.res.payload.assignments[0].credentialConfigured,true);
  assert.ok(!Object.hasOwn(context.res.payload.assignments[0],'credentialSecretReference'));
  assert.doesNotMatch(JSON.stringify(context.res.payload),'env:MINGLORA_AI_PROVIDER_RUNTIME_PRIVATE');
});

test('provider assignment listing redacts server-side credential references',async()=>{
  const context=makeContext({
    path:'/api/admin/personal-ai-bots/providers',
    url:new URL('https://minglora.test/api/admin/personal-ai-bots/providers?limit=10&offset=0'),
    listAiProviderAssignments:async options=>{
      assert.deepEqual(options,{limit:10,offset:0});
      return [
        {id:'assignment-1',providerName:'Example Provider',credentialSecretReference:'secret://private/provider-key'},
        {id:'assignment-2',providerName:'Unconfigured Provider',credentialSecretReference:null}
      ];
    }
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,200);
  assert.equal(context.res.payload.assignments.length,2);
  assert.equal(context.res.payload.assignments[0].credentialConfigured,true);
  assert.equal(context.res.payload.assignments[1].credentialConfigured,false);
  assert.ok(context.res.payload.assignments.every(item=>!Object.hasOwn(item,'credentialSecretReference')));
  assert.doesNotMatch(JSON.stringify(context.res.payload),'secret://private/provider-key');
});

test('owner overview reads canonical identity rows from the persistence callback',async()=>{
  const row={id:'ai-1',firstName:'Minglora',middleName:'AI',lastName:'Companion',username:'ai_minglora_companion',population:'independent',status:'created'};
  const context=makeContext({listAiIdentities:async options=>{
    assert.deepEqual(options,{limit:100,offset:0});
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
    assert.deepEqual(options,{limit:100,offset:0});
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
  assert.match(context.res.payload.error,/unsupported or sensitive|invalid/i);
  assert.equal(calls,0);
});

test('AI email overview reads PostgreSQL records and preserves provisioning truth',async()=>{
  const row={
    id:'email-record-1',identityId:'bot-1',emailAddress:'ai.guide@minglora.example',
    verificationStatus:'not_verified',provisioningStatus:'not_provisioned'
  };
  const context=makeContext({
    listAiEmailIdentities:async options=>{
      assert.deepEqual(options,{limit:100,offset:0});
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


test('canonical AI identity synchronization includes full profile and structured location attributes',async()=>{
  const botId='00000000-0000-4000-8000-000000000701';
  let persisted=null;
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/emails',
    input:{identityId:botId,emailAddress:'profile.ai@minglora.example',emailType:'primary'},
    db:{
      personalAiBotSettings:[{id:'global',enabled:false}],
      personalAiBots:[{
        id:botId,createdBy:'owner-1',displayName:'Profile AI',firstName:'Profile',lastName:'AI',
        categoryId:'ai-support',categoryName:'AI Support',username:'ai_profile',
        gender:'female',genderPresentation:'Feminine AI presentation',nationality:'Jamaican',
        countryOfOrigin:'Jamaica',currentCountry:'Jamaica',stateProvince:'Kingston',
        parishCounty:'Kingston',city:'Kingston',town:'Half Way Tree',originCountryCode:'JM',
        education:[{institution:'Minglora Learning',qualification:'AI qualification'}],
        profession:'Educator',communicationStyle:'Clear, warm and concise',
        voicePreferences:{voice:'neutral'},avatarPreferences:{style:'3d'},
        capabilities:[{code:'text',enabled:true,configuration:{draftOnly:true}}],
        locations:[{
          locationType:'current',countryCode:'JM',countryName:'Jamaica',
          stateProvince:'Kingston',parishCounty:'Kingston',city:'Kingston',
          town:'Half Way Tree',timeZone:'America/Jamaica',isPrimary:true
        }]
      }]
    },
    persistAiIdentities:async identities=>{persisted=identities[0];},
    persistAiEmailIdentity:async email=>({...email,verificationStatus:'not_verified',provisioningStatus:'not_provisioned'})
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,201);
  assert.equal(persisted.gender_presentation,'Feminine AI presentation');
  assert.equal(persisted.communication_style,'Clear, warm and concise');
  assert.equal(persisted.education[0].qualification,'AI qualification');
  assert.deepEqual(persisted.voice_preferences,{voice:'neutral'});
  assert.deepEqual(persisted.avatar_preferences,{style:'3d'});
  assert.equal(persisted.locations[0].parishCounty,'Kingston');
  assert.equal(persisted.locations[0].countryCode,'JM');
  assert.equal(persisted.capabilities[0].code,'text');
});


test('AI profile PATCH persists demographic, career, location and preference fields to canonical PostgreSQL records',async()=>{
  const botId='00000000-0000-4000-8000-000000000801';
  let persisted=null,saves=0;
  const context=makeContext({
    method:'PATCH',
    path:'/api/admin/personal-ai-bots/bots/'+botId,
    input:{
      firstName:'Profile',middleName:'Global',lastName:'Guide',
      gender:'non_binary',genderPresentation:'Androgynous AI identity',
      nationality:'Jamaican',countryOfOrigin:'Jamaica',currentCountry:'United Kingdom',
      timeZone:'Europe/London',
      introduction:'A global AI learning guide.',
      communicationStyle:'Clear and encouraging.',
      profession:'Educator',
      education:[{institution:'Minglora Academy',qualification:'AI Education Certificate'}],
      skills:['Teaching','Research'],
      locations:[{
        locationType:'current',countryCode:'GB',countryName:'United Kingdom',
        stateProvince:'England',district:'Greater London',city:'London',
        timeZone:'Europe/London',isPrimary:true
      }],
      voicePreferences:{voice:'neutral'},avatarPreferences:{style:'3d'},
      memoryEnabled:true,memoryConfiguration:{retentionDays:14},
      avatarStorageReference:'ai/profile/avatar-801',
      coverStorageReference:'ai/profile/cover-801'
    },
    db:{
      personalAiBotSettings:[{id:'global',enabled:false}],
      personalAiBots:[{
        id:botId,createdBy:'owner-1',displayName:'Profile Global Guide',
        firstName:'Profile',middleName:'Global',lastName:'Guide',
        categoryId:'ai-support',categoryName:'AI Support',
        username:'ai_profile_global_guide',status:'disabled',enabled:false,
        visibility:'private',publicProfileEnabled:false
      }]
    },
    persistAiIdentities:async identities=>{persisted=identities[0];},
    saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,200);
  assert.equal(context.res.payload.ok,true);
  assert.equal(persisted.first_name,'Profile');
  assert.equal(persisted.middle_name,'Global');
  assert.equal(persisted.last_name,'Guide');
  assert.equal(persisted.gender,'non_binary');
  assert.equal(persisted.gender_presentation,'Androgynous AI identity');
  assert.equal(persisted.nationality,'Jamaican');
  assert.equal(persisted.country_of_origin,'Jamaica');
  assert.equal(persisted.current_country,'United Kingdom');
  assert.equal(persisted.time_zone,'Europe/London');
  assert.equal(persisted.communication_style,'Clear and encouraging.');
  assert.equal(persisted.profession,'Educator');
  assert.equal(persisted.education[0].qualification,'AI Education Certificate');
  assert.deepEqual(persisted.skills,['Teaching','Research']);
  assert.equal(persisted.locations[0].countryCode,'GB');
  assert.equal(persisted.locations[0].city,'London');
  assert.deepEqual(persisted.voice_preferences,{voice:'neutral'});
  assert.deepEqual(persisted.avatar_preferences,{style:'3d'});
  assert.equal(persisted.memory_enabled,true);
  assert.deepEqual(persisted.memory_configuration,{retentionDays:14});
  assert.equal(persisted.avatar_storage_reference,'ai/profile/avatar-801');
  assert.equal(persisted.cover_storage_reference,'ai/profile/cover-801');
  assert.equal(saves,1);
});


test('owner canonical AI identity list supports bounded page offsets',async()=>{
  const identities=Array.from({length:50},(_,index)=>({id:'identity-'+(200+index),username:'ai_member_'+(200+index)}));
  let options=null;
  const context=makeContext({
    method:'GET',
    path:'/api/admin/personal-ai-bots/identities',
    url:new URL('https://minglora.test/api/admin/personal-ai-bots/identities?limit=50&offset=200'),
    listAiIdentities:async value=>{options=value;return identities;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,200);
  assert.deepEqual(options,{limit:50,offset:200});
  assert.deepEqual(context.res.payload.identities,identities);
  assert.equal(context.res.payload.nextOffset,250);
  assert.equal(context.res.payload.hasMore,true);
});

test('owner canonical AI identity list rejects invalid pagination before reading storage',async()=>{
  let called=false;
  const context=makeContext({
    method:'GET',
    path:'/api/admin/personal-ai-bots/identities',
    url:new URL('https://minglora.test/api/admin/personal-ai-bots/identities?limit=1001&offset=0'),
    listAiIdentities:async()=>{called=true;return [];}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,400);
  assert.equal(called,false);
});

test('owner provider assignment and email identity lists paginate with validated cursors',async()=>{
  const providerRows=Array.from({length:25},(_,index)=>({assignmentId:'provider-'+(100+index)}));
  const emailRows=Array.from({length:25},(_,index)=>({id:'email-'+(200+index)}));
  let providerOptions=null,emailOptions=null;
  const providerContext=makeContext({
    method:'GET',
    path:'/api/admin/personal-ai-bots/providers',
    url:new URL('https://minglora.test/api/admin/personal-ai-bots/providers?limit=25&offset=100'),
    listAiProviderAssignments:async value=>{providerOptions=value;return providerRows;}
  });
  await handlePersonalAiBotsAdminApi(providerContext);
  assert.equal(providerContext.res.statusCode,200);
  assert.deepEqual(providerOptions,{limit:25,offset:100});
  assert.deepEqual(providerContext.res.payload.assignments,providerRows);
  assert.equal(providerContext.res.payload.nextOffset,125);
  assert.equal(providerContext.res.payload.hasMore,true);

  const emailContext=makeContext({
    method:'GET',
    path:'/api/admin/personal-ai-bots/emails',
    url:new URL('https://minglora.test/api/admin/personal-ai-bots/emails?limit=25&offset=200'),
    listAiEmailIdentities:async value=>{emailOptions=value;return emailRows;}
  });
  await handlePersonalAiBotsAdminApi(emailContext);
  assert.equal(emailContext.res.statusCode,200);
  assert.deepEqual(emailOptions,{limit:25,offset:200});
  assert.deepEqual(emailContext.res.payload.emails,emailRows);
  assert.equal(emailContext.res.payload.nextOffset,225);
  assert.equal(emailContext.res.payload.hasMore,true);
});

test('owner provider and email list APIs reject oversized pagination',async()=>{
  for(const [path,property] of [
    ['/api/admin/personal-ai-bots/providers','listAiProviderAssignments'],
    ['/api/admin/personal-ai-bots/emails','listAiEmailIdentities']
  ]){
    let called=false;
    const context=makeContext({
      method:'GET',path,
      url:new URL('https://minglora.test'+path+'?limit=501&offset=0'),
      [property]:async()=>{called=true;return [];}
    });
    await handlePersonalAiBotsAdminApi(context);
    assert.equal(context.res.statusCode,400,path);
    assert.equal(called,false,path);
  }
});

test('owner durable AI task queue supports bounded offset pagination',async()=>{
  const tasks=Array.from({length:25},(_,index)=>({id:'task-'+(300+index),taskType:index%2?'follow':'assistant_request',status:'awaiting_administrator_approval'}));
  let options=null;
  const context=makeContext({
    method:'GET',
    path:'/api/admin/personal-ai-bots/tasks',
    url:new URL('https://minglora.test/api/admin/personal-ai-bots/tasks?limit=25&offset=300'),
    listAiBotTasks:async value=>{options=value;return tasks;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,200);
  assert.deepEqual(options,{limit:25,offset:300});
  assert.deepEqual(context.res.payload.tasks,tasks);
  assert.equal(context.res.payload.nextOffset,325);
  assert.equal(context.res.payload.hasMore,true);
});

test('owner durable AI task queue rejects page sizes above the gateway cap',async()=>{
  let called=false;
  const context=makeContext({
    method:'GET',
    path:'/api/admin/personal-ai-bots/tasks',
    url:new URL('https://minglora.test/api/admin/personal-ai-bots/tasks?limit=101&offset=0'),
    listAiBotTasks:async()=>{called=true;return [];}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,400);
  assert.equal(called,false);
});

test('owner safety report queue returns pending reports from canonical storage',async()=>{
  const reports=[{reportId:'report-1',identityId:'ai-1',reason:'spam',status:'pending'}];
  let options=null;
  const context=makeContext({
    listAiIdentityReports:async value=>{options=value;return reports;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,200);
  assert.deepEqual(options,{status:'open',limit:100,offset:0});
  assert.deepEqual(context.res.payload.safetyReports,reports);
  assert.equal(context.res.payload.safetyReportsSource,'minglora_supabase_postgresql');
});

test('owner AI report review queue supports bounded page offsets and next-page metadata',async()=>{
  const reports=Array.from({length:50},(_,index)=>({reportId:'report-'+(100+index),status:'pending'}));
  let options=null;
  const context=makeContext({
    method:'GET',
    path:'/api/admin/personal-ai-bots/safety/reports',
    url:new URL('https://minglora.test/api/admin/personal-ai-bots/safety/reports?status=open&limit=50&offset=100'),
    listAiIdentityReports:async value=>{options=value;return reports;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,200);
  assert.deepEqual(options,{status:'open',limit:50,offset:100});
  assert.deepEqual(context.res.payload.reports,reports);
  assert.equal(context.res.payload.nextOffset,150);
  assert.equal(context.res.payload.hasMore,true);
});

test('owner AI report review queue supports every documented status filter',async()=>{
  for(const status of ['all','open','pending','in_review','actioned','dismissed']){
    let options=null;
    const context=makeContext({
      method:'GET',
      path:'/api/admin/personal-ai-bots/safety/reports',
      url:new URL('https://minglora.test/api/admin/personal-ai-bots/safety/reports?status='+status+'&limit=25&offset=0'),
      listAiIdentityReports:async value=>{options=value;return [];}
    });
    await handlePersonalAiBotsAdminApi(context);
    assert.equal(context.res.statusCode,200,status);
    assert.deepEqual(options,{status,limit:25,offset:0},status);
    assert.deepEqual(context.res.payload.reports,[],status);
  }
});

test('owner AI report review queue rejects invalid pagination before querying storage',async()=>{
  let called=false;
  const context=makeContext({
    method:'GET',
    path:'/api/admin/personal-ai-bots/safety/reports',
    url:new URL('https://minglora.test/api/admin/personal-ai-bots/safety/reports?status=open&limit=201&offset=0'),
    listAiIdentityReports:async()=>{called=true;return [];}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,400);
  assert.equal(called,false);
});

test('owner can move an AI safety report into review or close it with an audit note',async()=>{
  let received=null,saves=0;
  const context=makeContext({
    method:'PATCH',
    path:'/api/admin/personal-ai-bots/safety/reports/00000000-0000-4000-8000-000000000701',
    input:{status:'actioned',resolutionNote:'Reviewed and action recorded.'},
    reviewAiIdentityReport:async value=>{received=value;return {reportId:value.reportId,status:value.status};},
    saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,200);
  assert.deepEqual(received,{
    reportId:'00000000-0000-4000-8000-000000000701',
    status:'actioned',resolutionNote:'Reviewed and action recorded.'
  });
  assert.equal(context.res.payload.report.status,'actioned');
  assert.equal(saves,1);
});

test('AI report review rejects unsupported statuses and oversized resolution notes',async()=>{
  for(const input of [
    {status:'deleted',resolutionNote:''},
    {status:'dismissed',resolutionNote:'x'.repeat(1201)}
  ]){
    const context=makeContext({
      method:'PATCH',
      path:'/api/admin/personal-ai-bots/safety/reports/00000000-0000-4000-8000-000000000702',
      input,
      reviewAiIdentityReport:async()=>{throw new Error('must not be called');}
    });
    await handlePersonalAiBotsAdminApi(context);
    assert.equal(context.res.statusCode,400);
  }
});


function sequenceUid(start=900){
  let next=start;
  return ()=> '00000000-0000-4000-8000-'+String(next++).padStart(12,'0');
}

const identityBatchItems=[
  {displayName:'Batch Learning Guide',categoryId:'ai-educators',firstName:'Batch',lastName:'Guide',population:'independent'},
  {displayName:'Batch Service Analyst',categoryId:'ai-support',firstName:'Batch',lastName:'Analyst',population:'specialized_service'}
];

test('owner creates a bounded AI identity batch and persists every canonical identity before success',async()=>{
  const db={};
  let persisted=null,saves=0;
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/batches',
    input:{idempotencyKey:'identity-batch-0001',items:identityBatchItems},
    db,uid:sequenceUid(),
    persistAiIdentities:async rows=>{persisted=rows;},
    saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,201);
  assert.equal(context.res.payload.batch.status,'completed');
  assert.equal(context.res.payload.batch.totalRecords,2);
  assert.equal(context.res.payload.batch.completedRecords,2);
  assert.equal(db.personalAiBots.length,2);
  assert.equal(new Set(db.personalAiBots.map(bot=>bot.id)).size,2);
  assert.ok(db.personalAiBots.every(bot=>bot.enabled===false&&bot.status==='disabled'));
  assert.equal(persisted.length,2);
  assert.equal(persisted[0].first_name,'Batch');
  assert.equal(persisted[0].last_name,'Guide');
  assert.equal(persisted[1].population,'specialized_service');
  assert.equal(saves,2);
});

test('AI identity batch retries use the same identities after canonical persistence fails',async()=>{
  const db={};
  let attempts=0,saves=0,persistedIds=[];
  const input={idempotencyKey:'identity-batch-retry-01',items:identityBatchItems};
  const first=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/batches',input,db,uid:sequenceUid(950),
    persistAiIdentities:async rows=>{attempts++;if(attempts===1)throw new Error('database unavailable');persistedIds=rows.map(row=>row.id);},
    saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(first);
  assert.equal(first.res.statusCode,503);
  assert.equal(first.res.payload.batch.status,'retryable_failed');
  const initialIds=db.personalAiBots.map(bot=>bot.id);
  const retry=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/batches',input,db,uid:sequenceUid(990),
    persistAiIdentities:async rows=>{attempts++;persistedIds=rows.map(row=>row.id);},
    saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(retry);
  assert.equal(retry.res.statusCode,200);
  assert.equal(retry.res.payload.batch.status,'completed');
  assert.equal(attempts,2);
  assert.deepEqual(db.personalAiBots.map(bot=>bot.id),initialIds);
  assert.deepEqual(persistedIds,initialIds);
  assert.equal(db.personalAiBots.length,2);
});

test('AI identity batch returns per-record outcomes and rejects changed idempotency payloads',async()=>{
  const db={};
  const duplicateInput={idempotencyKey:'identity-batch-duplicate-01',items:[
    {displayName:'Same AI Name',categoryId:'ai-support'},
    {displayName:' same   ai name ',categoryId:'ai-support'},
    {displayName:'Invalid AI Name',categoryId:'unknown-category'}
  ]};
  const first=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/batches',
    input:duplicateInput,db,uid:sequenceUid(1000),
    persistAiIdentities:async()=>{}
  });
  await handlePersonalAiBotsAdminApi(first);
  assert.equal(first.res.statusCode,201);
  assert.equal(first.res.payload.batch.status,'completed_with_errors');
  assert.equal(first.res.payload.batch.totalRecords,3);
  assert.equal(first.res.payload.batch.createdRecords,1);
  assert.equal(first.res.payload.batch.completedRecords,1);
  assert.equal(first.res.payload.batch.failedRecords,2);
  assert.deepEqual(first.res.payload.results.map(result=>result.status),['persisted','failed','failed']);
  assert.equal(first.res.payload.results[1].errorCode,'DUPLICATE_IDENTITY');
  assert.equal(db.personalAiBots.length,1);

  const changed=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/batches',
    input:{idempotencyKey:duplicateInput.idempotencyKey,items:[{displayName:'Changed Name',categoryId:'ai-support'}]},
    db,persistAiIdentities:async()=>{throw new Error('must not be called');}
  });
  await handlePersonalAiBotsAdminApi(changed);
  assert.equal(changed.res.statusCode,409);
  assert.equal(db.personalAiBots.length,1);
});

test('AI identity batch retries only created rows and retains failed row outcomes',async()=>{
  const db={};
  const input={idempotencyKey:'identity-batch-row-retry-01',items:[
    {displayName:'Retry Valid AI',categoryId:'ai-support'},
    {displayName:'Invalid Category AI',categoryId:'missing-category'}
  ]};
  let calls=0;
  const first=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/batches',input,db,uid:sequenceUid(1400),
    persistAiIdentities:async()=>{calls++;throw new Error('temporary database failure');}
  });
  await handlePersonalAiBotsAdminApi(first);
  assert.equal(first.res.statusCode,503);
  assert.equal(first.res.payload.batch.status,'retryable_failed');
  assert.deepEqual(first.res.payload.results.map(result=>result.status),['retryable_failed','failed']);
  const originalIds=db.personalAiBots.map(bot=>bot.id);
  const retry=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/batches',input,db,uid:sequenceUid(1500),
    persistAiIdentities:async rows=>{calls++;assert.deepEqual(rows.map(row=>row.id),originalIds);}
  });
  await handlePersonalAiBotsAdminApi(retry);
  assert.equal(retry.res.statusCode,200);
  assert.equal(retry.res.payload.batch.status,'completed_with_errors');
  assert.deepEqual(retry.res.payload.results.map(result=>result.status),['persisted','failed']);
  assert.equal(retry.res.payload.batch.completedRecords,1);
  assert.equal(retry.res.payload.batch.failedRecords,1);
  assert.equal(db.personalAiBots.length,1);
  assert.equal(calls,2);
});
test('AI identity batch requires canonical persistence and rejects batches larger than 100',async()=>{
  const noPersistence=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/batches',
    input:{idempotencyKey:'identity-batch-no-store',items:identityBatchItems}
  });
  await handlePersonalAiBotsAdminApi(noPersistence);
  assert.equal(noPersistence.res.statusCode,503);
  assert.equal(noPersistence.db.personalAiBots.length,0);
  const tooLarge=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/batches',
    input:{idempotencyKey:'identity-batch-too-large',items:Array.from({length:101},(_,i)=>({displayName:'Batch AI '+i,categoryId:'ai-support'}))},
    persistAiIdentities:async()=>{throw new Error('must not be called');}
  });
  await handlePersonalAiBotsAdminApi(tooLarge);
  assert.equal(tooLarge.res.statusCode,400);
  assert.equal(tooLarge.db.personalAiBots.length,0);
});

test('AI identity batch completed replay returns recorded IDs without persisting twice',async()=>{
  const db={};
  let initialPersistCalls=0,replayPersistCalls=0;
  const input={idempotencyKey:'identity-batch-replay-0001',items:identityBatchItems};
  const first=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/batches',input,db,uid:sequenceUid(1100),
    persistAiIdentities:async()=>{initialPersistCalls++;}
  });
  await handlePersonalAiBotsAdminApi(first);
  assert.equal(first.res.statusCode,201);
  const originalIds=db.personalAiBots.map(bot=>bot.id);
  assert.equal(initialPersistCalls,1);

  const replay=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/batches',input,db,uid:sequenceUid(1200),
    persistAiIdentities:async()=>{replayPersistCalls++;}
  });
  await handlePersonalAiBotsAdminApi(replay);
  assert.equal(replay.res.statusCode,200);
  assert.equal(replay.res.payload.replayed,true);
  assert.equal(replay.res.payload.batch.status,'completed');
  assert.deepEqual(replay.res.payload.batch.identityIds,originalIds);
  assert.deepEqual(db.personalAiBots.map(bot=>bot.id),originalIds);
  assert.equal(db.personalAiBots.length,2);
  assert.equal(replayPersistCalls,0);
});

test('AI identity batch rolls back its checkpoint when the initial runtime save fails',async()=>{
  const db={personalAiBots:[],personalAiBotAudit:[],personalAiBotBatches:[]};
  const originalBots=db.personalAiBots;
  const originalAudit=db.personalAiBotAudit;
  const originalBatches=db.personalAiBotBatches;
  let persistenceCalled=false,saves=0;
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/batches',
    input:{idempotencyKey:'identity-batch-save-failure-01',items:identityBatchItems},
    db,uid:sequenceUid(1300),
    persistAiIdentities:async()=>{persistenceCalled=true;},
    saveStore:async()=>{saves++;throw new Error('runtime checkpoint unavailable');}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,503);
  assert.match(context.res.payload.error,/checkpoint could not be saved/);
  assert.equal(saves,1);
  assert.equal(persistenceCalled,false);
  assert.equal(db.personalAiBots,originalBots);
  assert.equal(db.personalAiBotAudit,originalAudit);
  assert.equal(db.personalAiBotBatches,originalBatches);
  assert.equal(db.personalAiBots.length,0);
  assert.equal(db.personalAiBotBatches.length,0);
});

test('AI identity batch history is limited to the authenticated owner',async()=>{
  const ownerBatch={id:'batch-owner',ownerId:'owner-1',idempotencyKey:'identity-batch-owner-01',status:'completed',totalRecords:2,completedRecords:2};
  const otherBatch={id:'batch-other',ownerId:'owner-2',idempotencyKey:'identity-batch-other-01',status:'completed',totalRecords:3,completedRecords:3};
  const context=makeContext({
    method:'GET',path:'/api/admin/personal-ai-bots/batches',
    db:{personalAiBotBatches:[otherBatch,ownerBatch]}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,200);
  assert.deepEqual(context.res.payload.batches,[ownerBatch]);
});

test('AI identity batch history paginates after owner filtering and returns a stable cursor',async()=>{
  const db={personalAiBotBatches:[
    {id:'batch-foreign',ownerId:'owner-2',createdAt:'2026-11-10T05:00:00.000Z'},
    {id:'batch-c',ownerId:'owner-1',createdAt:'2026-11-10T03:00:00.000Z'},
    {id:'batch-b',ownerId:'owner-1',createdAt:'2026-11-10T02:00:00.000Z'},
    {id:'batch-a',ownerId:'owner-1',createdAt:'2026-11-10T01:00:00.000Z'}
  ]};
  const context=makeContext({
    method:'GET',
    path:'/api/admin/personal-ai-bots/batches',
    url:new URL('https://minglora.test/api/admin/personal-ai-bots/batches?limit=1&offset=1'),
    db
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,200);
  assert.deepEqual(context.res.payload.batches,[db.personalAiBotBatches[2]]);
  assert.equal(context.res.payload.nextOffset,2);
  assert.equal(context.res.payload.hasMore,true);
});

test('AI identity batch history rejects invalid pagination before returning owner records',async()=>{
  const context=makeContext({
    method:'GET',
    path:'/api/admin/personal-ai-bots/batches',
    url:new URL('https://minglora.test/api/admin/personal-ai-bots/batches?limit=101&offset=0'),
    db:{personalAiBotBatches:[{id:'batch-owner',ownerId:'owner-1'}]}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,400);
  assert.deepEqual(context.res.payload,{error:'AI identity batch history pagination is invalid.'});
});

test('explicitly skipped PostgreSQL identity writes are never reported as completed',async()=>{
  let saves=0;
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots',
    input:{displayName:'Skipped AI Identity',firstName:'Skipped',lastName:'Identity',categoryId:'ai-support'},
    persistAiIdentities:async()=>({ok:true,skipped:true}),
    saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,503);
  assert.match(context.res.payload.error,/not persisted to Minglora Supabase PostgreSQL/);
  assert.equal(saves,0);
});

test('AI identity batch marks an explicitly skipped PostgreSQL write retryable instead of completed',async()=>{
  const db={};
  let saves=0;
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/batches',
    input:{idempotencyKey:'identity-batch-skipped-01',items:identityBatchItems},
    db,uid:sequenceUid(1400),
    persistAiIdentities:async()=>({ok:true,skipped:true}),
    saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,503);
  assert.equal(context.res.payload.batch.status,'retryable_failed');
  assert.equal(context.res.payload.batch.completedRecords,0);
  assert.equal(context.res.payload.batch.failedRecords,2);
  assert.equal(db.personalAiBotBatches[0].status,'retryable_failed');
  assert.equal(db.personalAiBots.length,2);
  assert.ok(db.personalAiBots.every(bot=>bot.enabled===false&&bot.visibility==='private'));
  assert.equal(saves,2);
});


test('only the designated owner can create, edit and deactivate corporate departments',async()=>{
  const db={};
  let saves=0;
  const createRoot=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/departments',
    input:{name:'Regional Partnerships',description:'Regional teams and partnerships.'},
    db,uid:sequenceUid(1800),saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(createRoot);
  assert.equal(createRoot.res.statusCode,201);
  const root=createRoot.res.payload.department;
  assert.equal(root.enabled,true);
  assert.equal(root.builtIn,false);
  const createChild=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/departments',
    input:{name:'Caribbean Partnerships',parentDepartmentId:root.id},
    db,uid:sequenceUid(1900),saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(createChild);
  assert.equal(createChild.res.statusCode,201);
  const child=createChild.res.payload.department;
  assert.equal(child.parentDepartmentId,root.id);
  const update=makeContext({
    method:'PATCH',path:'/api/admin/personal-ai-bots/departments/'+root.id,
    input:{name:'Global Partnerships',description:'Global partners.',enabled:false},
    db,uid:sequenceUid(2000),saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(update);
  assert.equal(update.res.statusCode,200);
  assert.equal(update.res.payload.department.name,'Global Partnerships');
  assert.equal(update.res.payload.department.enabled,false);
  const deactivate=makeContext({
    method:'DELETE',path:'/api/admin/personal-ai-bots/departments/'+child.id,
    db,uid:sequenceUid(2100),saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(deactivate);
  assert.equal(deactivate.res.statusCode,200);
  assert.equal(deactivate.res.payload.department.enabled,false);
  assert.equal(saves,4);
  const cycle=makeContext({
    method:'PATCH',path:'/api/admin/personal-ai-bots/departments/'+root.id,
    input:{parentDepartmentId:child.id},db,saveStore:async()=>{throw new Error('must not save a cycle');}
  });
  await handlePersonalAiBotsAdminApi(cycle);
  assert.equal(cycle.res.statusCode,409);
});

test('department write routes reject non-owner and cross-origin callers before persisting',async()=>{
  let saves=0;
  const nonOwner=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/departments',
    input:{name:'Unauthorized Department'},isOwnerAdmin:false,
    saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(nonOwner);
  assert.equal(nonOwner.res.statusCode,403);
  assert.equal(nonOwner.db.personalAiBotDepartments,undefined);
  const crossOrigin=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/departments',
    input:{name:'Cross Origin Department'},isSameOriginWrite:false,
    saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(crossOrigin);
  assert.equal(crossOrigin.res.statusCode,403);
  assert.equal(crossOrigin.db.personalAiBotDepartments,undefined);
  assert.equal(saves,0);
});


test('owner can create, list, pause and close a scoped corporate vacancy',async()=>{
  const db={};let saves=0;
  const departmentId='department-finance_accounting';
  const create=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/vacancies',
    input:{positionCode:'department_manager',departmentId,title:'Finance Operations Manager',slots:2,requirements:'Accounting and reconciliation.'},
    db,uid:sequenceUid(2200),saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(create);
  assert.equal(create.res.statusCode,201);
  const vacancy=create.res.payload.vacancy;
  assert.equal(vacancy.status,'open');
  assert.equal(vacancy.slots,2);
  assert.equal(Object.hasOwn(vacancy,'employeeId'),false);
  const list=makeContext({method:'GET',path:'/api/admin/personal-ai-bots/vacancies',db});
  await handlePersonalAiBotsAdminApi(list);
  assert.equal(list.res.statusCode,200);
  assert.equal(list.res.payload.vacancies.length,1);
  const pause=makeContext({
    method:'PATCH',path:'/api/admin/personal-ai-bots/vacancies/'+vacancy.id,
    input:{status:'paused'},db,saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(pause);
  assert.equal(pause.res.statusCode,200);
  assert.equal(pause.res.payload.vacancy.status,'paused');
  const close=makeContext({
    method:'DELETE',path:'/api/admin/personal-ai-bots/vacancies/'+vacancy.id,
    db,saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(close);
  assert.equal(close.res.statusCode,200);
  assert.equal(close.res.payload.vacancy.status,'closed');
  assert.equal(saves,3);
});

test('vacancy API rejects non-owner writes and unsupported filled status',async()=>{
  const nonOwner=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/vacancies',
    input:{positionCode:'worker',departmentId:'department-finance_accounting'},
    isOwnerAdmin:false
  });
  await handlePersonalAiBotsAdminApi(nonOwner);
  assert.equal(nonOwner.res.statusCode,403);
  assert.equal(nonOwner.db.personalAiBotVacancies,undefined);
  const filled=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/vacancies',
    input:{positionCode:'worker',departmentId:'department-finance_accounting',title:'Vacant worker'},
    db:{}
  });
  await handlePersonalAiBotsAdminApi(filled);
  assert.equal(filled.res.statusCode,201);
  const id=filled.res.payload.vacancy.id;
  const attempt=makeContext({
    method:'PATCH',path:'/api/admin/personal-ai-bots/vacancies/'+id,
    input:{status:'filled'},db:filled.db
  });
  await handlePersonalAiBotsAdminApi(attempt);
  assert.equal(attempt.res.statusCode,400);
});


test('owner can submit and review an organizational AI candidate application',async()=>{
  const db={};let saves=0;
  const vacancyContext=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/vacancies',
    input:{positionCode:'worker',departmentId:'department-finance_accounting',title:'Finance AI Worker'},
    db,uid:sequenceUid(2600),saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(vacancyContext);
  const vacancy=vacancyContext.res.payload.vacancy;
  db.personalAiBots.push({id:'org-candidate-001',population:'organizational',displayName:'Org Candidate',username:'ai_org_candidate'});
  const create=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/applications',
    input:{vacancyId:vacancy.id,identityId:'org-candidate-001'},
    db,uid:sequenceUid(2700),saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(create);
  assert.equal(create.res.statusCode,201);
  assert.equal(create.res.payload.application.status,'submitted');
  assert.equal(Object.hasOwn(create.res.payload.application,'employeeId'),false);
  const list=makeContext({method:'GET',path:'/api/admin/personal-ai-bots/applications',db});
  await handlePersonalAiBotsAdminApi(list);
  assert.equal(list.res.statusCode,200);
  assert.equal(list.res.payload.applications.length,1);
  const review=makeContext({
    method:'PATCH',path:'/api/admin/personal-ai-bots/applications/'+create.res.payload.application.id,
    input:{status:'in_review'},db,saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(review);
  assert.equal(review.res.statusCode,200);
  assert.equal(review.res.payload.application.status,'in_review');
  const withdraw=makeContext({
    method:'PATCH',path:'/api/admin/personal-ai-bots/applications/'+create.res.payload.application.id,
    input:{status:'withdrawn'},db,saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(withdraw);
  assert.equal(withdraw.res.statusCode,200);
  assert.equal(withdraw.res.payload.application.status,'withdrawn');
  assert.deepEqual(withdraw.res.payload.application.statusHistory.map(entry=>entry.status),['submitted','in_review','withdrawn']);
  assert.equal(saves,4);
});

test('owner appointment route approves only shortlisted candidates and records employment history',async()=>{
  const db={};let saves=0;
  const vacancyContext=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/vacancies',
    input:{positionCode:'board_chair',departmentId:'department-executive_management',title:'Board Chair Appointment'},
    db,uid:sequenceUid(3100),saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(vacancyContext);
  const vacancy=vacancyContext.res.payload.vacancy;
  const candidate={id:'org-appointed-candidate',population:'organizational',displayName:'Appointed AI',username:'ai_appointed',status:'disabled',enabled:false};
  db.personalAiBots.push(candidate);
  const create=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/applications',
    input:{vacancyId:vacancy.id,identityId:candidate.id},
    db,uid:sequenceUid(3200),saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(create);
  assert.equal(create.res.statusCode,201);
  const notShortlisted=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/appointments',
    input:{applicationId:create.res.payload.application.id},db,uid:sequenceUid(3300),saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(notShortlisted);
  assert.equal(notShortlisted.res.statusCode,409);
  const shortlist=makeContext({
    method:'PATCH',path:'/api/admin/personal-ai-bots/applications/'+create.res.payload.application.id,
    input:{status:'shortlisted'},db,saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(shortlist);
  assert.equal(shortlist.res.statusCode,200);
  const appoint=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/appointments',
    input:{applicationId:create.res.payload.application.id},db,uid:sequenceUid(3400),saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(appoint);
  assert.equal(appoint.res.statusCode,201);
  assert.equal(appoint.res.payload.appointment.status,'appointed');
  assert.deepEqual(appoint.res.payload.appointment.permissions,[]);
  assert.equal(appoint.res.payload.appointment.permissionGrantStatus,'not_granted');
  assert.equal(appoint.res.payload.appointment.identityActivationStatus,'unchanged_disabled');
  assert.equal(candidate.status,'disabled');
  assert.equal(candidate.enabled,false);
  assert.equal(create.res.payload.application.status,'submitted');
  const appointments=makeContext({method:'GET',path:'/api/admin/personal-ai-bots/appointments',db});
  await handlePersonalAiBotsAdminApi(appointments);
  assert.equal(appointments.res.payload.appointments.length,1);
  const history=makeContext({method:'GET',path:'/api/admin/personal-ai-bots/employment-history',db});
  await handlePersonalAiBotsAdminApi(history);
  assert.equal(history.res.payload.events.length,1);
  assert.equal(saves,4);
});

test('appointment API is owner-only and rejects unsupported appointment fields',async()=>{
  const blocked=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/appointments',
    input:{applicationId:'application-1'},isOwnerAdmin:false
  });
  await handlePersonalAiBotsAdminApi(blocked);
  assert.equal(blocked.res.statusCode,403);
  assert.equal(blocked.db.personalAiBotAppointments,undefined);
  const unsupported=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/appointments',
    input:{applicationId:'application-1',permissions:['send_message']}
  });
  await handlePersonalAiBotsAdminApi(unsupported);
  assert.equal(unsupported.res.statusCode,400);
  assert.deepEqual(unsupported.db.personalAiBotAppointments,[]);
});

test('candidate application routes are owner-only and reject independent AI identities',async()=>{
  const nonOwner=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/applications',
    input:{vacancyId:'vacancy-existing',identityId:'candidate-existing'},
    isOwnerAdmin:false
  });
  await handlePersonalAiBotsAdminApi(nonOwner);
  assert.equal(nonOwner.res.statusCode,403);
  assert.equal(nonOwner.db.personalAiBotApplications,undefined);
  const db={personalAiBots:[{id:'independent-001',population:'independent',displayName:'Independent'}],personalAiBotVacancies:[{
    id:'vacancy-001',ownerId:'owner-1',title:'Position',positionCode:'worker',positionTitle:'Worker',
    departmentId:'department-finance_accounting',departmentName:'Finance and Accounting',status:'open'
  }]};
  const attempt=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/applications',
    input:{vacancyId:'vacancy-001',identityId:'independent-001'},db
  });
  await handlePersonalAiBotsAdminApi(attempt);
  assert.equal(attempt.res.statusCode,409);
  assert.equal(attempt.db.personalAiBotApplications.length,0);
});


test('provider assignment creation never returns the server-side credential reference',async()=>{
  const botId='00000000-0000-4000-8000-000000000401';
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/providers',
    input:{identityId:botId,providerName:'Example Provider',providerIdentifier:'example.provider',providerAccountReference:'default',credentialSecretReference:'env:MINGLORA_AI_PROVIDER_PRIVATE',modelName:'Example Model',modelIdentifier:'example-model'},
    db:{personalAiBots:[{id:botId,displayName:'AI Assistant'}]},
    persistAiIdentities:async()=>{},
    persistAiProviderAssignment:async assignment=>({...assignment,id:'assignment-created'})
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,201);
  assert.equal(context.res.payload.assignment.credentialConfigured,true);
  assert.ok(!Object.hasOwn(context.res.payload.assignment,'credentialSecretReference'));
  assert.doesNotMatch(JSON.stringify(context.res.payload),'env:MINGLORA_AI_PROVIDER_PRIVATE');
});



test('owner schedule preview is read-only and never dispatches work',async()=>{
  let saves=0;
  const context=makeContext({
    path:'/api/admin/personal-ai-bots/bots/00000000-0000-4000-8000-000000000001/schedule-preview',
    url:new URL('https://minglora.test/api/admin/personal-ai-bots/bots/00000000-0000-4000-8000-000000000001/schedule-preview?days=1'),
    now:()=> '2026-11-11T10:00:00.000Z',
    db:{
      personalAiBots:[{
        id:'00000000-0000-4000-8000-000000000001',status:'enabled',enabled:true,
        activitySchedule:{
          timezone:'America/Jamaica',daysOfWeek:[3],startTime:'09:00',endTime:'17:00',
          maxTasksPerDay:4
        }
      }],
      personalAiBotSettings:[{id:'global',enabled:true}]
    },
    saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,200);
  assert.equal(context.res.payload.preview.slots.length,1);
  assert.equal(context.res.payload.preview.slots[0].startsAtUtc,'2026-11-11T14:00:00.000Z');
  assert.equal(context.res.payload.preview.previewOnly,true);
  assert.equal(context.res.payload.preview.dispatchEnabled,false);
  assert.equal(context.res.payload.configurationGates.schedulerConnected,false);
  assert.equal(context.res.payload.configurationGates.dispatchEnabled,false);
  assert.equal(saves,0);
});

test('owner schedule preview rejects out-of-range preview horizons',async()=>{
  const context=makeContext({
    path:'/api/admin/personal-ai-bots/bots/00000000-0000-4000-8000-000000000001/schedule-preview',
    url:new URL('https://minglora.test/api/admin/personal-ai-bots/bots/00000000-0000-4000-8000-000000000001/schedule-preview?days=61'),
    now:()=> '2026-11-11T10:00:00.000Z',
    db:{personalAiBots:[{
      id:'00000000-0000-4000-8000-000000000001',status:'disabled',
      activitySchedule:{
        timezone:'America/Jamaica',daysOfWeek:[3],startTime:'09:00',endTime:'17:00',
        maxTasksPerDay:0
      }
    }]}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,400);
  assert.match(context.res.payload.error,/between 1 and 60/);
});


const validPersonaApiConfiguration={
  purpose:'Assist Minglora members with safe platform navigation.',
  role:'Member support assistant',
  communicationStyle:'Clear, respectful and concise.',
  tone:'Friendly and professional',
  responseLength:'balanced',
  expertise:['Minglora navigation'],
  languagePreferences:['English'],
  audience:'Minglora members',
  boundaries:'Never request passwords or authentication codes. Escalate account access issues to a human.',
  prohibitedBehaviors:'Never impersonate people, send messages, publish posts or change member account settings.',
  escalationInstructions:'Refer payment, identity and safety issues to the authorized human support team.',
  traits:{formality:50,warmth:70,humor:20,assertiveness:35,detail:60,creativity:40,initiative:20,caution:90}
};

test('Persona Laboratory API creates, evaluates, approves and activates a version under owner control',async()=>{
  const botId='00000000-0000-4000-8000-000000000002';
  const db={personalAiBots:[{
    id:botId,displayName:'Persona API Bot',status:'disabled',enabled:false,
    aiLabel:'AI Bot',aiDisclosureVisible:true,allowedAutonomousActions:[]
  }]};
  let saves=0;
  const post=async(path,input)=>{
    const context=makeContext({
      method:'POST',path,
      url:new URL('https://minglora.test'+path),
      input:input||{},db,saveStore:async()=>{saves++;}
    });
    await handlePersonalAiBotsAdminApi(context);
    return context.res;
  };

  const created=await post('/api/admin/personal-ai-bots/personas',{
    botId,configuration:validPersonaApiConfiguration
  });
  assert.equal(created.statusCode,201);
  const versionId=created.payload.version.id;
  assert.equal(created.payload.version.version,1);
  assert.equal(created.payload.version.status,'draft');

  const evaluated=await post('/api/admin/personal-ai-bots/personas/'+versionId+'/evaluate');
  assert.equal(evaluated.statusCode,200);
  assert.equal(evaluated.payload.evaluation.status,'pass');
  assert.match(evaluated.payload.evaluation.limitations,/No model inference/);

  const approved=await post('/api/admin/personal-ai-bots/personas/'+versionId+'/approve');
  assert.equal(approved.statusCode,200);
  assert.equal(approved.payload.version.status,'approved');

  const activated=await post('/api/admin/personal-ai-bots/personas/'+versionId+'/activate');
  assert.equal(activated.statusCode,200);
  assert.equal(activated.payload.version.status,'active');
  assert.equal(db.personalAiBots[0].activePersonaVersionId,versionId);
  assert.equal(db.personalAiBots[0].status,'disabled');
  assert.equal(db.personalAiBots[0].enabled,false);
  assert.deepEqual(db.personalAiBots[0].allowedAutonomousActions,[]);
  assert.equal(db.personalAiBots[0].aiDisclosureVisible,true);
  assert.equal(saves,4);
});

test('Persona Laboratory API rejects unsupported permission fields and non-owner requests',async()=>{
  const botId='00000000-0000-4000-8000-000000000003';
  const db={personalAiBots:[{id:botId,status:'disabled'}]};
  const invalid=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/personas',
    input:{botId,configuration:{...validPersonaApiConfiguration,tools:['send_message']}},
    db
  });
  await handlePersonalAiBotsAdminApi(invalid);
  assert.equal(invalid.res.statusCode,400);
  assert.match(invalid.res.payload.error,/unsupported fields/);
  assert.deepEqual(db.personalAiBotPersonaVersions,[]);

  const denied=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/personas',
    input:{botId,configuration:validPersonaApiConfiguration},
    isOwnerAdmin:false,db
  });
  await handlePersonalAiBotsAdminApi(denied);
  assert.equal(denied.res.statusCode,403);
  assert.equal(db.personalAiBotPersonaVersions,undefined);
});


test('Persona Laboratory API lists history and draft edits invalidate stale structural checks',async()=>{
  const botId='00000000-0000-4000-8000-000000000004';
  const db={personalAiBots:[{id:botId,displayName:'Editable Persona Bot',status:'disabled'}]};
  const post=async(path,input)=>{
    const context=makeContext({method:'POST',path,url:new URL('https://minglora.test'+path),input:input||{},db});
    await handlePersonalAiBotsAdminApi(context);
    return context.res;
  };
  const created=await post('/api/admin/personal-ai-bots/personas',{botId,configuration:validPersonaApiConfiguration});
  assert.equal(created.statusCode,201);
  const id=created.payload.version.id;
  const evaluated=await post('/api/admin/personal-ai-bots/personas/'+id+'/evaluate');
  assert.equal(evaluated.payload.evaluation.status,'pass');

  const listedContext=makeContext({
    method:'GET',path:'/api/admin/personal-ai-bots/personas',
    url:new URL('https://minglora.test/api/admin/personal-ai-bots/personas?botId='+botId),db
  });
  await handlePersonalAiBotsAdminApi(listedContext);
  assert.equal(listedContext.res.statusCode,200);
  assert.equal(listedContext.res.payload.versions.length,1);
  assert.equal(listedContext.res.payload.activePersonaVersionId,null);

  const edited=await (async()=>{
    const context=makeContext({
      method:'PATCH',path:'/api/admin/personal-ai-bots/personas/'+id,
      url:new URL('https://minglora.test/api/admin/personal-ai-bots/personas/'+id),
      input:{configuration:{...validPersonaApiConfiguration,tone:'Calm and reassuring'}},db
    });
    await handlePersonalAiBotsAdminApi(context);
    return context.res;
  })();
  assert.equal(edited.statusCode,200);
  assert.equal(edited.payload.version.configuration.tone,'Calm and reassuring');
  assert.equal(edited.payload.version.structuralEvaluation,null);
});


test('team handoff API is owner-controlled, one-receiver and permanently non-dispatching',async()=>{
  const teamId='00000000-0000-4000-8000-000000000501';
  const senderId='00000000-0000-4000-8000-000000000502';
  const receiverId='00000000-0000-4000-8000-000000000503';
  const taskId='00000000-0000-4000-8000-000000000504';
  const db={
    personalAiBots:[{id:senderId,createdBy:'owner'},{id:receiverId,createdBy:'owner'}],
    personalAiBotTeams:[{id:teamId,ownerId:'owner',name:'Review Team',status:'enabled',enabled:true}],
    personalAiBotTeamMembers:[
      {id:'member-1',ownerId:'owner',teamId,botId:senderId},
      {id:'member-2',ownerId:'owner',teamId,botId:receiverId}
    ],
    personalAiBotTasks:[{id:taskId,botId:senderId,status:'awaiting_administrator_approval'}]
  };
  let saves=0;
  const invoke=async(method,path,input)=>{
    const context=makeContext({
      method,path,url:new URL('https://minglora.test'+path),input:input||{},db,
      saveStore:async()=>{saves++;}
    });
    await handlePersonalAiBotsAdminApi(context);
    return {...context.res,payload:context.res.payload?JSON.parse(JSON.stringify(context.res.payload)):null};
  };
  const base='/api/admin/personal-ai-bots/teams/'+teamId+'/handoffs';
  const created=await invoke('POST',base,{
    sourceTaskId:taskId,senderBotId:senderId,receivingBotId:receiverId,
    requiredInput:'Review the source draft for accuracy and completeness.',
    expectedOutput:'Return a structured review with findings.',
    contextScope:'team_internal',privacyAttested:true
  });
  assert.equal(created.statusCode,201);
  assert.equal(created.payload.handoff.dispatchStatus,'not_dispatched');
  assert.equal(created.payload.handoff.status,'pending_owner_review');
  const id=created.payload.handoff.id;

  const accepted=await invoke('POST',base+'/'+id+'/accept');
  assert.equal(accepted.statusCode,200);
  assert.equal(accepted.payload.handoff.status,'accepted');
  assert.equal(accepted.payload.handoff.dispatchStatus,'not_dispatched');

  const completed=await invoke('POST',base+'/'+id+'/complete',{
    resultSummary:'Human-reviewed result recorded for this handoff.'
  });
  assert.equal(completed.statusCode,200);
  assert.equal(completed.payload.handoff.status,'completed');
  assert.equal(completed.payload.handoff.dispatchStatus,'not_dispatched');
  assert.equal(db.personalAiBotTasks.length,1);

  const listed=await invoke('GET',base);
  assert.equal(listed.statusCode,200);
  assert.equal(listed.payload.handoffs.length,1);
  assert.equal(saves,3);
});

test('team handoff API requires explicit owner privacy attestation before persistence',async()=>{
  const teamId='00000000-0000-4000-8000-000000000521';
  const senderId='00000000-0000-4000-8000-000000000522';
  const receiverId='00000000-0000-4000-8000-000000000523';
  const taskId='00000000-0000-4000-8000-000000000524';
  const db={
    personalAiBots:[{id:senderId},{id:receiverId}],
    personalAiBotTeams:[{id:teamId,ownerId:'owner',name:'Privacy Team',status:'enabled'}],
    personalAiBotTeamMembers:[
      {ownerId:'owner',teamId,botId:senderId},
      {ownerId:'owner',teamId,botId:receiverId}
    ],
    personalAiBotTasks:[{id:taskId,botId:senderId,status:'awaiting_administrator_approval'}]
  };
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/teams/'+teamId+'/handoffs',
    input:{
      sourceTaskId:taskId,senderBotId:senderId,receivingBotId:receiverId,
      requiredInput:'Review approved team information only.',
      expectedOutput:'Return a short review to the owner.',
      contextScope:'team_internal'
    },db
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,400);
  assert.match(context.res.payload.error,/owner must confirm that no private member conversation/);
  assert.equal(db.personalAiBotTeamHandoffs.length,0);
});

test('team handoff API rejects private context, unsupported fields and non-owner access',async()=>{
  const teamId='00000000-0000-4000-8000-000000000511';
  const senderId='00000000-0000-4000-8000-000000000512';
  const receiverId='00000000-0000-4000-8000-000000000513';
  const taskId='00000000-0000-4000-8000-000000000514';
  const db={
    personalAiBots:[{id:senderId},{id:receiverId}],
    personalAiBotTeams:[{id:teamId,ownerId:'owner',name:'Review Team',status:'enabled'}],
    personalAiBotTeamMembers:[
      {ownerId:'owner',teamId,botId:senderId},
      {ownerId:'owner',teamId,botId:receiverId}
    ],
    personalAiBotTasks:[{id:taskId,botId:senderId,status:'awaiting_administrator_approval'}]
  };
  const path='/api/admin/personal-ai-bots/teams/'+teamId+'/handoffs';
  const context=makeContext({
    method:'POST',path,
    input:{
      sourceTaskId:taskId,senderBotId:senderId,receivingBotId:receiverId,
      requiredInput:'This includes private member conversation content.',
      expectedOutput:'Return a review.',
      contextScope:'private',
      tools:['send_message']
    },
    db
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,400);
  assert.match(context.res.payload.error,/unsupported fields/);

  const denied=makeContext({
    method:'GET',path,url:new URL('https://minglora.test'+path),
    db,isOwnerAdmin:false
  });
  await handlePersonalAiBotsAdminApi(denied);
  assert.equal(denied.res.statusCode,403);
  assert.equal(db.personalAiBotTeamHandoffs,undefined);
});


test('emergency shutdown API reports paused teams and cancelled handoffs',async()=>{
  const teamId='00000000-0000-4000-8000-000000000601';
  const handoffId='00000000-0000-4000-8000-000000000602';
  const db={
    personalAiBotSettings:[{id:'global',enabled:true,hybridEnabled:true}],
    personalAiBots:[{id:'bot-active',status:'enabled',enabled:true}],
    personalAiBotTasks:[{id:'task-open',status:'approved_waiting_for_worker'}],
    personalAiBotTeams:[{id:teamId,ownerId:'owner-1',name:'Shutdown Team',status:'enabled',enabled:true}],
    personalAiBotTeamHandoffs:[{
      id:handoffId,ownerId:'owner-1',teamId,senderBotId:'bot-a',receivingBotId:'bot-b',
      status:'accepted',dispatchStatus:'not_dispatched',createdAt:'2026-11-11T11:00:00.000Z'
    }]
  };
  let saves=0;
  const context=makeContext({
    method:'POST',path:'/api/admin/personal-ai-bots/emergency-shutdown',
    input:{},db,saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(context);
  assert.equal(context.res.statusCode,200);
  assert.equal(context.res.payload.paused,1);
  assert.equal(context.res.payload.pausedTeams,1);
  assert.equal(context.res.payload.cancelled,1);
  assert.equal(context.res.payload.cancelledHandoffs,1);
  assert.equal(context.res.payload.message.includes('team handoffs were cancelled'),true);
  assert.equal(db.personalAiBotTeams[0].status,'paused');
  assert.equal(db.personalAiBotTeamHandoffs[0].status,'cancelled');
  assert.equal(saves,1);
});


test('multilingual settings API loads defaults and saves private per-bot language preferences',async()=>{
  const botId='00000000-0000-4000-8000-000000000701';
  const db={personalAiBots:[{id:botId,createdBy:'owner-1',languages:['English','Jamaican Patois']}]};
  let saves=0;
  const base='/api/admin/personal-ai-bots/bots/'+botId+'/languages';
  const read=makeContext({
    method:'GET',path:base,url:new URL('https://minglora.test'+base),db
  });
  await handlePersonalAiBotsAdminApi(read);
  assert.equal(read.res.statusCode,200);
  assert.equal(read.res.payload.saved,false);
  assert.equal(read.res.payload.configuration.providerCompatibility,'not_checked');
  assert.equal(read.res.payload.configuration.humanReviewRequired,true);

  const write=makeContext({
    method:'PUT',path:base,url:new URL('https://minglora.test'+base),
    input:{
      supportedLanguages:['en','jam','es'],primaryLanguage:'en',
      fallbackLanguage:'jam',locale:'en-JM',
      detectionMode:'confidence_guarded',confidenceThreshold:0.82,
      responsePolicy:'match_input_language',codeSwitchingPolicy:'preserve',
      translationDisplay:'show_original_and_translation',humanReviewRequired:true
    },db,saveStore:async()=>{saves++;}
  });
  await handlePersonalAiBotsAdminApi(write);
  assert.equal(write.res.statusCode,200);
  assert.equal(write.res.payload.configuration.fallbackLanguage,'jam');
  assert.equal(write.res.payload.configuration.providerAdapterConnected,false);
  assert.equal(write.res.payload.configuration.languageQuality.every(item=>item.status==='unverified'),true);
  assert.deepEqual(db.personalAiBots[0].languages,['English','Jamaican Patois']);
  assert.equal(saves,1);
});

test('multilingual settings API rejects provider assertions and non-owner reads',async()=>{
  const botId='00000000-0000-4000-8000-000000000702';
  const base='/api/admin/personal-ai-bots/bots/'+botId+'/languages';
  const db={personalAiBots:[{id:botId,createdBy:'owner-1'}]};
  const invalid=makeContext({
    method:'PUT',path:base,url:new URL('https://minglora.test'+base),
    input:{supportedLanguages:['en'],primaryLanguage:'en',fallbackLanguage:'en',locale:'en-JM',providerCompatibility:'verified'},
    db
  });
  await handlePersonalAiBotsAdminApi(invalid);
  assert.equal(invalid.res.statusCode,400);
  assert.equal(db.personalAiBotLanguageSettings.length,0);

  const denied=makeContext({
    method:'GET',path:base,url:new URL('https://minglora.test'+base),
    db,isOwnerAdmin:false
  });
  await handlePersonalAiBotsAdminApi(denied);
  assert.equal(denied.res.statusCode,403);
  assert.equal(db.personalAiBotLanguageSettings,undefined);
});


test('multilingual evaluation set API creates, submits and records human review without provider execution',async()=>{
  const botId='00000000-0000-4000-8000-000000000801';
  const db={
    personalAiBots:[{id:botId,createdBy:'owner-1',languages:['English','Jamaican Patois']}],
    personalAiBotLanguageSettings:[{
      id:'language-settings-1',botId,ownerId:'owner-1',
      configuration:{
        supportedLanguages:['en','jam'],primaryLanguage:'en',fallbackLanguage:'jam',
        languageQuality:[{code:'en',status:'unverified'},{code:'jam',status:'unverified'}]
      }
    }]
  };
  let saves=0;
  const invoke=async(method,path,input={})=>{
    const context=makeContext({
      method,path,url:new URL('https://minglora.test'+path),input,db,
      saveStore:async()=>{saves++;}
    });
    await handlePersonalAiBotsAdminApi(context);
    return {...context.res,payload:context.res.payload?JSON.parse(JSON.stringify(context.res.payload)):null};
  };
  const base='/api/admin/personal-ai-bots/bots/'+botId+'/languages/evaluation-sets';
  const cases=Array.from({length:5},(_,index)=>({
    inputText:'Synthetic source example '+index,
    expectedOutput:'Synthetic human reference '+index,
    category:'general'
  }));
  const created=await invoke('POST',base,{
    languageCode:'jam',name:'Patois API Test Set',description:'Synthetic test examples.',
    cases,syntheticDataAttested:true
  });
  assert.equal(created.statusCode,201);
  assert.equal(created.payload.evaluationSet.status,'draft');
  const id=created.payload.evaluationSet.id;

  const submitted=await invoke('POST',base+'/'+id+'/submit');
  assert.equal(submitted.statusCode,200);
  assert.equal(submitted.payload.evaluationSet.status,'pending_human_review');

  const reviewed=await invoke('POST',base+'/'+id+'/review',{
    decision:'approve',reviewerRole:'native_speaker',
    evidenceReference:'owner-entered-language-review-001',
    reviewNotes:'Human reviewer recorded the evaluation notes.',
    reviewerAttestation:true
  });
  assert.equal(reviewed.statusCode,200);
  assert.equal(reviewed.payload.evaluationSet.status,'human_reviewed');
  assert.equal(reviewed.payload.evaluationSet.providerExecutionStatus,'not_run');
  assert.equal(reviewed.payload.evaluationSet.languageQualityStatus,'unverified');

  const listed=await invoke('GET',base);
  assert.equal(listed.statusCode,200);
  assert.equal(listed.payload.evaluationSets.length,1);
  assert.deepEqual(db.personalAiBots[0].languages,['English','Jamaican Patois']);
  assert.equal(saves,3);
});

test('multilingual evaluation set API requires owner privacy attestation and blocks non-owner access',async()=>{
  const botId='00000000-0000-4000-8000-000000000802';
  const db={
    personalAiBots:[{id:botId,createdBy:'owner-1'}],
    personalAiBotLanguageSettings:[{
      id:'language-settings-2',botId,ownerId:'owner-1',
      configuration:{supportedLanguages:['en'],primaryLanguage:'en',fallbackLanguage:'en'}
    }]
  };
  const path='/api/admin/personal-ai-bots/bots/'+botId+'/languages/evaluation-sets';
  const invalid=makeContext({
    method:'POST',path,url:new URL('https://minglora.test'+path),
    input:{languageCode:'en',name:'Unattested Set',cases:[{
      inputText:'Synthetic sample',expectedOutput:'Reference sample'
    }]},db
  });
  await handlePersonalAiBotsAdminApi(invalid);
  assert.equal(invalid.res.statusCode,400);
  assert.equal(db.personalAiBotLanguageEvaluationSets.length,0);

  const denied=makeContext({
    method:'GET',path,url:new URL('https://minglora.test'+path),db,isOwnerAdmin:false
  });
  await handlePersonalAiBotsAdminApi(denied);
  assert.equal(denied.res.statusCode,403);
  assert.equal(db.personalAiBotLanguageEvaluationSets.length,0);
});
