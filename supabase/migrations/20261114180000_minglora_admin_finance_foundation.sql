-- Minglora company finance foundation.
-- All records are owner-managed through the authenticated server and the private
-- Supabase runtime gateway. Customer, creator and seller ledgers remain separate.

CREATE TABLE IF NOT EXISTS public.minglora_admin_service_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key text NOT NULL UNIQUE
    CHECK (provider_key ~ '^[a-z0-9][a-z0-9_-]{1,63}$'),
  provider_name text NOT NULL CHECK (length(btrim(provider_name)) BETWEEN 2 AND 160),
  website_url text NOT NULL CHECK (website_url ~ '^https://'),
  service_category text NOT NULL CHECK (length(btrim(service_category)) BETWEEN 2 AND 80),
  department text NOT NULL DEFAULT 'infrastructure',
  account_owner text,
  account_identifier text,
  connection_status text NOT NULL DEFAULT 'not_registered'
    CHECK (connection_status IN (
      'not_registered','planned','registration_pending','active','free_plan','paid_plan',
      'payment_pending','overdue','suspended','cancelled','disconnected','requires_attention'
    )),
  service_importance text NOT NULL DEFAULT 'normal'
    CHECK (service_importance IN ('low','normal','high','critical')),
  integration_method text NOT NULL DEFAULT 'manual'
    CHECK (integration_method IN ('none','manual','oauth','api','webhook')),
  api_available boolean NOT NULL DEFAULT false,
  api_connection_status text NOT NULL DEFAULT 'not_connected'
    CHECK (api_connection_status IN ('not_configured','not_connected','connected','error','manual_only')),
  last_synced_at timestamptz,
  support_contact text,
  notes text,
  is_candidate boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.minglora_admin_service_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.minglora_admin_service_providers(id) ON DELETE RESTRICT,
  service_name text NOT NULL CHECK (length(btrim(service_name)) BETWEEN 2 AND 160),
  package_name text,
  plan_type text NOT NULL DEFAULT 'unknown'
    CHECK (plan_type IN ('free','paid','usage_based','one_time','unknown')),
  subscription_status text NOT NULL DEFAULT 'planned'
    CHECK (subscription_status IN (
      'not_registered','planned','registration_pending','active','free_plan','paid_plan',
      'payment_pending','overdue','suspended','cancelled','disconnected','requires_attention'
    )),
  currency_code text NOT NULL DEFAULT 'USD' CHECK (currency_code ~ '^[A-Z]{3}$'),
  setup_fee_minor bigint CHECK (setup_fee_minor IS NULL OR setup_fee_minor >= 0),
  monthly_fee_minor bigint CHECK (monthly_fee_minor IS NULL OR monthly_fee_minor >= 0),
  annual_fee_minor bigint CHECK (annual_fee_minor IS NULL OR annual_fee_minor >= 0),
  renewal_fee_minor bigint CHECK (renewal_fee_minor IS NULL OR renewal_fee_minor >= 0),
  usage_charge_minor bigint CHECK (usage_charge_minor IS NULL OR usage_charge_minor >= 0),
  usage_unit text,
  billing_frequency text NOT NULL DEFAULT 'unknown'
    CHECK (billing_frequency IN ('weekly','monthly','quarterly','annually','one_time','usage_based','unknown')),
  started_on date,
  next_payment_date date,
  renewal_date date,
  auto_renewal_enabled boolean NOT NULL DEFAULT false,
  auto_renewal_approved boolean NOT NULL DEFAULT false,
  included_usage jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(included_usage) = 'object'),
  measured_usage jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(measured_usage) = 'object'),
  cancellation_notice_days smallint CHECK (cancellation_notice_days IS NULL OR cancellation_notice_days BETWEEN 0 AND 365),
  cancellation_terms text,
  billing_portal_url text CHECK (billing_portal_url IS NULL OR billing_portal_url ~ '^https://'),
  contract_status text NOT NULL DEFAULT 'unknown'
    CHECK (contract_status IN ('not_required','pending','active','expired','terminated','unknown')),
  invoice_location text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT minglora_admin_subscription_autorenew_approval
    CHECK (NOT auto_renewal_enabled OR auto_renewal_approved)
);

CREATE TABLE IF NOT EXISTS public.minglora_admin_operating_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_key text NOT NULL CHECK (department_key ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  department_name text NOT NULL CHECK (length(btrim(department_name)) BETWEEN 2 AND 120),
  period_type text NOT NULL CHECK (period_type IN ('monthly','quarterly','annual')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  currency_code text NOT NULL DEFAULT 'USD' CHECK (currency_code ~ '^[A-Z]{3}$'),
  allocated_amount_minor bigint NOT NULL CHECK (allocated_amount_minor >= 0),
  approval_status text NOT NULL DEFAULT 'draft'
    CHECK (approval_status IN ('draft','pending','approved','rejected','frozen')),
  alert_thresholds smallint[] NOT NULL DEFAULT ARRAY[50,75,90,100]::smallint[]
    CHECK (cardinality(alert_thresholds) BETWEEN 1 AND 10),
  manager_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT minglora_admin_budget_valid_period CHECK (period_end >= period_start),
  CONSTRAINT minglora_admin_budget_approval_consistency
    CHECK ((approval_status = 'approved' AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
      OR approval_status <> 'approved'),
  CONSTRAINT minglora_admin_budget_unique_period
    UNIQUE (department_key, period_type, period_start, currency_code)
);

CREATE TABLE IF NOT EXISTS public.minglora_admin_operating_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.minglora_admin_service_providers(id) ON DELETE RESTRICT,
  subscription_id uuid REFERENCES public.minglora_admin_service_subscriptions(id) ON DELETE SET NULL,
  invoice_number text NOT NULL CHECK (length(btrim(invoice_number)) BETWEEN 1 AND 120),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 2 AND 500),
  department_key text NOT NULL DEFAULT 'infrastructure',
  invoice_date date,
  due_date date,
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  payment_status text NOT NULL DEFAULT 'received'
    CHECK (payment_status IN (
      'received','under_review','awaiting_approval','approved','payment_scheduled',
      'payment_initiated','paid_pending_verification','paid','partially_paid',
      'failed','disputed','overdue','cancelled'
    )),
  approval_status text NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('not_required','pending','approved','rejected')),
  payment_reference text,
  payment_provider_event_id text,
  payment_verified_at timestamptz,
  attachment_storage_path text,
  receipt_storage_path text,
  reporting_currency_code text NOT NULL DEFAULT 'USD' CHECK (reporting_currency_code ~ '^[A-Z]{3}$'),
  exchange_rate numeric(20,10) CHECK (exchange_rate IS NULL OR exchange_rate > 0),
  exchange_rate_date date,
  reporting_amount_minor bigint CHECK (reporting_amount_minor IS NULL OR reporting_amount_minor >= 0),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT minglora_admin_invoice_total_matches
    CHECK (total_minor = amount_minor + tax_minor),
  CONSTRAINT minglora_admin_invoice_paid_requires_provider_confirmation
    CHECK (payment_status <> 'paid' OR
      (payment_verified_at IS NOT NULL AND payment_provider_event_id IS NOT NULL)),
  CONSTRAINT minglora_admin_invoice_provider_number_unique UNIQUE (provider_id, invoice_number)
);

CREATE TABLE IF NOT EXISTS public.minglora_admin_operating_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES public.minglora_admin_service_providers(id) ON DELETE RESTRICT,
  invoice_id uuid UNIQUE REFERENCES public.minglora_admin_operating_invoices(id) ON DELETE RESTRICT,
  expense_category text NOT NULL
    CHECK (expense_category IN ('domain','hosting','database','storage','media','communications','software','security','legal','accounting','marketing','support','tax','fee','other')),
  description text NOT NULL CHECK (length(btrim(description)) BETWEEN 2 AND 500),
  department_key text NOT NULL DEFAULT 'infrastructure',
  expense_date date NOT NULL,
  currency_code text NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  expense_status text NOT NULL DEFAULT 'actual'
    CHECK (expense_status IN ('actual','accrued','reversed')),
  reporting_currency_code text NOT NULL DEFAULT 'USD' CHECK (reporting_currency_code ~ '^[A-Z]{3}$'),
  exchange_rate numeric(20,10) CHECK (exchange_rate IS NULL OR exchange_rate > 0),
  exchange_rate_date date,
  reporting_amount_minor bigint CHECK (reporting_amount_minor IS NULL OR reporting_amount_minor >= 0),
  source_reference text,
  receipt_storage_path text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.minglora_admin_finance_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('provider','subscription','budget','invoice','expense')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created','updated')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS minglora_admin_subscriptions_provider_idx
  ON public.minglora_admin_service_subscriptions(provider_id, subscription_status);
CREATE INDEX IF NOT EXISTS minglora_admin_subscriptions_next_payment_idx
  ON public.minglora_admin_service_subscriptions(next_payment_date)
  WHERE next_payment_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS minglora_admin_budgets_department_period_idx
  ON public.minglora_admin_operating_budgets(department_key, period_start, period_end);
CREATE INDEX IF NOT EXISTS minglora_admin_invoices_due_status_idx
  ON public.minglora_admin_operating_invoices(due_date, payment_status);
CREATE INDEX IF NOT EXISTS minglora_admin_invoices_provider_idx
  ON public.minglora_admin_operating_invoices(provider_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS minglora_admin_expenses_department_date_idx
  ON public.minglora_admin_operating_expenses(department_key, expense_date DESC);
CREATE INDEX IF NOT EXISTS minglora_admin_finance_audit_entity_idx
  ON public.minglora_admin_finance_audit_events(entity_type, entity_id, created_at DESC);

-- Finance is accessed only by the authenticated Minglora server through the private
-- runtime Edge Function. RLS default-denies all user-facing roles; service_role bypasses RLS.
ALTER TABLE public.minglora_admin_service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_admin_service_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_admin_operating_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_admin_operating_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_admin_operating_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.minglora_admin_finance_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.minglora_admin_service_providers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.minglora_admin_service_subscriptions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.minglora_admin_operating_budgets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.minglora_admin_operating_invoices FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.minglora_admin_operating_expenses FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.minglora_admin_finance_audit_events FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.minglora_admin_service_providers TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.minglora_admin_service_subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.minglora_admin_operating_budgets TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.minglora_admin_operating_invoices TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.minglora_admin_operating_expenses TO service_role;
GRANT SELECT, INSERT ON public.minglora_admin_finance_audit_events TO service_role;

CREATE OR REPLACE FUNCTION public.minglora_admin_finance_audit_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'Minglora finance audit events are append-only';
END;
$$;

REVOKE ALL ON FUNCTION public.minglora_admin_finance_audit_immutable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_admin_finance_audit_immutable() TO service_role;

DROP TRIGGER IF EXISTS minglora_admin_finance_audit_no_mutation
  ON public.minglora_admin_finance_audit_events;
CREATE TRIGGER minglora_admin_finance_audit_no_mutation
  BEFORE UPDATE OR DELETE ON public.minglora_admin_finance_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.minglora_admin_finance_audit_immutable();

CREATE OR REPLACE FUNCTION public.minglora_admin_finance_command(
  p_action text,
  p_actor_user_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_id uuid;
  v_record jsonb;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_entity_type text;
  v_event_action text;
  v_metadata jsonb;
BEGIN
  IF p_actor_user_id IS DISTINCT FROM '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid THEN
    RAISE EXCEPTION 'Only the designated Minglora owner can manage company finance records'
      USING ERRCODE = '42501';
  END IF;
  IF p_payload IS NULL OR pg_catalog.jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'A finance record object is required' USING ERRCODE = '22023';
  END IF;
  v_id := NULLIF(p_payload->>'id','')::uuid;
  v_event_action := CASE WHEN v_id IS NULL THEN 'created' ELSE 'updated' END;

  IF v_action = 'save_provider' THEN
    INSERT INTO public.minglora_admin_service_providers (
      id, provider_key, provider_name, website_url, service_category, department,
      account_owner, account_identifier, connection_status, service_importance,
      integration_method, api_available, api_connection_status, support_contact,
      notes, is_candidate, created_by, updated_by, updated_at
    ) VALUES (
      coalesce(v_id, pg_catalog.gen_random_uuid()),
      lower(btrim(p_payload->>'provider_key')),
      btrim(p_payload->>'provider_name'),
      btrim(p_payload->>'website_url'),
      btrim(p_payload->>'service_category'),
      coalesce(nullif(btrim(p_payload->>'department'),''),'infrastructure'),
      nullif(btrim(p_payload->>'account_owner'),''),
      nullif(btrim(p_payload->>'account_identifier'),''),
      coalesce(nullif(p_payload->>'connection_status',''),'not_registered'),
      coalesce(nullif(p_payload->>'service_importance',''),'normal'),
      coalesce(nullif(p_payload->>'integration_method',''),'manual'),
      coalesce(nullif(p_payload->>'api_available','')::boolean,false),
      coalesce(nullif(p_payload->>'api_connection_status',''),'not_connected'),
      nullif(btrim(p_payload->>'support_contact'),''),
      nullif(btrim(p_payload->>'notes'),''),
      coalesce(nullif(p_payload->>'is_candidate','')::boolean,true),
      p_actor_user_id,p_actor_user_id,pg_catalog.now()
    )
    ON CONFLICT (id) DO UPDATE SET
      provider_key=EXCLUDED.provider_key,
      provider_name=EXCLUDED.provider_name,
      website_url=EXCLUDED.website_url,
      service_category=EXCLUDED.service_category,
      department=EXCLUDED.department,
      account_owner=EXCLUDED.account_owner,
      account_identifier=EXCLUDED.account_identifier,
      connection_status=EXCLUDED.connection_status,
      service_importance=EXCLUDED.service_importance,
      integration_method=EXCLUDED.integration_method,
      api_available=EXCLUDED.api_available,
      api_connection_status=EXCLUDED.api_connection_status,
      support_contact=EXCLUDED.support_contact,
      notes=EXCLUDED.notes,
      is_candidate=EXCLUDED.is_candidate,
      updated_by=p_actor_user_id,
      updated_at=pg_catalog.now()
    RETURNING id INTO v_id;
    SELECT pg_catalog.to_jsonb(p) INTO v_record
      FROM public.minglora_admin_service_providers AS p WHERE p.id=v_id;
    v_entity_type := 'provider';

  ELSIF v_action = 'save_subscription' THEN
    INSERT INTO public.minglora_admin_service_subscriptions (
      id,provider_id,service_name,package_name,plan_type,subscription_status,currency_code,
      setup_fee_minor,monthly_fee_minor,annual_fee_minor,renewal_fee_minor,usage_charge_minor,
      usage_unit,billing_frequency,started_on,next_payment_date,renewal_date,
      auto_renewal_enabled,auto_renewal_approved,included_usage,measured_usage,
      cancellation_notice_days,cancellation_terms,billing_portal_url,contract_status,
      invoice_location,notes,created_by,updated_by,updated_at
    ) VALUES (
      coalesce(v_id,pg_catalog.gen_random_uuid()),
      (p_payload->>'provider_id')::uuid,
      btrim(p_payload->>'service_name'),
      nullif(btrim(p_payload->>'package_name'),''),
      coalesce(nullif(p_payload->>'plan_type',''),'unknown'),
      coalesce(nullif(p_payload->>'subscription_status',''),'planned'),
      upper(coalesce(nullif(p_payload->>'currency_code',''),'USD')),
      nullif(p_payload->>'setup_fee_minor','')::bigint,
      nullif(p_payload->>'monthly_fee_minor','')::bigint,
      nullif(p_payload->>'annual_fee_minor','')::bigint,
      nullif(p_payload->>'renewal_fee_minor','')::bigint,
      nullif(p_payload->>'usage_charge_minor','')::bigint,
      nullif(btrim(p_payload->>'usage_unit'),''),
      coalesce(nullif(p_payload->>'billing_frequency',''),'unknown'),
      nullif(p_payload->>'started_on','')::date,
      nullif(p_payload->>'next_payment_date','')::date,
      nullif(p_payload->>'renewal_date','')::date,
      coalesce(nullif(p_payload->>'auto_renewal_enabled','')::boolean,false),
      coalesce(nullif(p_payload->>'auto_renewal_approved','')::boolean,false),
      CASE WHEN pg_catalog.jsonb_typeof(p_payload->'included_usage')='object' THEN p_payload->'included_usage' ELSE '{}'::jsonb END,
      CASE WHEN pg_catalog.jsonb_typeof(p_payload->'measured_usage')='object' THEN p_payload->'measured_usage' ELSE '{}'::jsonb END,
      nullif(p_payload->>'cancellation_notice_days','')::smallint,
      nullif(btrim(p_payload->>'cancellation_terms'),''),
      nullif(btrim(p_payload->>'billing_portal_url'),''),
      coalesce(nullif(p_payload->>'contract_status',''),'unknown'),
      nullif(btrim(p_payload->>'invoice_location'),''),
      nullif(btrim(p_payload->>'notes'),''),
      p_actor_user_id,p_actor_user_id,pg_catalog.now()
    )
    ON CONFLICT (id) DO UPDATE SET
      provider_id=EXCLUDED.provider_id,
      service_name=EXCLUDED.service_name,
      package_name=EXCLUDED.package_name,
      plan_type=EXCLUDED.plan_type,
      subscription_status=EXCLUDED.subscription_status,
      currency_code=EXCLUDED.currency_code,
      setup_fee_minor=EXCLUDED.setup_fee_minor,
      monthly_fee_minor=EXCLUDED.monthly_fee_minor,
      annual_fee_minor=EXCLUDED.annual_fee_minor,
      renewal_fee_minor=EXCLUDED.renewal_fee_minor,
      usage_charge_minor=EXCLUDED.usage_charge_minor,
      usage_unit=EXCLUDED.usage_unit,
      billing_frequency=EXCLUDED.billing_frequency,
      started_on=EXCLUDED.started_on,
      next_payment_date=EXCLUDED.next_payment_date,
      renewal_date=EXCLUDED.renewal_date,
      auto_renewal_enabled=EXCLUDED.auto_renewal_enabled,
      auto_renewal_approved=EXCLUDED.auto_renewal_approved,
      included_usage=EXCLUDED.included_usage,
      measured_usage=EXCLUDED.measured_usage,
      cancellation_notice_days=EXCLUDED.cancellation_notice_days,
      cancellation_terms=EXCLUDED.cancellation_terms,
      billing_portal_url=EXCLUDED.billing_portal_url,
      contract_status=EXCLUDED.contract_status,
      invoice_location=EXCLUDED.invoice_location,
      notes=EXCLUDED.notes,
      updated_by=p_actor_user_id,
      updated_at=pg_catalog.now()
    RETURNING id INTO v_id;
    SELECT pg_catalog.to_jsonb(s) INTO v_record
      FROM public.minglora_admin_service_subscriptions AS s WHERE s.id=v_id;
    v_entity_type := 'subscription';

  ELSIF v_action = 'save_budget' THEN
    INSERT INTO public.minglora_admin_operating_budgets (
      id,department_key,department_name,period_type,period_start,period_end,
      currency_code,allocated_amount_minor,approval_status,manager_user_id,
      notes,created_by,updated_by,updated_at
    ) VALUES (
      coalesce(v_id,pg_catalog.gen_random_uuid()),
      lower(btrim(p_payload->>'department_key')),
      btrim(p_payload->>'department_name'),
      coalesce(nullif(p_payload->>'period_type',''),'monthly'),
      (p_payload->>'period_start')::date,
      (p_payload->>'period_end')::date,
      upper(coalesce(nullif(p_payload->>'currency_code',''),'USD')),
      (p_payload->>'allocated_amount_minor')::bigint,
      coalesce(nullif(p_payload->>'approval_status',''),'draft'),
      nullif(p_payload->>'manager_user_id','')::uuid,
      nullif(btrim(p_payload->>'notes'),''),
      p_actor_user_id,p_actor_user_id,pg_catalog.now()
    )
    ON CONFLICT (id) DO UPDATE SET
      department_key=EXCLUDED.department_key,
      department_name=EXCLUDED.department_name,
      period_type=EXCLUDED.period_type,
      period_start=EXCLUDED.period_start,
      period_end=EXCLUDED.period_end,
      currency_code=EXCLUDED.currency_code,
      allocated_amount_minor=EXCLUDED.allocated_amount_minor,
      approval_status=CASE WHEN minglora_admin_operating_budgets.approval_status='approved'
        THEN minglora_admin_operating_budgets.approval_status ELSE EXCLUDED.approval_status END,
      manager_user_id=EXCLUDED.manager_user_id,
      notes=EXCLUDED.notes,
      updated_by=p_actor_user_id,
      updated_at=pg_catalog.now()
    RETURNING id INTO v_id;
    SELECT pg_catalog.to_jsonb(b) INTO v_record
      FROM public.minglora_admin_operating_budgets AS b WHERE b.id=v_id;
    v_entity_type := 'budget';

  ELSIF v_action = 'save_invoice' THEN
    IF lower(coalesce(p_payload->>'payment_status','received'))='paid' THEN
      RAISE EXCEPTION 'An invoice can only be marked paid after verified provider confirmation'
        USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.minglora_admin_operating_invoices (
      id,provider_id,subscription_id,invoice_number,description,department_key,
      invoice_date,due_date,currency_code,amount_minor,tax_minor,total_minor,
      payment_status,approval_status,payment_reference,attachment_storage_path,
      receipt_storage_path,reporting_currency_code,exchange_rate,exchange_rate_date,
      reporting_amount_minor,notes,created_by,updated_by,updated_at
    ) VALUES (
      coalesce(v_id,pg_catalog.gen_random_uuid()),
      (p_payload->>'provider_id')::uuid,
      nullif(p_payload->>'subscription_id','')::uuid,
      btrim(p_payload->>'invoice_number'),
      btrim(p_payload->>'description'),
      coalesce(nullif(p_payload->>'department_key',''),'infrastructure'),
      nullif(p_payload->>'invoice_date','')::date,
      nullif(p_payload->>'due_date','')::date,
      upper(btrim(p_payload->>'currency_code')),
      (p_payload->>'amount_minor')::bigint,
      coalesce(nullif(p_payload->>'tax_minor','')::bigint,0),
      (p_payload->>'total_minor')::bigint,
      coalesce(nullif(p_payload->>'payment_status',''),'received'),
      coalesce(nullif(p_payload->>'approval_status',''),'pending'),
      nullif(btrim(p_payload->>'payment_reference'),''),
      nullif(btrim(p_payload->>'attachment_storage_path'),''),
      nullif(btrim(p_payload->>'receipt_storage_path'),''),
      upper(coalesce(nullif(p_payload->>'reporting_currency_code',''),'USD')),
      nullif(p_payload->>'exchange_rate','')::numeric,
      nullif(p_payload->>'exchange_rate_date','')::date,
      nullif(p_payload->>'reporting_amount_minor','')::bigint,
      nullif(btrim(p_payload->>'notes'),''),
      p_actor_user_id,p_actor_user_id,pg_catalog.now()
    )
    ON CONFLICT (id) DO UPDATE SET
      provider_id=EXCLUDED.provider_id,
      subscription_id=EXCLUDED.subscription_id,
      invoice_number=EXCLUDED.invoice_number,
      description=EXCLUDED.description,
      department_key=EXCLUDED.department_key,
      invoice_date=EXCLUDED.invoice_date,
      due_date=EXCLUDED.due_date,
      currency_code=EXCLUDED.currency_code,
      amount_minor=EXCLUDED.amount_minor,
      tax_minor=EXCLUDED.tax_minor,
      total_minor=EXCLUDED.total_minor,
      payment_status=CASE WHEN minglora_admin_operating_invoices.payment_status='paid'
        THEN minglora_admin_operating_invoices.payment_status ELSE EXCLUDED.payment_status END,
      approval_status=EXCLUDED.approval_status,
      payment_reference=EXCLUDED.payment_reference,
      attachment_storage_path=EXCLUDED.attachment_storage_path,
      receipt_storage_path=EXCLUDED.receipt_storage_path,
      reporting_currency_code=EXCLUDED.reporting_currency_code,
      exchange_rate=EXCLUDED.exchange_rate,
      exchange_rate_date=EXCLUDED.exchange_rate_date,
      reporting_amount_minor=EXCLUDED.reporting_amount_minor,
      notes=EXCLUDED.notes,
      updated_by=p_actor_user_id,
      updated_at=pg_catalog.now()
    RETURNING id INTO v_id;
    SELECT pg_catalog.to_jsonb(i) INTO v_record
      FROM public.minglora_admin_operating_invoices AS i WHERE i.id=v_id;
    v_entity_type := 'invoice';

  ELSIF v_action = 'save_expense' THEN
    INSERT INTO public.minglora_admin_operating_expenses (
      id,provider_id,invoice_id,expense_category,description,department_key,
      expense_date,currency_code,amount_minor,expense_status,reporting_currency_code,
      exchange_rate,exchange_rate_date,reporting_amount_minor,source_reference,
      receipt_storage_path,notes,created_by,updated_by,updated_at
    ) VALUES (
      coalesce(v_id,pg_catalog.gen_random_uuid()),
      (p_payload->>'provider_id')::uuid,
      nullif(p_payload->>'invoice_id','')::uuid,
      coalesce(nullif(p_payload->>'expense_category',''),'other'),
      btrim(p_payload->>'description'),
      coalesce(nullif(p_payload->>'department_key',''),'infrastructure'),
      (p_payload->>'expense_date')::date,
      upper(btrim(p_payload->>'currency_code')),
      (p_payload->>'amount_minor')::bigint,
      coalesce(nullif(p_payload->>'expense_status',''),'actual'),
      upper(coalesce(nullif(p_payload->>'reporting_currency_code',''),'USD')),
      nullif(p_payload->>'exchange_rate','')::numeric,
      nullif(p_payload->>'exchange_rate_date','')::date,
      nullif(p_payload->>'reporting_amount_minor','')::bigint,
      nullif(btrim(p_payload->>'source_reference'),''),
      nullif(btrim(p_payload->>'receipt_storage_path'),''),
      nullif(btrim(p_payload->>'notes'),''),
      p_actor_user_id,p_actor_user_id,pg_catalog.now()
    )
    ON CONFLICT (id) DO UPDATE SET
      provider_id=EXCLUDED.provider_id,
      invoice_id=EXCLUDED.invoice_id,
      expense_category=EXCLUDED.expense_category,
      description=EXCLUDED.description,
      department_key=EXCLUDED.department_key,
      expense_date=EXCLUDED.expense_date,
      currency_code=EXCLUDED.currency_code,
      amount_minor=EXCLUDED.amount_minor,
      expense_status=EXCLUDED.expense_status,
      reporting_currency_code=EXCLUDED.reporting_currency_code,
      exchange_rate=EXCLUDED.exchange_rate,
      exchange_rate_date=EXCLUDED.exchange_rate_date,
      reporting_amount_minor=EXCLUDED.reporting_amount_minor,
      source_reference=EXCLUDED.source_reference,
      receipt_storage_path=EXCLUDED.receipt_storage_path,
      notes=EXCLUDED.notes,
      updated_by=p_actor_user_id,
      updated_at=pg_catalog.now()
    RETURNING id INTO v_id;
    SELECT pg_catalog.to_jsonb(e) INTO v_record
      FROM public.minglora_admin_operating_expenses AS e WHERE e.id=v_id;
    v_entity_type := 'expense';

  ELSE
    RAISE EXCEPTION 'Unsupported Minglora finance operation' USING ERRCODE = '22023';
  END IF;

  v_metadata := pg_catalog.jsonb_build_object(
    'record_id',v_id,
    'status',coalesce(v_record->>'connection_status',v_record->>'subscription_status',
      v_record->>'approval_status',v_record->>'payment_status',v_record->>'expense_status'),
    'currency_code',coalesce(v_record->>'currency_code',''),
    'amount_minor',coalesce(v_record->>'total_minor',v_record->>'allocated_amount_minor',
      v_record->>'amount_minor','')
  );

  INSERT INTO public.minglora_admin_finance_audit_events
    (actor_user_id,entity_type,entity_id,action,metadata)
  VALUES (p_actor_user_id,v_entity_type,v_id,v_event_action,v_metadata);

  RETURN pg_catalog.jsonb_build_object('ok',true,'action',v_action,'record',v_record);
END;
$function$;

REVOKE ALL ON FUNCTION public.minglora_admin_finance_command(text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_admin_finance_command(text,uuid,jsonb) TO service_role;

-- These are directory entries only. No provider account, plan, price, invoice,
-- payment method, or integration is claimed to exist.
INSERT INTO public.minglora_admin_service_providers
  (provider_key,provider_name,website_url,service_category,department,connection_status,api_connection_status,notes,is_candidate)
VALUES
  ('namecheap','Namecheap','https://www.namecheap.com/','domain_dns','domain_websites','not_registered','not_connected','Candidate provider from the Minglora administration specification; account and domain ownership not verified.',true),
  ('cloudflare','Cloudflare','https://www.cloudflare.com/','domain_dns_cdn','domain_websites','not_registered','not_connected','Candidate provider; no connected account or configured DNS is claimed.',true),
  ('github','GitHub','https://github.com/','code_repository','development','not_registered','not_connected','Repository access is managed through the connected GitHub account; no billing or organization connection is asserted here.',true),
  ('github-actions','GitHub Actions','https://github.com/features/actions','ci_cd','development','not_registered','not_connected','Candidate provider feature; workflow usage and billing have not been reconciled.',true),
  ('render','Render','https://render.com/','application_hosting','hosting_infrastructure','not_registered','not_connected','Candidate provider directory entry; actual Minglora Render service is separately linked in the connected workspace.',true),
  ('supabase','Supabase','https://supabase.com/','database_backend','database_storage','not_registered','not_connected','Candidate provider directory entry; actual Minglora Supabase project is separately linked.',true),
  ('livekit','LiveKit','https://livekit.io/','audio_video','live_calls','not_registered','not_connected','Candidate provider; production usage and plan charges require provider billing reconciliation.',true),
  ('bunny-net','Bunny.net','https://bunny.net/','media_cdn_storage','media_storage','not_registered','not_connected','Candidate provider; no account or service is claimed.',true),
  ('cloudflare-stream','Cloudflare Stream','https://www.cloudflare.com/products/cloudflare-stream/','video_streaming','media_storage','not_registered','not_connected','Candidate provider; no account or service is claimed.',true),
  ('google-play-console','Google Play Console','https://play.google.com/console/','android_publishing','mobile_applications','not_registered','not_connected','Publishing account and registration status require owner verification.',true),
  ('firebase','Firebase','https://firebase.google.com/','mobile_services_analytics','mobile_applications','not_registered','not_connected','Candidate provider; Firebase services are not asserted as connected.',true),
  ('apple-developer','Apple Developer','https://developer.apple.com/','ios_publishing','mobile_applications','not_registered','not_connected','Apple membership and account status require owner verification.',true),
  ('app-store-connect','App Store Connect','https://appstoreconnect.apple.com/','ios_publishing','mobile_applications','not_registered','not_connected','Publishing connection is not verified.',true),
  ('testflight','TestFlight','https://developer.apple.com/testflight/','ios_testing','mobile_applications','not_registered','not_connected','Candidate provider feature; no release or test status is asserted.',true),
  ('samsung-galaxy-store','Samsung Galaxy Store','https://seller.samsungapps.com/','android_publishing','mobile_applications','not_registered','not_connected','Candidate provider; publisher account not verified.',true),
  ('amazon-appstore','Amazon Appstore','https://developer.amazon.com/apps-and-games','android_publishing','mobile_applications','not_registered','not_connected','Candidate provider; publisher account not verified.',true),
  ('huawei-appgallery','Huawei AppGallery','https://developer.huawei.com/consumer/en/','android_publishing','mobile_applications','not_registered','not_connected','Candidate provider; publisher account not verified.',true),
  ('namecheap-private-email','Namecheap Private Email','https://www.namecheap.com/hosting/email/','business_email','email_communications','not_registered','not_connected','Candidate email service; no mailboxes or subscription are asserted.',true),
  ('google-workspace','Google Workspace','https://workspace.google.com/','business_email','email_communications','not_registered','not_connected','Candidate email service; no subscription is asserted.',true),
  ('zoho-mail','Zoho Mail','https://www.zoho.com/mail/','business_email','email_communications','not_registered','not_connected','Candidate email service; no subscription is asserted.',true),
  ('resend','Resend','https://resend.com/','transactional_email','email_communications','not_registered','not_connected','Candidate email service; no connection or delivery volume is asserted.',true),
  ('sendgrid','SendGrid','https://sendgrid.com/','transactional_email','email_communications','not_registered','not_connected','Candidate email service; no connection or delivery volume is asserted.',true),
  ('twilio','Twilio','https://www.twilio.com/','sms_communications','email_communications','not_registered','not_connected','Candidate communications provider; no SMS account or usage is asserted.',true),
  ('vonage','Vonage','https://www.vonage.com/','sms_communications','email_communications','not_registered','not_connected','Candidate communications provider; no account or usage is asserted.',true),
  ('paypal','PayPal','https://www.paypal.com/jm/business','payments','payments_revenue','not_registered','not_connected','Candidate payment provider; no finance integration or payment authority is asserted.',true),
  ('wipay','WiPay','https://wipaycaribbean.com/','payments','payments_revenue','not_registered','not_connected','Candidate payment provider; no finance integration or payment authority is asserted.',true),
  ('posthog','PostHog','https://posthog.com/','product_analytics','analytics_monitoring','not_registered','not_connected','Candidate analytics provider; no connection or telemetry is asserted.',true),
  ('google-analytics','Google Analytics','https://analytics.google.com/','web_analytics','analytics_monitoring','not_registered','not_connected','Candidate analytics provider; no property is asserted.',true),
  ('uptimerobot','UptimeRobot','https://uptimerobot.com/','uptime_monitoring','analytics_monitoring','not_registered','not_connected','Candidate uptime monitoring provider; no monitors or uptime claims are asserted.',true),
  ('sentry','Sentry','https://sentry.io/','error_monitoring','analytics_monitoring','not_registered','not_connected','Candidate error monitoring provider; no project or events are asserted.',true),
  ('cloudflare-r2','Cloudflare R2','https://www.cloudflare.com/developer-platform/r2/','object_storage','media_storage','not_registered','not_connected','Candidate storage provider; no bucket or usage is asserted.',true),
  ('supabase-storage','Supabase Storage','https://supabase.com/','object_storage','media_storage','not_registered','not_connected','Candidate service; the current Minglora Supabase project is recorded separately.',true),
  ('bunny-storage','Bunny Storage','https://bunny.net/','object_storage','media_storage','not_registered','not_connected','Candidate storage provider; no account or usage is asserted.',true),
  ('bitwarden','Bitwarden','https://bitwarden.com/','password_security','security','not_registered','not_connected','Candidate password-security provider; no subscription is asserted.',true),
  ('openai','OpenAI','https://openai.com/','ai_services','ai_api','not_registered','not_connected','Candidate AI provider; no API account, usage, or spend is asserted.',true),
  ('openai-api','OpenAI API','https://platform.openai.com/','ai_api','ai_api','not_registered','not_connected','Candidate API provider; no API key or spend is stored here.',true),
  ('freshdesk','Freshdesk','https://www.freshworks.com/freshdesk/','customer_support','customer_support','not_registered','not_connected','Candidate support provider; no account or subscription is asserted.',true),
  ('helpscout','Help Scout','https://www.helpscout.com/','customer_support','customer_support','not_registered','not_connected','Candidate support provider; no account or subscription is asserted.',true),
  ('crisp','Crisp','https://crisp.chat/','customer_support','customer_support','not_registered','not_connected','Candidate support provider; no account or subscription is asserted.',true),
  ('zoho-books','Zoho Books','https://www.zoho.com/books/','accounting','business_operations','not_registered','not_connected','Candidate accounting provider; no subscription or financial data connection is asserted.',true),
  ('quickbooks','QuickBooks','https://quickbooks.intuit.com/','accounting','business_operations','not_registered','not_connected','Candidate accounting provider; no subscription or financial data connection is asserted.',true),
  ('google-drive','Google Drive','https://drive.google.com/','document_storage','business_operations','not_registered','not_connected','Candidate document-storage provider; no account or files are connected by this record.',true)
ON CONFLICT (provider_key) DO NOTHING;

