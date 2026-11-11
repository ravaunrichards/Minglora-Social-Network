import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root=new URL('../../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('Personal AI Bots page loads the dedicated responsive controller and styles',async()=>{
  const html=await read('public/personal-ai-bots.html');
  assert.match(html,/personal-ai-bots\.js\?v=20261111-personal-ai-bots-21/);
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
  assert.match(ui,/pause enabled bots and teams, cancel open tasks and cancel open team handoffs/);
  assert.match(ui,/result\.pausedTeams\|\|0\).*team\(s\) paused/);
  assert.match(ui,/result\.cancelledHandoffs\|\|0\).*team handoff\(s\) cancelled/);
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


test('owner Admin Centre pages canonical AI identity records with a verified cursor',async()=>{
  const [source,api,html]=await Promise.all([
    read('public/personal-ai-bots.js'),
    read('backend/modules/personal-ai-bots/admin-api.js'),
    read('public/personal-ai-bots.html')
  ]);
  assert.match(source,/Canonical PostgreSQL AI identity records/);
  assert.match(source,/id="pab-canonical-identity-rows"/);
  assert.match(source,/id="pab-load-more-identities"/);
  assert.match(source,/loadMoreCanonicalIdentities/);
  assert.match(source,/URLSearchParams\(\{limit:'100',offset:/);
  assert.match(source,/identityRecordsHasMore/);
  assert.match(source,/identityRecordsNextOffset/);
  assert.match(api,/listAiIdentities\(\{limit:100,offset:0\}\)/);
  assert.match(api,/path===root\+'\/identities'/);
  assert.match(api,/nextOffset:offset\+result\.length/);
  assert.match(api,/hasMore:result\.length===limit/);
  assert.ok(html.includes('/personal-ai-bots.js?v=20261111-personal-ai-bots-21'));
});

test('owner Admin Centre paginates provider assignments and AI email identity records',async()=>{
  const [source,api,html]=await Promise.all([
    read('public/personal-ai-bots.js'),
    read('backend/modules/personal-ai-bots/admin-api.js'),
    read('public/personal-ai-bots.html')
  ]);
  assert.match(source,/id="pab-load-more-providers"/);
  assert.match(source,/id="pab-provider-assignment-rows"/);
  assert.match(source,/loadMoreProviderAssignments/);
  assert.match(source,/API\+'\/providers\?'/);
  assert.match(source,/providerAssignmentsNextOffset/);
  assert.match(source,/id="pab-load-more-emails"/);
  assert.match(source,/id="pab-email-identity-rows"/);
  assert.match(source,/loadMoreEmailIdentities/);
  assert.match(source,/API\+'\/emails\?'/);
  assert.match(source,/emailIdentitiesNextOffset/);
  assert.match(api,/listAiProviderAssignments\(\{limit:100,offset:0\}\)/);
  assert.match(api,/listAiEmailIdentities\(\{limit:100,offset:0\}\)/);
  assert.match(api,/path===root\+'\/providers'/);
  assert.match(api,/path===root\+'\/emails'/);
  assert.ok(html.includes('/personal-ai-bots.js?v=20261111-personal-ai-bots-21'));
});

test('owner Admin Centre paginates task queue and follow/unfollow history together',async()=>{
  const [source,api,html]=await Promise.all([
    read('public/personal-ai-bots.js'),
    read('backend/modules/personal-ai-bots/admin-api.js'),
    read('public/personal-ai-bots.html')
  ]);
  assert.match(source,/id="pab-task-queue-list"/);
  assert.match(source,/id="pab-follow-task-history-list"/);
  assert.match(source,/id="pab-load-more-tasks"/);
  assert.match(source,/loadMoreTaskRecords/);
  assert.match(source,/API\+'\/tasks\?'/);
  assert.match(source,/state\.tasksNextOffset/);
  assert.match(source,/followTasks=added\.filter\(task=>\['follow','unfollow'\]/);
  assert.match(api,/listAiBotTasks\(\{limit:100,offset:0\}\)/);
  assert.match(api,/path===root\+'\/tasks'/);
  assert.match(api,/tasksNextOffset/);
  assert.match(api,/tasksHasMore/);
  assert.match(api,/hasMore:result\.length===limit/);
  assert.ok(html.includes('/personal-ai-bots.js?v=20261111-personal-ai-bots-21'));
});

test('owner Admin Centre paginates AI identity batch history without losing owner scope',async()=>{
  const [source,api,html]=await Promise.all([
    read('public/personal-ai-bots.js'),
    read('backend/modules/personal-ai-bots/admin-api.js'),
    read('public/personal-ai-bots.html')
  ]);
  assert.match(source,/function batchHistoryRow\(batch\)/);
  assert.match(source,/id="pab-batch-history-list"/);
  assert.match(source,/id="pab-load-more-batches"/);
  assert.match(source,/loadMoreBatchHistory/);
  assert.match(source,/API\+'\/batches\?'/);
  assert.match(source,/batchHistoryNextOffset/);
  assert.match(source,/batchHistoryHasMore/);
  assert.match(api,/batch\.ownerId===user\.id/);
  assert.match(api,/url\.searchParams\.get\('limit'\)\|\|50/);
  assert.match(api,/url\.searchParams\.get\('offset'\)\|\|0/);
  assert.match(api,/nextOffset:offset\+batches\.length/);
  assert.match(api,/hasMore:offset\+batches\.length<ownedBatches\.length/);
  assert.ok(html.includes('/personal-ai-bots.js?v=20261111-personal-ai-bots-21'));
});

test('owner Admin Centre exposes a real paginated AI profile report review queue',async()=>{
  const [source,css,api,html]=await Promise.all([
    read('public/personal-ai-bots.js'),
    read('public/personal-ai-bots.css'),
    read('backend/modules/personal-ai-bots/admin-api.js'),
    read('public/personal-ai-bots.html')
  ]);
  assert.match(source,/AI profile safety reports/);
  assert.match(source,/Mark in review/);
  assert.match(source,/Mark actioned/);
  assert.match(source,/Dismiss report/);
  assert.match(source,/reviewAiProfileReport/);
  assert.match(source,/loadMoreSafetyReports/);
  assert.match(source,/pab-load-more-reports/);
  assert.match(source,/safetyReportsHasMore/);
  assert.match(source,/safetyReportsNextOffset/);
  assert.match(source,/URLSearchParams\(\{status,limit:'100',offset:/);
  assert.match(source,/id="pab-safety-report-filter"/);
  for(const status of ['open','pending','in_review','all','actioned','dismissed'])assert.ok(source.includes('value="'+status+'"'),status);
  assert.match(source,/pab-safety-report-filter.*addEventListener\('change'/);
  assert.match(source,/state\.safetyReportsLoading/);
  assert.match(api,/safetyReportsNextOffset/);
  assert.match(api,/safetyReportsHasMore/);
  assert.match(api,/nextOffset:offset\+reports\.length/);
  assert.match(api,/hasMore:reports\.length===limit/);
  assert.ok(html.includes('/personal-ai-bots.js?v=20261111-personal-ai-bots-21'));
  assert.match(css,/\.pab-report-card/);
  assert.match(css,/\.pab-report-resolution/);
});

test('owner Admin Centre exposes bounded JSON identity batch import with retry history',async()=>{
  const [ui,api,service]=await Promise.all([
    read('public/personal-ai-bots.js'),
    read('backend/modules/personal-ai-bots/admin-api.js'),
    read('backend/modules/personal-ai-bots/personal-ai-bots-service.js')
  ]);
  for(const phrase of ['Bulk AI identity generation and import','id="pab-batch-form"','id="pab-batch-items"','id="pab-batch-key"','Recent identity batches','createIdentityBatch','renderBatchResults','pab-batch-results']) assert.ok(ui.includes(phrase),phrase);
  assert.match(ui,/API\+'\/batches'/);
  assert.match(api,/identity batch was saved for recovery/);
  assert.match(api,/idempotencyKey/);
  assert.match(api,/CANONICAL_PERSISTENCE_FAILED/);
  assert.match(api,/between 1 and 100/);
  assert.match(service,/personalAiBotBatches/);
});



test('owner Admin Centre exposes vacancy creation and safe lifecycle management',async()=>{
  const [ui,service,api]=await Promise.all([
    read('public/personal-ai-bots.js'),
    read('backend/modules/personal-ai-bots/personal-ai-bots-service.js'),
    read('backend/modules/personal-ai-bots/admin-api.js')
  ]);
  for(const phrase of [
    'Corporate vacancies','id="pab-vacancy-form"','id="pab-vacancy-position"',
    'id="pab-vacancy-department"','id="pab-vacancy-title"',
    'id="pab-vacancy-slots"','id="pab-vacancy-requirements"',
    'pab-save-vacancy','createVacancy','saveVacancy','vacancyCard'
  ])assert.ok(ui.includes(phrase),phrase);
  assert.match(ui,/vacancies\.map\(vacancyCard\)/);
  assert.match(ui,/Filled slots:/);
  assert.match(ui,/Remaining:/);
  assert.match(ui,/vacancy\.filledSlots/);
  assert.match(ui,/vacancy\.remainingSlots/);
  assert.match(ui,/No AI identity or appointment was created/);
  assert.match(ui,/Filled slots:/);
  assert.match(ui,/Remaining:/);
  assert.match(ui,/vacancy\.filledSlots/);
  assert.match(ui,/vacancy\.remainingSlots/);
  assert.match(api,/path===root\+'\/vacancies'/);
  assert.match(api,/vacancyMatch&&method==='PATCH'/);
  assert.match(api,/vacancyMatch&&method==='DELETE'/);
  assert.match(service,/An open or paused vacancy with this title already exists/);
  assert.match(service,/statusHistory\.push/);
  assert.match(service,/vacancy\.created/);
  assert.match(service,/vacancy\.updated/);
});

test('owner Admin Centre exposes the 20-department catalogue and safe hierarchy controls',async()=>{
  const [ui,service,html]=await Promise.all([
    read('public/personal-ai-bots.js'),
    read('backend/modules/personal-ai-bots/personal-ai-bots-service.js'),
    read('public/personal-ai-bots.html')
  ]);
  for(const phrase of ['Corporate departments','pab-department-form','pab-new-department-name','pab-new-department-parent','pab-department-parent','pab-save-department','createDepartment','saveDepartment'])assert.ok(ui.includes(phrase),phrase);
  assert.match(ui,/owner-approved appointments are recorded separately in the appointments section/);
  for(const phrase of ['Corporate board and job-position catalogue','position types','Approved appointments are listed separately in the appointments section','No permissions','No execution authority'])assert.ok(ui.includes(phrase),phrase);
  assert.match(ui,/Recorded appointments:/);
  assert.match(ui,/position\.code&&\['appointed','suspended'\]\.includes\(item\.status\)/);
  assert.doesNotMatch(ui,/No AI has been appointed/,'position catalogue must not contradict the existing appointment workflow');
  assert.ok(html.includes('/personal-ai-bots.js?v=20261111-personal-ai-bots-21'),'Admin Centre script cache version is current');
  assert.match(service,/PERSONAL_AI_BOT_DEPARTMENTS = Object\.freeze/);
  assert.equal((service.match(/\{code:'[a-z_]+',name:'[^']+'/g)||[]).length>=20,true);
});



test('owner Admin Centre exposes corporate vacancy creation and safe status controls',async()=>{
  const [ui,service,api,html]=await Promise.all([
    read('public/personal-ai-bots.js'),
    read('backend/modules/personal-ai-bots/personal-ai-bots-service.js'),
    read('backend/modules/personal-ai-bots/admin-api.js'),
    read('public/personal-ai-bots.html')
  ]);
  for(const phrase of ['Corporate vacancies','pab-vacancy-form','pab-vacancy-position','pab-vacancy-department','pab-vacancy-title','pab-vacancy-slots','pab-vacancy-requirements','createVacancy','saveVacancy'])assert.ok(ui.includes(phrase),phrase);
  assert.match(ui,/does not create an AI identity, hire or appoint anyone/);
  assert.match(ui,/shortlisted candidate can be appointed only through the separate owner-approved appointments workflow/);
  assert.match(service,/export function createPersonalAiBotVacancy/);
  assert.ok(service.includes("status:'open'"));
  assert.ok(service.includes('statusHistory'));
  assert.ok(api.includes("root+'/vacancies'"));
  assert.ok(html.includes('/personal-ai-bots.js?v=20261111-personal-ai-bots-21'));
});

test('owner Admin Centre exposes approval-gated appointments and employment history without activating AI identities',async()=>{
  const [ui,service,api,html]=await Promise.all([
    read('public/personal-ai-bots.js'),
    read('backend/modules/personal-ai-bots/personal-ai-bots-service.js'),
    read('backend/modules/personal-ai-bots/admin-api.js'),
    read('public/personal-ai-bots.html')
  ]);
  for(const phrase of ['Owner-approved corporate appointments','pab-appointment-form','pab-appointment-application','pab-appointment-manager','createAppointment','syncAppointmentManagerRequirement','employmentHistory'])assert.ok(ui.includes(phrase),phrase);
  for(const phrase of ['Corporate organization chart','organizationChart','pab-org-tree','reportingManagerAppointmentId','Circular reporting link detected','Appointment records'])assert.ok(ui.includes(phrase),phrase);
  assert.ok(api.includes("root+'/appointments'"));
  assert.ok(api.includes("root+'/employment-history'"));
  assert.ok(service.includes("application.status!=='shortlisted'"));
  assert.ok(service.includes("candidate.enabled!==false"));
  assert.ok(service.includes("permissionGrantStatus:'not_granted'"));
  assert.ok(service.includes("identityActivationStatus:'unchanged_disabled'"));
  assert.ok(service.includes("position.reportsTo.length"));
  assert.match(ui,/The AI identity stays disabled, no permissions are granted/);
  assert.match(ui,/reportingManagerPositionTitle\|\|'Position unavailable'/);
  assert.ok(html.includes('/personal-ai-bots.js?v=20261111-personal-ai-bots-21'));
});



test('owner Admin Centre exposes organizational candidate submission and review controls',async()=>{
  const [ui,service,api,html]=await Promise.all([
    read('public/personal-ai-bots.js'),
    read('backend/modules/personal-ai-bots/personal-ai-bots-service.js'),
    read('backend/modules/personal-ai-bots/admin-api.js'),
    read('public/personal-ai-bots.html')
  ]);
  for(const phrase of ['AI candidate applications and review','pab-application-form','pab-application-candidate','pab-application-vacancy','createApplication','saveApplication','pab-save-application'])assert.ok(ui.includes(phrase),phrase);
  assert.match(ui,/Only existing AI identities with population "organizational" can be submitted/);
  assert.ok(service.includes("candidate.population!=='organizational'"));
  assert.ok(api.includes("root+'/applications'"));
  assert.ok(html.includes('/personal-ai-bots.js?v=20261111-personal-ai-bots-21'));
});



test('provider and email pagination labels never imply a total record count',async()=>{
  const source=await read('public/personal-ai-bots.js');
  assert.match(source,/Rows load 100 at a time; the number loaded is not a total count/);
  assert.match(source,/Runtime rows load 100 at a time; the number loaded is not a total count/);
  assert.match(source,/Address rows load 100 at a time; the number loaded is not a total count/);
  assert.match(source,/id="pab-load-more-providers"/);
  assert.match(source,/id="pab-load-more-provider-runtime"/);
  assert.match(source,/id="pab-load-more-emails"/);
});


test('activity schedule UI offers a read-only timezone-aware dry-run preview',async()=>{
  const ui=await read('public/personal-ai-bots.js');
  for(const phrase of [
    'Preview next 14 days',
    'pab-preview-schedule',
    'previewBotSchedule',
    'schedule-preview?days=14',
    'Upcoming local activity windows',
    'Dry-run schedule preview only. No tasks were dispatched.',
    'Scheduler:</strong> not connected.',
    'Dispatch:</strong> disabled.'
  ]) assert.ok(ui.includes(phrase),phrase);
});


test('Personality Laboratory exposes versioned drafts and a human approval lifecycle without enabling the bot',async()=>{
  const ui=await read('public/personal-ai-bots.js');
  for(const phrase of [
    'Personality Laboratory',
    'Create persona draft',
    'Load version history',
    'Run structural checks',
    'Approve version',
    'Edit draft',
    'Save draft changes',
    'Duplicate as new draft',
    'Rollback to this version',
    'Activate approved version',
    'Provider/model behavioural test: not connected',
    'This is not a model or safety benchmark.',
    'The bot remains in its existing activation state.'
  ]) assert.ok(ui.includes(phrase),phrase);
  assert.match(ui,/data-action="evaluate"/);
  assert.match(ui,/data-action="approve"/);
  assert.match(ui,/async function editPersonaDraft/);
  assert.match(ui,/async function duplicatePersonaDraft/);
  assert.match(ui,/method:'PATCH',body:JSON\.stringify\(\{configuration\}\)/);
});


test('Bot Teams exposes owner-reviewed single-receiver handoffs without automatic dispatch',async()=>{
  const ui=await read('public/personal-ai-bots.js');
  for(const phrase of [
    'Create a task handoff',
    'Existing source task',
    'Receiving bot',
    'Required input',
    'Expected output',
    'Team-internal approved context',
    'Public context only',
    'I confirm this handoff contains no private member conversations, private messages or private bot memory.',
    'Create handoff for owner review',
    'Load handoff history',
    'Accept',
    'Reject',
    'Cancel',
    'Record human-reviewed completion',
    'Dispatch: not dispatched',
    'No bot execution or external actions occur.',
    'No bot execution occurred.'
  ]) assert.ok(ui.includes(phrase),phrase);
  assert.match(ui,/async function createTeamHandoff/);
  assert.match(ui,/async function loadTeamHandoffs/);
  assert.match(ui,/async function reviewTeamHandoff/);
  assert.match(ui,/pab-team-handoff-create/);
  assert.match(ui,/pab-team-handoff-load/);
  assert.match(ui,/pab-handoff-privacy-attestation/);
  assert.match(ui,/if\(!payload\.privacyAttested\)/);
});


test('Multilingual Intelligence exposes private configuration while keeping translation disabled and human-reviewed',async()=>{
  const ui=await read('public/personal-ai-bots.js');
  for(const phrase of [
    'Multilingual Intelligence · language behavior',
    'Supported language codes (comma-separated)',
    'Primary language code',
    'Fallback language code',
    'Regional locale',
    'Confidence guarded (not connected)',
    'Member language preference',
    'Preserve code-switching',
    'Show original and translation',
    'jam is Jamaican Patois',
    'language quality remains unverified',
    'Provider compatibility:',
    'not connected',
    'Human review:',
    'No translation or detection was executed.',
    'Load saved language settings',
    'Save multilingual settings'
  ]) assert.ok(ui.includes(phrase),phrase);
  assert.match(ui,/async function loadLanguageSettings/);
  assert.match(ui,/async function saveLanguageSettings/);
  assert.ok(ui.includes("/languages"));
  assert.ok(ui.includes("panel.dataset.languageLoaded!=='true'"));
  assert.match(ui,/privacy|public profile Languages field/i);
});


test('Multilingual evaluation registry exposes synthetic data privacy and owner-attested human review',async()=>{
  const ui=await read('public/personal-ai-bots.js');
  for(const phrase of [
    'Manual language evaluation sets',
    'Use synthetic examples only.',
    'Synthetic test cases (JSON array)',
    'I confirm every evaluation case is synthetic and contains no private member data.',
    'Create evaluation set',
    'Load evaluation sets',
    'Submit for human review',
    'Record owner-attested review',
    'Request changes',
    'Reject set',
    'Provider run: not run',
    'Language quality: unverified',
    'owner-entered and self-attested by the bot owner, not independently verified',
    'Provider compatibility and language quality remain unverified.'
  ]) assert.ok(ui.includes(phrase),phrase);
  assert.match(ui,/async function createOrUpdateLanguageEvaluationSet/);
  assert.match(ui,/async function actOnLanguageEvaluationSet/);
  assert.match(ui,/async function reviewLanguageEvaluationSet/);
});
