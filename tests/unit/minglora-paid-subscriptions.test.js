import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('profile Subscribe action follows Follow and remains in a horizontal row', async () => {
  const [app, profileCss, subscriptionCss] = await Promise.all([
    read('../../public/app.js'),
    read('../../public/profile-established.css'),
    read('../../public/subscriptions.css')
  ]);
  const start = app.indexOf('const relationshipActions=isMe');
  const end = app.indexOf('const aboutHtml=profileAboutMarkup', start);
  assert.ok(start >= 0 && end > start, 'visitor profile action row exists');
  const row = app.slice(start, end);
  const order = ['id="profile-follow"', 'id="profile-subscribe"', 'id="profile-message"', 'data-profile-call="audio"', 'data-profile-call="video"', 'id="profile-report"', 'id="profile-block"'];
  let prior = -1;
  for (const item of order) {
    const next = row.indexOf(item);
    assert.ok(next > prior, item + ' must stay in the requested order');
    prior = next;
  }
  assert.match(profileCss, /flex-flow:row nowrap/);
  assert.match(profileCss, /overflow-x:auto/);
  assert.match(profileCss, /flex:0 0 auto/);
  assert.match(subscriptionCss, /profile-subscribe-button/);
});

test('creator application, monthly offer, PayPal checkout and cancellation are server routes', async () => {
  const server = await read('../../src/server.js');
  assert.match(server, /\/api\/subscriptions\/apply/);
  assert.match(server, /\/api\/subscriptions\/tier/);
  assert.match(server, /\/api\/subscriptions\/checkout/);
  assert.match(server, /\/api\/subscriptions\/cancel/);
  assert.match(server, /\/api\/subscriptions\/admin\/review/);
  assert.match(server, /\/api\/subscriptions\/admin\/bonus-review/);
  assert.match(server, /verify-webhook-signature/);
  assert.match(server, /subscription_paypal_webhook/);
  assert.match(server, /subscription_checkout_prepare/);
});

test('subscriber-only posts and LIVE are enforced by server access checks', async () => {
  const [server, app] = await Promise.all([
    read('../../src/server.js'),
    read('../../public/app.js')
  ]);
  assert.match(server, /async function subscriptionAccessSet/);
  assert.match(server, /async function canViewSubscriptionPost/);
  assert.match(server, /accessLevel=input\.accessLevel==='subscribers'/);
  assert.match(server, /subscriberOnly=input\.subscriberOnly===true/);
  assert.match(server, /canViewLiveSession\(session,user\.id\)/);
  assert.match(app, /name='subscriberOnly'/);
  assert.match(app, /subscriberOnly:values\.has\("subscriberOnly"\)/);
  assert.match(app, /Subscribers only · Paid members/);
});

test('Minglora uses a 70% base share and a reviewed 20-point bonus up to 90% after PayPal fees', async () => {
  const [edge, splitMigration, feeMigration] = await Promise.all([
    read('../../supabase/functions/minglora-runtime-state/index.ts'),
    read('../../supabase/migrations/20261106120000_minglora_tiktok_style_subscription_performance_share.sql'),
    read('../../supabase/migrations/20261106121000_minglora_subscription_provider_fee_net_split.sql')
  ]);
  assert.match(edge, /subscription_bonus_review/);
  assert.match(edge, /followerCount >= 10000/);
  assert.match(edge, /qualifyingVideoViews >= 100000/);
  assert.match(edge, /subscriberOnlyVideoCount >= 3/);
  assert.match(edge, /creatorShareBps = 7000 \+ performanceBonusBps/);
  assert.match(edge, /creatorMinor = Math\.floor\(netMinor \* creatorShareBps \/ 10000\)/);
  assert.match(edge, /provider_fee_minor: providerFeeMinor/);
  assert.match(edge, /originalPayment\?\.creator_share_bps/);
  assert.match(splitMigration, /creator_share_bps IN \(5000,7000,9000\)/);
  assert.match(splitMigration, /platform_share_bps IN \(1000,3000,5000\)/);
  assert.match(feeMigration, /provider_fee_minor integer NOT NULL DEFAULT 0/);
  assert.match(feeMigration, /creator_minor \+ platform_minor \+ provider_fee_minor = gross_minor/);
});

test('subscription pages, Creator Studio navigation and current cache version are reachable', async () => {
  const [app, html, worker, css] = await Promise.all([
    read('../../public/app.js'),
    read('../../public/index.html'),
    read('../../public/sw.js'),
    read('../../public/subscriptions.css')
  ]);
  assert.match(app, /async function renderSubscriptions/);
  assert.match(app, /function creatorSubscriptionsMarkup/);
  assert.match(app, /\["subscriptions","Subscriptions"/);
  assert.match(app, /state\.view==='subscriptions'/);
  assert.match(app, /profile-subscribe/);
  assert.match(html, /subscriptions\.css\?v=20261106-tiktok-style-subscriptions-1/);
  assert.match(html, /app\.js\?v=20261106-tiktok-style-subscriptions-1/);
  assert.match(worker, /minglora-shell-v115-tiktok-style-subscriptions-1/);
  assert.match(worker, /subscriptions\.css\?v=20261106-tiktok-style-subscriptions-1/);
  assert.ok(css.length > 1000);
});
