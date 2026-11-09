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

test('new AI bot creation captures gender presentation separately from gender identity',async()=>{
  const ui=await read('public/personal-ai-bots.js');
  assert.match(ui,/id="pab-bot-gender-presentation"/);
  assert.match(ui,/genderPresentation:document\.querySelector\('#pab-bot-gender-presentation'\)\.value/);
  assert.match(ui,/genderPresentation:card\.querySelector\('\.pab-bot-gender-presentation'\)\.value/);
});

test('admin UI lets administrators create and edit all three AI populations',async()=>{
  const ui=await read('public/personal-ai-bots.js');
  for(const id of ['independent','organizational','specialized_service']) assert.ok(ui.includes("['"+id+"',")||ui.includes('value="'+id+'"'),id);
  assert.match(ui,/id="pab-bot-population"/);
  assert.match(ui,/population:document\.querySelector\('#pab-bot-population'\)\.value/);
  assert.match(ui,/class="pab-select pab-bot-population"/);
  assert.match(ui,/population:card\.querySelector\('\.pab-bot-population'\)\.value/);
});

test('admin bot directory filters records independently by the three AI populations',async()=>{
  const ui=await read('public/personal-ai-bots.js');
  for(const value of ['all','independent','organizational','specialized_service']) assert.ok(ui.includes('value="'+value+'"'),value);
  assert.match(ui,/id="pab-population-filter"[^>]*aria-label="Filter by AI population"/);
  assert.match(ui,/data-population="'\+esc\(bot\.population\|\|'independent'\)\+'"/);
  assert.match(ui,/addEventListener\('change',filterBots\)/);
  assert.match(ui,/populationMatches=population==='all'\|\|card\.dataset\.population===population/);
  assert.match(ui,/card\.hidden=!\(searchMatches&&populationMatches\)/);
});

test('admin UI exposes the complete 15-category starter set and all five autonomy modes',async()=>{
  const [service,ui]=await Promise.all([read('backend/modules/personal-ai-bots/personal-ai-bots-service.js'),read('public/personal-ai-bots.js')]);
  for(const name of ['AI Friends','AI Creators','AI Influencers','AI News','AI Musicians','AI Entertainers','AI Gamers','AI Community Hosts','AI Live Hosts','AI Moderators','AI Support','AI Educators','AI Sports','AI Travel','AI Business']) assert.ok(service.includes("name:'"+name+"'"),name);
  for(const mode of ['Fully supervised','Supervisor controlled','Hybrid autonomy','Autonomous within limits','Restricted observation']) assert.ok(ui.includes('>'+mode+'</option>'),mode);
  assert.ok(ui.includes("card.querySelectorAll('.pab-hybrid-action')"));
  assert.ok(ui.includes("autonomyMode==='autonomous_within_limits'"));
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


test('provider assignment controls distinguish a stored assignment from a live provider connection',async()=>{
  const ui=await read('public/personal-ai-bots.js');
  for(const phrase of [
    'AI provider and model assignments',
    'Provider name','Provider identifier','Model name','Model identifier',
    'Server-side credential reference','Do not paste an API key here',
    'New assignments are saved as configured and unverified',
    'credentialConfigured','providerHealthStatus'
  ]) assert.ok(ui.includes(phrase),phrase);
  assert.match(ui,/API\+'\/providers'/);
  assert.match(ui,/identityId:document\.querySelector\('#pab-provider-identity'\)/);
});


test('provider credentials are labelled as references, not proof of a live secret',async()=>{
  const source=await read('public/personal-ai-bots.js');
  assert.match(source,/Reference saved/);
  assert.match(source,/Missing reference/);
  assert.match(source,/health check succeeds/);
});


test('AI email identity panel records addresses without claiming inbox provisioning',async()=>{
  const source=await read('public/personal-ai-bots.js');
  for(const phrase of [
    'AI email identity records',
    'NOT VERIFIED and NOT PROVISIONED',
    'does not create a mailbox',
    'Email address','Email type','Set as primary address',
    'Save AI email identity record','not_provisioned','not_verified'
  ]) assert.ok(source.includes(phrase),phrase);
  assert.match(source,/API\+'\/emails'/);
  assert.match(source,/emailIdentitiesSource/);
  assert.match(source,/provisioningStatus/);
});


test('public AI profile controls are explicit and discovery remains disabled by default',async()=>{
  const [service,admin,ui]=await Promise.all([
    read('backend/modules/personal-ai-bots/personal-ai-bots-service.js'),
    read('backend/modules/personal-ai-bots/admin-api.js'),
    read('public/personal-ai-bots.js')
  ]);
  assert.match(service,/visibility:'private',publicProfileEnabled:false/);
  assert.match(admin,/public_profile_enabled:bot\.publicProfileEnabled===true && bot\.visibility==='public' && bot\.status==='enabled'/);
  assert.match(ui,/Profile visibility/);
  assert.match(ui,/List this AI in public discovery/);
  assert.match(ui,/publicProfileEnabled:card\.querySelector\('\.pab-bot-public-discovery'\)\.checked/);
});

test('signed-in AI discovery page loads its controller and supports ISO country multi-select',async()=>{
  const [html,script,index]=await Promise.all([
    read('public/ai-discover.html'),read('public/ai-discover.js'),read('public/index.html')
  ]);
  assert.match(html,/AI Member Discovery/);
  assert.match(html,/id="aid-country" multiple/);
  assert.match(html,/Discover AI members/);
  assert.match(script,/COUNTRY_CODES/);
  assert.match(script,/new Intl\.DisplayNames\(\['en'\],\{type:'region'\}\)/);
  assert.match(script,/countryCode:multi\('aid-country'\)/);
  assert.match(script,/fetch\('\/api\/ai\/discover\?/);
  assert.match(index,/href="\/ai-discover\.html"[^>]*aria-label="Discover AI members"/);
});


test('AI profile editor uses all 249 ISO country and territory names with country-code mapping',async()=>{
  const source=await read('public/personal-ai-bots.js');
  const match=source.match(/const AI_COUNTRY_CODES='([^']+)'\.split\(' '\)/);
  assert.ok(match,'AI profile country catalogue is missing');
  const codes=match[1].split(' ');
  assert.equal(codes.length,249);
  assert.equal(new Set(codes).size,249);
  assert.match(source,/new Intl\.DisplayNames\(\['en'\],\{type:'region'\}\)/);
  assert.match(source,/id="pab-country-options"/);
  assert.match(source,/pab-origin-country-name" list="pab-country-options"/);
  assert.match(source,/pab-current-country-name" list="pab-country-options"/);
  assert.match(source,/AI_COUNTRY_CODE_BY_NAME\.get/);
});


test('owner Admin Centre exposes a real AI profile report review queue',async()=>{
  const source=await read('public/personal-ai-bots.js');
  const css=await read('public/personal-ai-bots.css');
  assert.match(source,/AI profile safety reports/);
  assert.match(source,/Mark in review/);
  assert.match(source,/Mark actioned/);
  assert.match(source,/Dismiss report/);
  assert.match(source,/reviewAiProfileReport/);
  assert.match(source,/API\+'\/safety\/reports\/'\+encodeURIComponent\(reportId\)/);
  assert.match(css,/\.pab-report-card/);
  assert.match(css,/\.pab-report-resolution/);
});


test('owner Admin Centre exposes bounded JSON identity batch import with retry history',async()=>{
  const [ui,api,service]=await Promise.all([
    read('public/personal-ai-bots.js'),
    read('backend/modules/personal-ai-bots/admin-api.js'),
    read('backend/modules/personal-ai-bots/personal-ai-bots-service.js')
  ]);
  for(const phrase of ['Bulk AI identity generation and import','id="pab-batch-form"','id="pab-batch-items"','id="pab-batch-key"','Recent identity batches','createIdentityBatch']) assert.ok(ui.includes(phrase),phrase);
  assert.match(ui,/API\+'\/batches'/);
  assert.match(api,/identity batch was saved for recovery/);
  assert.match(api,/idempotencyKey/);
  assert.match(api,/CANONICAL_PERSISTENCE_FAILED/);
  assert.match(api,/between 1 and 100/);
  assert.match(service,/personalAiBotBatches/);
});

