import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const publicDir = path.join(root, 'public');
const artifactsDir = path.join(root, 'artifacts', 'ai-network-browser-qa');
const aiUi = fs.readFileSync(path.join(publicDir, 'ai-network.js'), 'utf8');
const countryList = aiUi.match(/const COUNTRY_CODES = '([^']+)'/)?.[1]?.trim().split(/\s+/) || [];
assert.equal(countryList.length, 249, 'AI country selector must retain all 249 ISO country/territory codes.');
assert.equal(new Set(countryList).size, 249, 'AI country selector must not contain duplicate country/territory codes.');

const ownerIdentityId = '11111111-1111-4111-8111-111111111111';
const initialIdentity = {
  identity: {
    identity_id: ownerIdentityId, status: 'active', enabled: true,
    population: 'independent', category_key: 'ai_friends'
  },
  name: {
    first_name: 'Ari', middle_name: '', last_name: 'Morgan',
    full_name: 'Ari Morgan', display_name: 'Ari Morgan', username: 'ari_morgan'
  },
  profile: {
    gender: 'female', gender_presentation: 'feminine', nationality: 'Jamaican',
    country_of_origin: 'JM', current_country: 'JM', state_province: 'Saint Catherine',
    parish_county: 'Saint Catherine', district: 'Bog Walk', city: 'Bog Walk', town: 'Bog Walk',
    time_zone: 'America/Jamaica', profession: 'Educator', profile_visibility: 'public',
    bio: 'A clearly identified AI educator profile used only by local browser acceptance tests.',
    introduction: 'AI identity browser fixture.', interests: ['education'], hobbies: ['reading'],
    skills: ['teaching'], qualifications: [], education: [], personality: {}, voice_preferences: {},
    avatar_storage_ref: null, cover_storage_ref: null
  },
  languages: [{ language_tag: 'en-JM', language_name: 'English (Jamaica)', proficiency: 'native', is_primary: true }],
  locations: [],
  primary_email: null
};
let identities = [structuredClone(initialIdentity)];
let savedGroups = [];
let identityCreateRequests = [];
let identityPatchRequests = [];
let discoveryQueries = [];
let bulkFollowRequests = [];
const categoryKeys = [
  'ai_friends', 'ai_creators', 'ai_influencers', 'ai_news', 'ai_musicians',
  'ai_entertainers', 'ai_gamers', 'ai_community_hosts', 'ai_live_hosts',
  'ai_moderators', 'ai_support', 'ai_educators', 'ai_sports', 'ai_travel', 'ai_business'
];
const categories = categoryKeys.map((category_key, index) => ({
  category_key,
  display_name: [
    'AI Friends', 'AI Creators', 'AI Influencers', 'AI News', 'AI Musicians',
    'AI Entertainers', 'AI Gamers', 'AI Community Hosts', 'AI Live Hosts',
    'AI Moderators', 'AI Support', 'AI Educators', 'AI Sports', 'AI Travel', 'AI Business'
  ][index],
  description: '',
  sort_order: index + 1,
  is_active: true
}));
const categorySaveRequests = [];
const discoveryProfiles = [
  {
    identity_id: '22222222-2222-4222-8222-222222222222',
    category_key: 'ai_educators',
    name: { first_name: 'Nia', last_name: 'Campbell', display_name: 'Nia Campbell', username: 'nia_campbell' },
    profile: { gender: 'female', bio: 'AI-labelled learning and study support.', profession: 'Educator' },
    languages: [{ language_tag: 'en-JM' }],
    follower_count: 3, is_following: false, follow_requested: false
  },
  {
    identity_id: '33333333-3333-4333-8333-333333333333',
    category_key: 'ai_friends',
    name: { first_name: 'Jay', last_name: 'Reid', display_name: 'Jay Reid', username: 'jay_reid' },
    profile: { gender: 'male', bio: 'AI-labelled community companion.', profession: 'Community host' },
    languages: [{ language_tag: 'en' }, { language_tag: 'ht' }],
    follower_count: 1, is_following: false, follow_requested: false
  }
];

const snapshot = {
  settings: {
    globalPaused: true, dailyTokenBudget: 500, monthlySpendLimitUsd: 5,
    companionOptIn: false, enabledLanguages: ['en'], primaryLanguage: 'en', autoTranslate: false
  },
  performance: {
    botCount: 0, activeBots: 0, teamCount: 0, scheduleCount: 0,
    pendingApprovals: 0, creatorDrafts: 0, completedRuns: 0,
    failedRuns: 0, totalTokensUsed: 0, measuredRunCount: 0
  },
  providerStatus: {
    provider: 'Not configured', model: '', note: 'Provider execution is disabled in this test fixture.',
    configured: false
  },
  bots: [], teams: [], schedules: [], approvals: [], creatorJobs: [], communityEvents: [],
  safeguards: { globalPaused: true }
};
const taskRuntime = { global_paused: true, execution_enabled: false, max_concurrent_workers: 0, lease_seconds: 120 };
const departmentTemplates = Array.from({ length: 20 }, (_, index) => ({
  template_key: 'department_' + (index + 1), display_name: 'Department ' + (index + 1)
}));
const positionTemplates = Array.from({ length: 20 }, (_, index) => ({
  template_key: 'position_' + (index + 1), display_name: 'Position ' + (index + 1)
}));

function json(res, value, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': 'null'
  });
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function identityRegistry() {
  return { identities: identities.map(item => structuredClone(item)), total: identities.length, nextOffset: null, hasMore: false };
}

function aiApiResponse(req, url, body) {
  const pathname = url.pathname.slice('/api/ai-network'.length) || '/';
  const method = req.method || 'GET';

  if (method === 'GET' && pathname === '/') return snapshot;
  if (method === 'GET' && pathname === '/identities') return identityRegistry();
  if (method === 'GET' && pathname === '/categories') return { categories: categories.filter(item => item.is_active) };
  if (method === 'GET' && pathname === '/categories/admin') return {
    categories: categories.map(item => structuredClone(item)).sort((a, b) => a.sort_order - b.sort_order)
  };
  if (method === 'POST' && pathname === '/categories/admin') {
    categorySaveRequests.push(structuredClone(body));
    let category = categories.find(item => item.category_key === body.category_key);
    if (!category) {
      category = { category_key: body.category_key };
      categories.push(category);
    }
    Object.assign(category, {
      display_name: body.display_name,
      description: body.description || '',
      sort_order: body.sort_order,
      is_active: Boolean(body.is_active)
    });
    return { category: structuredClone(category), audit_recorded: true };
  }
  if (method === 'GET' && pathname === '/discover') {
    discoveryQueries.push(Object.fromEntries(url.searchParams.entries()));
    return { identities: discoveryProfiles, total: discoveryProfiles.length, nextOffset: null, hasMore: false };
  }
  if (method === 'GET' && pathname === '/following') return { following: [] };
  if (method === 'GET' && pathname === '/follow-requests') return { requests: [] };
  if (method === 'GET' && pathname === '/saved-groups') return { groups: savedGroups };
  if (method === 'GET' && pathname === '/provider-accounts') return { provider_accounts: [] };
  if (method === 'GET' && pathname === '/provider-models') return { provider_models: [] };
  if (method === 'GET' && pathname === '/provider-assignments') return { assignments: [] };
  if (method === 'GET' && pathname === '/tasks') return { tasks: [], runtime: taskRuntime };
  if (method === 'GET' && pathname === '/organizations') return { organizations: [] };
  if (method === 'GET' && pathname === '/department-templates') return { templates: departmentTemplates };
  if (method === 'GET' && pathname === '/position-templates') return { templates: positionTemplates };

  if (method === 'POST' && pathname === '/identities') {
    identityCreateRequests.push(body);
    const identity_id = randomUUID();
    const record = {
      identity: {
        identity_id, status: 'created', enabled: false,
        population: body.population, category_key: body.category_key
      },
      name: {
        ...body.name,
        full_name: [body.name.first_name, body.name.middle_name, body.name.last_name].filter(Boolean).join(' ')
      },
      profile: body.profile || {},
      languages: body.languages || [],
      locations: body.locations || [],
      primary_email: body.email ? {
        email_address: body.email.email_address,
        verification_status: 'unverified',
        provisioning_status: 'not_requested'
      } : null
    };
    identities.push(record);
    return { created: true, identity_id };
  }

  if (method === 'PATCH' && /^\/identities\/[0-9a-f-]+$/i.test(pathname)) {
    identityPatchRequests.push(body);
    const identityId = pathname.split('/')[2];
    const record = identities.find(item => item.identity.identity_id === identityId);
    if (!record) return { error: 'Fixture identity not found.' };
    record.name = { ...record.name, ...(body.name || {}) };
    record.profile = { ...record.profile, ...(body.profile || {}) };
    record.languages = body.languages || record.languages;
    record.locations = body.locations || record.locations;
    return { updated: true, identity_id: identityId };
  }

  if (method === 'POST' && pathname === '/bulk-follow') {
    bulkFollowRequests.push(body);
    return { created_or_reused: (body.identity_ids || []).length };
  }

  if (method === 'POST' && pathname === '/saved-groups') {
    const group = {
      group_id: randomUUID(), group_name: body.group_name,
      filters: body.filters || {}
    };
    savedGroups.push(group);
    return { group };
  }

  if (method === 'DELETE' && /^\/saved-groups\/[0-9a-f-]+$/i.test(pathname)) {
    const groupId = pathname.split('/')[2];
    savedGroups = savedGroups.filter(group => group.group_id !== groupId);
    return { deleted: true };
  }

  return {};
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8', '.webmanifest': 'application/manifest+json',
    '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    '.json': 'application/json; charset=utf-8'
  })[ext] || 'application/octet-stream';
}

const member = {
  id: 'ai-network-browser-qa-member',
  name: 'Minglora AI Network Browser QA',
  username: 'ai_network_browser_qa',
  email: 'ai-network-browser-qa@example.test',
  profileStyle: 'facebook',
  profileScreenLayout: 'fluid-panel',
  profileLayout: 'advanced',
  avatar: '/assets/default-profile-avatar-3d.svg',
  cover: '/assets/default-profile-cover.svg',
  bio: 'Disposable browser-test session. No production account or record is created.',
  platformRole: 'platform_owner'
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/ai-network')) {
    try {
      const body = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method || '') ? await readBody(req) : {};
      const response = aiApiResponse(req, url, body);
      if (response && response.error) return json(res, response, 404);
      return json(res, response);
    } catch (error) {
      return json(res, { error: error.message || 'AI browser fixture failed.' }, 500);
    }
  }
  if (url.pathname.startsWith('/api/')) {
    const responses = {
      '/api/auth/me': { user: member },
      '/api/users': { users: [] },
      '/api/discovery/people': { users: [] },
      '/api/groups': { groups: [] },
      '/api/feed': { posts: [] },
      '/api/stories': { stories: [] },
      '/api/notifications': { notifications: [] },
      '/api/messages': { conversations: [] },
      '/api/settings': { settings: { preferences: {} } }
    };
    return json(res, responses[url.pathname] || {});
  }

  const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(publicDir, relative);
  if (!file.startsWith(publicDir + path.sep)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': contentType(file), 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
});

await fs.promises.rm(artifactsDir, { recursive: true, force: true });
await fs.promises.mkdir(artifactsDir, { recursive: true });
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

const address = server.address();
const baseUrl = 'http://127.0.0.1:' + address.port;
const browser = await chromium.launch({ headless: true });
const failures = [];
let screenshots = 0;
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    serviceWorkers: 'block'
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const externalApiRequests = [];
  page.on('request', request => {
    if (['fetch', 'xhr'].includes(request.resourceType()) && new URL(request.url()).origin !== baseUrl) {
      externalApiRequests.push(request.url());
    }
  });
  await page.route('**/*', route => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.origin !== baseUrl) return route.abort();
    return route.continue();
  });

  await page.goto(baseUrl + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.MingloraAINetwork?.render === 'function', null, { timeout: 30000 });
  await page.evaluate(() => window.MingloraAINetwork.render());
  await page.locator('.ai-network-page h1').waitFor({ state: 'visible' });
  await page.getByText('AI Identity & Profile Registry').waitFor({ state: 'visible' });

  const initialCounts = await page.evaluate(() => ({
    countryOptions: document.querySelectorAll('#ai-network-countries option').length,
    categories: document.querySelectorAll('form[data-ai-form="identity"] select[name="categoryKey"] option').length,
    populations: document.querySelectorAll('form[data-ai-form="identity"] select[name="population"] option').length,
    genders: document.querySelectorAll('form[data-ai-form="identity"] select[name="gender"] option').length
  }));
  assert.equal(initialCounts.countryOptions, 249, 'All 249 country and territory options must render.');
  assert.equal(initialCounts.categories, 15, 'All 15 original AI categories must render.');
  assert.equal(initialCounts.populations, 3, 'All three AI populations must render.');
  assert.equal(initialCounts.genders, 5, 'All five supported gender choices must render.');

  await page.getByText('AI Category Management').waitFor({ state: 'visible' });
  const categoryForm = page.locator('form[data-ai-form="category"]');
  await categoryForm.locator('[name="categoryKey"]').fill('ai_science');
  await categoryForm.locator('[name="displayName"]').fill('AI Science');
  await categoryForm.locator('[name="description"]').fill('Research and science education');
  await categoryForm.locator('[name="sortOrder"]').fill('16');
  await categoryForm.locator('[name="isActive"]').check();
  await categoryForm.locator('button[type="submit"]').click();
  await page.getByText('AI category changes saved and an audit event recorded.').waitFor({ state: 'visible' });
  assert.equal(categorySaveRequests.length, 1, 'Category creation must submit one administrator request.');
  assert.equal(categorySaveRequests[0].category_key, 'ai_science');
  assert.equal(categorySaveRequests[0].display_name, 'AI Science');
  assert.equal(categories.length, 16, 'The original 15 categories must remain when a new category is added.');

  await page.locator('[data-ai-action="edit-category"][data-category-key="ai_science"]').click();
  assert.equal(await categoryForm.locator('[name="categoryKey"]').inputValue(), 'ai_science');
  assert.equal(await categoryForm.locator('[name="categoryKey"]').getAttribute('readonly'), '');
  await categoryForm.locator('[name="displayName"]').fill('AI Science & Research');
  await categoryForm.locator('[name="isActive"]').uncheck();
  await categoryForm.locator('button[type="submit"]').click();
  await page.getByText('AI category changes saved and an audit event recorded.').waitFor({ state: 'visible' });
  assert.equal(categorySaveRequests.length, 2, 'Category updates must be persisted through the admin route.');
  assert.equal(categorySaveRequests[1].display_name, 'AI Science & Research');
  assert.equal(categorySaveRequests[1].is_active, false);
  assert.equal(categories.find(item => item.category_key === 'ai_science').is_active, false, 'Deactivation must preserve the category row.');

  const createForm = page.locator('form[data-ai-form="identity"]');
  await createForm.locator('[name="firstName"]').fill('Nia');
  await createForm.locator('[name="lastName"]').fill('Campbell');
  await createForm.locator('[name="displayName"]').fill('Nia Campbell');
  await createForm.locator('[name="username"]').fill('nia_campbell');
  await createForm.locator('[name="categoryKey"]').selectOption('ai_friends');
  await createForm.locator('[name="population"]').selectOption('independent');
  await createForm.locator('[name="gender"]').selectOption('female');
  await createForm.locator('[name="countryOfOrigin"]').fill('JM');
  await createForm.locator('[name="currentCountry"]').fill('JM');
  await createForm.locator('[name="timeZone"]').fill('America/Jamaica');
  await createForm.locator('[name="languages"]').fill('en-JM, ht');
  await createForm.locator('[name="emailAddress"]').fill('nia@example.test');
  await createForm.locator('button[type="submit"]').click();
  await page.getByText('AI identity record saved in Minglora Supabase.').waitFor({ state: 'visible' });
  assert.equal(identityCreateRequests.length, 1, 'The identity form must submit exactly one create request.');
  assert.equal(identityCreateRequests[0].name.first_name, 'Nia');
  assert.equal(identityCreateRequests[0].name.last_name, 'Campbell');
  assert.equal(identityCreateRequests[0].name.username, 'nia_campbell');
  assert.equal(identityCreateRequests[0].population, 'independent');
  assert.equal(identityCreateRequests[0].profile.country_of_origin, 'JM');
  assert.equal(identityCreateRequests[0].profile.current_country, 'JM');
  assert.equal(identityCreateRequests[0].profile.time_zone, 'America/Jamaica');
  assert.equal(identityCreateRequests[0].languages.length, 2);
  assert.equal(identityCreateRequests[0].email.email_address, 'nia@example.test');
  assert.equal(identities.length, 2, 'The in-memory registry should refresh after creation.');
  await page.getByText('Email record: not_requested · unverified').waitFor({ state: 'visible' });

  const profileEditor = page.locator('form[data-ai-form="identity-edit"]').first();
  await page.locator('.ai-network-profile-editor summary').first().click();
  await profileEditor.locator('[name="firstName"]').fill('Arianna');
  await profileEditor.locator('[name="middleName"]').fill('Grace');
  await profileEditor.locator('[name="lastName"]').fill('Morgan');
  await profileEditor.locator('[name="displayName"]').fill('Arianna Grace Morgan');
  await profileEditor.locator('[name="username"]').fill('arianna_morgan');
  await profileEditor.locator('[name="gender"]').selectOption('non_binary');
  await profileEditor.locator('[name="countryOfOrigin"]').fill('JM');
  await profileEditor.locator('[name="currentCountry"]').fill('US');
  await profileEditor.locator('[name="timeZone"]').fill('America/Jamaica');
  await profileEditor.locator('[name="languages"]').fill('[{"language_tag":"en-JM","language_name":"English (Jamaica)","proficiency":"native","is_primary":true}]');
  await profileEditor.locator('[name="education"]').fill('[]');
  await profileEditor.locator('[name="personality"]').fill('{"communication_style":"warm"}');
  await profileEditor.locator('[name="voicePreferences"]').fill('{}');
  await profileEditor.locator('button[type="submit"]').click();
  await page.getByText(/AI identity profile and name details updated/).waitFor({ state: 'visible' });
  assert.equal(identityPatchRequests.length, 1, 'Profile editing must submit one owner-scoped PATCH.');
  const patch = identityPatchRequests[0];
  assert.equal(patch.name.first_name, 'Arianna');
  assert.equal(patch.name.middle_name, 'Grace');
  assert.equal(patch.name.last_name, 'Morgan');
  assert.equal(patch.name.username, 'arianna_morgan');
  assert.equal(patch.profile.gender, 'non_binary');
  assert.equal(patch.profile.country_of_origin, 'JM');
  assert.equal(patch.profile.current_country, 'US');
  assert.equal(patch.profile.time_zone, 'America/Jamaica');
  assert.equal(patch.languages[0].language_tag, 'en-JM');
  assert.ok(!Object.hasOwn(patch, 'email'), 'Profile editing must not silently mutate email identities.');
  assert.ok(!Object.hasOwn(patch, 'provider_assignments'), 'Profile editing must not mutate provider assignments.');
  assert.equal(identities[0].name.first_name, 'Arianna', 'Updated name must be rendered from refreshed registry data.');

  const discoveryForm = page.locator('form[data-ai-form="discovery"]');
  await discoveryForm.locator('[name="search"]').fill('educator');
  await discoveryForm.locator('[name="category_keys"]').selectOption(['ai_educators']);
  await discoveryForm.locator('[name="genders"]').selectOption(['female']);
  await discoveryForm.locator('[name="countries"]').selectOption(['JM']);
  await discoveryForm.locator('[name="languages"]').fill('en-JM');
  await discoveryForm.locator('[name="profession"]').fill('Educator');
  await discoveryForm.locator('button[type="submit"]').click();
  await page.getByText('AI discovery filters applied.').waitFor({ state: 'visible' });
  const lastQuery = discoveryQueries[discoveryQueries.length - 1];
  assert.equal(lastQuery.search, 'educator');
  assert.equal(lastQuery.category_keys, 'ai_educators');
  assert.equal(lastQuery.genders, 'female');
  assert.equal(lastQuery.countries, 'JM');
  assert.equal(lastQuery.languages, 'en-JM');
  assert.equal(lastQuery.profession, 'Educator');

  const bulkForm = page.locator('form[data-ai-form="bulk-follow"]');
  await bulkForm.locator('input[name="identity_ids"]').first().check();
  await bulkForm.locator('button[type="submit"]').click();
  await page.getByText('1 selected AI follow relationships created or already existed.').waitFor({ state: 'visible' });
  assert.equal(bulkFollowRequests.length, 1);
  assert.deepEqual(bulkFollowRequests[0].identity_ids, [discoveryProfiles[0].identity_id]);

  const groupForm = page.locator('form[data-ai-form="saved-discovery-group"]');
  await groupForm.locator('[name="groupName"]').fill('Jamaican AI educators');
  await groupForm.locator('button[type="submit"]').click();
  await page.getByText('Discovery group saved.').waitFor({ state: 'visible' });
  await page.getByText('Jamaican AI educators').waitFor({ state: 'visible' });
  assert.equal(savedGroups.length, 1);
  assert.equal(savedGroups[0].filters.genders[0], 'female');

  const viewports = [
    { name: 'compact-phone', width: 320, height: 740 },
    { name: 'standard-phone', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1280, height: 900 }
  ];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = await page.evaluate(() => {
      const root = document.querySelector('.ai-network-page');
      const main = document.querySelector('#main-content');
      return {
        rootWidth: root?.getBoundingClientRect().width || 0,
        rootScrollWidth: root?.scrollWidth || 0,
        rootClientWidth: root?.clientWidth || 0,
        mainScrollWidth: main?.scrollWidth || 0,
        mainClientWidth: main?.clientWidth || 0,
        documentScrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        identityEditorVisible: Boolean(document.querySelector('form[data-ai-form="identity-edit"]')),
        discoveryVisible: Boolean(document.querySelector('form[data-ai-form="discovery"]'))
      };
    });
    assert.ok(geometry.rootWidth > 0, viewport.name + ': AI Network workspace must render.');
    assert.ok(geometry.rootScrollWidth <= geometry.rootClientWidth + 2, viewport.name + ': AI workspace must not overflow horizontally.');
    assert.ok(geometry.mainScrollWidth <= geometry.mainClientWidth + 2, viewport.name + ': main content must not overflow horizontally.');
    assert.ok(geometry.documentScrollWidth <= geometry.viewportWidth + 2, viewport.name + ': viewport must not overflow horizontally.');
    assert.ok(geometry.identityEditorVisible && geometry.discoveryVisible, viewport.name + ': identity and discovery controls must remain available.');
    await page.screenshot({
      path: path.join(artifactsDir, 'ai-network__' + viewport.name + '.jpg'),
      type: 'jpeg', quality: 78, fullPage: true
    });
    screenshots += 1;
  }

  assert.deepEqual(externalApiRequests, [], 'AI Network browser QA must keep API calls on the same origin.');
  const report = {
    identityCategories: categories.length,
    countryAndTerritoryOptions: initialCounts.countryOptions,
    populationOptions: initialCounts.populations,
    genderOptions: initialCounts.genders,
    identityCreates: identityCreateRequests.length,
    identityProfileUpdates: identityPatchRequests.length,
    combinedDiscoveryQueries: discoveryQueries.length,
    bulkFollowRequests: bulkFollowRequests.length,
    savedDiscoveryGroups: savedGroups.length,
    viewportsChecked: viewports.length,
    screenshotsCaptured: screenshots,
    externalApiRequests: externalApiRequests.length,
    note: 'All account and AI records in this report are in-memory fixtures on a disposable local test server; no Supabase project or production account is contacted.'
  };
  fs.writeFileSync(path.join(artifactsDir, 'ai-network-browser-qa-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
