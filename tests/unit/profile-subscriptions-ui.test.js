import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../public/subscriptions.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
const server = readFileSync(new URL('../../src/server.js', import.meta.url), 'utf8');

test('profile action order is Followers, Follow, Subscribe, Message, calls, Report, Block', () => {
  const start = app.indexOf('const relationshipActions=isMe');
  const end = app.indexOf('const aboutHtml=', start);
  assert.ok(start >= 0 && end > start, 'profile action renderer must exist');
  const row = app.slice(start, end);
  const order = [
    'profile-followers-action',
    'id="profile-follow"',
    'id="profile-subscribe"',
    'id="profile-message"',
    'data-profile-call="audio"',
    'data-profile-call="video"',
    'id="profile-report"',
    'id="profile-block"'
  ];
  let previous = -1;
  for (const marker of order) {
    const index = row.indexOf(marker);
    assert.ok(index > previous, marker + ' must follow the previous profile action');
    previous = index;
  }
  assert.equal((row.match(/data-open-connections="followers"/g) || []).length, 1);
});

test('profile subscription checkout is server-backed and never self-subscribes', () => {
  assert.match(app, /openProfileSubscriptionPicker\(u,data\.subscriptionOffer\)/);
  assert.match(app, /api\("\/subscriptions\/checkout"/);
  assert.match(server, /creatorId===user\.id/);
  assert.match(server, /subscription_checkout_prepare/);
  assert.match(server, /subscription_checkout_attach/);
});

test('creator applications, monthly offers, cancellation and moderator performance review have routes', () => {
  assert.match(server, /p==='\/api\/subscriptions\/apply'/);
  assert.match(server, /p==='\/api\/subscriptions\/tier'/);
  assert.match(server, /p==='\/api\/subscriptions\/settings'/);
  assert.match(server, /p==='\/api\/subscriptions\/cancel'/);
  assert.match(server, /p==='\/api\/subscriptions\/admin\/bonus-review'/);
  assert.match(app, /function bindCreatorSubscriptionActions/);
  assert.match(app, /async function renderSubscriptions/);
});

test('net-revenue subscription styling loads and profile action row stays horizontal on phones', () => {
  assert.match(html, /\/subscriptions\.css\?v=20261107-subscriptions-net-share-1/);
  assert.match(css, /\.profile-actions\s*\{[^}]*flex-wrap:nowrap/s);
  assert.match(css, /\.profile-info>\.profile-actions\s*\{[^}]*overflow-x:auto/s);
  assert.match(css, /\.profile-actions \.profile-followers-action/);
});
