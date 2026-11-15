begin;

create table if not exists ai_network.ai_conversation_sessions (
  conversation_id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references ai_network.ai_identities(identity_id) on delete cascade,
  owner_user_id uuid not null,
  title text not null default 'New conversation'
    check (char_length(trim(title)) between 1 and 120),
  status text not null default 'active'
    check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days')
);

create table if not exists ai_network.ai_conversation_messages (
  message_id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references ai_network.ai_conversation_sessions(conversation_id) on delete cascade,
  identity_id uuid not null references ai_network.ai_identities(identity_id) on delete cascade,
  owner_user_id uuid not null,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(trim(content)) between 1 and 8000),
  provider text,
  model text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  idempotency_key uuid,
  created_at timestamptz not null default now()
);

create unique index if not exists ai_conversation_messages_request_role_uidx
  on ai_network.ai_conversation_messages(conversation_id, idempotency_key, role)
  where idempotency_key is not null;
create index if not exists ai_conversation_sessions_owner_updated_idx
  on ai_network.ai_conversation_sessions(owner_user_id, identity_id, updated_at desc);
create index if not exists ai_conversation_messages_owner_conversation_idx
  on ai_network.ai_conversation_messages(owner_user_id, conversation_id, created_at desc);
create index if not exists ai_conversation_sessions_expiry_idx
  on ai_network.ai_conversation_sessions(expires_at)
  where status = 'active';

create table if not exists ai_network.ai_conversation_usage_daily (
  owner_user_id uuid not null,
  usage_date date not null default current_date,
  reserved_tokens bigint not null default 0 check (reserved_tokens >= 0),
  used_tokens bigint not null default 0 check (used_tokens >= 0),
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, usage_date)
);

create table if not exists ai_network.ai_conversation_requests (
  request_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  identity_id uuid not null references ai_network.ai_identities(identity_id) on delete cascade,
  conversation_id uuid not null references ai_network.ai_conversation_sessions(conversation_id) on delete cascade,
  request_key uuid not null,
  user_message text not null check (char_length(trim(user_message)) between 1 and 4000),
  status text not null default 'processing'
    check (status in ('processing','completed','failed')),
  reserved_tokens integer not null check (reserved_tokens between 128 and 10000),
  usage_date date not null default current_date,
  lease_expires_at timestamptz not null default (now() + interval '5 minutes'),
  provider text,
  model text,
  response_id text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, request_key)
);

create index if not exists ai_conversation_requests_lease_idx
  on ai_network.ai_conversation_requests(status, lease_expires_at)
  where status = 'processing';
create index if not exists ai_conversation_requests_owner_date_idx
  on ai_network.ai_conversation_requests(owner_user_id, usage_date desc);

alter table ai_network.ai_conversation_sessions enable row level security;
alter table ai_network.ai_conversation_sessions force row level security;
alter table ai_network.ai_conversation_messages enable row level security;
alter table ai_network.ai_conversation_messages force row level security;
alter table ai_network.ai_conversation_usage_daily enable row level security;
alter table ai_network.ai_conversation_usage_daily force row level security;
alter table ai_network.ai_conversation_requests enable row level security;
alter table ai_network.ai_conversation_requests force row level security;

revoke all on table ai_network.ai_conversation_sessions from public, anon, authenticated;
revoke all on table ai_network.ai_conversation_messages from public, anon, authenticated;
revoke all on table ai_network.ai_conversation_usage_daily from public, anon, authenticated;
revoke all on table ai_network.ai_conversation_requests from public, anon, authenticated;
grant select, insert, update, delete on table ai_network.ai_conversation_sessions to service_role;
grant select, insert, update, delete on table ai_network.ai_conversation_messages to service_role;
grant select, insert, update, delete on table ai_network.ai_conversation_usage_daily to service_role;
grant select, insert, update, delete on table ai_network.ai_conversation_requests to service_role;

create or replace function public.minglora_ai_conversation_command(
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
  v_action text := lower(coalesce(p_action, ''));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_identity_id uuid;
  v_conversation_id uuid;
  v_request_key uuid;
  v_owner uuid;
  v_title text;
  v_limit integer;
  v_reserved integer;
  v_actual integer;
  v_user_message text;
  v_assistant_message text;
  v_request ai_network.ai_conversation_requests%rowtype;
  v_usage ai_network.ai_conversation_usage_daily%rowtype;
  v_session ai_network.ai_conversation_sessions%rowtype;
  v_messages jsonb;
  v_created boolean := false;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'AI conversation commands are restricted to the Minglora server runtime.';
  end if;
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'AI conversation payload must be a JSON object.';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora owner is required.';
  end if;

  begin
    v_identity_id := nullif(v_payload->>'identity_id','')::uuid;
    v_conversation_id := nullif(v_payload->>'conversation_id','')::uuid;
    v_request_key := nullif(v_payload->>'request_key','')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'A valid AI identity, conversation or request ID is required.';
  end;
  if v_identity_id is null then
    raise exception using errcode = '22023', message = 'A valid AI identity ID is required.';
  end if;

  select i.owner_user_id into v_owner
  from ai_network.ai_identities i
  where i.identity_id = v_identity_id
  for share;
  if v_owner is null or v_owner <> p_actor_user_id then
    raise exception using errcode = '42501', message = 'This AI identity does not belong to the signed-in Minglora owner.';
  end if;

  if v_action = 'create_session' then
    v_title := trim(coalesce(v_payload->>'title','New conversation'));
    if char_length(v_title) not between 1 and 120 then
      raise exception using errcode = '22023', message = 'Conversation titles must contain between 1 and 120 characters.';
    end if;
    insert into ai_network.ai_conversation_sessions(identity_id, owner_user_id, title)
    values (v_identity_id, p_actor_user_id, v_title)
    returning * into v_session;
    return jsonb_build_object(
      'conversation_id', v_session.conversation_id,
      'identity_id', v_identity_id,
      'title', v_session.title,
      'status', v_session.status,
      'messages', '[]'::jsonb,
      'created_at', v_session.created_at
    );
  end if;

  if v_action = 'list_sessions' then
    select coalesce(jsonb_agg(to_jsonb(s) order by s.updated_at desc), '[]'::jsonb)
    into v_messages
    from (
      select conversation_id, identity_id, title, status, created_at, updated_at
      from ai_network.ai_conversation_sessions
      where identity_id = v_identity_id and owner_user_id = p_actor_user_id
        and status = 'active' and expires_at > now()
      order by updated_at desc
      limit 20
    ) s;
    return jsonb_build_object('conversations', v_messages);
  end if;

  if v_action = 'get_session' or v_action = 'archive_session' then
    if v_conversation_id is null then
      raise exception using errcode = '22023', message = 'A valid conversation ID is required.';
    end if;
    select * into v_session
    from ai_network.ai_conversation_sessions
    where conversation_id = v_conversation_id
      and identity_id = v_identity_id
      and owner_user_id = p_actor_user_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'The AI conversation was not found for this owner.';
    end if;
    if v_action = 'archive_session' then
      update ai_network.ai_conversation_sessions
      set status = 'archived', updated_at = now()
      where conversation_id = v_conversation_id;
      return jsonb_build_object('archived', true, 'conversation_id', v_conversation_id);
    end if;
    select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at), '[]'::jsonb)
    into v_messages
    from (
      select message_id, role, content, provider, model, input_tokens, output_tokens, created_at
      from ai_network.ai_conversation_messages
      where conversation_id = v_conversation_id and owner_user_id = p_actor_user_id
      order by created_at desc
      limit 30
    ) m;
    return jsonb_build_object(
      'conversation_id', v_session.conversation_id,
      'identity_id', v_session.identity_id,
      'title', v_session.title,
      'status', v_session.status,
      'messages', v_messages,
      'created_at', v_session.created_at,
      'updated_at', v_session.updated_at
    );
  end if;

  if v_action = 'begin_exchange' then
    if v_conversation_id is null or v_request_key is null then
      raise exception using errcode = '22023', message = 'A conversation ID and unique request key are required.';
    end if;
    v_user_message := trim(coalesce(v_payload->>'user_message',''));
    if char_length(v_user_message) not between 1 and 4000 then
      raise exception using errcode = '22023', message = 'Messages must contain between 1 and 4,000 characters.';
    end if;
    v_reserved := coalesce(nullif(v_payload->>'reserved_tokens','')::integer, 0);
    v_limit := coalesce(nullif(v_payload->>'daily_limit','')::integer, 10000);
    if v_reserved not between 128 and 10000 or v_limit not between 500 and 500000 then
      raise exception using errcode = '22023', message = 'The AI conversation token reservation is outside the allowed range.';
    end if;

    select * into v_session
    from ai_network.ai_conversation_sessions
    where conversation_id = v_conversation_id
      and identity_id = v_identity_id
      and owner_user_id = p_actor_user_id
      and status = 'active'
      and expires_at > now()
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'The active AI conversation was not found for this owner.';
    end if;

    select * into v_request
    from ai_network.ai_conversation_requests
    where owner_user_id = p_actor_user_id and request_key = v_request_key
    for update;
    if found then
      if v_request.identity_id <> v_identity_id or v_request.conversation_id <> v_conversation_id then
        raise exception using errcode = '23505', message = 'This request key was already used for a different conversation.';
      end if;
      if v_request.status = 'completed' then
        return jsonb_build_object('status','completed','request_id',v_request.request_id,'reused',true);
      end if;
      if v_request.status = 'processing' and v_request.lease_expires_at > now() then
        return jsonb_build_object('status','in_progress','request_id',v_request.request_id,'reused',true);
      end if;
      update ai_network.ai_conversation_usage_daily
      set reserved_tokens = greatest(0, reserved_tokens - v_request.reserved_tokens), updated_at = now()
      where owner_user_id = p_actor_user_id and usage_date = v_request.usage_date;
    end if;

    if v_reserved > v_limit then
      raise exception using errcode = '54000', message = 'The requested conversation would exceed the daily Minglora AI token budget.';
    end if;

    insert into ai_network.ai_conversation_usage_daily(owner_user_id, usage_date, reserved_tokens, used_tokens)
    values (p_actor_user_id, current_date, v_reserved, 0)
    on conflict (owner_user_id, usage_date) do update
      set reserved_tokens = ai_network.ai_conversation_usage_daily.reserved_tokens + excluded.reserved_tokens,
          updated_at = now()
      where ai_network.ai_conversation_usage_daily.used_tokens
        + ai_network.ai_conversation_usage_daily.reserved_tokens
        + excluded.reserved_tokens <= v_limit
    returning * into v_usage;
    if not found then
      raise exception using errcode = '54000', message = 'The daily Minglora AI conversation token budget is exhausted.';
    end if;

    if v_request.request_id is null then
      insert into ai_network.ai_conversation_requests(
        owner_user_id, identity_id, conversation_id, request_key, user_message,
        status, reserved_tokens, usage_date, lease_expires_at
      )
      values (
        p_actor_user_id, v_identity_id, v_conversation_id, v_request_key, v_user_message,
        'processing', v_reserved, current_date, now() + interval '5 minutes'
      )
      returning * into v_request;
    else
      update ai_network.ai_conversation_requests
      set user_message = v_user_message,
          status = 'processing',
          reserved_tokens = v_reserved,
          usage_date = current_date,
          lease_expires_at = now() + interval '5 minutes',
          error_code = null,
          updated_at = now()
      where request_id = v_request.request_id
      returning * into v_request;
    end if;
    return jsonb_build_object(
      'status','processing',
      'request_id',v_request.request_id,
      'conversation_id',v_conversation_id,
      'reserved_tokens',v_reserved,
      'usage_date',v_request.usage_date
    );
  end if;

  if v_action = 'complete_exchange' then
    if v_request_key is null or v_conversation_id is null then
      raise exception using errcode = '22023', message = 'A valid conversation ID and request key are required.';
    end if;
    v_assistant_message := trim(coalesce(v_payload->>'assistant_message',''));
    if char_length(v_assistant_message) not between 1 and 8000 then
      raise exception using errcode = '22023', message = 'AI replies must contain between 1 and 8,000 characters.';
    end if;
    v_actual := coalesce(nullif(v_payload->>'total_tokens','')::integer, 0);
    if v_actual < 0 then
      raise exception using errcode = '22023', message = 'Token usage must be zero or greater.';
    end if;

    select * into v_request
    from ai_network.ai_conversation_requests
    where owner_user_id = p_actor_user_id
      and request_key = v_request_key
      and conversation_id = v_conversation_id
      and identity_id = v_identity_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'The active AI conversation request was not found.';
    end if;
    if v_request.status = 'completed' then
      return jsonb_build_object('completed',true,'reused',true,'request_id',v_request.request_id);
    end if;
    if v_request.status <> 'processing' or v_request.lease_expires_at <= now() then
      raise exception using errcode = 'P0002', message = 'The AI conversation request lease expired. Start a new request.';
    end if;
    if v_actual > v_request.reserved_tokens then
      raise exception using errcode = '54000', message = 'Measured token usage exceeded the reserved conversation budget.';
    end if;

    insert into ai_network.ai_conversation_messages(
      conversation_id, identity_id, owner_user_id, role, content, idempotency_key
    ) values (
      v_conversation_id, v_identity_id, p_actor_user_id, 'user', v_request.user_message, v_request.request_key
    ) on conflict do nothing;

    insert into ai_network.ai_conversation_messages(
      conversation_id, identity_id, owner_user_id, role, content, provider, model,
      input_tokens, output_tokens, idempotency_key
    ) values (
      v_conversation_id, v_identity_id, p_actor_user_id, 'assistant', v_assistant_message,
      nullif(v_payload->>'provider',''), nullif(v_payload->>'model',''),
      nullif(v_payload->>'input_tokens','')::integer,
      nullif(v_payload->>'output_tokens','')::integer,
      v_request.request_key
    ) on conflict do nothing;

    update ai_network.ai_conversation_usage_daily
    set reserved_tokens = greatest(0, reserved_tokens - v_request.reserved_tokens),
        used_tokens = used_tokens + v_actual,
        updated_at = now()
    where owner_user_id = p_actor_user_id and usage_date = v_request.usage_date;

    update ai_network.ai_conversation_requests
    set status = 'completed',
        provider = nullif(v_payload->>'provider',''),
        model = nullif(v_payload->>'model',''),
        response_id = nullif(v_payload->>'response_id',''),
        input_tokens = nullif(v_payload->>'input_tokens','')::integer,
        output_tokens = nullif(v_payload->>'output_tokens','')::integer,
        reserved_tokens = 0,
        updated_at = now()
    where request_id = v_request.request_id;

    update ai_network.ai_conversation_sessions
    set updated_at = now()
    where conversation_id = v_conversation_id;

    return jsonb_build_object('completed',true,'request_id',v_request.request_id,'total_tokens',v_actual);
  end if;

  if v_action = 'fail_exchange' then
    if v_request_key is null or v_conversation_id is null then
      raise exception using errcode = '22023', message = 'A valid conversation ID and request key are required.';
    end if;
    select * into v_request
    from ai_network.ai_conversation_requests
    where owner_user_id = p_actor_user_id
      and request_key = v_request_key
      and conversation_id = v_conversation_id
      and identity_id = v_identity_id
    for update;
    if not found then
      return jsonb_build_object('released',false);
    end if;
    if v_request.status = 'processing' then
      update ai_network.ai_conversation_usage_daily
      set reserved_tokens = greatest(0, reserved_tokens - v_request.reserved_tokens), updated_at = now()
      where owner_user_id = p_actor_user_id and usage_date = v_request.usage_date;
      update ai_network.ai_conversation_requests
      set status = 'failed',
          error_code = left(coalesce(v_payload->>'error_code','provider_error'), 80),
          reserved_tokens = 0,
          updated_at = now()
      where request_id = v_request.request_id;
      return jsonb_build_object('released',true);
    end if;
    return jsonb_build_object('released',false,'status',v_request.status);
  end if;

  raise exception using errcode = '22023', message = 'Unsupported AI conversation command.';
end;
$function$;

revoke all on function public.minglora_ai_conversation_command(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_conversation_command(text, uuid, jsonb) to service_role;
comment on function public.minglora_ai_conversation_command(text, uuid, jsonb) is
  'Private service-role only, owner-scoped AI bot conversations with idempotency, leased exchanges, daily token reservations and audit-safe retention. Does not execute external actions.';

commit;
