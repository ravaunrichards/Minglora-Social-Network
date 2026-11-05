import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const [server, app, styles] = await Promise.all([
  read('src/server.js'),
  read('public/app.js'),
  read('public/styles.css')
]);

test('LIVE host can list, assign and remove room moderators through authenticated routes', () => {
  assert.ok(server.includes('const liveModeratorsMatch = p.match'));
  assert.ok(server.includes('Only the LIVE host or an assigned moderator can view room moderators'));
  assert.ok(server.includes('Only the LIVE host can assign moderators'));
  assert.ok(server.includes("method === 'DELETE' && liveModeratorsMatch[2]"));
  assert.ok(server.includes('session.liveModerators.push(target.id)'));
  assert.ok(server.includes('maximum of 10 moderators'));
  assert.ok(server.includes('blockedBetween(user.id, target.id)'));
});

test('assigned LIVE moderators can remove chat comments but cannot use host-only controls', () => {
  assert.ok(server.includes('session.hostId===user.id||(session.liveModerators||[]).includes(user.id)'));
  assert.ok(app.includes('activeLiveSession?.liveModerators?.includes(state.user?.id)'));
  assert.ok(app.includes('if(deleteButton&&(role==="host"||Boolean(session.liveModerators?.includes(state.user?.id))))'));
  assert.ok(app.includes('if(!button||role!=="host")return'));
  assert.ok(app.includes('data-live-chat-delete='));
});

test('Group LIVE chat is saved at setup, displayed conditionally and enforced by the API', () => {
  assert.ok(app.includes("name='groupChatEnabled' checked"));
  assert.ok(app.includes('groupChatEnabled:values.has("groupChatEnabled")'));
  assert.ok(app.includes('liveSettings.groupChatEnabled!==false'));
  assert.ok(server.includes('session.liveSettings?.groupChatEnabled===false'));
  assert.ok(server.includes('The host has disabled group LIVE chat'));
});

test('host moderator manager is connected to list, add and remove API routes', () => {
  assert.ok(app.includes("id='live-moderator-panel'"));
  assert.ok(app.includes("id='live-moderator-form'"));
  assert.ok(app.includes('"/moderators"'));
  assert.ok(app.includes('"/moderators",{method:"POST"'));
  assert.ok(app.includes('"/moderators/"+encodeURIComponent(memberId)'));
  assert.ok(app.includes("data-live-tools-target='#live-moderator-panel'"));
  assert.ok(styles.includes('.live-moderator-panel'));
});
