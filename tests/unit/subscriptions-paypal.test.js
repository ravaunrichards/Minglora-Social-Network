import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Minglora uses PayPal-only monthly billing and stores server-side subscription records', async () => {
  const [server, schema, paypalMigration] = await Promise.all([
    read('../../src/server.js'),
    read('../../supabase/migrations/20261104200000_minglora_creator_subscriptions.sql'),
    read('../../supabase/migrations/20261104202000_minglora_paypal_subscription_billing.sql')
  ]);
  assert.match(server, /\/v1\/catalogs\/products/);
  assert.match(server, /\/v1\/billing\/plans/);
  assert.match(server, /\/v1\/billing\/subscriptions/);
  assert.match(server, /PAYPAL_WEBHOOK_ID/);
  assert.match(schema, /platform_share_bps integer NOT NULL DEFAULT 5000 CHECK \(platform_share_bps = 5000\)/);
  assert.match(schema, /creator_share_bps integer NOT NULL DEFAULT 5000 CHECK \(creator_share_bps = 5000\)/);
  assert.ok(schema.includes("UNIQUE(provider,provider_event_id)"));
  assert.match(paypalMigration, /paypal_plan_id/);
});

test('PayPal webhook verification and idempotent event handling gate paid access', async () => {
  const [server, edge] = await Promise.all([
    read('../../src/server.js'),
    read('../../supabase/functions/minglora-runtime-state/index.ts')
  ]);
  assert.match(server, /verify-webhook-signature/);
  assert.match(server, /subscription_paypal_webhook/);
  assert.match(edge, /BILLING\.SUBSCRIPTION\.ACTIVATED/);
  assert.match(edge, /PAYMENT\.SALE\.COMPLETED/);
  assert.match(edge, /PAYMENT\.SALE\.REFUNDED/);
  assert.match(edge, /PAYMENT\.SALE\.REVERSED/);
  assert.match(edge, /processed_at/);
  assert.match(edge, /creator_minor: half, platform_minor: half/);
  assert.match(edge, /Only PAYMENT\.SALE\.COMPLETED grants membership access/);
});

test('creator approval is required and subscriber-only posts and LIVE use server checks', async () => {
  const [server, edge, migration] = await Promise.all([
    read('../../src/server.js'),
    read('../../supabase/functions/minglora-runtime-state/index.ts'),
    read('../../supabase/migrations/20261104201000_harden_minglora_subscription_creator_controls.sql')
  ]);
  assert.match(server, /subscription_creator_get/);
  assert.match(server, /application_status!==?'approved'/);
  assert.match(server, /accessLevel==='subscribers'/);
  assert.match(server, /subscriberOnly===true/);
  assert.match(server, /canViewLiveSession\(session,user\.id\)/);
  assert.match(edge, /subscription_access_check/);
  assert.match(migration, /minglora_guard_creator_subscription_settings/);
});

test('member and creator subscription screens are reachable without adding a phone main tab', async () => {
  const [app, css, sw] = await Promise.all([
    read('../../public/app.js'),
    read('../../public/subscriptions.css'),
    read('../../public/sw.js')
  ]);
  assert.match(app, /profile-subscribe/);
  assert.match(app, /data-creator-section/);
  assert.match(app, /view:'subscriptions'/);
  assert.match(app, /async function renderSubscriptions/);
  assert.match(app, /subscription-tier-form/);
  assert.match(css, /\.subscription-member-card/);
  assert.match(sw, /subscriptions\.css\?v=20261104-paypal-subscriptions-1/);
  assert.match(sw, /minglora-shell-v74-paypal-subscriptions-1/);
});

test('subscription earnings are merged into the existing creator PayPal payout balance', async () => {
  const [edge, app] = await Promise.all([
    read('../../supabase/functions/minglora-runtime-state/index.ts'),
    read('../../public/app.js')
  ]);
  assert.match(edge, /subscription_earnings_ledger/);
  assert.match(edge, /creator_minor/);
  assert.match(edge, /availableMinor/);
  assert.match(app, /item\.source==="subscription"/);
  assert.match(app, /PayPal payout/);
});
