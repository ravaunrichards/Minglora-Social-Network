import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../public/app.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../../src/server.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../public/mobile-layout.css', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../../supabase/functions/minglora-runtime-state/index.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../../supabase/migrations/20261104225000_minglora_creator_subscriptions.sql', import.meta.url), 'utf8');

test('profile offers creator subscription management and subscriber checkout only when packages exist', () => {
  assert.match(app, /id="creator-subscriptions-manage"/);
  assert.match(app, /id="profile-subscribe"/);
  assert.match(app, /openCreatorSubscriptionManager\(\)/);
  assert.match(app, /openProfileSubscriptionPicker\(u,data\)/);
  assert.match(app, /subscriptionPlans\?\.length\|\|data\.viewerSubscription/);
});

test('creator subscription manager lets owners enable packages and toggle individual perks', () => {
  assert.match(app, /data-plan-enabled/);
  assert.match(app, /data-plan-perk/);
  assert.match(app, /api\('\/creator\/subscriptions'/);
  assert.match(server, /method==='PUT'&&p==='\/api\/creator\/subscriptions'/);
});

test('member checkout, PayPal return, renewal cancellation and webhook events are connected', () => {
  assert.match(app, /api\('\/subscriptions\/checkout'/);
  assert.match(app, /api\('\/subscriptions\/confirm'/);
  assert.match(app, /api\('\/subscriptions\/'.*\/cancel/);
  assert.match(app, /finishCreatorSubscriptionReturn\(\)/);
  assert.match(app, /checkout-cancel/);
  assert.match(server, /subscriptionCheckoutCancelMatch/);
  assert.match(server, /creatorId:tracked\.creatorId/);
  assert.match(server, /\/v1\/billing\/subscriptions/);
  assert.match(server, /BILLING\.SUBSCRIPTION\.ACTIVATED/);
  assert.match(server, /PAYMENT\.SALE\.COMPLETED/);
});

test('subscription receipts use an idempotent 50/50 creator and platform ledger', () => {
  assert.match(runtime, /economy_subscription_payment/);
  assert.match(migration, /UNIQUE \(paypal_sale_id\)/);
  assert.match(migration, /creator_amount := floor\(p_gross_minor \/ 2\.0\)/);
  assert.match(migration, /platform_amount := p_gross_minor - creator_amount/);
});

test('the subscriber-badge perk is reflected on a member identity while active', () => {
  assert.match(server, /result\.subscriberBadge=\(db\.creatorSubscriptions\|\|\[\]\)\.some/);
  assert.ok(server.includes('item.perks?.subscriber_badge!==true'));
  assert.match(app, /ml-subscriber-badge/);
  assert.match(css, /\.ml-subscriber-badge\s*\{/);
});

test('subscription controls and package cards fit and scroll on phones', () => {
  assert.match(css, /\.creator-subscription-modal\s*\{[^}]*max-height:calc\(100dvh - 16px\)/s);
  assert.match(css, /\.creator-subscription-perks\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(css, /\.subscriber-subscription-packages\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(css, /\.subscriber-subscription-tier button\{min-height:44px/);
});
