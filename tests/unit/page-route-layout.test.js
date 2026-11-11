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
  assert.ok(sync.includes("const standalone=state.view!=='feed';"),
    'Every route other than Home becomes a standalone page, including For You');
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
  assert.ok(app.includes("const standalone=state.view!=='feed';"),
    'Only the Home feed keeps the feature rail');
  const navStart=app.indexOf('function syncNavigationActive(){');
  assert.ok(app.slice(navStart,navStart+100).includes('syncPageLayout();'),
    'Direct route navigation also synchronizes the standalone page shell');
});



test('Settings is a real restorable page and uses the shared standalone layout',()=>{
  const settings=fs.readFileSync(path.join(root,'public/settings.js'),'utf8');
  assert.ok(app.includes("const RESTORABLE_VIEWS=new Set(")&&app.includes("'settings']);"),
    'Settings can be restored after a page reload');
  assert.ok(app.includes("window.MingloraActivateSilentView=view=>activateSilent(view);"),
    'Dedicated pages can update shared navigation state without rendering twice');
  assert.ok(app.includes("else if(state.view==='settings')await window.MingloraSettings?.render?.();"),
    'The shared route renderer can restore Settings');
  assert.ok(settings.includes("window.MingloraActivateSilentView?.('settings')"),
    'Opening Settings changes the active route before displaying its content');
  assert.ok(settings.includes('window.MingloraSettings = { open: openSettings, render: openSettings };'),
    'Settings exposes the same page renderer for direct entry and route restoration');
  assert.ok(html.includes('/app.js?v=20261111-profile-gifter-level-badges-1'),
    'The browser receives the updated page-routing bundle');
  assert.ok(html.includes('/settings.js?v=20261110-standalone-settings-page-1'),
    'The browser receives the updated Settings page bundle');
});

test('Notifications opens and restores as its own standalone destination',()=>{
  assert.ok(app.includes("async function renderNotifications(){if(state.view!=='notifications')activateSilent('notifications');"),
    'Every direct notification entry synchronizes the active route and hides Home rails');
  assert.ok(app.includes("else if(state.view==='notifications')await renderNotifications();"),
    'Notifications is still supported by shared route restoration');
  assert.ok(!app.includes("state.view='notifications';syncNavigationActive();persistCurrentView();recordBrowserNavigation();"),
    'Notifications must not duplicate the history entry created by its route transition');
});

test('Messenger keeps Facebook-style quick access and a standalone inbox route',()=>{
  assert.ok(app.includes("if(messengerButton)messengerButton.onclick=()=>{void toggleMessengerPanel().catch(error=>toast(error.message||'Messenger could not open.'));};"),
    'The Messenger header action keeps its Facebook-style quick-access panel');
  assert.ok(html.includes('data-view="messages"'),
    'The Messenger feature destination remains available as a full page');
  assert.ok(app.includes("async function renderMessages(){\n  if(state.view!=='messages')activateSilent('messages');"),
    'The full-page inbox route synchronizes navigation without duplicate history entries');
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
