-- Minglora AI Bot Network — durable, leased and retryable task queue.
-- Staged additive migration only. Runtime execution remains OFF until a real
-- provider adapter is approved and verified through the existing release gate.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conname = 'ai_identities_identity_owner_uq'
      AND conrelid = 'public.ai_identities'::regclass
  ) THEN
    ALTER TABLE public.ai_identities
      ADD CONSTRAINT ai_identities_identity_owner_uq UNIQUE (identity_id,owner_admin_id);
  END IF;
END $$;

ALTER TABLE public.minglora_ai_bot_tasks
  DROP CONSTRAINT IF EXISTS minglora_ai_bot_tasks_bot_owner_fk;
ALTER TABLE public.minglora_ai_bot_tasks
  ADD CONSTRAINT minglora_ai_bot_tasks_identity_owner_fk
  FOREIGN KEY (bot_id,owner_admin_id)
  REFERENCES public.ai_identities(identity_id,owner_admin_id) ON DELETE CASCADE;

ALTER TABLE public.minglora_ai_bot_tasks
  DROP CONSTRAINT IF EXISTS minglora_ai_bot_tasks_status_check;
ALTER TABLE public.minglora_ai_bot_tasks
  ADD CONSTRAINT minglora_ai_bot_tasks_status_lifecycle_check
  CHECK (status IN (
    'awaiting_administrator_approval','approved_waiting_for_worker','running',
    'completed','failed','dead_lettered','cancelled','rejected'
  ));

ALTER TABLE public.minglora_ai_bot_tasks
  ADD COLUMN IF NOT EXISTS worker_id text,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_error_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz,
  ADD COLUMN IF NOT EXISTS result jsonb NOT NULL DEFAULT '{}'::jsonb;

-- A missing lease cannot be allowed to strand a pre-existing "running" row.
UPDATE public.minglora_ai_bot_tasks
SET status = CASE WHEN attempt_count >= max_attempts THEN 'dead_lettered' ELSE 'approved_waiting_for_worker' END,
    worker_id = NULL,
    lease_token = NULL,
    lease_expires_at = NULL,
    heartbeat_at = NULL,
    dead_lettered_at = CASE WHEN attempt_count >= max_attempts THEN now() ELSE dead_lettered_at END,
    next_attempt_at = now(),
    error_code = 'WORKER_LEASE_MISSING',
    error_message = 'Recovered a running task that had no valid worker lease.',
    updated_at = now()
WHERE status = 'running'
  AND (worker_id IS NULL OR lease_token IS NULL OR lease_expires_at IS NULL);

ALTER TABLE public.minglora_ai_bot_tasks
  ADD CONSTRAINT minglora_ai_bot_tasks_attempts_check
    CHECK (attempt_count BETWEEN 0 AND max_attempts AND max_attempts BETWEEN 1 AND 8),
  ADD CONSTRAINT minglora_ai_bot_tasks_result_check
    CHECK (pg_catalog.jsonb_typeof(result) = 'object'),
  ADD CONSTRAINT minglora_ai_bot_tasks_worker_id_check
    CHECK (worker_id IS NULL OR worker_id ~ '^[A-Za-z0-9._:-]{3,80}$'),
  ADD CONSTRAINT minglora_ai_bot_tasks_lease_state_check
    CHECK (
      (status = 'running' AND worker_id IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
      OR
      (status <> 'running' AND worker_id IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL)
    );

-- Existing rows receive a stable key before the column becomes mandatory.
UPDATE public.minglora_ai_bot_tasks
SET idempotency_key = id
WHERE idempotency_key IS NULL;
ALTER TABLE public.minglora_ai_bot_tasks
  ALTER COLUMN idempotency_key SET DEFAULT gen_random_uuid(),
  ALTER COLUMN idempotency_key SET NOT NULL;

ALTER TABLE public.minglora_ai_bot_settings
  ADD COLUMN IF NOT EXISTS execution_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider_ready boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS minglora_ai_bot_tasks_due_queue_idx
  ON public.minglora_ai_bot_tasks (next_attempt_at,created_at)
  WHERE status = 'approved_waiting_for_worker';
CREATE INDEX IF NOT EXISTS minglora_ai_bot_tasks_lease_expiry_idx
  ON public.minglora_ai_bot_tasks (lease_expires_at)
  WHERE status = 'running';
CREATE UNIQUE INDEX IF NOT EXISTS minglora_ai_bot_tasks_lease_token_uq
  ON public.minglora_ai_bot_tasks (lease_token)
  WHERE lease_token IS NOT NULL;

COMMENT ON COLUMN public.minglora_ai_bot_settings.execution_enabled IS
  'Explicit kill switch for queue dispatch. Defaults OFF and must not be enabled before provider and safety verification.';
COMMENT ON COLUMN public.minglora_ai_bot_settings.provider_ready IS
  'Set only after a real server-side provider adapter has been configured and health-checked. Defaults OFF.';
COMMENT ON TABLE public.minglora_ai_bot_tasks IS
  'Durable approval-gated queue. Claiming uses leases and SKIP LOCKED. Only safe text-generation task types can be claimed; social actions remain non-executable.';

CREATE OR REPLACE FUNCTION public.minglora_ai_bot_task_upsert(
  p_task jsonb,
  p_actor_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_id uuid;
  v_bot_id uuid;
  v_task_type text;
  v_instruction text;
  v_status text;
  v_target_user_id uuid;
  v_idempotency_key uuid;
  v_approved_by uuid;
  v_approved_at timestamptz;
  v_cancelled_by uuid;
  v_cancelled_at timestamptz;
  v_created_at timestamptz;
  v_high_impact boolean;
  v_row public.minglora_ai_bot_tasks;
BEGIN
  IF p_actor_user_id IS DISTINCT FROM '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid THEN
    RAISE EXCEPTION 'Only the designated Minglora owner may persist AI bot tasks.' USING ERRCODE = '42501';
  END IF;
  IF p_task IS NULL OR pg_catalog.jsonb_typeof(p_task) <> 'object' THEN
    RAISE EXCEPTION 'A task object is required.' USING ERRCODE = '22023';
  END IF;

  v_id := NULLIF(p_task->>'id','')::uuid;
  v_bot_id := NULLIF(p_task->>'botId','')::uuid;
  v_task_type := COALESCE(NULLIF(p_task->>'taskType',''),'other');
  v_instruction := pg_catalog.btrim(COALESCE(p_task->>'instruction',''));
  v_status := COALESCE(NULLIF(p_task->>'status',''),'awaiting_administrator_approval');
  v_target_user_id := NULLIF(p_task->>'targetUserId','')::uuid;
  v_idempotency_key := COALESCE(NULLIF(p_task->>'idempotencyKey','')::uuid,v_id);
  v_approved_by := NULLIF(p_task->>'approvedBy','')::uuid;
  v_approved_at := NULLIF(p_task->>'approvedAt','')::timestamptz;
  v_cancelled_by := NULLIF(p_task->>'cancelledBy','')::uuid;
  v_cancelled_at := NULLIF(p_task->>'cancelledAt','')::timestamptz;
  v_created_at := COALESCE(NULLIF(p_task->>'createdAt','')::timestamptz,pg_catalog.now());
  v_high_impact := COALESCE(NULLIF(p_task->>'highImpact','')::boolean,true);

  IF v_id IS NULL OR v_bot_id IS NULL OR v_idempotency_key IS NULL OR
     pg_catalog.char_length(v_instruction) < 5 OR pg_catalog.char_length(v_instruction) > 4000 THEN
    RAISE EXCEPTION 'Task ID, bot ID, idempotency key and a 5–4,000 character instruction are required.' USING ERRCODE = '22023';
  END IF;
  IF v_task_type NOT IN (
    'assistant_request','draft_post','share_media','create_reel','draft_comment','draft_reply',
    'follow','unfollow','react','join_group','send_message','event_participation',
    'customer_service_draft','support_draft','moderation_review','analytics_report',
    'automation_request','community_event_draft','live_show_plan','translation','other'
  ) THEN
    RAISE EXCEPTION 'Unsupported AI bot task type.' USING ERRCODE = '22023';
  END IF;
  IF v_status NOT IN ('awaiting_administrator_approval','approved_waiting_for_worker','cancelled','rejected') THEN
    RAISE EXCEPTION 'Only pending, approved, cancelled or rejected tasks can be synchronized by the admin API.' USING ERRCODE = '22023';
  END IF;
  IF v_status = 'approved_waiting_for_worker' AND
     (v_approved_by IS DISTINCT FROM p_actor_user_id OR v_approved_at IS NULL) THEN
    RAISE EXCEPTION 'A durable approval must include the designated owner and approval timestamp.' USING ERRCODE = '22023';
  END IF;
  IF v_status = 'cancelled' AND
     (v_cancelled_by IS DISTINCT FROM p_actor_user_id OR v_cancelled_at IS NULL) THEN
    RAISE EXCEPTION 'A durable cancellation must include the designated owner and cancellation timestamp.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ai_identities AS identity
    WHERE identity.identity_id = v_bot_id
      AND identity.owner_admin_id = p_actor_user_id
      AND identity.population = 'independent'
  ) THEN
    RAISE EXCEPTION 'The AI bot identity does not exist under this owner.' USING ERRCODE = '23503';
  END IF;

  -- Only these four task kinds are ever eligible for the future no-tools text worker.
  IF v_task_type NOT IN ('assistant_request','moderation_review','analytics_report','translation') THEN
    v_high_impact := true;
  END IF;

  INSERT INTO public.minglora_ai_bot_tasks AS existing_task (
    id,owner_admin_id,bot_id,task_type,instruction,target_user_id,payload,
    request_source,status,high_impact,approval_required,approved_by,approved_at,
    cancelled_by,cancelled_at,idempotency_key,exclude_from_human_engagement_metrics,
    created_at,updated_at
  ) VALUES (
    v_id,p_actor_user_id,v_bot_id,v_task_type,v_instruction,v_target_user_id,
    pg_catalog.jsonb_build_object(
      'privacyGuardRequired',COALESCE((p_task->>'privacyGuardRequired')::boolean,false),
      'blockGuardRequired',COALESCE((p_task->>'blockGuardRequired')::boolean,false),
      'executionStatus',COALESCE(p_task->>'executionStatus','not_dispatched')
    ),
    'administrator',v_status,v_high_impact,true,v_approved_by,v_approved_at,
    v_cancelled_by,v_cancelled_at,v_idempotency_key,true,v_created_at,pg_catalog.now()
  )
  ON CONFLICT (id) DO UPDATE SET
    status = CASE
      WHEN existing_task.status IN ('completed','failed','dead_lettered','cancelled','rejected') THEN existing_task.status
      WHEN EXCLUDED.status = 'cancelled' THEN 'cancelled'
      WHEN EXCLUDED.status = 'rejected' THEN 'rejected'
      WHEN EXCLUDED.status = 'approved_waiting_for_worker'
           AND existing_task.status = 'awaiting_administrator_approval' THEN 'approved_waiting_for_worker'
      ELSE existing_task.status
    END,
    approved_by = COALESCE(EXCLUDED.approved_by,existing_task.approved_by),
    approved_at = COALESCE(EXCLUDED.approved_at,existing_task.approved_at),
    cancelled_by = CASE WHEN EXCLUDED.status = 'cancelled' THEN EXCLUDED.cancelled_by ELSE existing_task.cancelled_by END,
    cancelled_at = CASE WHEN EXCLUDED.status = 'cancelled' THEN EXCLUDED.cancelled_at ELSE existing_task.cancelled_at END,
    worker_id = CASE WHEN EXCLUDED.status IN ('cancelled','rejected') THEN NULL ELSE existing_task.worker_id END,
    lease_token = CASE WHEN EXCLUDED.status IN ('cancelled','rejected') THEN NULL ELSE existing_task.lease_token END,
    lease_expires_at = CASE WHEN EXCLUDED.status IN ('cancelled','rejected') THEN NULL ELSE existing_task.lease_expires_at END,
    heartbeat_at = CASE WHEN EXCLUDED.status IN ('cancelled','rejected') THEN NULL ELSE existing_task.heartbeat_at END,
    updated_at = pg_catalog.now()
  WHERE existing_task.owner_admin_id = p_actor_user_id
    AND existing_task.bot_id = EXCLUDED.bot_id
    AND existing_task.idempotency_key = EXCLUDED.idempotency_key
  RETURNING existing_task.* INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task ID conflicts with another owner or idempotency record.' USING ERRCODE = '23505';
  END IF;
  RETURN pg_catalog.to_jsonb(v_row);
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_ai_bot_task_upsert_batch(
  p_tasks jsonb,
  p_actor_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_task jsonb;
  v_result jsonb := '[]'::jsonb;
BEGIN
  IF p_tasks IS NULL OR pg_catalog.jsonb_typeof(p_tasks) <> 'array' OR
     pg_catalog.jsonb_array_length(p_tasks) < 1 OR
     pg_catalog.jsonb_array_length(p_tasks) > 100 THEN
    RAISE EXCEPTION 'Provide between 1 and 100 AI bot tasks.' USING ERRCODE = '22023';
  END IF;
  FOR v_task IN SELECT value FROM pg_catalog.jsonb_array_elements(p_tasks)
  LOOP
    v_result := v_result || pg_catalog.jsonb_build_array(
      public.minglora_ai_bot_task_upsert(v_task,p_actor_user_id)
    );
  END LOOP;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_ai_bot_task_claim(
  p_worker_id text,
  p_limit integer DEFAULT 1,
  p_lease_seconds integer DEFAULT 180,
  p_actor_user_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_settings record;
  v_running integer;
  v_used_today integer;
  v_available integer;
  v_claim_limit integer;
  v_result jsonb;
BEGIN
  IF p_actor_user_id IS DISTINCT FROM '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid THEN
    RAISE EXCEPTION 'Worker authorization is invalid.' USING ERRCODE = '42501';
  END IF;
  IF p_worker_id IS NULL OR p_worker_id !~ '^[A-Za-z0-9._:-]{3,80}$' OR
     p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 OR
     p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'Worker ID, batch size or lease duration is invalid.' USING ERRCODE = '22023';
  END IF;

  -- Serialize claimers on the settings row to enforce the concurrency cap.
  SELECT * INTO v_settings
  FROM public.minglora_ai_bot_settings
  WHERE id = true
  FOR UPDATE;
  IF NOT FOUND OR NOT v_settings.enabled OR NOT v_settings.execution_enabled OR
     NOT v_settings.provider_ready OR v_settings.emergency_shutdown_at IS NOT NULL OR
     v_settings.max_concurrent_executions <= 0 OR v_settings.daily_execution_budget <= 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  -- Reclaim expired leases. A reclaimed task is never executed twice concurrently.
  UPDATE public.minglora_ai_bot_tasks AS task
  SET status = CASE WHEN task.attempt_count >= task.max_attempts THEN 'dead_lettered' ELSE 'approved_waiting_for_worker' END,
      next_attempt_at = CASE
        WHEN task.attempt_count >= task.max_attempts THEN pg_catalog.now()
        ELSE pg_catalog.now() + pg_catalog.make_interval(secs =>
          LEAST(300,(5 * pg_catalog.power(2,LEAST(GREATEST(task.attempt_count - 1,0),6)))::integer)
        )
      END,
      dead_lettered_at = CASE WHEN task.attempt_count >= task.max_attempts THEN pg_catalog.now() ELSE task.dead_lettered_at END,
      worker_id = NULL,lease_token = NULL,lease_expires_at = NULL,heartbeat_at = NULL,
      last_error_at = pg_catalog.now(),
      error_code = 'WORKER_LEASE_EXPIRED',
      error_message = 'The worker lease expired before the task was completed.',
      updated_at = pg_catalog.now()
  WHERE task.status = 'running'
    AND (task.lease_expires_at IS NULL OR task.lease_expires_at <= pg_catalog.now());

  SELECT pg_catalog.count(*)::integer INTO v_running
  FROM public.minglora_ai_bot_tasks AS task
  WHERE task.status = 'running' AND task.lease_expires_at > pg_catalog.now();
  SELECT pg_catalog.count(*)::integer INTO v_used_today
  FROM public.minglora_ai_bot_tasks AS task
  WHERE task.execution_started_at >= pg_catalog.date_trunc('day',pg_catalog.now());
  v_available := GREATEST(v_settings.max_concurrent_executions - v_running,0);
  v_claim_limit := LEAST(p_limit,v_available,GREATEST(v_settings.daily_execution_budget - v_used_today,0));
  IF v_claim_limit <= 0 THEN
    RETURN '[]'::jsonb;
  END IF;

  WITH candidates AS (
    SELECT task.id
    FROM public.minglora_ai_bot_tasks AS task
    JOIN public.ai_identities AS identity
      ON identity.identity_id = task.bot_id
     AND identity.owner_admin_id = task.owner_admin_id
    JOIN public.minglora_ai_bot_categories AS category
      ON category.id = identity.category_id
     AND category.enabled = true
    WHERE task.owner_admin_id = p_actor_user_id
      AND task.status = 'approved_waiting_for_worker'
      AND task.next_attempt_at <= pg_catalog.now()
      AND task.high_impact = false
      AND task.task_type IN ('assistant_request','moderation_review','analytics_report','translation')
      AND task.approval_required = true
      AND task.approved_by = p_actor_user_id
      AND task.approved_at IS NOT NULL
      AND identity.population = 'independent'
      AND identity.status = 'active'
    ORDER BY task.next_attempt_at ASC,task.created_at ASC
    LIMIT v_claim_limit
    FOR UPDATE OF task SKIP LOCKED
  ),
  claimed AS (
    UPDATE public.minglora_ai_bot_tasks AS task
    SET status = 'running',
        worker_id = p_worker_id,
        lease_token = pg_catalog.gen_random_uuid(),
        lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
        heartbeat_at = pg_catalog.now(),
        attempt_count = task.attempt_count + 1,
        execution_started_at = COALESCE(task.execution_started_at,pg_catalog.now()),
        updated_at = pg_catalog.now()
    FROM candidates
    WHERE task.id = candidates.id
    RETURNING task.id,task.bot_id,task.task_type,task.instruction,task.payload,
      task.high_impact,task.approved_by,task.approved_at,task.attempt_count,
      task.max_attempts,task.worker_id,task.lease_token,task.lease_expires_at
  )
  SELECT COALESCE(
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id',claimed.id,'botId',claimed.bot_id,'taskType',claimed.task_type,
      'instruction',claimed.instruction,'payload',claimed.payload,
      'highImpact',claimed.high_impact,'approvedBy',claimed.approved_by,
      'approvedAt',claimed.approved_at,'attemptCount',claimed.attempt_count,
      'maxAttempts',claimed.max_attempts,'workerId',claimed.worker_id,
      'leaseToken',claimed.lease_token,'leaseExpiresAt',claimed.lease_expires_at
    ) ORDER BY claimed.id),
    '[]'::jsonb
  ) INTO v_result
  FROM claimed;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_ai_bot_task_heartbeat(
  p_task_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 180,
  p_actor_user_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_actor_user_id IS DISTINCT FROM '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid OR
     p_worker_id IS NULL OR p_worker_id !~ '^[A-Za-z0-9._:-]{3,80}$' OR
     p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 300 THEN
    RAISE EXCEPTION 'Worker authorization or heartbeat parameters are invalid.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.minglora_ai_bot_tasks
  SET heartbeat_at = pg_catalog.now(),
      lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
      updated_at = pg_catalog.now()
  WHERE id = p_task_id AND owner_admin_id = p_actor_user_id
    AND status = 'running' AND worker_id = p_worker_id
    AND lease_token = p_lease_token
    AND lease_expires_at > pg_catalog.now();
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_ai_bot_task_complete(
  p_task_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_result jsonb,
  p_actor_user_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF p_actor_user_id IS DISTINCT FROM '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid OR
     p_worker_id IS NULL OR p_worker_id !~ '^[A-Za-z0-9._:-]{3,80}$' OR
     p_lease_token IS NULL OR p_result IS NULL OR
     pg_catalog.jsonb_typeof(p_result) <> 'object' OR pg_catalog.octet_length(p_result::text) > 32768 THEN
    RAISE EXCEPTION 'Worker completion payload is invalid.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.minglora_ai_bot_tasks
  SET status = 'completed',
      result = p_result,
      completed_at = pg_catalog.now(),
      worker_id = NULL,lease_token = NULL,lease_expires_at = NULL,heartbeat_at = NULL,
      error_code = NULL,error_message = NULL,updated_at = pg_catalog.now()
  WHERE id = p_task_id AND owner_admin_id = p_actor_user_id
    AND status = 'running' AND worker_id = p_worker_id
    AND lease_token = p_lease_token
    AND lease_expires_at > pg_catalog.now();
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_ai_bot_task_fail(
  p_task_id uuid,
  p_worker_id text,
  p_lease_token uuid,
  p_retryable boolean,
  p_error_code text,
  p_error_message text,
  p_actor_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_status text;
BEGIN
  IF p_actor_user_id IS DISTINCT FROM '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid OR
     p_worker_id IS NULL OR p_worker_id !~ '^[A-Za-z0-9._:-]{3,80}$' OR
     p_lease_token IS NULL OR p_retryable IS NULL THEN
    RAISE EXCEPTION 'Worker failure payload is invalid.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.minglora_ai_bot_tasks AS task
  SET status = CASE
        WHEN NOT p_retryable THEN 'failed'
        WHEN task.attempt_count >= task.max_attempts THEN 'dead_lettered'
        ELSE 'approved_waiting_for_worker'
      END,
      next_attempt_at = CASE
        WHEN p_retryable AND task.attempt_count < task.max_attempts THEN
          pg_catalog.now() + pg_catalog.make_interval(secs =>
            LEAST(300,(5 * pg_catalog.power(2,LEAST(GREATEST(task.attempt_count - 1,0),6)))::integer)
          )
        ELSE pg_catalog.now()
      END,
      dead_lettered_at = CASE
        WHEN p_retryable AND task.attempt_count >= task.max_attempts THEN pg_catalog.now()
        ELSE task.dead_lettered_at
      END,
      last_error_at = pg_catalog.now(),
      error_code = pg_catalog.left(COALESCE(NULLIF(p_error_code,''),'WORKER_EXECUTION_FAILED'),80),
      error_message = pg_catalog.left(COALESCE(NULLIF(p_error_message,''),'The AI task failed.'),500),
      worker_id = NULL,lease_token = NULL,lease_expires_at = NULL,heartbeat_at = NULL,
      updated_at = pg_catalog.now()
  WHERE task.id = p_task_id AND task.owner_admin_id = p_actor_user_id
    AND task.status = 'running' AND task.worker_id = p_worker_id
    AND task.lease_token = p_lease_token
    AND task.lease_expires_at > pg_catalog.now()
  RETURNING task.status INTO v_status;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('ok',false,'reason','lease_not_owned_or_expired');
  END IF;
  RETURN pg_catalog.jsonb_build_object('ok',true,'status',v_status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_ai_bot_task_list(
  p_owner_admin_id uuid,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    pg_catalog.jsonb_agg(result.item ORDER BY result.created_at DESC),
    '[]'::jsonb
  )
  FROM (
    SELECT
      pg_catalog.jsonb_build_object(
        'id',task.id,'botId',task.bot_id,'taskType',task.task_type,
        'instruction',task.instruction,'targetUserId',task.target_user_id,
        'status',task.status,'highImpact',task.high_impact,
        'approvedBy',task.approved_by,'approvedAt',task.approved_at,
        'attemptCount',task.attempt_count,'maxAttempts',task.max_attempts,
        'nextAttemptAt',task.next_attempt_at,'workerId',task.worker_id,
        'leaseExpiresAt',task.lease_expires_at,'completedAt',task.completed_at,
        'deadLetteredAt',task.dead_lettered_at,'errorCode',task.error_code,
        'errorMessage',task.error_message,'result',task.result,
        'createdAt',task.created_at,'updatedAt',task.updated_at
      ) AS item,
      task.created_at
    FROM public.minglora_ai_bot_tasks AS task
    WHERE task.owner_admin_id = p_owner_admin_id
    ORDER BY task.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit,100),1),100)
    OFFSET GREATEST(COALESCE(p_offset,0),0)
  ) AS result;
$function$;

CREATE OR REPLACE FUNCTION public.minglora_ai_bot_task_stats(
  p_owner_admin_id uuid
) RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'pendingApproval',(SELECT pg_catalog.count(*) FROM public.minglora_ai_bot_tasks WHERE owner_admin_id=p_owner_admin_id AND status='awaiting_administrator_approval'),
    'approvedWaiting',(SELECT pg_catalog.count(*) FROM public.minglora_ai_bot_tasks WHERE owner_admin_id=p_owner_admin_id AND status='approved_waiting_for_worker'),
    'running',(SELECT pg_catalog.count(*) FROM public.minglora_ai_bot_tasks WHERE owner_admin_id=p_owner_admin_id AND status='running'),
    'completedToday',(SELECT pg_catalog.count(*) FROM public.minglora_ai_bot_tasks WHERE owner_admin_id=p_owner_admin_id AND status='completed' AND completed_at >= pg_catalog.date_trunc('day',pg_catalog.now())),
    'failed',(SELECT pg_catalog.count(*) FROM public.minglora_ai_bot_tasks WHERE owner_admin_id=p_owner_admin_id AND status='failed'),
    'deadLettered',(SELECT pg_catalog.count(*) FROM public.minglora_ai_bot_tasks WHERE owner_admin_id=p_owner_admin_id AND status='dead_lettered'),
    'networkEnabled',(SELECT enabled FROM public.minglora_ai_bot_settings WHERE id=true),
    'hybridEnabled',(SELECT hybrid_enabled FROM public.minglora_ai_bot_settings WHERE id=true),
    'emergencyShutdownAt',(SELECT emergency_shutdown_at FROM public.minglora_ai_bot_settings WHERE id=true),
    'automaticSuspensionEnabled',(SELECT automatic_suspension_enabled FROM public.minglora_ai_bot_settings WHERE id=true),
    'executionEnabled',(SELECT execution_enabled FROM public.minglora_ai_bot_settings WHERE id=true),
    'providerReady',(SELECT provider_ready FROM public.minglora_ai_bot_settings WHERE id=true),
    'maxConcurrent',(SELECT max_concurrent_executions FROM public.minglora_ai_bot_settings WHERE id=true),
    'dailyExecutionBudget',(SELECT daily_execution_budget FROM public.minglora_ai_bot_settings WHERE id=true)
  );
$function$;

CREATE OR REPLACE FUNCTION public.minglora_ai_bot_settings_update(
  p_settings jsonb,
  p_actor_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_row public.minglora_ai_bot_settings;
BEGIN
  IF p_actor_user_id IS DISTINCT FROM '5b998c21-86b5-4621-ab37-e0808a2657b1'::uuid THEN
    RAISE EXCEPTION 'Only the designated Minglora owner may update AI network settings.' USING ERRCODE = '42501';
  END IF;
  IF p_settings IS NULL OR pg_catalog.jsonb_typeof(p_settings) <> 'object' THEN
    RAISE EXCEPTION 'AI network settings must be an object.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_object_keys(p_settings) AS supplied(key)
    WHERE key NOT IN (
      'enabled','hybridEnabled','maxConcurrentExecutions',
      'dailyExecutionBudget','automaticSuspensionEnabled','emergencyShutdownAt'
    )
  ) THEN
    RAISE EXCEPTION 'The AI network settings payload contains an unsupported field.' USING ERRCODE = '22023';
  END IF;
  IF (p_settings ? 'enabled' AND pg_catalog.jsonb_typeof(p_settings->'enabled') IS DISTINCT FROM 'boolean')
     OR (p_settings ? 'hybridEnabled' AND pg_catalog.jsonb_typeof(p_settings->'hybridEnabled') IS DISTINCT FROM 'boolean')
     OR (p_settings ? 'automaticSuspensionEnabled' AND pg_catalog.jsonb_typeof(p_settings->'automaticSuspensionEnabled') IS DISTINCT FROM 'boolean')
     OR (p_settings ? 'maxConcurrentExecutions' AND (
       pg_catalog.jsonb_typeof(p_settings->'maxConcurrentExecutions') IS DISTINCT FROM 'number'
       OR (p_settings->>'maxConcurrentExecutions') !~ '^[0-9]+(jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_upsert(jsonb,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_upsert_batch(jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_upsert_batch(jsonb,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_claim(text,integer,integer,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_claim(text,integer,integer,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_heartbeat(uuid,text,uuid,integer,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_heartbeat(uuid,text,uuid,integer,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_complete(uuid,text,uuid,jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_complete(uuid,text,uuid,jsonb,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_fail(uuid,text,uuid,boolean,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_fail(uuid,text,uuid,boolean,text,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_list(uuid,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_list(uuid,integer,integer) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_stats(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_settings_update(jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_settings_update(jsonb,uuid) TO service_role;

COMMIT;

       OR (p_settings->>'maxConcurrentExecutions')::integer NOT BETWEEN 0 AND 10000
     ))
     OR (p_settings ? 'dailyExecutionBudget' AND (
       pg_catalog.jsonb_typeof(p_settings->'dailyExecutionBudget') IS DISTINCT FROM 'number'
       OR (p_settings->>'dailyExecutionBudget') !~ '^[0-9]+(jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_upsert(jsonb,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_upsert_batch(jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_upsert_batch(jsonb,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_claim(text,integer,integer,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_claim(text,integer,integer,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_heartbeat(uuid,text,uuid,integer,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_heartbeat(uuid,text,uuid,integer,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_complete(uuid,text,uuid,jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_complete(uuid,text,uuid,jsonb,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_fail(uuid,text,uuid,boolean,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_fail(uuid,text,uuid,boolean,text,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_list(uuid,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_list(uuid,integer,integer) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_stats(uuid) TO service_role;

COMMIT;

       OR (p_settings->>'dailyExecutionBudget')::integer NOT BETWEEN 0 AND 1000000
     ))
     OR (p_settings ? 'emergencyShutdownAt' AND
       pg_catalog.jsonb_typeof(p_settings->'emergencyShutdownAt') NOT IN ('null','string')) THEN
    RAISE EXCEPTION 'One or more AI network settings values are invalid.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.minglora_ai_bot_settings
  SET enabled = CASE WHEN p_settings ? 'enabled' THEN (p_settings->>'enabled')::boolean ELSE enabled END,
      hybrid_enabled = CASE WHEN p_settings ? 'hybridEnabled' THEN (p_settings->>'hybridEnabled')::boolean ELSE hybrid_enabled END,
      max_concurrent_executions = CASE WHEN p_settings ? 'maxConcurrentExecutions' THEN (p_settings->>'maxConcurrentExecutions')::integer ELSE max_concurrent_executions END,
      daily_execution_budget = CASE WHEN p_settings ? 'dailyExecutionBudget' THEN (p_settings->>'dailyExecutionBudget')::integer ELSE daily_execution_budget END,
      automatic_suspension_enabled = CASE WHEN p_settings ? 'automaticSuspensionEnabled' THEN (p_settings->>'automaticSuspensionEnabled')::boolean ELSE automatic_suspension_enabled END,
      emergency_shutdown_at = CASE WHEN p_settings ? 'emergencyShutdownAt' THEN NULLIF(p_settings->>'emergencyShutdownAt','')::timestamptz ELSE emergency_shutdown_at END,
      updated_at = pg_catalog.now()
  WHERE id = true
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The Minglora AI network settings row is missing.' USING ERRCODE = 'P0002';
  END IF;
  RETURN pg_catalog.to_jsonb(v_row);
END;
$function$;

REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_upsert(jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_upsert(jsonb,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_upsert_batch(jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_upsert_batch(jsonb,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_claim(text,integer,integer,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_claim(text,integer,integer,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_heartbeat(uuid,text,uuid,integer,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_heartbeat(uuid,text,uuid,integer,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_complete(uuid,text,uuid,jsonb,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_complete(uuid,text,uuid,jsonb,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_fail(uuid,text,uuid,boolean,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_fail(uuid,text,uuid,boolean,text,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_list(uuid,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_list(uuid,integer,integer) TO service_role;
REVOKE ALL ON FUNCTION public.minglora_ai_bot_task_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.minglora_ai_bot_task_stats(uuid) TO service_role;

COMMIT;
