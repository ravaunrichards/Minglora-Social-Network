-- Phase 9: owner-scoped task retry and event-log access.
-- This migration adds no worker authentication or execution capability.
create or replace function public.minglora_ai_task_retry(
  p_actor_user_id uuid,
  p_task_id uuid,
  p_reason text,
  p_max_attempts integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_task ai_network.ai_task_queue%rowtype;
  v_reason text := left(trim(coalesce(p_reason, '')), 1000);
  v_max_attempts integer;
  v_new_status text;
  v_result jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI task retry is restricted to the private service runtime.';
  end if;
  if p_actor_user_id is null or p_task_id is null then
    raise exception using errcode = '22023', message = 'A valid administrator and task are required.';
  end if;
  if length(v_reason) < 3 then
    raise exception using errcode = '22023', message = 'A retry reason of at least three characters is required.';
  end if;

  select q.* into v_task
  from ai_network.ai_task_queue q
  where q.owner_user_id = p_actor_user_id
    and q.task_id = p_task_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'The AI task does not exist or is not owned by this administrator.';
  end if;
  if v_task.status <> 'failed' then
    raise exception using errcode = '55000', message = 'Only a failed AI task can be retried.';
  end if;
  if not exists (
    select 1
    from ai_network.ai_identities i
    where i.identity_id = v_task.identity_id
      and i.owner_user_id = p_actor_user_id
      and i.status = 'active'
      and i.enabled = true
  ) then
    raise exception using errcode = '55000', message = 'The linked AI identity must be active and enabled before retrying this task.';
  end if;

  v_max_attempts := coalesce(p_max_attempts, v_task.max_attempts);
  if v_max_attempts < v_task.max_attempts
     or v_max_attempts > 10
     or v_max_attempts <= v_task.attempt_count then
    raise exception using errcode = '22023', message = 'Maximum attempts must preserve the current limit, be no more than 10, and exceed the recorded attempt count.';
  end if;

  v_new_status := case
    when v_task.autonomy_mode = 'restricted_observation' then 'observation_only'
    when v_task.requires_approval then 'pending_approval'
    else 'queued'
  end;

  update ai_network.ai_task_queue q
  set status = v_new_status,
      max_attempts = v_max_attempts,
      approved_by_user_id = case when v_task.requires_approval then null else q.approved_by_user_id end,
      approved_at = case when v_task.requires_approval then null else q.approved_at end,
      worker_id = null,
      lease_token = null,
      lease_expires_at = null,
      started_at = null,
      finished_at = null,
      task_result = null,
      failure_reason = '',
      updated_at = now()
  where q.owner_user_id = p_actor_user_id
    and q.task_id = p_task_id
  returning to_jsonb(q) into v_result;

  if v_task.requires_approval then
    insert into ai_network.ai_task_approvals(
      owner_user_id, task_id, approval_status, requested_at,
      reviewed_by_user_id, reviewed_at, review_reason
    )
    values (
      p_actor_user_id, p_task_id, 'requested', now(), null, null,
      'Retry requested by an administrator: ' || v_reason
    )
    on conflict (task_id) do update
      set approval_status = 'requested',
          requested_at = now(),
          reviewed_by_user_id = null,
          reviewed_at = null,
          review_reason = 'Retry requested by an administrator: ' || v_reason;
  end if;

  insert into ai_network.ai_task_events(
    owner_user_id, task_id, actor_type, actor_user_id, event_type,
    previous_status, new_status, reason, metadata
  )
  values (
    p_actor_user_id, p_task_id, 'human_user', p_actor_user_id,
    'task_retry_requested', 'failed', v_new_status, v_reason,
    jsonb_build_object(
      'attempt_count', v_task.attempt_count,
      'previous_max_attempts', v_task.max_attempts,
      'max_attempts', v_max_attempts,
      'requires_approval', v_task.requires_approval,
      'autonomy_mode', v_task.autonomy_mode,
      'execution_started', false
    )
  );

  return jsonb_build_object('task', v_result, 'queued', v_new_status = 'queued',
    'approval_required', v_new_status = 'pending_approval',
    'execution_started', false);
end;
$function$;

revoke all on function public.minglora_ai_task_retry(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.minglora_ai_task_retry(uuid, uuid, text, integer) to service_role;
comment on function public.minglora_ai_task_retry(uuid, uuid, text, integer)
  is 'Owner-scoped retry/requeue for failed AI tasks. Rechecks active identity, preserves attempt history, re-requests human approval when required, and never starts execution.';

create or replace function public.minglora_ai_task_events(
  p_actor_user_id uuid,
  p_task_id uuid,
  p_limit integer default 100
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_events jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI task logs are restricted to the private service runtime.';
  end if;
  if p_actor_user_id is null or p_task_id is null then
    raise exception using errcode = '22023', message = 'A valid administrator and task are required.';
  end if;
  if not exists (
    select 1 from ai_network.ai_task_queue q
    where q.owner_user_id = p_actor_user_id and q.task_id = p_task_id
  ) then
    raise exception using errcode = 'P0002', message = 'The AI task does not exist or is not owned by this administrator.';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(e) order by e.occurred_at asc),
    '[]'::jsonb
  )
  into v_events
  from (
    select
      event_id, actor_type, actor_user_id, worker_id, event_type,
      previous_status, new_status, reason, metadata, occurred_at
    from ai_network.ai_task_events
    where owner_user_id = p_actor_user_id and task_id = p_task_id
    order by occurred_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 100))
  ) e;

  return jsonb_build_object('task_id', p_task_id, 'events', v_events);
end;
$function$;

revoke all on function public.minglora_ai_task_events(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.minglora_ai_task_events(uuid, uuid, integer) to service_role;
comment on function public.minglora_ai_task_events(uuid, uuid, integer)
  is 'Owner-scoped, bounded read of durable AI task audit events for the private administrative dashboard.';
