import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const layoutCss=fs.readFileSync(path.join(root,'public/page-route-layout.css'),'utf8');

test('Home alone keeps the Facebook-style feature rail',()=>{
  const start=app.indexOf('function syncPageLayout(){');
  const end=app.indexOf('\nfunction activateSilent',start);
  assert.notEqual(start,-1,'Shared page-layout synchronizer exists');
  assert.ok(end>start,'Page-layout synchronizer is complete');
  const sync=app.slice(start,end);
  assert.ok(sync.includes("const standalone=state.view!=='feed'&&!forYou;"),
    'Every route other than Home and immersive For You becomes a standalone page');
  assert.ok(sync.includes("classList.toggle('minglora-standalone-page',standalone)"),
    'Standalone route state is applied to the document');
  assert.ok(sync.includes("classList.toggle('standalone-page-view',standalone)"),
    'Standalone route state is also applied to the page layout');
});

test('standalone pages hide both Home rails and share one full-width content canvas',()=>{
  assert.ok(html.includes('/page-route-layout.css?v=20261108-home-only-feature-sidebar-1'),
    'Standalone page stylesheet is loaded');
  assert.ok(layoutCss.includes('.layout>.left-rail')&&layoutCss.includes('.layout>.right-rail'),
    'Both Home-only side rails are hidden on standalone pages');
  assert.ok(layoutCss.includes('max-width:1440px!important'),
    'Standalone pages share one centered desktop content width');
  assert.ok(layoutCss.includes('max-width:none!important'),
    'Standalone page canvas uses the available screen width');
  assert.ok(layoutCss.includes('@media(max-width:760px)'),
    'Standalone pages have a full-width mobile layout');
});

test('Home navigation and global navigation remain present',()=>{
  assert.ok(html.includes('<nav class="top-nav" aria-label="Main navigation">'),
    'The desktop primary navigation remains available');
  assert.ok(html.includes('<div class="mobile-nav" role="navigation"'),
    'The mobile primary navigation remains available');
  assert.ok(html.includes('class="left-rail-features"'),
    'Home retains its feature rail markup');
  assert.match(app,/const standalone=state\.view!=='feed'&&!forYou;/,
    'Only the Home feed keeps the feature rail');
  const navStart=app.indexOf('function syncNavigationActive(){');
  assert.ok(app.slice(navStart,navStart+100).includes('syncPageLayout();'),
    'Direct route navigation also synchronizes the standalone page shell');
});


test('Admin Centre initializes dedicated page routing after building its feature sections',()=>{
  const admin=fs.readFileSync(path.join(root,'public/admin-centre.js'),'utf8');
  const panelStart=admin.indexOf('function addControlCentrePanel(');
  const apiStart=admin.indexOf('async function adminCentreApi(',panelStart);
  assert.ok(panelStart>=0&&apiStart>panelStart,'Admin Centre panel builder and API helper exist');
  const panelBuilder=admin.slice(panelStart,apiStart);
  assert.match(panelBuilder,/initializeAdminPageNavigation\(panel,\s*unlocked\);/,
    'The page router is initialized inside the panel builder after its feature sections are created');
  assert.ok(!admin.includes('return payload;\\n    initializeAdminPageNavigation(panel, unlocked);'),
    'The page router must never be placed after an unconditional return');
});


test('Admin Centre has exactly seven persistent department buttons and no tool submenu in the sidebar',()=>{
  const admin=fs.readFileSync(path.join(root,'public/admin-centre.js'),'utf8');
  const start=admin.indexOf('function initializeAdminPageNavigation(panel, unlocked) {');
  const end=admin.indexOf('\n  function addControlCentrePanel(',start);
  assert.ok(start>=0&&end>start,'Department page navigation function exists');
  const nav=admin.slice(start,end);
  const keys=['dashboard','profile-community','user-management','creator-finance','live-pro-access','trust-support','administration'];
  for(const key of keys){
    assert.match(nav,new RegExp("key:'"+key+"'"),'Department '+key+' is defined');
  }
  assert.equal((nav.match(/\\{key:'(?:dashboard|profile-community|user-management|creator-finance|live-pro-access|trust-support|administration)'/g)||[]).length,7,
    'Exactly seven top-level department workspaces are defined');
  assert.match(nav,/departments\\.forEach\\(\\(department,index\\)=>\\s*\\{\\s*const link = document\\.createElement\\('a'\\)/,
    'The persistent sidebar is populated from the seven departments');
  assert.match(nav,/link\\.className = 'admin-centre-sidebar-link'/,
    'Each department is a single sidebar navigation control');
  assert.doesNotMatch(nav,/Recently visited|Find a page|admin-centre-nav-group|admin-centre-nav-heading/,
    'The sidebar has no expandable tool groups, recent-page list or tool search');
});

test('Admin Centre groups existing tools into complete department pages and keeps direct legacy links compatible',()=>{
  const admin=fs.readFileSync(path.join(root,'public/admin-centre.js'),'utf8');
  const start=admin.indexOf('function initializeAdminPageNavigation(panel, unlocked) {');
  const end=admin.indexOf('\n  function addControlCentrePanel(',start);
  const nav=admin.slice(start,end);
  assert.match(nav,/departments\\.forEach\\(department=>\\s*\\{\\s*const view = document\\.createElement\\('section'\\)/,
    'Each department receives its own separate page view');
  assert.match(nav,/view\\.hidden = pageKey !== key/,
    'Only the selected department page is visible');
  assert.match(nav,/view\\.append\\(target\\)/,
    'Existing live tool containers are moved into their owning department instead of duplicated');
  assert.match(nav,/data-admin-department-tool/,
    'Each moved tool is retained as a department-specific workspace section');
  for(const alias of ['users','audit-log','gift-earnings','campaign-wallet','member-promotions','marketing-budget','platform-payouts','creator-withdrawals','promotional-tracking','live-pro','moderation','support','security']){
    assert.match(nav,new RegExp(alias+":"),'Legacy route '+alias+' still resolves to its department');
  }
  assert.match(nav,/window\\.history\\.pushState/,'Department navigation updates browser history');
  assert.match(nav,/window\\.addEventListener\\('popstate'/,'Browser Back and Forward restore the selected department');
});

test('Admin Centre department workspaces remain responsive with a mobile department picker',()=>{
  const admin=fs.readFileSync(path.join(root,'public/admin-centre.js'),'utf8');
  const css=fs.readFileSync(path.join(root,'public/admin-centre.css'),'utf8');
  assert.match(admin,/admin-centre-mobile-page-picker/,'A mobile department selector is included');
  assert.match(css,/\\.admin-centre-workspace\\{[\\s\\S]*?grid-template-columns:minmax\\(230px,270px\\) minmax\\(0,1fr\\)/,
    'Desktop uses a persistent sidebar and a separate full-width workspace');
  assert.match(css,/@media\\(max-width:760px\\)[\\s\\S]*?\\.admin-centre-workspace\\{grid-template-columns:minmax\\(0,1fr\\)\\}/,
    'Mobile stacks navigation above the selected full-page workspace');
  assert.match(css,/\\.admin-centre-page-view\\[hidden\\]\\{display:none!important\\}/,
    'Inactive departments are hidden rather than stacked below the active page');
});
