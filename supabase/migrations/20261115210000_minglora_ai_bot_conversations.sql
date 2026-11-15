-- Minglora AI Bot Network: private, owner-scoped, human-initiated bot conversations.
-- Conversation records are not AI memory. Long-term memory remains separately opted-in.
-- All access is mediated by the authenticated Minglora server and its private service-role gateway.

create table if not exists ai_network.ai_bot_conversations (
  conversation_id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  identity_id uuid not null references ai_network.ai_identities(identity_id) on delete restrict,
  bot_id uuid not null,
  conversation_title text not null default '' check (length(conversation_title) between 1 and 100),
  conversation_status text not null default 'open' check (conversation_status in ('open','archived')),
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, identity_id, owner_user_id)
);
create unique index if not exists ai_bot_conversations_owner_idempotency_uq
  on ai_network.ai_bot_conversations(owner_user_id, idempotency_key);
create index if not exists ai_bot_conversations_owner_activity_idx
  on ai_network.ai_bot_conversations(owner_user_id, coalesce(last_message_at, created_at) desc);
create index if not exists ai_bot_conversations_identity_activity_idx
  on ai_network.ai_bot_conversations(identity_id, created_at desc);

create table if not exists ai_network.ai_bot_conversation_turns (
  turn_id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  identity_id uuid not null,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 8 and 160),
  user_message text not null check (length(trim(user_message)) between 1 and 4000),
  assistant_message text check (assistant_message is null or length(assistant_message) between 1 and 12000),
  turn_status text not null default 'running' check (turn_status in ('running','completed','failed')),
  provider text,
  model text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  total_tokens integer not null default 0 check (total_tokens >= 0),
  reserved_tokens integer not null default 0 check (reserved_tokens >= 0),
  failure_code text check (failure_code is null or failure_code ~ '^[a-z0-9_]{1,60}$'),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (conversation_id, identity_id, owner_user_id)
    references ai_network.ai_bot_conversations(conversation_id, identity_id, owner_user_id)
    on delete cascade,
  unique (conversation_id, owner_user_id, idempotency_key)
);
create index if not exists ai_bot_conversation_turns_history_idx
  on ai_network.ai_bot_conversation_turns(conversation_id, created_at desc);
create index if not exists ai_bot_conversation_turns_owner_usage_idx
  on ai_network.ai_bot_conversation_turns(owner_user_id, created_at desc);
create index if not exists ai_bot_conversation_turns_running_idx
  on ai_network.ai_bot_conversation_turns(conversation_id, started_at)
  where turn_status = 'running';

alter table ai_network.ai_bot_conversations enable row level security;
alter table ai_network.ai_bot_conversation_turns enable row level security;
revoke all on table ai_network.ai_bot_conversations, ai_network.ai_bot_conversation_turns
  from public, anon, authenticated;
grant select, insert, update, delete
  on table ai_network.ai_bot_conversations, ai_network.ai_bot_conversation_turns
  to service_role;

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
  v_conversation ai_network.ai_bot_conversations%rowtype;
  v_turn ai_network.ai_bot_conversation_turns%rowtype;
  v_identity_id uuid;
  v_bot_id uuid;
  v_conversation_id uuid;
  v_turn_id uuid;
  v_idempotency_key text;
  v_user_message text;
  v_assistant_message text;
  v_title text;
  v_identity_status text;
  v_profile_data jsonb;
  v_bot_name text;
  v_result jsonb;
  v_turns jsonb;
  v_used_tokens bigint := 0;
  v_reserved_tokens bigint := 0;
  v_available_tokens bigint := 0;
  v_reserve integer := 0;
  v_input_tokens integer := 0;
  v_output_tokens integer := 0;
  v_total_tokens integer := 0;
  v_provider text;
  v_model text;
  v_failure_code text;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'AI conversation commands are restricted to the private Minglora server runtime.';
  end if;
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'AI conversation payload must be a JSON object.';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora owner is required.';
  end if;

  if v_action = 'usage_today' then
    select
      coalesce(sum(t.total_tokens), 0),
      coalesce(sum(t.reserved_tokens) filter (where t.turn_status = 'running'), 0),
      count(*) filter (where t.turn_status = 'completed')
    into v_used_tokens, v_reserved_tokens, v_total_tokens
    from ai_network.ai_bot_conversation_turns t
    where t.owner_user_id = p_actor_user_id
      and t.created_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC');
    return jsonb_build_object(
      'used_tokens', v_used_tokens,
      'reserved_tokens', v_reserved_tokens,
      'completed_turns', v_total_tokens
    );
  end if;

  if v_action = 'list_conversations' then
    select coalesce(jsonb_agg(q.item order by q.activity_at desc), '[]'::jsonb)
    into v_result
    from (
      select
        jsonb_build_object(
          'conversation_id', c.conversation_id,
          'identity_id', c.identity_id,
          'bot_id', c.bot_id,
          'bot_name', n.display_name,
          'conversation_title', c.conversation_title,
          'conversation_status', c.conversation_status,
          'last_message_at', c.last_message_at,
          'created_at', c.created_at,
          'turn_count', (
            select count(*) from ai_network.ai_bot_conversation_turns t
            where t.conversation_id = c.conversation_id and t.owner_user_id = p_actor_user_id
              and t.turn_status = 'completed'
          )
        ) as item,
        coalesce(c.last_message_at, c.created_at) as activity_at
      from ai_network.ai_bot_conversations c
      join ai_network.ai_names n on n.identity_id = c.identity_id
      where c.owner_user_id = p_actor_user_id
      order by coalesce(c.last_message_at, c.created_at) desc
      limit 50
    ) q;
    return jsonb_build_object('conversations', coalesce(v_result, '[]'::jsonb));
  end if;

  if v_action = 'create_conversation' then
    if coalesce(v_payload->>'identity_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(v_payload->>'bot_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A linked AI bot and relational identity are required.';
    end if;
    v_identity_id := (v_payload->>'identity_id')::uuid;
    v_bot_id := (v_payload->>'bot_id')::uuid;
    v_idempotency_key := trim(coalesce(v_payload->>'idempotency_key', ''));
    if length(v_idempotency_key) < 8 or length(v_idempotency_key) > 160 then
      raise exception using errcode = '22023', message = 'A stable conversation request key is required.';
    end if;
    select i.status, p.extra_profile_data, n.display_name
      into v_identity_status, v_profile_data, v_bot_name
    from ai_network.ai_identities i
    join ai_network.ai_profiles p on p.identity_id = i.identity_id
    join ai_network.ai_names n on n.identity_id = i.identity_id
    where i.identity_id = v_identity_id
      and i.owner_user_id = p_actor_user_id
      and p.extra_profile_data->>'source' = 'bot_personality_laboratory'
      and p.extra_profile_data->>'bot_id' = v_bot_id::text;
    if not found then
      raise exception using errcode = '42501', message = 'The linked AI bot identity does not belong to this Minglora owner.';
    end if;
    if v_identity_status in ('suspended','restricted','archived','retired') then
      raise exception using errcode = '42501', message = 'This AI identity is restricted from starting conversations.';
    end if;
    v_title := left(trim(coalesce(v_payload->>'title', 'Chat with ' || v_bot_name)), 100);
    if v_title = '' then v_title := 'Chat with ' || v_bot_name; end if;

    insert into ai_network.ai_bot_conversations (
      owner_user_id, identity_id, bot_id, conversation_title, idempotency_key
    ) values (
      p_actor_user_id, v_identity_id, v_bot_id, v_title, v_idempotency_key
    )
    on conflict (owner_user_id, idempotency_key) do nothing
    returning * into v_conversation;
    if not found then
      select * into v_conversation
      from ai_network.ai_bot_conversations c
      where c.owner_user_id = p_actor_user_id and c.idempotency_key = v_idempotency_key;
      if not found or v_conversation.identity_id <> v_identity_id or v_conversation.bot_id <> v_bot_id then
        raise exception using errcode = '23505', message = 'The conversation request key is already used for a different AI bot.';
      end if;
      return jsonb_build_object('conversation', to_jsonb(v_conversation), 'reused', true);
    end if;
    return jsonb_build_object('conversation', to_jsonb(v_conversation), 'reused', false);
  end if;

  if coalesce(v_payload->>'conversation_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'A valid AI conversation ID is required.';
  end if;
  v_conversation_id := (v_payload->>'conversation_id')::uuid;
  select * into v_conversation
  from ai_network.ai_bot_conversations c
  where c.conversation_id = v_conversation_id and c.owner_user_id = p_actor_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'AI conversation was not found for this Minglora owner.';
  end if;

  if v_action = 'get_conversation' then
    select n.display_name into v_bot_name
    from ai_network.ai_names n where n.identity_id = v_conversation.identity_id;
    select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at), '[]'::jsonb)
      into v_turns
    from (
      select t.*
      from ai_network.ai_bot_conversation_turns t
      where t.conversation_id = v_conversation_id and t.owner_user_id = p_actor_user_id
      order by t.created_at desc
      limit 30
    ) q;
    return jsonb_build_object(
      'conversation', to_jsonb(v_conversation) || jsonb_build_object('bot_name', v_bot_name),
      'turns', coalesce(v_turns, '[]'::jsonb)
    );
  end if;

  if v_action = 'archive_conversation' then
    update ai_network.ai_bot_conversations
    set conversation_status = 'archived', updated_at = now()
    where conversation_id = v_conversation_id and owner_user_id = p_actor_user_id
    returning * into v_conversation;
    return jsonb_build_object('conversation', to_jsonb(v_conversation), 'archived', true);
  end if;

  if v_action = 'start_turn' then
    if v_conversation.conversation_status <> 'open' then
      raise exception using errcode = '55000', message = 'Archived conversations cannot receive new messages.';
    end if;
    select i.status into v_identity_status
    from ai_network.ai_identities i
    join ai_network.ai_profiles p on p.identity_id = i.identity_id
    where i.identity_id = v_conversation.identity_id and i.owner_user_id = p_actor_user_id
      and p.extra_profile_data->>'source' = 'bot_personality_laboratory'
      and p.extra_profile_data->>'bot_id' = v_conversation.bot_id::text;
    if not found or v_identity_status in ('suspended','restricted','archived','retired') then
      raise exception using errcode = '42501', message = 'This AI identity is restricted from starting conversations.';
    end if;
    v_user_message := trim(coalesce(v_payload->>'user_message', ''));
    if length(v_user_message) < 1 or length(v_user_message) > 4000 then
      raise exception using errcode = '22023', message = 'Messages must contain between 1 and 4,000 characters.';
    end if;
    v_idempotency_key := trim(coalesce(v_payload->>'idempotency_key', ''));
    if length(v_idempotency_key) < 8 or length(v_idempotency_key) > 160 then
      raise exception using errcode = '22023', message = 'A stable message request key is required.';
    end if;
    v_reserve := coalesce(nullif(v_payload->>'reserved_tokens','')::integer, 0);
    v_available_tokens := coalesce(nullif(v_payload->>'available_tokens','')::bigint, 0);
    if v_reserve < 128 or v_reserve > 10000 or v_available_tokens < 0 or v_available_tokens > 500000 then
      raise exception using errcode = '22023', message = 'The conversation token reservation is outside the allowed limits.';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(p_actor_user_id::text, 0));
    update ai_network.ai_bot_conversation_turns t
    set turn_status = 'failed',
        reserved_tokens = 0,
        failure_code = 'interrupted',
        finished_at = now()
    where t.conversation_id = v_conversation_id
      and t.owner_user_id = p_actor_user_id
      and t.turn_status = 'running'
      and t.started_at < now() - interval '2 minutes';
    select * into v_turn
    from ai_network.ai_bot_conversation_turns t
    where t.conversation_id = v_conversation_id
      and t.owner_user_id = p_actor_user_id
      and t.idempotency_key = v_idempotency_key;
    if found then
      if v_turn.user_message <> v_user_message then
        raise exception using errcode = '23505', message = 'The message request key is already used for different content.';
      end if;
      return jsonb_build_object('turn', to_jsonb(v_turn), 'reused', true);
    end if;

    if exists (
      select 1 from ai_network.ai_bot_conversation_turns t
      where t.conversation_id = v_conversation_id and t.owner_user_id = p_actor_user_id
        and t.turn_status = 'running'
    ) then
      raise exception using errcode = '55P03', message = 'This conversation already has a message being processed.';
    end if;
    if (select count(*) from ai_network.ai_bot_conversation_turns t
        where t.conversation_id = v_conversation_id and t.owner_user_id = p_actor_user_id) >= 200 then
      raise exception using errcode = '54000', message = 'This conversation reached its 200-message safety limit.';
    end if;

    select coalesce(sum(t.total_tokens), 0),
           coalesce(sum(t.reserved_tokens) filter (where t.turn_status = 'running'), 0)
      into v_used_tokens, v_reserved_tokens
    from ai_network.ai_bot_conversation_turns t
    where t.owner_user_id = p_actor_user_id
      and t.created_at >= (date_trunc('day', now() at time zone 'UTC') at time zone 'UTC');
    if v_used_tokens + v_reserved_tokens + v_reserve > v_available_tokens then
      raise exception using errcode = '54000', message = 'The remaining daily AI token budget cannot cover this message.';
    end if;

    insert into ai_network.ai_bot_conversation_turns (
      conversation_id, identity_id, owner_user_id, idempotency_key,
      user_message, turn_status, reserved_tokens
    ) values (
      v_conversation_id, v_conversation.identity_id, p_actor_user_id, v_idempotency_key,
      v_user_message, 'running', v_reserve
    )
    returning * into v_turn;
    update ai_network.ai_bot_conversations
    set last_message_at = now(), updated_at = now()
    where conversation_id = v_conversation_id and owner_user_id = p_actor_user_id;
    return jsonb_build_object('turn', to_jsonb(v_turn), 'reused', false);
  end if;

  if v_action in ('complete_turn','fail_turn') then
    if coalesce(v_payload->>'turn_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid conversation turn ID is required.';
    end if;
    v_turn_id := (v_payload->>'turn_id')::uuid;
    select * into v_turn
    from ai_network.ai_bot_conversation_turns t
    where t.turn_id = v_turn_id
      and t.conversation_id = v_conversation_id
      and t.owner_user_id = p_actor_user_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'The conversation turn was not found.';
    end if;
    if v_turn.turn_status <> 'running' then
      return jsonb_build_object('turn', to_jsonb(v_turn), 'reused', true);
    end if;
    v_input_tokens := greatest(0, least(1000000, coalesce(nullif(v_payload->>'input_tokens','')::integer, 0)));
    v_output_tokens := greatest(0, least(1000000, coalesce(nullif(v_payload->>'output_tokens','')::integer, 0)));
    v_total_tokens := greatest(0, least(2000000, coalesce(nullif(v_payload->>'total_tokens','')::integer, v_input_tokens + v_output_tokens)));
    v_provider := nullif(left(trim(coalesce(v_payload->>'provider','')), 40), '');
    v_model := nullif(left(trim(coalesce(v_payload->>'model','')), 180), '');
    if v_action = 'complete_turn' then
      v_assistant_message := trim(coalesce(v_payload->>'assistant_message',''));
      if v_assistant_message = '' or length(v_assistant_message) > 12000 or v_provider <> 'openai' or v_model is null then
        raise exception using errcode = '22023', message = 'A moderated AI response and verified provider metadata are required to complete a turn.';
      end if;
      update ai_network.ai_bot_conversation_turns
      set assistant_message = v_assistant_message,
          turn_status = 'completed',
          provider = v_provider,
          model = v_model,
          input_tokens = v_input_tokens,
          output_tokens = v_output_tokens,
          total_tokens = v_total_tokens,
          reserved_tokens = 0,
          failure_code = null,
          finished_at = now()
      where turn_id = v_turn_id and owner_user_id = p_actor_user_id
      returning * into v_turn;
      update ai_network.ai_bot_conversations
      set last_message_at = now(), updated_at = now()
      where conversation_id = v_conversation_id and owner_user_id = p_actor_user_id;
    else
      v_failure_code := lower(coalesce(v_payload->>'failure_code','provider_error'));
      if v_failure_code !~ '^[a-z0-9_]{1,60}$' then v_failure_code := 'provider_error'; end if;
      update ai_network.ai_bot_conversation_turns
      set turn_status = 'failed',
          provider = v_provider,
          model = v_model,
          input_tokens = v_input_tokens,
          output_tokens = v_output_tokens,
          total_tokens = v_total_tokens,
          reserved_tokens = 0,
          failure_code = v_failure_code,
          finished_at = now()
      where turn_id = v_turn_id and owner_user_id = p_actor_user_id
      returning * into v_turn;
    end if;
    return jsonb_build_object('turn', to_jsonb(v_turn), 'reused', false);
  end if;

  raise exception using errcode = '22023', message = 'Unsupported Minglora AI conversation command.';
end;
$function$;

revoke all on function public.minglora_ai_conversation_command(text, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.minglora_ai_conversation_command(text, uuid, jsonb)
  to service_role;
