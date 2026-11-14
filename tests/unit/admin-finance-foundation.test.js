import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(new URL('../../supabase/migrations/20261114180000_minglora_admin_finance_foundation.sql', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../../supabase/functions/minglora-runtime-state/index.ts', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../../src/server.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../../public/admin-centre.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../public/admin-centre.html', import.meta.url), 'utf8');
const financeUi = fs.readFileSync(new URL('../../public/admin-finance.js', import.meta.url), 'utf8');
const financeCss = fs.readFileSync(new URL('../../public/admin-finance.css', import.meta.url), 'utf8');

test('company finance schema is additive and keeps company expenses separate from creator liabilities', () => {
  for (const table of [
    'minglora_admin_service_providers',
    'minglora_admin_service_subscriptions',
    'minglora_admin_operating_budgets',
    'minglora_admin_operating_invoices',
    'minglora_admin_operating_expenses',
    'minglora_admin_finance_audit_events'
  ]) assert.match(migration, new RegExp('CREATE TABLE IF NOT EXISTS public\\.' + table));
  assert.match(migration, /UNIQUE \(provider_id, invoice_number\)/);
  assert.match(migration, /invoice_id uuid UNIQUE/);
  assert.match(migration, /creator and seller ledgers remain separate/i);
  assert.match(migration, /total_minor = amount_minor \+ tax_minor/);
});

test('finance tables deny browser roles and audit history is append-only', () => {
  assert.equal((migration.match(/ENABLE ROW LEVEL SECURITY/g) || []).length, 6);
  assert.match(migration, /REVOKE ALL ON public\.minglora_admin_operating_invoices FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT SELECT, INSERT ON public\.minglora_admin_finance_audit_events TO service_role/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON public\.minglora_admin_finance_audit_events/);
  assert.match(migration, /SECURITY INVOKER/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.minglora_admin_finance_command\(text,uuid,jsonb\) FROM PUBLIC, anon, authenticated/);
});

test('provider directory seeds only supplied provider candidates as not registered', () => {
  assert.match(migration, /'namecheap','Namecheap','https:\/\/www\.namecheap\.com\//);
  assert.match(migration, /'supabase','Supabase','https:\/\/supabase\.com\//);
  assert.match(migration, /'paypal','PayPal','https:\/\/www\.paypal\.com\/jm\/business'/);
  assert.match(migration, /'not_registered','not_connected'/);
  assert.match(migration, /ON CONFLICT \(provider_key\) DO NOTHING/);
  const seedBlock = migration.split('-- These are directory entries only.')[1] || '';
  assert.match(seedBlock, /INSERT INTO public\.minglora_admin_service_providers/);
  assert.doesNotMatch(seedBlock, /INSERT INTO public\.minglora_admin_operating_/i);
});

test('private runtime finance action supports records but no money movement command', () => {
  assert.match(runtime, /"admin_finance_command"/);
  assert.match(runtime, /if \(action === "admin_finance_command"\)/);
  assert.match(runtime, /minglora_admin_finance_command/);
  assert.match(runtime, /payment execution/i);
  assert.doesNotMatch(runtime, /financeAction === ["']pay["']/);
});

test('server finance API uses the existing owner and MFA authorization guard', () => {
  assert.match(server, /p==='\/api\/admin\/finance'/);
  assert.match(server, /isDesignatedCreatorHubAdmin\(user\).*isModerator\(user,req\).*hasActiveReviewerSession\(user\)/s);
  assert.match(server, /isSameOriginApiWrite\(req\)/);
  assert.match(server, /save_provider.*save_subscription.*save_budget.*save_invoice.*save_expense/s);
});

test('Admin Centre mounts the finance module only after the owner-only panel is created', () => {
  assert.match(admin, /initializeAdminPageNavigation\(panel, unlocked\)/);
  assert.match(admin, /MingloraAdminFinance\?\.mount\(panel, adminCentreApi\)/);
  assert.match(admin, /key:'company-finance'.*selector:'#admin-finance-control'/s);
  assert.match(html, /admin-finance\.css/);
  assert.match(html, /admin-finance\.js/);
  assert.match(financeUi, /NOT CONNECTED/);
  assert.match(financeUi, /OPEN PROVIDER BILLING PORTAL/);
  assert.match(financeUi, /MANUAL PROVIDER ACTION REQUIRED/);
  assert.match(financeUi, /payment_status/);
  assert.match(financeUi, /paid_pending_verification/);
  assert.doesNotMatch(financeUi, /select\('Approval status','approval_status',\[\['draft','Draft'\],\['pending','Pending'\],\['approved','Approved'\]/);
  assert.match(financeCss, /@media\(max-width:520px\)/);
});
