import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('public/app.js');
const html = read('public/index.html');
const sw = read('public/sw.js');
const menu = read('public/minglora-menu.js');
const ui = read('public/ai-network.js');
const css = read('public/ai-network.css');
const server = read('src/server.js');
const store = read('src/store.js');
const moduleSource = read('backend/modules/ai-network/service.js');

test('Minglora AI Network is a restorable first-party destination, separate from external Meta AI', () => {
  assert.match(app, /RESTORABLE_VIEWS=new Set\([^)]*'ai-network'/);
  assert.ok(app.includes("state.view==='ai-network'"));
  assert.ok(app.includes('window.MingloraAINetwork?.render()'));
  assert.ok(html.includes('data-view="ai-network"'));
  assert.ok(html.includes('Minglora AI Network'));
  assert.ok(html.includes('href="https://www.meta.ai/"'));
  assert.ok(html.includes('/ai-network.css?v=20261113-ai-network-1'));
  assert.ok(html.includes('/ai-network.js?v=20261113-ai-network-1'));
});

test('Minglora main menu includes a separate AI Network route', () => {
  assert.ok(menu.includes("label: 'Minglora AI Network'"));
  assert.ok(menu.includes("action: 'ai-network'"));
  assert.ok(menu.includes("'ai-network': 'ai-network'"));
});

test('AI Network script and styles are precached with matching asset versions', () => {
  const appAsset = html.match(/app\.js\?v=[^"']+/)?.[0] || '';
  const menuAsset = html.match(/minglora-menu\.js\?v=[^"']+/)?.[0] || '';
  const cacheName = sw.match(/CACHE_NAME='([^']+)'/)?.[1] || '';
  assert.equal(appAsset, 'app.js?v=20261113-profile-style-library-layout-removal-1');
  assert.equal(menuAsset, 'minglora-menu.js?v=20261113-ai-network-1');
  assert.ok(sw.includes('/' + appAsset));
  assert.ok(sw.includes('/' + menuAsset));
  assert.ok(sw.includes('/ai-network.js?v=20261113-ai-network-1'));
  assert.ok(sw.includes('/ai-network.css?v=20261113-ai-network-1'));
  assert.equal(cacheName, 'minglora-shell-v302-ai-network-1');
});

test('AI Network workspace exposes all ten recommendations and true measured/empty states', () => {
  for (const label of [
    'Bot Personality Laboratory', 'Bot Teams', 'Smart Activity Scheduling', 'Bot Performance Center',
    'Multilingual Intelligence', 'AI Creator Studio', 'Security & Trust Center',
    'AI Friendship & Companionship', 'AI Community Events', 'Central Bot Command Center'
  ]) assert.ok(ui.includes(label), label);
  assert.ok(ui.includes('No AI bots created yet'));
  assert.ok(ui.includes('recorded runs only'));
  assert.ok(ui.includes('Disabled until provider adapter is verified'));
  assert.ok(ui.includes('AI BOT'));
  assert.ok(ui.includes('Emergency pause all AI work'));
  assert.ok(css.includes('.ai-network-page'));
  assert.ok(css.includes('@media(max-width:560px)'));
  assert.ok(css.includes('prefers-reduced-motion:reduce'));
});

test('AI Network page calls only same-origin authenticated API routes and never accepts client provider secrets', () => {
  assert.ok(ui.includes("const API = '/api/ai-network'"));
  assert.ok(ui.includes("credentials: 'same-origin'"));
  assert.ok(!/name=['"](?:apiKey|providerApiKey|MINGLORA_AI_API_KEY)['"]/.test(ui));
  assert.ok(!ui.includes('localStorage'));
  assert.ok(ui.includes('provider adapter is verified'));
});

test('AI Network APIs are behind the signed-in session and the feature-owned collections persist separately', () => {
  const route = server.slice(server.indexOf("if (p === '/api/ai-network'"));
  assert.ok(route.startsWith("if (p === '/api/ai-network'"));
  assert.ok(route.includes('const user = sessionUser(req);'));
  assert.ok(route.includes('requireAuth(user);'));
  assert.ok(route.includes('getAICommandCenter(db, user.id'));
  assert.ok(route.includes('await saveStore();'));
  for (const collection of [
    'aiBotSettings','aiBots','aiBotTeams','aiBotSchedules','aiBotRuns',
    'aiBotApprovals','aiBotAudit','aiBotCreatorJobs','aiBotCompanionConsents','aiBotCommunityEvents'
  ]) {
    assert.ok(store.includes("'" + collection + "'"), collection);
    assert.ok(moduleSource.includes("'" + collection + "'"), collection);
  }
});

test('no provider execution or hidden high-impact execution is exposed by the current workspace', () => {
  assert.ok(moduleSource.includes('executionEnabled: false'));
  assert.ok(moduleSource.includes('approval.executionStatus = \'not_executed\''));
  assert.ok(moduleSource.includes('highImpactActionsExecutedAutomatically: false'));
  assert.ok(!ui.includes('fetch(' + "'" + 'https://'));
});
