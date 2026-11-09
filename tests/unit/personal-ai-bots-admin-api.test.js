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
