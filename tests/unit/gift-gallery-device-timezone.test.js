import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { giftGalleryTimeZone, getGiftGalleryPeriod } from '../../backend/modules/gift-gallery/service.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Gift Gallery is a first-class profile tab directly after Badges',()=>{
  const app=read('public/app.js');
  assert.match(app,/\[\['posts','All'\],\['about','About'\],\['friends','Friends'\],\['photos','Photos'\],\['reels','Reels'\],\['badges','Badges'\],\['gift-gallery','Gift Gallery'\],\['more','More'\]\]/);
  assert.match(app,/if\(tab==='gift-gallery'\)return/);
  assert.doesNotMatch(app,/if\(tab==='more'\)return[^\n]*data-profile-tab="gift-gallery"/);
  assert.match(app,/selected=button\.dataset\.profileTab===nextTab/);
  assert.match(app,/\['posts','about','friends','photos','reels','badges','more','gift-gallery'/);
});

test('Gift Gallery resolves the time-zone variable before formatting the weekly reset',()=>{
  const app=read('public/app.js');
  const gallery=app.slice(app.indexOf('async function loadProfileGiftGallery'),app.indexOf('function bindProfileTabActions'));
  const zone=gallery.indexOf('const timezone=');
  const format=gallery.indexOf('resetAt.toLocaleString');
  assert.ok(zone>=0&&format>zone,'time zone must be initialized before formatting');
  assert.match(gallery,/period\.timeZone\|\|getMingloraDeviceTimeZone\(\)\|\|'America\/Jamaica'/);
});

test('The browser IANA time zone is attached to Minglora API calls and validated on the server',()=>{
  const app=read('public/app.js');
  const settings=read('public/settings.js');
  const server=read('src/server.js');
  assert.match(app,/Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/);
  assert.match(app,/X-Minglora-Time-Zone/);
  assert.match(app,/headers:\{'Content-Type':'application\/json',\.\.\.mingloraDeviceContextHeaders\(\)/);
  assert.match(settings,/MingloraDeviceContextHeaders\?\.\(\)/);
  assert.match(server,/x-minglora-time-zone/);
  assert.match(server,/new Intl\.DateTimeFormat\('en-US',\{timeZone:deviceTimeZone\}\)/);
  assert.match(server,/user\.deviceTimeZone=deviceTimeZone/);
});

test('Gift Gallery prefers saved device time zone and computes the right local week',()=>{
  assert.equal(giftGalleryTimeZone({deviceTimeZone:'America/Los_Angeles'}),'America/Los_Angeles');
  assert.equal(giftGalleryTimeZone({country:'Jamaica'}),'America/Jamaica');
  const instant=new Date('2026-11-07T05:00:00.000Z');
  const period=getGiftGalleryPeriod(instant,'America/Jamaica');
  assert.equal(period.timeZone,'America/Jamaica');
  assert.match(period.weekKey,/^2026-11-02$/);
  assert.ok(new Date(period.startsAt).getTime()<instant.getTime());
  assert.ok(new Date(period.resetsAt).getTime()>instant.getTime());
});

test('Android WebView exposes location only to Minglora and follows runtime permission decisions',()=>{
  const activity=read('apps/android/app/src/main/java/com/minglora/social/MainActivity.java');
  const manifest=read('apps/android/app/src/main/AndroidManifest.xml');
  assert.match(activity,/onGeolocationPermissionsShowPrompt/);
  assert.match(activity,/APP_HOST\.equalsIgnoreCase\(uri\.getHost\(\)\)/);
  assert.match(activity,/ACCESS_COARSE_LOCATION/);
  assert.match(activity,/ACCESS_FINE_LOCATION/);
  assert.match(activity,/callback\.invoke\(origin, coarseGranted \|\| fineGranted, false\)/);
  assert.match(manifest,/android\.permission\.ACCESS_COARSE_LOCATION/);
  assert.match(manifest,/android\.permission\.ACCESS_FINE_LOCATION/);
});
