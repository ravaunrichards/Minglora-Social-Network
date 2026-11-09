import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PERSONAL_AI_BOT_CATEGORIES,
  PERSONAL_AI_BOT_HYBRID_ACTIONS,
  ensurePersonalAiBotCollections,
  getPersonalAiBotCategories,
  getPersonalAiBotOverview,
  createPersonalAiBot,
  createPersonalAiBotStarterSet,
  updatePersonalAiBot,
  setPersonalAiBotCategoryEnabled,
  queuePersonalAiBotInstruction,
  approvePersonalAiBotTask,
  cancelPersonalAiBotTask,
  setPersonalAiBotNetworkSettings
} from '../../backend/modules/personal-ai-bots/personal-ai-bots-service.js';

const makeDb=()=>({});
let sequence=0;
const uid=()=> '00000000-0000-4000-8000-'+String(++sequence).padStart(12,'0');
const actor='owner-user';
const stamp='2026-11-09T10:00:00.000Z';

test('the Personal AI Bots Network starts disabled and administrator-controlled',()=>{
  const db=makeDb();
  const settings=ensurePersonalAiBotCollections(db);
  assert.equal(settings.enabled,false);
  assert.equal(settings.hybridEnabled,false);
  assert.equal(settings.defaultAutonomyMode,'administrator_controlled');
  assert.equal(settings.requireAdministratorApproval,true);
  assert.equal(settings.executionWorkersConfigured,false);
});

test('the requested 15 categories are defined and initially enabled',()=>{
  const db=makeDb();
  const categories=getPersonalAiBotCategories(db);
  assert.equal(PERSONAL_AI_BOT_CATEGORIES.length,15);
  assert.equal(categories.length,15);
  assert.ok(categories.every(category=>category.enabled===true));
  for(const name of ['Assistant Bots','Moderation Bots','Customer Service Bots','Automation Bots','Analytics Bots','Companion Bots','Creators','Influencers','Friends','News','Entertainers','Musicians','Community Hosts','Supports','Live Hosts']){
    assert.ok(categories.some(category=>category.name===name),name+' category should exist');
  }
});

test('starter set creates one disabled administrator-controlled bot per category and is idempotent',()=>{
  const db=makeDb();
  const created=createPersonalAiBotStarterSet(db,actor,stamp,uid);
  assert.equal(created.length,15);
  assert.equal(db.personalAiBots.length,15);
  assert.ok(created.every(bot=>bot.enabled===false&&bot.status==='disabled'));
  assert.ok(created.every(bot=>bot.autonomyMode==='administrator_controlled'));
  assert.ok(created.every(bot=>bot.allowedAutonomousActions.length===0));
  assert.ok(created.every(bot=>bot.requiresApprovalForEveryTask===true&&bot.requiresApprovalForPublishing===true));
  assert.ok(created.every(bot=>bot.profileType==='ai_bot'&&bot.aiLabel==='AI Bot'));
  assert.equal(createPersonalAiBotStarterSet(db,actor,stamp,uid).length,0);
  assert.equal(db.personalAiBots.length,15);
});

test('individual bot creation always starts disabled with no autonomous permissions',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'Minglora Help Desk',categoryId:'assistant-bots'},actor,stamp,uid);
  assert.equal(bot.status,'disabled');
  assert.equal(bot.enabled,false);
  assert.equal(bot.autonomyMode,'administrator_controlled');
  assert.deepEqual(bot.allowedAutonomousActions,[]);
  assert.equal(bot.aiLabel,'AI Bot');
});

test('category controls are persistent and prevent new instructions in disabled categories',()=>{
  const db=makeDb();
  createPersonalAiBotStarterSet(db,actor,stamp,uid);
  const category=setPersonalAiBotCategoryEnabled(db,'creators',false,actor,stamp,uid);
  assert.equal(category.enabled,false);
  assert.equal(getPersonalAiBotCategories(db).find(item=>item.id==='creators').enabled,false);
  const bot=db.personalAiBots.find(item=>item.categoryId==='creators');
  bot.enabled=true;bot.status='enabled';
  assert.throws(()=>queuePersonalAiBotInstruction(db,bot.id,{taskType:'draft_post',instruction:'Prepare a new draft'},actor,stamp,uid),/category is disabled/);
  setPersonalAiBotCategoryEnabled(db,'creators',true,actor,stamp,uid);
  assert.equal(getPersonalAiBotCategories(db).find(item=>item.id==='creators').enabled,true);
});

test('hybrid mode accepts only the defined low-risk permission allowlist',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'Analytics Guide',categoryId:'analytics-bots'},actor,stamp,uid);
  assert.throws(()=>updatePersonalAiBot(db,bot.id,{allowedAutonomousActions:['analytics_read']},actor,stamp,uid),/Switch the bot to hybrid mode/);
  updatePersonalAiBot(db,bot.id,{autonomyMode:'hybrid'},actor,stamp,uid);
  const updated=updatePersonalAiBot(db,bot.id,{allowedAutonomousActions:['analytics_read','draft_content']},actor,stamp,uid);
  assert.deepEqual(updated.allowedAutonomousActions,['analytics_read','draft_content']);
  assert.throws(()=>updatePersonalAiBot(db,bot.id,{allowedAutonomousActions:['publish_post']},actor,stamp,uid),/low-risk hybrid actions/);
  assert.ok(PERSONAL_AI_BOT_HYBRID_ACTIONS.includes('analytics_read'));
});

test('returning to administrator-controlled mode clears autonomous permissions',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'Analytics Guide',categoryId:'analytics-bots'},actor,stamp,uid);
  updatePersonalAiBot(db,bot.id,{autonomyMode:'hybrid'},actor,stamp,uid);
  updatePersonalAiBot(db,bot.id,{allowedAutonomousActions:['analytics_read']},actor,stamp,uid);
  const updated=updatePersonalAiBot(db,bot.id,{autonomyMode:'administrator_controlled'},actor,stamp,uid);
  assert.deepEqual(updated.allowedAutonomousActions,[]);
});

test('network switch cannot remove the administrator approval requirement',()=>{
  const db=makeDb();
  createPersonalAiBotStarterSet(db,actor,stamp,uid);
  const settings=setPersonalAiBotNetworkSettings(db,{enabled:true,hybridEnabled:true,requireAdministratorApproval:false},actor,stamp,uid);
  assert.equal(settings.enabled,true);
  assert.equal(settings.hybridEnabled,true);
  assert.equal(settings.requireAdministratorApproval,true);
  assert.equal(settings.defaultAutonomyMode,'administrator_controlled');
});

test('instructions are pending approval and approval does not execute without a worker',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'Content Creator',categoryId:'creators'},actor,stamp,uid);
  updatePersonalAiBot(db,bot.id,{status:'enabled'},actor,stamp,uid);
  setPersonalAiBotNetworkSettings(db,{enabled:true},actor,stamp,uid);
  const task=queuePersonalAiBotInstruction(db,bot.id,{taskType:'draft_post',instruction:'Prepare a draft about the Minglora community.'},actor,stamp,uid);
  assert.equal(task.status,'awaiting_administrator_approval');
  assert.equal(task.executionStatus,'not_dispatched');
  const approved=approvePersonalAiBotTask(db,task.id,actor,stamp,uid);
  assert.equal(approved.status,'approved_waiting_for_worker');
  assert.equal(approved.executionStatus,'worker_not_configured');
  assert.equal(approved.completedAt,null);
});

test('follow and unfollow instructions require a selected target account',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'Assistant',categoryId:'assistant-bots'},actor,stamp,uid);
  updatePersonalAiBot(db,bot.id,{status:'enabled'},actor,stamp,uid);
  setPersonalAiBotNetworkSettings(db,{enabled:true},actor,stamp,uid);
  assert.throws(()=>queuePersonalAiBotInstruction(db,bot.id,{taskType:'follow',instruction:'Follow this account'},actor,stamp,uid),/member account/);
  const task=queuePersonalAiBotInstruction(db,bot.id,{taskType:'follow',targetUserId:'member-123',instruction:'Follow the selected member after approval'},actor,stamp,uid);
  assert.equal(task.targetUserId,'member-123');
  assert.equal(task.highImpact,true);
});

test('pending instructions can be cancelled and cannot be approved twice',()=>{
  const db=makeDb();
  const bot=createPersonalAiBot(db,{displayName:'Assistant',categoryId:'assistant-bots'},actor,stamp,uid);
  updatePersonalAiBot(db,bot.id,{status:'enabled'},actor,stamp,uid);
  setPersonalAiBotNetworkSettings(db,{enabled:true},actor,stamp,uid);
  const task=queuePersonalAiBotInstruction(db,bot.id,{taskType:'assistant_request',instruction:'Answer this administrative question.'},actor,stamp,uid);
  const cancelled=cancelPersonalAiBotTask(db,task.id,actor,stamp,uid);
  assert.equal(cancelled.status,'cancelled');
  assert.throws(()=>approvePersonalAiBotTask(db,task.id,actor,stamp,uid),/Only pending instructions/);
});

test('overview reports real configured bot and queue counts without synthetic users',()=>{
  const db=makeDb();
  createPersonalAiBotStarterSet(db,actor,stamp,uid);
  const overview=getPersonalAiBotOverview(db);
  assert.equal(overview.counts.totalBots,15);
  assert.equal(overview.counts.disabledBots,15);
  assert.equal(overview.counts.enabledBots,0);
  assert.equal(overview.counts.pendingInstructions,0);
  assert.equal(overview.network.enabled,false);
});
