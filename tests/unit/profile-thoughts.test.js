import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('profile thoughts appear beside member profile pictures and are tappable from the feed', async () => {
  const [app,server,css] = await Promise.all([
    read('../../public/app.js'),read('../../src/server.js'),read('../../public/styles.css')
  ]);
  assert.ok(app.includes('function thoughtAvatarMarkup('));
  assert.ok(app.includes('function openProfileThoughtViewer('));
  assert.ok(app.includes('function openProfileThoughtByUserId('));
  assert.ok(app.includes('class="ml-profile-thought-bubble"'));
  assert.ok(app.includes('class="ml-profile-thought-add"'));
  assert.ok(app.includes("api('/users/'+encodeURIComponent(userId)+'/profile-status')"));
  assert.ok(server.includes('canViewProfileAudience(viewerId,u.id,item.audience)'));
  assert.ok(server.includes('result.profileThought='));
  assert.ok(css.includes('.ml-profile-thought-bubble'));
  assert.ok(css.includes('.ml-thought-avatar-indicator'));
});

test('thought editor retains audience options and expiry and allows edit and removal', async () => {
  const [app,server]=await Promise.all([read('../../public/app.js'),read('../../src/server.js')]);
  assert.ok(app.includes('Share a thought'));
  assert.ok(app.includes('Who can see your thought?'));
  assert.ok(app.includes('How long it stays visible'));
  assert.ok(app.includes('Remove current thought'));
  assert.ok(app.includes("api('/profile-status',{method:'DELETE',body:'{}'})"));
  assert.ok(server.includes("if(method==='DELETE'&&p==='/api/profile-status')"));
  assert.ok(server.includes("['public','friends','followers','private'].includes(audience)"));
  assert.ok(server.includes('Math.min(168,Number(input.expiresInHours)||24)'));
});
