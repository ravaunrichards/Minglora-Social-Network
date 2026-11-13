-- Execute the staged Minglora AI migrations as real PostgreSQL SQL.
-- All records are created only in the disposable CI database.

DO $smoke$
DECLARE
  v_owner CONSTANT uuid := '5b998c21-86b5-4621-ab37-e0808a2657b1';
  v_identity CONSTANT uuid := '10000000-0000-4000-8000-000000000001';
  v_org_one CONSTANT uuid := '20000000-0000-4000-8000-000000000001';
  v_org_two CONSTANT uuid := '20000000-0000-4000-8000-000000000002';
  v_result jsonb;
  v_list jsonb;
  v_count integer;
  v_constraint text;
BEGIN
  INSERT INTO auth.users(id) VALUES (v_owner);

  v_result := public.minglora_ai_identity_upsert(
    pg_catalog.jsonb_build_object(
      'id',v_identity::text,
      'population','independent',
      'identity_type','social_personality',
      'status','created',
      'category_id','ai-friends',
      'category_name','AI Friends',
      'first_name','Ari',
      'last_name','Test',
      'display_name','Ari Test',
      'username','ai_ari_test',
      'public_profile_slug','ari-test',
      'visibility','private',
      'languages',pg_catalog.jsonb_build_array('English','Jamaican Patois'),
      'permissions',pg_catalog.jsonb_build_array('analytics_read','draft_content'),
      'locations',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'locationType','current','countryCode','JM','countryName','Jamaica',
        'parishCounty','Kingston','city','Kingston','timeZone','America/Jamaica','isPrimary',true
      ))
    ),
    v_owner
  );
  IF v_result->>'id' <> v_identity::text THEN
    RAISE EXCEPTION 'Canonical AI identity upsert returned an unexpected identity.';
  END IF;

  SELECT count(*) INTO v_count FROM public.ai_identity_permissions
  WHERE identity_id=v_identity AND allowed=true;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Expected two normalized permission grants, found %.',v_count; END IF;

  v_result := public.minglora_ai_identity_list(v_owner,100,0);
  IF pg_catalog.jsonb_array_length(v_result) <> 1 OR
     pg_catalog.jsonb_array_length(v_result->0->'languages') <> 2 OR
     pg_catalog.jsonb_array_length(v_result->0->'permissions') <> 2 THEN
    RAISE EXCEPTION 'Canonical AI identity readback omitted languages or permission records.';
  END IF;

  -- Partial update: omitted languages and permissions must be preserved.
  PERFORM public.minglora_ai_identity_upsert(
    pg_catalog.jsonb_build_object(
      'id',v_identity::text,'population','independent','status','created',
      'first_name','Ari','last_name','Test','username','ai_ari_test','public_profile_slug','ari-test'
    ),
    v_owner
  );
  SELECT count(*) INTO v_count FROM public.ai_identity_languages WHERE identity_id=v_identity;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Partial identity update unexpectedly removed language records.'; END IF;
  SELECT count(*) INTO v_count FROM public.ai_identity_permissions
  WHERE identity_id=v_identity AND allowed=true;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Partial identity update unexpectedly removed permission grants.'; END IF;

  -- Explicit empty permissions revoke existing grants without deleting history.
  PERFORM public.minglora_ai_identity_upsert(
    pg_catalog.jsonb_build_object(
      'id',v_identity::text,'population','independent','status','created',
      'first_name','Ari','last_name','Test','username','ai_ari_test','public_profile_slug','ari-test',
      'permissions','[]'::jsonb
    ),
    v_owner
  );
  SELECT count(*) INTO v_count FROM public.ai_identity_permissions
  WHERE identity_id=v_identity AND allowed=true;
  IF v_count <> 0 THEN RAISE EXCEPTION 'Explicit permission revocation did not clear effective grants.'; END IF;
  SELECT count(*) INTO v_count FROM public.ai_identity_permissions WHERE identity_id=v_identity;
  IF v_count <> 2 THEN RAISE EXCEPTION 'Permission revocation deleted audit-preserving grant rows.'; END IF;

  -- The database repeats the allowlist check instead of trusting only the API.
  BEGIN
    PERFORM public.minglora_ai_identity_upsert(
      pg_catalog.jsonb_build_object(
        'id',v_identity::text,'population','independent','status','created',
        'first_name','Ari','last_name','Test','username','ai_ari_test','public_profile_slug','ari-test',
        'permissions',pg_catalog.jsonb_build_array('delete_users')
      ),
      v_owner
    );
    RAISE EXCEPTION 'Unapproved AI permission unexpectedly persisted.';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  v_result := public.minglora_ai_provider_assignment_upsert(
    pg_catalog.jsonb_build_object(
      'identityId',v_identity::text,'providerName','OpenAI','providerIdentifier','openai',
      'providerAccountReference','ci-test','modelName','Test Model','modelIdentifier','test-model',
      'modelVersion','ci-v1','supportedLanguages',pg_catalog.jsonb_build_array('en','jam'),
      'capabilities',pg_catalog.jsonb_build_object('text',true),'textCapable',true,
      'isPrimary',true
    ),
    v_owner
  );
  IF v_result->>'assignmentStatus' <> 'configured' OR v_result->>'providerHealthStatus' <> 'unknown' THEN
    RAISE EXCEPTION 'Provider assignment did not preserve its unverified state.';
  END IF;

  v_result := public.minglora_ai_email_identity_upsert(
    pg_catalog.jsonb_build_object(
      'identityId',v_identity::text,'emailAddress','ari-test@minglora.example',
      'emailType','primary','emailProvider','CI-only'
    ),
    v_owner
  );
  IF v_result->>'verificationStatus' <> 'not_verified' OR
     v_result->>'provisioningStatus' <> 'not_provisioned' THEN
    RAISE EXCEPTION 'AI email identity falsely reported verification or provisioning.';
  END IF;

  PERFORM public.minglora_ai_identity_upsert(
    pg_catalog.jsonb_build_object(
      'id',v_org_one::text,'population','organizational','identity_type','corporate_employee',
      'status','created','first_name','Board','last_name','Chair','display_name','Board Chair',
      'username','ai_board_chair','public_profile_slug','board-chair'
    ),v_owner
  );
  PERFORM public.minglora_ai_identity_upsert(
    pg_catalog.jsonb_build_object(
      'id',v_org_two::text,'population','organizational','identity_type','corporate_employee',
      'status','created','first_name','Board','last_name','Director','display_name','Board Director',
      'username','ai_board_director','public_profile_slug','board-director'
    ),v_owner
  );

  v_result := public.minglora_ai_bot_hr_state_upsert(
    pg_catalog.jsonb_build_object(
      'departments',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'id','department-executive_management','code','executive_management',
        'name','Executive Management','description','CI corporate department',
        'builtIn',true,'enabled',true
      )),
      'vacancies','[]'::jsonb,'applications','[]'::jsonb,'appointments','[]'::jsonb,
      'employmentHistory','[]'::jsonb,'audit','[]'::jsonb
    ),v_owner
  );
  IF v_result->>'ok' <> 'true' THEN RAISE EXCEPTION 'Normalized HR state write failed.'; END IF;
  v_result := public.minglora_ai_bot_hr_state_list(v_owner);
  IF pg_catalog.jsonb_array_length(v_result->'departments') <> 1 OR
     pg_catalog.jsonb_array_length(v_result->'jobPositions') <> 20 THEN
    RAISE EXCEPTION 'Normalized HR readback or 20-position catalogue failed.';
  END IF;

  INSERT INTO public.ai_vacancies (
    owner_admin_id,vacancy_id,position_code,position_title,department_id,department_code,
    department_name,title,created_by,updated_by
  ) VALUES
    (v_owner,'vacancy-board-chair','board_chair','Chairperson / Board President',
     'department-executive_management','executive_management','Executive Management',
     'Board Chair CI vacancy',v_owner::text,v_owner::text),
    (v_owner,'vacancy-board-director','board_director','Board Director',
     'department-executive_management','executive_management','Executive Management',
     'Board Director CI vacancy',v_owner::text,v_owner::text);

  INSERT INTO public.ai_candidate_applications (
    owner_admin_id,application_id,vacancy_id,identity_id,vacancy_title,position_code,
    position_title,department_id,department_name,candidate_display_name,candidate_username,
    population,status,submitted_by
  ) VALUES
    (v_owner,'application-board-chair','vacancy-board-chair',v_org_one,'Board Chair CI vacancy',
     'board_chair','Chairperson / Board President','department-executive_management',
     'Executive Management','Board Chair','ai_board_chair','organizational','shortlisted',v_owner),
    (v_owner,'application-board-director','vacancy-board-director',v_org_two,'Board Director CI vacancy',
     'board_director','Board Director','department-executive_management',
     'Executive Management','Board Director','ai_board_director','organizational','shortlisted',v_owner);

  INSERT INTO public.ai_appointments (
    owner_admin_id,appointment_id,application_id,vacancy_id,identity_id,position_code,
    position_title,position_level,department_id,department_code,department_name,
    candidate_display_name,candidate_username,population,status,approved_by,approved_at,appointed_at
  ) VALUES (
    v_owner,'appointment-board-chair','application-board-chair','vacancy-board-chair',v_org_one,
    'board_chair','Chairperson / Board President',1,'department-executive_management',
    'executive_management','Executive Management','Board Chair','ai_board_chair',
    'organizational','appointed',v_owner,pg_catalog.now(),pg_catalog.now()
  );

  -- Exercise the same normalized employment-history write/read path used by the owner API.
  v_result := public.minglora_ai_bot_hr_state_upsert(
    pg_catalog.jsonb_build_object(
      'employmentHistory',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'id','employment-event-smoke-1',
        'appointmentId','appointment-board-chair',
        'applicationId','application-board-chair',
        'identityId',v_org_one::text,
        'vacancyId','vacancy-board-chair',
        'eventType','trained',
        'actorId',v_owner::text,
        'createdAt',pg_catalog.now(),
        'notes','CI verifies normalized employment-history event persistence and readback.'
      ))
    ),
    v_owner
  );
  IF v_result->>'ok' <> 'true' THEN
    RAISE EXCEPTION 'Normalized employment-history event write failed.';
  END IF;
  v_list := public.minglora_ai_bot_hr_state_list(v_owner);
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(v_list->'employmentHistory') AS event(item)
    WHERE item->>'id'='employment-event-smoke-1'
      AND item->>'appointmentId'='appointment-board-chair'
      AND item->>'identityId'=v_org_one::text
      AND item->>'eventType'='trained'
      AND item->>'actorId'=v_owner::text
      AND item->>'notes'='CI verifies normalized employment-history event persistence and readback.'
  ) THEN
    RAISE EXCEPTION 'Normalized employment-history readback omitted the event, appointment, actor or notes.';
  END IF;
  SELECT count(*) INTO v_count
  FROM public.ai_employment_history
  WHERE owner_admin_id=v_owner AND employment_event_id='employment-event-smoke-1';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Expected one normalized employment-history row, found %.',v_count;
  END IF;

  -- The manager appointment exists and the referenced identity exists, but they
  -- deliberately point to different AI identities. The composite FK must reject it.
  BEGIN
    INSERT INTO public.ai_appointments (
      owner_admin_id,appointment_id,application_id,vacancy_id,identity_id,position_code,
      position_title,position_level,department_id,department_code,department_name,
      candidate_display_name,candidate_username,population,reporting_manager_appointment_id,
      reporting_manager_identity_id,status,approved_by,approved_at,appointed_at
    ) VALUES (
      v_owner,'appointment-board-director','application-board-director','vacancy-board-director',v_org_two,
      'board_director','Board Director',1,'department-executive_management','executive_management',
      'Executive Management','Board Director','ai_board_director','organizational',
      'appointment-board-chair',v_org_two,'appointed',v_owner,pg_catalog.now(),pg_catalog.now()
    );
    SET CONSTRAINTS ai_appointments_reporting_manager_identity_match_fk IMMEDIATE;
    RAISE EXCEPTION 'Mismatched reporting manager identity unexpectedly persisted.';
  EXCEPTION WHEN foreign_key_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint <> 'ai_appointments_reporting_manager_identity_match_fk' THEN
      RAISE;
    END IF;
  END;

  SELECT count(*) INTO v_count FROM public.ai_appointments WHERE owner_admin_id=v_owner;
  IF v_count <> 1 THEN RAISE EXCEPTION 'Invalid reporting-manager appointment was not rolled back.'; END IF;
END;
$smoke$;
