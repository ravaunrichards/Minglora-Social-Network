-- Durable, owner-scoped AI identity import history and retry.
-- Reuses the canonical ai_network.ai_identities and existing identity RPC.
-- Failed request payloads remain private until retry succeeds; successful payloads are cleared.

begin;

create table if not exists ai_network.ai_identity_batches (
  batch_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{32}$'),
  source text not null default 'admin_center' check (length(source) between 1 and 80),
  status text not null default 'failed' check (status in ('completed','partial','failed')),
  requested_count integer not null check (requested_count between 1 and 100),
  created_count integer not null default 0 check (created_count between 0 and 100),
  reused_count integer not null default 0 check (reused_count between 0 and 100),
  failed_count integer not null default 0 check (failed_count between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id,idempotency_key),
  unique (batch_id,owner_user_id),
  check (created_count + reused_count + failed_count = requested_count)
);

create index if not exists ai_identity_batches_owner_created_idx
  on ai_network.ai_identity_batches(owner_user_id,created_at desc,batch_id);

create table if not exists ai_network.ai_identity_batch_rows (
  batch_row_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  row_index integer not null check (row_index between 1 and 100),
  row_idempotency_key text not null check (length(row_idempotency_key) between 8 and 160),
  identity_id uuid references ai_network.ai_identities(identity_id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','created','reused','failed')),
  request_payload jsonb,
  attempt_count integer not null default 0 check (attempt_count between 0 and 25),
  error_code text not null default '',
  error_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (batch_id,owner_user_id)
    references ai_network.ai_identity_batches(batch_id,owner_user_id) on delete restrict,
  unique (batch_id,row_index),
  unique (batch_id,row_idempotency_key),
  check (
    (status='failed' and request_payload is not null)
    or (status in ('pending','created','reused'))
  ),
  check (request_payload is null or jsonb_typeof(request_payload)='object')
);

create index if not exists ai_identity_batch_rows_retry_idx
  on ai_network.ai_identity_batch_rows(owner_user_id,batch_id,row_index)
  where status='failed' and request_payload is not null;

-- Full indexes support every referencing foreign key; the retry index is partial.
create index if not exists ai_identity_batch_rows_owner_idx
  on ai_network.ai_identity_batch_rows(owner_user_id);
create index if not exists ai_identity_batch_rows_batch_owner_idx
  on ai_network.ai_identity_batch_rows(batch_id,owner_user_id);
create index if not exists ai_identity_batch_rows_identity_idx
  on ai_network.ai_identity_batch_rows(identity_id);

create table if not exists ai_network.ai_identity_batch_events (
  event_id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null check (event_type in ('batch_created','batch_retry_completed')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  occurred_at timestamptz not null default now(),
  foreign key (batch_id,owner_user_id)
    references ai_network.ai_identity_batches(batch_id,owner_user_id) on delete restrict
);

create index if not exists ai_identity_batch_events_owner_time_idx
  on ai_network.ai_identity_batch_events(owner_user_id,occurred_at desc);
create index if not exists ai_identity_batch_events_batch_owner_idx
  on ai_network.ai_identity_batch_events(batch_id,owner_user_id);
create index if not exists ai_identity_batch_events_actor_idx
  on ai_network.ai_identity_batch_events(actor_user_id);

alter table ai_network.ai_identity_batches enable row level security;
alter table ai_network.ai_identity_batch_rows enable row level security;
alter table ai_network.ai_identity_batch_events enable row level security;

revoke all on ai_network.ai_identity_batches,ai_network.ai_identity_batch_rows,ai_network.ai_identity_batch_events
  from public,anon,authenticated,service_role;
grant select,insert,update on ai_network.ai_identity_batches to service_role;
grant select,insert,update on ai_network.ai_identity_batch_rows to service_role;
grant select,insert on ai_network.ai_identity_batch_events to service_role;

create or replace function public.minglora_ai_identity_batch_command(
  p_action text,
  p_actor_user_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_action text := lower(coalesce(p_action,''));
  v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
  v_items jsonb;
  v_item record;
  v_row ai_network.ai_identity_batch_rows%rowtype;
  v_batch ai_network.ai_identity_batches%rowtype;
  v_batch_id uuid;
  v_batch_key text;
  v_fingerprint text;
  v_source text;
  v_result jsonb;
  v_identity_id uuid;
  v_error_code text;
  v_error_message text;
  v_created integer := 0;
  v_reused integer := 0;
  v_failed integer := 0;
  v_limit integer;
begin
  if current_user <> 'service_role' then
    raise exception using errcode='42501',message='AI identity batch operations are restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_user_id) then
    raise exception using errcode='42501',message='A valid signed-in Minglora owner is required for AI identity batches.';
  end if;
  if jsonb_typeof(v_payload)<>'object'
     or v_payload::text ~* '"(token|api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential)"[[:space:]]*:' then
    raise exception using errcode='22023',message='AI identity batches cannot contain credentials or secret fields.';
  end if;

  if v_action='create_batch' then
    v_batch_key := trim(coalesce(v_payload->>'batch_idempotency_key',''));
    v_source := left(trim(coalesce(v_payload->>'source','admin_center')),80);
    v_items := v_payload->'items';
    if length(v_batch_key)<8 or length(v_batch_key)>160 then
      raise exception using errcode='22023',message='A batch idempotency key between 8 and 160 characters is required.';
    end if;
    if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items)<1 or jsonb_array_length(v_items)>100 then
      raise exception using errcode='22023',message='An AI identity batch must contain between 1 and 100 records.';
    end if;
    if octet_length(v_items::text)>180000 then
      raise exception using errcode='22023',message='The AI identity batch is too large to retain safely.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_items) x(value)
      where jsonb_typeof(x.value)<>'object'
    ) then
      raise exception using errcode='22023',message='Every AI identity batch row must be a JSON object.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_items) x(value)
      where length(trim(coalesce(x.value->>'idempotency_key','')))<8
         or length(trim(coalesce(x.value->>'idempotency_key','')))>160
    ) then
      raise exception using errcode='22023',message='Every AI identity row requires its own idempotency key between 8 and 160 characters.';
    end if;
    if (
      select count(distinct trim(x.value->>'idempotency_key'))
      from jsonb_array_elements(v_items) x(value)
    ) <> jsonb_array_length(v_items) then
      raise exception using errcode='22023',message='Duplicate row idempotency keys are not allowed within one batch.';
    end if;
    v_fingerprint := pg_catalog.md5(v_items::text);

    insert into ai_network.ai_identity_batches(
      owner_user_id,idempotency_key,request_fingerprint,source,status,requested_count,
      created_count,reused_count,failed_count
    ) values (
      p_actor_user_id,v_batch_key,v_fingerprint,coalesce(nullif(v_source,''),'admin_center'),
      'failed',jsonb_array_length(v_items),0,0,jsonb_array_length(v_items)
    )
    on conflict (owner_user_id,idempotency_key) do nothing
    returning * into v_batch;

    if v_batch.batch_id is null then
      select * into v_batch
      from ai_network.ai_identity_batches b
      where b.owner_user_id=p_actor_user_id and b.idempotency_key=v_batch_key
      for update;
      if v_batch.request_fingerprint<>v_fingerprint then
        raise exception using errcode='23505',message='This batch idempotency key was already used for different identity rows.';
      end if;
      select jsonb_build_object(
        'batch_id',b.batch_id,'idempotency_key',b.idempotency_key,'status',b.status,
        'requested_count',b.requested_count,'created_count',b.created_count,
        'reused_count',b.reused_count,'succeeded_count',b.created_count+b.reused_count,
        'failed_count',b.failed_count,
        'failed_rows',coalesce((
          select jsonb_agg(jsonb_build_object(
            'row_index',r.row_index,'idempotency_key',r.row_idempotency_key,
            'status',r.status,'error_code',r.error_code,'error',r.error_message,
            'attempt_count',r.attempt_count
          ) order by r.row_index)
          from ai_network.ai_identity_batch_rows r
          where r.batch_id=b.batch_id and r.owner_user_id=p_actor_user_id and r.status='failed'
        ),'[]'::jsonb)
      ) into v_result
      from ai_network.ai_identity_batches b where b.batch_id=v_batch.batch_id;
      return v_result || jsonb_build_object('replayed',true);
    end if;

    v_batch_id := v_batch.batch_id;
    for v_item in
      select x.value,x.ordinality::integer as row_index
      from jsonb_array_elements(v_items) with ordinality x(value,ordinality)
      order by x.ordinality
    loop
      insert into ai_network.ai_identity_batch_rows(
        batch_id,owner_user_id,row_index,row_idempotency_key,status,request_payload
      ) values (
        v_batch_id,p_actor_user_id,v_item.row_index,
        trim(v_item.value->>'idempotency_key'),'pending',v_item.value
      );

      begin
        v_result := public.minglora_ai_identity_command('create',p_actor_user_id,v_item.value);
        v_identity_id := nullif(v_result #>> '{identity,identity_id}','')::uuid;
        if v_identity_id is null then
          raise exception using errcode='P0001',message='The identity writer returned no canonical identity ID.';
        end if;
        if coalesce((v_result->>'reused')::boolean,false) then
          update ai_network.ai_identity_batch_rows r
          set status='reused',identity_id=v_identity_id,request_payload=null,
              attempt_count=1,error_code='',error_message='',updated_at=now()
          where r.batch_id=v_batch_id and r.owner_user_id=p_actor_user_id and r.row_index=v_item.row_index;
          v_reused := v_reused+1;
        else
          update ai_network.ai_identity_batch_rows r
          set status='created',identity_id=v_identity_id,request_payload=null,
              attempt_count=1,error_code='',error_message='',updated_at=now()
          where r.batch_id=v_batch_id and r.owner_user_id=p_actor_user_id and r.row_index=v_item.row_index;
          v_created := v_created+1;
        end if;
      exception when others then
        get stacked diagnostics v_error_code=returned_sqlstate,v_error_message=message_text;
        update ai_network.ai_identity_batch_rows r
        set status='failed',request_payload=v_item.value,attempt_count=1,
            error_code=left(coalesce(v_error_code,''),20),
            error_message=left(coalesce(v_error_message,'AI identity creation failed.'),240),
            updated_at=now()
        where r.batch_id=v_batch_id and r.owner_user_id=p_actor_user_id and r.row_index=v_item.row_index;
        v_failed := v_failed+1;
      end;
    end loop;

    update ai_network.ai_identity_batches b
    set created_count=v_created,reused_count=v_reused,failed_count=v_failed,
        status=case when v_failed=0 then 'completed' when v_created+v_reused=0 then 'failed' else 'partial' end,
        updated_at=now()
    where b.batch_id=v_batch_id and b.owner_user_id=p_actor_user_id
    returning * into v_batch;

    insert into ai_network.ai_identity_batch_events(
      batch_id,owner_user_id,actor_user_id,event_type,metadata
    ) values (
      v_batch_id,p_actor_user_id,p_actor_user_id,'batch_created',
      jsonb_build_object('requested_count',v_batch.requested_count,'created_count',v_created,'reused_count',v_reused,'failed_count',v_failed)
    );

  elsif v_action='retry_failed' then
    if coalesce(v_payload->>'batch_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode='22023',message='A valid AI identity batch ID is required.';
    end if;
    v_batch_id := (v_payload->>'batch_id')::uuid;
    select * into v_batch from ai_network.ai_identity_batches b
    where b.batch_id=v_batch_id and b.owner_user_id=p_actor_user_id
    for update;
    if v_batch.batch_id is null then
      raise exception using errcode='P0002',message='The AI identity batch was not found for this owner.';
    end if;
    for v_row in
      select r.* from ai_network.ai_identity_batch_rows r
      where r.batch_id=v_batch_id and r.owner_user_id=p_actor_user_id
        and r.status='failed' and r.request_payload is not null and r.attempt_count<25
      order by r.row_index
      for update
    loop
      begin
        v_result := public.minglora_ai_identity_command('create',p_actor_user_id,v_row.request_payload);
        v_identity_id := nullif(v_result #>> '{identity,identity_id}','')::uuid;
        if v_identity_id is null then
          raise exception using errcode='P0001',message='The identity writer returned no canonical identity ID.';
        end if;
        update ai_network.ai_identity_batch_rows r
        set status=case when coalesce((v_result->>'reused')::boolean,false) then 'reused' else 'created' end,
            identity_id=v_identity_id,request_payload=null,attempt_count=r.attempt_count+1,
            error_code='',error_message='',updated_at=now()
        where r.batch_row_id=v_row.batch_row_id;
      exception when others then
        get stacked diagnostics v_error_code=returned_sqlstate,v_error_message=message_text;
        update ai_network.ai_identity_batch_rows r
        set status='failed',attempt_count=r.attempt_count+1,
            error_code=left(coalesce(v_error_code,''),20),
            error_message=left(coalesce(v_error_message,'AI identity retry failed.'),240),
            updated_at=now()
        where r.batch_row_id=v_row.batch_row_id;
      end;
    end loop;

    select
      count(*) filter(where r.status='created')::integer,
      count(*) filter(where r.status='reused')::integer,
      count(*) filter(where r.status='failed')::integer
    into v_created,v_reused,v_failed
    from ai_network.ai_identity_batch_rows r
    where r.batch_id=v_batch_id and r.owner_user_id=p_actor_user_id;

    update ai_network.ai_identity_batches b
    set created_count=v_created,reused_count=v_reused,failed_count=v_failed,
        status=case when v_failed=0 then 'completed' when v_created+v_reused=0 then 'failed' else 'partial' end,
        updated_at=now()
    where b.batch_id=v_batch_id and b.owner_user_id=p_actor_user_id
    returning * into v_batch;

    insert into ai_network.ai_identity_batch_events(
      batch_id,owner_user_id,actor_user_id,event_type,metadata
    ) values (
      v_batch_id,p_actor_user_id,p_actor_user_id,'batch_retry_completed',
      jsonb_build_object('created_count',v_created,'reused_count',v_reused,'failed_count',v_failed)
    );

  elsif v_action='list_batches' then
    v_limit := greatest(1,least(coalesce(nullif(v_payload->>'limit','')::integer,10),50));
    select coalesce(jsonb_agg(batch_json order by created_at desc),'[]'::jsonb)
      into v_result
    from (
      select b.created_at,jsonb_build_object(
        'batch_id',b.batch_id,'idempotency_key',b.idempotency_key,'source',b.source,
        'status',b.status,'requested_count',b.requested_count,
        'created_count',b.created_count,'reused_count',b.reused_count,
        'succeeded_count',b.created_count+b.reused_count,'failed_count',b.failed_count,
        'created_at',b.created_at,'updated_at',b.updated_at,
        'failed_rows',coalesce((
          select jsonb_agg(jsonb_build_object(
            'row_index',r.row_index,'idempotency_key',r.row_idempotency_key,
            'status',r.status,'error_code',r.error_code,'error',r.error_message,
            'attempt_count',r.attempt_count
          ) order by r.row_index)
          from ai_network.ai_identity_batch_rows r
          where r.batch_id=b.batch_id and r.owner_user_id=p_actor_user_id and r.status='failed'
        ),'[]'::jsonb)
      ) as batch_json
      from ai_network.ai_identity_batches b
      where b.owner_user_id=p_actor_user_id
      order by b.created_at desc
      limit v_limit
    ) recent;
    return jsonb_build_object('batches',coalesce(v_result,'[]'::jsonb),'count',jsonb_array_length(coalesce(v_result,'[]'::jsonb)));
  else
    raise exception using errcode='22023',message='Unsupported AI identity batch command.';
  end if;

  select jsonb_build_object(
    'batch_id',b.batch_id,'idempotency_key',b.idempotency_key,'source',b.source,
    'status',b.status,'requested_count',b.requested_count,
    'created_count',b.created_count,'reused_count',b.reused_count,
    'succeeded_count',b.created_count+b.reused_count,'failed_count',b.failed_count,
    'created_at',b.created_at,'updated_at',b.updated_at,
    'failed_rows',coalesce((
      select jsonb_agg(jsonb_build_object(
        'row_index',r.row_index,'idempotency_key',r.row_idempotency_key,
        'status',r.status,'error_code',r.error_code,'error',r.error_message,
        'attempt_count',r.attempt_count
      ) order by r.row_index)
      from ai_network.ai_identity_batch_rows r
      where r.batch_id=b.batch_id and r.owner_user_id=p_actor_user_id and r.status='failed'
    ),'[]'::jsonb)
  ) into v_result
  from ai_network.ai_identity_batches b
  where b.batch_id=v_batch_id and b.owner_user_id=p_actor_user_id;

  return v_result || jsonb_build_object('replayed',false);
end;
$function$;

comment on function public.minglora_ai_identity_batch_command(text,uuid,jsonb)
  is 'Owner-scoped durable AI identity batch import and failed-row retry. Uses the canonical identity command and clears successful row payloads.';

revoke all on function public.minglora_ai_identity_batch_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minglora_ai_identity_batch_command(text,uuid,jsonb) to service_role;

commit;
