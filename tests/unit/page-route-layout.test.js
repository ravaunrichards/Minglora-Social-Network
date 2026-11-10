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
