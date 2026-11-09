import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('Personal AI Bots page loads the dedicated responsive controller and styles',async()=>{
  const html=await read('public/personal-ai-bots.html');
  assert.match(html,/personal-ai-bots\.css/);
  assert.match(html,/personal-ai-bots\.js/);
  assert.match(html,/id="pab-root"/);
  assert.match(html,/noindex,nofollow/);
});

test('admin UI exposes the complete 15-category starter set and all three autonomy modes',async()=>{
  const [service,ui]=await Promise.all([read('backend/modules/personal-ai-bots/personal-ai-bots-service.js'),read('public/personal-ai-bots.js')]);
  for(const name of ['AI Friends','AI Creators','AI Influencers','AI News','AI Musicians','AI Entertainers','AI Gamers','AI Community Hosts','AI Live Hosts','AI Moderators','AI Support','AI Educators','AI Sports','AI Travel','AI Business']) assert.ok(service.includes("name:'"+name+"'"),name);
  assert.match(ui,/Administrator-controlled/);
  assert.match(ui,/Human approval for every task/);
  assert.match(ui,/Hybrid \(restricted\)/);
});

test('dashboard contains global, category, individual, bulk and emergency controls',async()=>{
  const ui=await read('public/personal-ai-bots.js');
  for(const phrase of ['Master network switch','Category manager','Create 15 starter bots','Bot directory','Apply to selected bots','Emergency shutdown','Bot Teams','Personality','Activity schedule and daily limits']) assert.ok(ui.includes(phrase),phrase);
});

test('central Following Manager supports selected-bot batches with supervised approval',async()=>{
  const ui=await read('public/personal-ai-bots.js');
  assert.match(ui,/Following Manager/);
  assert.match(ui,/Search members/);
  assert.match(ui,/submitFollowInstruction/);
  assert.match(ui,/id=\"pab-follow-bot\" class=\"pab-select\" multiple size=\"5\"/);
  assert.match(ui,/follow-batch/);
  assert.match(ui,/10 instructions per rolling 24 hours/);
  assert.match(ui,/No relationship changed/);
  assert.match(ui,/AI follow graph only/);
  assert.match(ui,/Select no more than 10 bots/);
});

test('team assignment UI explicitly keeps membership separate from bot activation',async()=>{
  const ui=await read('public/personal-ai-bots.js');
  assert.match(ui,/Bot Teams/);
  assert.match(ui,/Team membership does not activate the bot/);
  assert.match(ui,/Remove this AI bot from the team/);
});
