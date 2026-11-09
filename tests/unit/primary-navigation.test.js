import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');

test('desktop primary navigation remains unchanged and mobile navigation stays focused',()=>{
  const desktopStart=html.indexOf('<nav class="top-nav" aria-label="Main navigation">');
  const desktopEnd=html.indexOf('</nav>',desktopStart);
  const desktop=html.slice(desktopStart,desktopEnd);
  const expectedDesktop=['feed','for-you','live','meetwave','leagues'];
  assert.deepEqual([...desktop.matchAll(/data-view="([^"]+)"/g)].map(match=>match[1]),expectedDesktop);

  const mobileStart=html.indexOf('<div class="mobile-nav"');
  const mobileEnd=html.indexOf('</div>',mobileStart);
  assert.notEqual(mobileStart,-1,'Mobile navigation exists');
  const mobile=html.slice(mobileStart,mobileEnd);
  const expectedMobile=['feed','friends','for-you','live','more'];
  assert.deepEqual([...mobile.matchAll(/data-view="([^"]+)"/g)].map(match=>match[1]),expectedMobile);
  assert.ok(!html.includes('id="mobile-more-menu"'),'The old cramped floating More menu is removed');
  assert.ok(!html.includes('id="mobile-more-btn"'),'The obsolete More dropdown trigger is removed');
  assert.ok(html.includes('id="mobile-more-nav"'),'The More destination is a proper navigation item');
  assert.ok(html.indexOf('id="top-search-form"')<html.indexOf('class="top-nav"'),'Search remains before the desktop navigation');
});

test('the More page provides direct access to secondary features and account tools',()=>{
  const moreStart=app.indexOf('function renderMoreHub(){');
  const moreEnd=app.indexOf('async function renderView(){',moreStart);
  assert.notEqual(moreStart,-1,'More page renderer exists');
  assert.ok(moreEnd>moreStart,'More page renderer is defined before the view router');
  const hub=app.slice(moreStart,moreEnd);
  for(const destination of ['meetwave','friends','groups','pages','saved','creator','leagues','gifts','coins']){
    assert.ok(hub.includes("view:'"+destination+"'"),destination+' is directly accessible from More');
  }
  for(const action of ['profile','notifications','settings','themes']){
    assert.ok(hub.includes("action:'"+action+"'"),action+' is directly accessible from More');
  }
  assert.ok(app.includes("if(state.view==='more')renderMoreHub()"),'More has a real page route');
  assert.ok(app.includes("else if(action==='settings')window.MingloraSettings?.open?.()"),'Settings opens from More');
  assert.ok(app.includes("else if(action==='themes')openPaletteSwitcher()"),'Theme controls open from More');
});

test('profile navigation keeps creator tabs and the More menu available',()=>{
  assert.ok(app.includes("[['posts','Posts'],['about','About'],['friends','Friends'],['photos','Photos'],['reels','Reels'],['more','More']].map(([key,label])=>"));
  assert.ok(app.includes('profile-more-menu'),'profile More menu markup is present');
  for(const section of ['Check-ins','Events','Highlights','Groups','Videos','Badges','Gift Gallery','Photo albums','Manage sections']){
    assert.ok(app.includes(section),section+' remains represented in the profile More section');
  }
});
test('mobile navigation stylesheet is linked and versioned independently',()=>{
  assert.ok(html.includes('/mobile-layout.css?v=20261108-mobile-overlay-panels-1'));
  assert.match(html,/src="\/app\.js\?v=[^"]+"/);
  assert.ok(html.includes('/mobile-profile-navigation.css?v=20261108-five-profile-metrics-1'));
});

test('phone profile counts stay horizontal and the top account menu remains the profile entry point',()=>{
  const css=fs.readFileSync(path.join(root,'public/mobile-profile-navigation.css'),'utf8');
  assert.ok(css.includes('display:flex!important'));
  assert.ok(css.includes('flex-flow:row nowrap!important'));
  assert.ok(css.includes('flex:0 0 20%!important'));
  assert.ok(css.includes('overflow-x:auto!important'));
  assert.ok(css.includes('flex-shrink:0!important'));
  assert.ok(html.includes('id="profile-menu"'),'signed-in profile remains available from the top account menu');
});


test('desktop left sidebar contains secondary features while primary destinations stay in the top navigation',()=>{
  const start=html.indexOf('<div class="left-rail-feature-list" id="left-rail-feature-list">');
  const end=html.indexOf('id="left-rail-see-toggle"',start);
  assert.notEqual(start,-1,'Desktop left sidebar feature list exists');
  assert.ok(end>start,'Desktop left sidebar feature list is present before its See less control');
  const sidebar=html.slice(start,end);
  const primaryViews=['feed','for-you','live','meetwave','leagues'];
  for(const view of primaryViews){
    assert.ok(!sidebar.includes('data-view="'+view+'"'),view+' stays in the top navigation instead of being duplicated in the sidebar');
  }
  assert.ok(!sidebar.includes('>Feeds</span>'),'The duplicate For You/Feeds sidebar shortcut is removed');
  const expected=[
    ['friends','Friends'],['creator','Creator Studio'],['messages','Messenger'],
    ['gifts','Gifts'],['coins','Coins &amp; Payments'],['groups','Groups'],
    ['pages','Pages'],['saved','Saved'],['calendar','Events'],['videos','Video']
  ];
  for(const [view,label] of expected){
    assert.ok(sidebar.includes('data-view="'+view+'"'),view+' remains directly available from the desktop sidebar');
    assert.ok(sidebar.includes('>'+label+'</span>'),label+' has a visible sidebar label');
  }
  assert.ok(sidebar.includes('data-view="clock-centre"') && sidebar.includes('Clock Centre'),'Clock Centre remains available from the utility rail');
  for(const symbol of ['friends','saved','groups','creator','feeling','calendar','video','messages','coins','pages']){
    assert.ok(sidebar.includes('#'+symbol+'\"'),symbol+' uses the shared 3D navigation icon set');
  }
});
