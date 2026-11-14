import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const migration = fs.readFileSync(new URL('../../supabase/migrations/20261114182543_minglora_admin_finance_foundation_20261114.sql', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../../supabase/functions/minglora-runtime-state/index.ts', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../../src/server.js', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../../public/admin-centre.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../public/admin-centre.html', import.meta.url), 'utf8');
const financeUi = fs.readFileSync(new URL('../../public/admin-finance.js', import.meta.url), 'utf8');
const financeCss = fs.readFileSync(new URL('../../public/admin-finance.css', import.meta.url), 'utf8');
const financeAttachmentAuditMigration = fs.readFileSync(new URL('../../supabase/migrations/20261114191800_minglora_admin_finance_attachment_audit.sql', import.meta.url), 'utf8');

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
  assert.match(migration, /REVOKE ALL ON public\.minglora_admin_finance_audit_events FROM service_role/);
  assert.match(migration, /REVOKE ALL ON public\.minglora_admin_service_providers FROM service_role/);
  assert.match(migration, /GRANT SELECT, INSERT ON public\.minglora_admin_finance_audit_events TO service_role/);
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

test('finance registers can update existing records without unlocking protected states', () => {
  assert.match(financeUi, /data-finance-edit/);
  assert.match(financeUi, /function beginEdit\(kind,id\)/);
  for (const kind of ['provider','subscription','budget','invoice','expense']) {
    assert.match(financeUi, new RegExp("editAction\\('" + kind + "'"));
  }
  assert.match(financeUi, /data-finance-cancel-edit/);
  assert.match(financeUi, /id:form\.dataset\.editId/);
  assert.match(financeUi, /record\.approval_status === 'approved'/);
  assert.match(financeUi, /'paid','paid_pending_verification','payment_initiated','payment_scheduled'/);
  assert.match(financeUi, /Managed by verified provider connection/);
});

test('budget actuals use matching department, currency and the approved date period', () => {
  assert.match(financeUi, /const budgetActual = budget => records\.expenses\.reduce/);
  assert.match(financeUi, /item\.department_key !== budget\.department_key/);
  assert.match(financeUi, /String\(item\.currency_code \|\| ''\)\.toUpperCase\(\)/);
  assert.match(financeUi, /item\.expense_status !== 'actual'/);
  assert.match(financeUi, /Approved budget vs actual expenses/);
  assert.match(financeUi, /Renewal notice windows are calculated from saved dates/);
  assert.match(financeUi, /Related subscription/);
});


test('private company finance uploads validate owner, file type, signature and audited download access', () => {
  assert.ok(runtime.includes('COMPANY_FINANCE_BUCKET = "minglora-company-finance"'));
  assert.ok(runtime.includes('admin_finance_attachment_prepare'));
  assert.ok(runtime.includes('admin_finance_attachment_complete'));
  assert.ok(runtime.includes('admin_finance_attachment_download'));
  assert.ok(runtime.includes('createBucket(COMPANY_FINANCE_BUCKET'));
  assert.ok(runtime.includes('public: false'));
  assert.ok(runtime.includes('createSignedUploadUrl(path, { upsert: false })'));
  assert.ok(runtime.includes('const validSignature ='));
  assert.ok(runtime.includes('attachment_downloaded'));
  assert.ok(runtime.includes('createSignedUrl(storedPath, 60, { download: true })'));
  assert.ok(financeAttachmentAuditMigration.includes("'attachment_downloaded'::text"));
  assert.ok(financeAttachmentAuditMigration.includes('minglora_admin_finance_audit_events_action_check'));
  assert.ok(server.includes("p.startsWith('/api/admin/finance/attachments/')"));
  assert.ok(server.includes('hasActiveReviewerSession(user)'));
  assert.ok(server.includes('admin_finance_attachment_prepare'));
  assert.ok(server.includes('admin_finance_attachment_complete'));
  assert.ok(server.includes('admin_finance_attachment_download'));
  assert.ok(financeUi.includes('uploadFinanceAttachment'));
  assert.ok(financeUi.includes("uploadFinanceAttachment('invoice_attachment'"));
  assert.ok(financeUi.includes("uploadFinanceAttachment('invoice_receipt'"));
  assert.ok(financeUi.includes("uploadFinanceAttachment('expense_receipt'"));
  assert.ok(financeUi.includes('attachment_storage_path:attachmentPath'));
  assert.ok(financeUi.includes('receipt_storage_path:receiptPath'));
  assert.ok(financeUi.includes('kind=invoice_attachment'));
  assert.ok(financeUi.includes('kind=expense_receipt'));
});


test('subscription register captures contract, metered usage, dates and cancellation details', () => {
  for (const field of ['usage_charge','usage_unit','started_on','included_usage','measured_usage',
    'cancellation_notice_days','cancellation_terms','contract_status','invoice_location']) {
    assert.ok(financeUi.includes('name="' + field + '"') || financeUi.includes("'" + field + "'"), 'missing subscription control: ' + field);
  }
  assert.ok(financeUi.includes('usage_charge_minor:usageChargeRaw'));
  assert.ok(financeUi.includes('included_usage:parseUsageObject'));
  assert.ok(financeUi.includes('measured_usage:parseUsageObject'));
  assert.ok(financeUi.includes('cancellation_notice_days:cancellationNotice'));
  assert.ok(financeUi.includes('contract_status:String(values.get'));
  assert.ok(financeUi.includes('invoice_location:String(values.get'));
  assert.ok(financeUi.includes("key === 'included_usage' || key === 'measured_usage'"));
  assert.ok(financeUi.includes('cancellationNotice>365'));
  assert.match(migration, /usage_charge_minor bigint/);
  assert.ok(migration.includes("included_usage jsonb NOT NULL DEFAULT '{}'::jsonb"));
  assert.ok(migration.includes("measured_usage jsonb NOT NULL DEFAULT '{}'::jsonb"));
  assert.match(migration, /cancellation_notice_days smallint/);
  assert.match(migration, /cancellation_terms text/);
  assert.match(migration, /contract_status text NOT NULL DEFAULT 'unknown'/);
  assert.match(migration, /invoice_location text/);
});


test('provider directory records masked account ownership and integration metadata without fabricating connections', () => {
  for (const field of ['account_owner','account_identifier','support_contact','integration_method','api_available','api_connection_status','is_candidate']) {
    assert.ok(financeUi.includes('name="' + field + '"') || financeUi.includes("'" + field + "'"), 'missing provider control: ' + field);
  }
  assert.ok(financeUi.includes('account_owner:String(values.get'));
  assert.ok(financeUi.includes('account_identifier:String(values.get'));
  assert.ok(financeUi.includes('support_contact:String(values.get'));
  assert.ok(financeUi.includes('integration_method:String(values.get'));
  assert.ok(financeUi.includes("api_available:String(values.get('api_available')||'false')==='true'"));
  assert.ok(financeUi.includes('api_connection_status:String(values.get'));
  assert.ok(financeUi.includes('maskProviderReference'));
  assert.ok(financeUi.includes("API: ' + esc(item.api_connection_status.replace"));
  assert.ok(financeUi.includes('not_connected'));
  assert.ok(migration.includes('account_owner text'));
  assert.ok(migration.includes('account_identifier text'));
  assert.ok(migration.includes('support_contact text'));
});
