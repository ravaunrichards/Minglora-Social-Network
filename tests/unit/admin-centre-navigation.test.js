import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const js = fs.readFileSync(new URL('../../public/admin-centre.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../public/admin-centre.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../public/admin-centre.html', import.meta.url), 'utf8');

test('Admin Centre exposes seven clearly named navigation departments', () => {
  const groupOrder = js.match(/const groupOrder = \[([^\]]+)\]/);
  assert.ok(groupOrder, 'navigation department list must exist');
  const groups = [...groupOrder[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(groups, [
    'Dashboard',
    'Profile & Community',
    'User Management',
    'Creator Finance',
    'Live Pro Access',
    'Trust & Support',
    'Administration'
  ]);
});

test('existing administrative workspaces receive independent page routes', () => {
  for (const key of [
    'overview','internal-operations','platform-overview','profile-verification',
    'users','audit-log','gift-earnings','campaign-wallet','member-promotions',
    'marketing-budget','platform-payouts','creator-withdrawals',
    'promotional-tracking','live-pro','moderation','support','security'
  ]) {
    assert.match(js, new RegExp("key:'" + key + "'"));
  }
  assert.match(js, /dataset\.adminPageView = definition\.key/);
  assert.match(js, /url\.searchParams\.set\('page',key\)/);
});

test('member promotions and marketing budget resolve their actual section containers', () => {
  assert.match(js, /selector:'#admin-member-promotions-title',closest:'section\.admin-member-promotions'/);
  assert.match(js, /selector:'#admin-marketing-budget-title',closest:'section\.admin-marketing-budget'/);
  assert.match(js, /definition\.additionalSelectors/);
});

test('navigation provides search, recent pages, breadcrumbs, history and mobile selection', () => {
  for (const selector of [
    'admin-centre-page-search','admin-centre-recent-pages',
    'admin-centre-breadcrumbs','admin-history','admin-centre-mobile-page-select'
  ]) assert.ok(js.includes(selector), 'missing navigation element: ' + selector);
  assert.match(js, /window\.addEventListener\('popstate'/);
});

test('navigation can be collapsed and the page layout adapts to narrow screens', () => {
  assert.match(js, /admin-centre-sidebar-toggle/);
  assert.match(js, /admin-centre-workspace-sidebar-collapsed/);
  assert.match(js, /aria-controls/);
  assert.match(js, /is-collapsed/);
  assert.match(css, /@media\(max-width:980px\)/);
  assert.match(css, /@media\(max-width:600px\)/);
});

test('administrator access checks and authentication provider assets remain in place', () => {
  assert.match(js, /fetch\('\/api\/admin\/access'/);
  assert.match(js, /access\.canAccess/);
  assert.match(html, /auth-providers-admin\.css/);
  assert.match(html, /auth-providers-admin\.js/);
});

test('page navigation is initialized only after the current administration panel is mounted', () => {
  const panelStart = js.indexOf('function addControlCentrePanel');
  const mount = js.indexOf('root.replaceChildren(panel)', panelStart);
  const routeInit = js.indexOf('initializeAdminPageNavigation(panel, unlocked)', panelStart);
  assert.ok(panelStart >= 0 && mount > panelStart && routeInit > mount);
});
