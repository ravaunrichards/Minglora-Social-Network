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
  const expectedMobile=['feed','for-you','live','messages','more'];
  assert.deepEqual([...mobile.matchAll(/data-view="([^"]+)"/g)].map(match=>match[1]),expectedMobile);
  assert.ok(!html.includes('id="mobile-more-menu"'),'The old cramped floating More menu is removed');
  assert.ok(!html.includes('id="mobile-more-btn"'),'The obsolete More dropdown trigger is removed');
  assert.ok(html.includes('id="mobile-more-nav"'),'The More destination is a proper navigation item');
  assert.ok(html.indexOf('id="search-form"')<html.indexOf('class="top-nav"'),'Search remains before the desktop navigation');
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

test('profile navigation keeps the primary row to six sections and leaves secondary sections in More',()=>{
  assert.ok(app.includes("[['posts','All'],['about','About'],['friends','Friends'],['photos','Photos'],['reels','Reels'],['more','More']]"));
  assert.ok(app.includes("if(tab==='more')return '<section class=\"card profile-more-menu\""));
  for(const section of ['Check-ins','Events','Highlights','Groups','Videos','Photo albums','Manage sections']){
    assert.ok(app.includes(section),section+' remains represented in the profile More section');
  }
});

test('mobile navigation stylesheet is linked and versioned independently',()=>{
  assert.ok(html.includes('/mobile-layout.css?v=20261104-mobile-navigation-1'));
  assert.ok(html.includes('/app.js?v=20261105-live-reward-drops-1'));
});
