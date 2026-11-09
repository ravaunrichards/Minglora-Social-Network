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
