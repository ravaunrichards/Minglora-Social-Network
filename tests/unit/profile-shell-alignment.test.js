import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>readFile(resolve(root,file),'utf8');

test('profile header, tab panel and body share the same established canvas width',async()=>{
  const [css,html,sw]=await Promise.all([
    read('public/people-facebook-responsive.css'),
    read('public/index.html'),
    read('public/sw.js')
  ]);
  const lock=css.slice(css.lastIndexOf('/* Minglora profile shell alignment lock.'));
  assert.match(lock,/\.minglora-profile-page\s*\{[\s\S]*?max-width:851px!important/);
  assert.match(lock,/\.minglora-profile-page > \.profile-header-card,\s*\.minglora-profile-page > #profile-tab-panel\s*\{[\s\S]*?width:100%!important;[\s\S]*?max-width:100%!important/);
  assert.match(lock,/\.minglora-profile-page > #profile-tab-panel \.profile-body\s*\{[\s\S]*?width:100%!important;[\s\S]*?max-width:100%!important/);
  assert.ok(html.includes('/people-facebook-responsive.css?v=20261108-profile-shell-alignment-1'));
  assert.ok(sw.includes('/people-facebook-responsive.css?v=20261108-profile-shell-alignment-1'));
  assert.match(sw,/CACHE_NAME='minglora-shell-v\d+-[a-z0-9-]+'/);
  assert.doesNotMatch(lock,/--minglora-profile-avatar-size|\.profile-avatar-edit-wrap|\.profile-cover-image|\.profile-info-main/);
});
