import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROFILE_PRESENCE_TTL_MS,
  PROFILE_VIEW_WINDOW_MS,
  getProfileViewStats,
  recordProfileView,
  touchProfilePresence
} from '../../backend/modules/profiles/service.js';

const at = value => new Date(value);

test('profile visits are real signed-in visitor events and exclude self-views', () => {
  const views = [];
  assert.equal(recordProfileView(views, { targetUserId: 'owner', viewerUserId: 'owner', at: at('2026-10-31T10:00:00Z') }), false);
  assert.equal(views.length, 0);

  assert.equal(recordProfileView(views, { targetUserId: 'owner', viewerUserId: 'member-a', at: at('2026-10-31T10:00:00Z') }), true);
  assert.equal(recordProfileView(views, { targetUserId: 'owner', viewerUserId: 'member-a', at: at('2026-10-31T10:20:00Z') }), false);
  assert.equal(recordProfileView(views, { targetUserId: 'owner', viewerUserId: 'member-b', at: at('2026-10-31T10:25:00Z') }), true);
  assert.equal(views.length, 2);
});

test('a real return visit on a later UTC day is counted as another daily profile view', () => {
  const views = [];
  recordProfileView(views, { targetUserId: 'owner', viewerUserId: 'member-a', at: at('2026-10-31T23:59:00Z') });
  assert.equal(recordProfileView(views, { targetUserId: 'owner', viewerUserId: 'member-a', at: at('2026-11-01T00:01:00Z') }), true);
  assert.equal(views.length, 2);
  assert.deepEqual(views.map(view => view.viewedOn), ['2026-10-31', '2026-11-01']);
});

test('profile view metric includes only the rolling 30-day window', () => {
  const views = [];
  recordProfileView(views, { targetUserId: 'owner', viewerUserId: 'old-member', at: new Date(Date.now() - PROFILE_VIEW_WINDOW_MS - 1000) });
  recordProfileView(views, { targetUserId: 'owner', viewerUserId: 'recent-member', at: new Date() });
  const stats = getProfileViewStats({ views, targetUserId: 'owner' });
  assert.equal(stats.profileViews30d, 1);
});

test('active profile presence is upserted once per member and expires after its heartbeat TTL', () => {
  const presence = [];
  const first = at('2026-10-31T10:00:00Z');
  touchProfilePresence(presence, { targetUserId: 'owner', viewerUserId: 'member-a', at: first });
  touchProfilePresence(presence, { targetUserId: 'owner', viewerUserId: 'member-a', at: at('2026-10-31T10:00:20Z') });
  touchProfilePresence(presence, { targetUserId: 'owner', viewerUserId: 'member-b', at: at('2026-10-31T10:00:20Z') });

  assert.equal(presence.length, 2, 'repeated heartbeat updates the same visitor record');
  assert.equal(getProfileViewStats({ presence, targetUserId: 'owner', at: at('2026-10-31T10:00:30Z') }).activeViewersCount, 2);
  assert.equal(getProfileViewStats({ presence, targetUserId: 'owner', at: at('2026-10-31T10:01:11Z') }).activeViewersCount, 0);
  assert.equal(PROFILE_PRESENCE_TTL_MS, 50000);
});

test('active profile count is unique by member and excludes the profile owner', () => {
  const timestamp = new Date().toISOString();
  const presence = [
    { targetUserId: 'owner', viewerUserId: 'owner', lastSeenAt: timestamp },
    { targetUserId: 'owner', viewerUserId: 'member-a', lastSeenAt: timestamp },
    { targetUserId: 'owner', viewerUserId: 'member-a', lastSeenAt: timestamp },
    { targetUserId: 'owner', viewerUserId: 'member-b', lastSeenAt: timestamp },
    { targetUserId: 'another-profile', viewerUserId: 'member-c', lastSeenAt: timestamp }
  ];
  assert.equal(getProfileViewStats({ presence, targetUserId: 'owner' }).activeViewersCount, 2);
});

test('server records authorized profile access, returns owner-only analytics and persists the collections', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const [server, store] = await Promise.all([
    readFile(resolve(root, 'src/server.js'), 'utf8'),
    readFile(resolve(root, 'src/store.js'), 'utf8')
  ]);

  assert.match(server, /!canViewProfile\(user\.id,target\)/, 'profile privacy is checked before visit tracking');
  assert.match(server, /recordProfileView\(db\.profileViews/);
  assert.match(server, /getProfileViewStats\(\{views:db\.profileViews/);
  assert.match(server, /\/profile-presence/);
  assert.match(server, /target\.id===user\.id\s*\?getProfileViewStats/);
  assert.match(store, /'profileViews', 'profileViewPresence'/, 'new metrics persist through the configured state store');
});

test('profile owner sees transparent analytics labels and a visible-tab heartbeat', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const { dirname, resolve } = await import('node:path');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const app = await readFile(resolve(root, 'public/app.js'), 'utf8');
  const css = await readFile(resolve(root, 'public/styles.css'), 'utf8');

  assert.match(app, /Profile views · 30 days/);
  assert.match(app, /Viewing now/);
  assert.match(app, /Visits from signed-in members/);
  assert.match(app, /profile-presence/);
  assert.match(app, /setInterval\(\(\)=>void refreshProfilePresence\(profileId\),20000\)/);
  assert.match(app, /document\.visibilityState!=='visible'/);
  assert.match(app, /if\(view!=='profile'\)stopProfilePresence\(\)/);
  assert.match(css, /\.profile-live-insights/);
  assert.match(css, /\.profile-viewing-now i/);
});
