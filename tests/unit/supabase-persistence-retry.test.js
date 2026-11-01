import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const storeUrl = new URL('../../src/store.js', import.meta.url).href;
const collections = [
  'users', 'posts', 'friendships', 'follows', 'blocks', 'savedPosts', 'mediaAssets',
  'marketplaceSellers', 'marketplaceSellerEvents', 'marketplaceQuotes', 'marketplaceBookings',
  'jobPostings', 'jobApplications', 'groups', 'groupPosts', 'stories', 'storyViews', 'pages',
  'pageRoles', 'pageFollows', 'pagePosts', 'marketplaceListings', 'marketplaceSaved',
  'marketplaceInquiries', 'messages', 'messageConversationHides', 'notifications', 'sessions',
  'liveSessions', 'liveParticipants', 'liveSpeakerRequests', 'reports', 'supportTickets',
  'supportMessages', 'moderationActions', 'auditLog', 'pendingAuth', 'calls', 'callParticipants',
  'meetWaveRooms', 'meetWaveInvitations', 'meetWaveMessages', 'meetWaveAttendance',
  'dataRightsRequests', 'pushSubscriptions', 'profileViews', 'profileViewPresence', 'albums',
  'streambayChannels', 'streambayVideos', 'streambayComments', 'streambaySubscriptions',
  'streambayLikes', 'streambayHistory', 'streambayPlaylists', 'streambayPlaylistItems',
  'streambayWatchLater', 'mailboxes', 'mailMessages', 'mailOAuthStates', 'mailExternalAccounts'
];
const baseState = Object.fromEntries(collections.map(key => [key, []]));

function runIsolated(script) {
  return execFileSync(process.execPath, ['--input-type=module', '-e', script.replaceAll('__STORE_URL__', JSON.stringify(storeUrl))], {
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PERSISTENCE_DRIVER: 'supabase',
      SUPABASE_STATE_API_URL: 'https://supabase-gateway.invalid/state',
      SUPABASE_STATE_API_KEY: 'test-service-key',
      SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key'
    },
    timeout: 10000
  });
}

test('Supabase save retries a transient HTTP 520 and persists the pending update', () => {
  const script = `
    import assert from 'node:assert/strict';
    const state = ${JSON.stringify(baseState)};
    let loadCalls = 0;
    let saveCalls = 0;
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options.body);
      if (request.action === 'load') {
        loadCalls += 1;
        return new Response(JSON.stringify({ state, revision: 7 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (request.action === 'save') {
        saveCalls += 1;
        if (saveCalls === 1) return new Response(JSON.stringify({ error: 'temporary edge failure' }), { status: 520, headers: { 'content-type': 'application/json' } });
        return new Response(JSON.stringify({ revision: 8 }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      throw new Error('Unexpected Supabase action: ' + request.action);
    };
    const { db, saveStore } = await import(__STORE_URL__);
    db.users.push({ id: 'retry-regression-user' });
    await saveStore();
    assert.equal(loadCalls, 1);
    assert.equal(saveCalls, 2);
    assert.equal(db.users[0].id, 'retry-regression-user');
  `;
  assert.doesNotThrow(() => runIsolated(script));
});

test('Supabase save does not retry a permanent client error', () => {
  const script = `
    import assert from 'node:assert/strict';
    const state = ${JSON.stringify(baseState)};
    let saveCalls = 0;
    globalThis.fetch = async (_url, options) => {
      const request = JSON.parse(options.body);
      if (request.action === 'load') return new Response(JSON.stringify({ state, revision: 2 }), { status: 200, headers: { 'content-type': 'application/json' } });
      if (request.action === 'save') {
        saveCalls += 1;
        return new Response(JSON.stringify({ error: 'permission denied' }), { status: 403, headers: { 'content-type': 'application/json' } });
      }
      throw new Error('Unexpected Supabase action: ' + request.action);
    };
    const { db, saveStore } = await import(__STORE_URL__);
    db.users.push({ id: 'permanent-error-user' });
    await assert.rejects(saveStore(), error => error.status === 403 && /permission denied/.test(error.message));
    assert.equal(saveCalls, 1);
  `;
  assert.doesNotThrow(() => runIsolated(script));
});
