BEGIN;

ALTER TABLE public.minglora_admin_operating_budgets
  DROP CONSTRAINT IF EXISTS minglora_admin_operating_budgets_alert_thresholds_check;

ALTER TABLE public.minglora_admin_operating_budgets
  ADD CONSTRAINT minglora_admin_operating_budgets_alert_thresholds_check
  CHECK (
    cardinality(alert_thresholds) BETWEEN 1 AND 10
    AND 0::smallint < ALL (alert_thresholds)
    AND 100::smallint >= ALL (alert_thresholds)
  );

CREATE OR REPLACE FUNCTION public.minglora_admin_finance_command(p_action text, p_actor_user_id uuid, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
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
    IF coalesce(p_payload->>'approval_status','draft')='approved' THEN
      RAISE EXCEPTION 'Budget approval must use the separate authorized approval workflow' USING ERRCODE = '42501';
    END IF;
    IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.minglora_admin_operating_budgets WHERE id=v_id AND approval_status='approved') THEN
      RAISE EXCEPTION 'An approved budget cannot be edited; create a new period or approval request' USING ERRCODE = '42501';
    END IF;
    IF p_payload ? 'alert_thresholds'
       AND pg_catalog.jsonb_typeof(p_payload->'alert_thresholds') NOT IN ('array','null') THEN
      RAISE EXCEPTION 'Budget alert thresholds must be a JSON array' USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.jsonb_typeof(p_payload->'alert_thresholds') = 'array' THEN
      IF pg_catalog.jsonb_array_length(p_payload->'alert_thresholds') < 1
         OR pg_catalog.jsonb_array_length(p_payload->'alert_thresholds') > 10 THEN
        RAISE EXCEPTION 'Provide between 1 and 10 budget alert thresholds' USING ERRCODE = '22023';
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_payload->'alert_thresholds') AS threshold_items(value)
        WHERE CASE
          WHEN threshold_items.value ~ '^[0-9]{1,3}$' THEN threshold_items.value::integer < 1 OR threshold_items.value::integer > 100
          ELSE true
        END
      ) THEN
        RAISE EXCEPTION 'Budget alert thresholds must be whole percentages from 1 to 100' USING ERRCODE = '22023';
      END IF;
      IF (
        SELECT pg_catalog.count(*) <> pg_catalog.count(DISTINCT threshold_items.value::integer)
        FROM pg_catalog.jsonb_array_elements_text(p_payload->'alert_thresholds') AS threshold_items(value)
      ) THEN
        RAISE EXCEPTION 'Budget alert thresholds cannot contain duplicates' USING ERRCODE = '22023';
      END IF;
    END IF;
    INSERT INTO public.minglora_admin_operating_budgets (
      id,department_key,department_name,period_type,period_start,period_end,
      currency_code,allocated_amount_minor,approval_status,manager_user_id,alert_thresholds,
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
      CASE WHEN pg_catalog.jsonb_typeof(p_payload->'alert_thresholds')='array' THEN ARRAY(
        SELECT threshold_value::smallint
        FROM pg_catalog.jsonb_array_elements_text(p_payload->'alert_thresholds') AS threshold_items(threshold_value)
      ) ELSE ARRAY[50,75,90,100]::smallint[] END,
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
      alert_thresholds=EXCLUDED.alert_thresholds,
      notes=EXCLUDED.notes,
      updated_by=p_actor_user_id,
      updated_at=pg_catalog.now()
    RETURNING id INTO v_id;
    SELECT pg_catalog.to_jsonb(b) INTO v_record
      FROM public.minglora_admin_operating_budgets AS b WHERE b.id=v_id;
    v_entity_type := 'budget';

  ELSIF v_action = 'save_invoice' THEN
    IF v_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.minglora_admin_operating_invoices WHERE id=v_id AND payment_status='paid') THEN
      RAISE EXCEPTION 'A provider-confirmed paid invoice is immutable' USING ERRCODE = '42501';
    END IF;
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

COMMIT;
