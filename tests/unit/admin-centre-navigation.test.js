import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const js = fs.readFileSync(new URL('../../public/admin-centre.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../public/admin-centre.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../public/admin-centre.html', import.meta.url), 'utf8');

test('Admin Centre exposes exactly seven clearly named department workspaces', () => {
  const expected = [
    ['dashboard','Dashboard'],
    ['profile-community','Profile & Community'],
    ['user-management','User Management'],
    ['creator-finance','Creator Finance'],
    ['live-pro-access','Live Pro Access'],
    ['trust-support','Trust & Support'],
    ['administration','Administration']
  ];
  for (const [key,title] of expected) {
    assert.ok(js.includes("key:'"+key+"',title:'"+title+"'"), 'missing department '+title);
  }
  const start=js.indexOf('const departments = [');
  const end=js.indexOf('\n    ];',start);
  assert.ok(start>=0&&end>start,'department list must exist');
  const list=js.slice(start,end);
  assert.equal((list.match(/key:'/g)||[]).length,7,'sidebar has exactly seven department routes');
  assert.match(js,/link\.className = 'admin-centre-sidebar-link'/);
  assert.match(css,/\.admin-centre-sidebar-nav\{display:grid/);
});

test('existing administrative tools are grouped inside their own full-page department', () => {
  for (const key of [
    'internal-operations','platform-overview','profile-verification','users','audit-log',
    'gift-earnings','campaign-wallet','member-promotions','marketing-budget',
    'platform-payouts','creator-withdrawals','promotional-tracking','live-pro',
    'moderation','support','security'
  ]) assert.ok(js.includes("key:'"+key+"'"), 'missing existing tool '+key);
  assert.match(js,/dataset\.adminPageView = department\.key/);
  assert.match(js,/view\.hidden = pageKey !== key/);
  assert.match(js,/view\.append\(target\)/);
  assert.match(js,/tool\.additionalSelectors/);
  assert.match(js,/url\.searchParams\.set\('page',key\)/);
  assert.match(js,/aliases = \{/);
});

test('department search, breadcrumbs, browser history and mobile selection remain available', () => {
  for (const selector of [
    'admin-centre-page-search','admin-centre-breadcrumbs',
    'admin-history','admin-centre-mobile-page-select'
  ]) assert.ok(js.includes(selector), 'missing navigation element: '+selector);
  assert.match(js,/window\.addEventListener\('popstate'/);
  assert.match(js,/departmentSearch\?\.addEventListener\('input'/);
  assert.doesNotMatch(js,/admin-centre-recent-pages/);
});

test('persistent navigation supports compact mode and adapts to narrow screens', () => {
  assert.match(js,/admin-centre-sidebar-toggle/);
  assert.match(js,/admin-centre-workspace-sidebar-collapsed/);
  assert.match(js,/aria-controls/);
  assert.match(js,/is-collapsed/);
  assert.match(css,/@media\(max-width:980px\)/);
  assert.match(css,/@media\(max-width:600px\)|@media\(max-width:480px\)/);
  assert.match(css,/\.admin-centre-workspace-sidebar-collapsed/);
});

test('administrator access checks and authentication provider assets remain in place', () => {
  assert.match(js,/fetch\('\/api\/admin\/access'/);
  assert.match(js,/access\.canAccess/);
  assert.match(js,/authenticator-verified session/);
  assert.match(html,/auth-providers-admin\.css/);
  assert.match(html,/auth-providers-admin\.js/);
});

test('page navigation is initialized only after the current administration panel is mounted', () => {
  const panelStart = js.indexOf('function addControlCentrePanel');
  const mount = js.indexOf('root.replaceChildren(panel)', panelStart);
  const routeInit = js.indexOf('initializeAdminPageNavigation(panel, unlocked)', panelStart);
  assert.ok(panelStart >= 0 && mount > panelStart && routeInit > mount);
});
