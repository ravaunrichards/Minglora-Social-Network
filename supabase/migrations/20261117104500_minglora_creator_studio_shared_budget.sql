begin;

-- Creator Studio uses the same owner/day budget lock as relational AI bot chat.
-- These rows intentionally reference no synthetic bot or AI identity.
create table if not exists ai_network.ai_creator_studio_daily_token_reservations (
 owner_user_id uuid not null references public.profiles(id) on delete restrict,
 usage_date date not null,
 request_id uuid not null,
 job_id text not null check (length(job_id) between 1 and 180),
 reserved_tokens integer not null check (reserved_tokens between 1 and 100000000),
 actual_tokens integer not null default 0 check (actual_tokens between 0 and 100000000),
 status text not null default 'reserved' check (status in ('reserved','settled','released')),
 lease_expires_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key (request_id),
 foreign key (owner_user_id,usage_date)
  references ai_network.ai_bot_daily_token_budgets(owner_user_id,usage_date) on delete restrict,
 check (
  (status='reserved' and lease_expires_at is not null)
  or (status<>'reserved' and lease_expires_at is null)
 )
);

create table if not exists ai_network.ai_creator_studio_usage_events (
 usage_event_id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null references public.profiles(id) on delete restrict,
 usage_date date not null,
 request_id uuid not null unique references ai_network.ai_creator_studio_daily_token_reservations(request_id) on delete restrict,
 job_id text not null check (length(job_id) between 1 and 180),
 provider text not null check (provider='openai'),
 model text not null check (length(model) between 1 and 180),
 input_tokens integer not null default 0 check (input_tokens between 0 and 100000000),
 output_tokens integer not null default 0 check (output_tokens between 0 and 100000000),
 total_tokens integer not null check (total_tokens between 1 and 100000000),
 rejected_or_failed boolean not null default false,
 provider_response_id text,
 provider_request_id text,
 created_at timestamptz not null default now(),
 foreign key (owner_user_id,usage_date)
  references ai_network.ai_bot_daily_token_budgets(owner_user_id,usage_date) on delete restrict,
 check (input_tokens+output_tokens<=total_tokens)
);

create index if not exists ai_creator_studio_reservations_owner_date_status_idx
 on ai_network.ai_creator_studio_daily_token_reservations(owner_user_id,usage_date,status,lease_expires_at);
create unique index if not exists ai_creator_studio_reservations_active_job_uidx
 on ai_network.ai_creator_studio_daily_token_reservations(owner_user_id,job_id)
 where status='reserved';
create index if not exists ai_creator_studio_usage_owner_date_idx
 on ai_network.ai_creator_studio_usage_events(owner_user_id,usage_date);
create index if not exists ai_creator_studio_usage_job_idx
 on ai_network.ai_creator_studio_usage_events(owner_user_id,job_id,created_at desc);

alter table ai_network.ai_creator_studio_daily_token_reservations enable row level security;
alter table ai_network.ai_creator_studio_usage_events enable row level security;
revoke all on table ai_network.ai_creator_studio_daily_token_reservations from public,anon,authenticated;
revoke all on table ai_network.ai_creator_studio_usage_events from public,anon,authenticated;
grant select,insert,update,delete on table ai_network.ai_creator_studio_daily_token_reservations to service_role;
grant select,insert,update,delete on table ai_network.ai_creator_studio_usage_events to service_role;

create or replace function public.minglora_ai_bot_chat_command(p_action text,p_actor_user_id uuid,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path = ''
as $function$
declare
 v_action text := lower(coalesce(p_action,''));
 v_payload jsonb := coalesce(p_payload,'{}'::jsonb);
 v_identity_id uuid; v_identity_owner uuid; v_bot_id uuid; v_request_id uuid; v_conversation_id uuid;
 v_usage_date date; v_message text; v_message_hash text; v_daily_limit integer; v_baseline_tokens integer;
 v_persisted_baseline integer; v_reserve_tokens integer; v_actual_tokens bigint; v_reserved_tokens bigint;
 v_attempt integer; v_now timestamptz := clock_timestamp(); v_request ai_network.ai_bot_chat_requests%rowtype;
 v_conversation ai_network.ai_bot_conversations%rowtype; v_messages jsonb := '[]'::jsonb;
 v_user_message text; v_assistant_message text; v_provider text; v_model text; v_error_code text; v_error_message text;
 v_input_tokens integer; v_output_tokens integer; v_total_tokens integer; v_moderation jsonb; v_usage jsonb;
 v_job_id text; v_creator_reservation ai_network.ai_creator_studio_daily_token_reservations%rowtype;
begin
 if current_user <> 'service_role' then
  raise exception using errcode='42501',message='AI bot conversation commands are restricted to the Minglora server runtime.';
 end if;
 if p_actor_user_id is null or not exists(select 1 from public.profiles p where p.id=p_actor_user_id) then
  raise exception using errcode='42501',message='A valid signed-in Minglora owner is required for bot conversations.';
 end if;
 if jsonb_typeof(v_payload)<>'object' or v_payload::text ~*
  '"(api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential|private[_-]?key)"[[:space:]]*:' then
  raise exception using errcode='22023',message='AI bot conversation payload is invalid or contains credentials.';
 end if;

 if v_action='get_usage' then
  v_usage_date:=coalesce(nullif(v_payload->>'usage_date','')::date,(timezone('UTC',v_now))::date);
  select
   coalesce((select sum(e.total_tokens) from ai_network.ai_bot_usage_events e
    where e.owner_user_id=p_actor_user_id and e.usage_date=v_usage_date),0) +
   coalesce((select sum(e.total_tokens) from ai_network.ai_creator_studio_usage_events e
    where e.owner_user_id=p_actor_user_id and e.usage_date=v_usage_date),0)
   into v_actual_tokens;
  select
   coalesce((select sum(r.reserved_tokens) from ai_network.ai_bot_daily_token_reservations r
    join ai_network.ai_bot_chat_requests q on q.request_id=r.request_id
      and q.attempt_count=r.attempt_count and q.owner_user_id=r.owner_user_id
      and q.status='running' and q.lease_expires_at>v_now
    where r.owner_user_id=p_actor_user_id and r.usage_date=v_usage_date and r.status='reserved'),0) +
   coalesce((select sum(r.reserved_tokens) from ai_network.ai_creator_studio_daily_token_reservations r
    where r.owner_user_id=p_actor_user_id and r.usage_date=v_usage_date and r.status='reserved'
      and r.lease_expires_at>v_now),0)
   into v_reserved_tokens;
  return jsonb_build_object('usage_date',v_usage_date,'tokens_used',v_actual_tokens,'reserved_tokens',v_reserved_tokens);
 end if;


 if v_action='creator_begin_request' then
  if coalesce(v_payload->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
   raise exception using errcode='22023',message='A valid Creator Studio budget request ID is required.';
  end if;
  v_request_id:=(v_payload->>'request_id')::uuid;
  v_job_id:=btrim(coalesce(v_payload->>'job_id',''));
  v_usage_date:=coalesce(nullif(v_payload->>'usage_date','')::date,(timezone('UTC',v_now))::date);
  v_daily_limit:=coalesce(nullif(v_payload->>'daily_token_budget','')::integer,0);
  v_baseline_tokens:=coalesce(nullif(v_payload->>'baseline_used_tokens','')::integer,0);
  v_reserve_tokens:=coalesce(nullif(v_payload->>'reserve_tokens','')::integer,0);
  if char_length(v_job_id) not between 1 and 180
    or v_daily_limit not between 1 and 100000000
    or v_baseline_tokens not between 0 and 100000000
    or v_reserve_tokens not between 1 and 100000000 then
   raise exception using errcode='22023',message='The Creator Studio job or daily token reservation is invalid.';
  end if;

  insert into ai_network.ai_bot_daily_token_budgets(owner_user_id,usage_date,daily_limit_tokens,baseline_used_tokens)
   values(p_actor_user_id,v_usage_date,v_daily_limit,v_baseline_tokens)
   on conflict(owner_user_id,usage_date) do nothing;
  perform 1 from ai_network.ai_bot_daily_token_budgets b
   where b.owner_user_id=p_actor_user_id and b.usage_date=v_usage_date for update;
  update ai_network.ai_bot_daily_token_budgets b set daily_limit_tokens=v_daily_limit,
   baseline_used_tokens=greatest(b.baseline_used_tokens,v_baseline_tokens),updated_at=v_now
   where b.owner_user_id=p_actor_user_id and b.usage_date=v_usage_date;

  update ai_network.ai_creator_studio_daily_token_reservations r set
   status='released',actual_tokens=0,lease_expires_at=null,updated_at=v_now
   where r.owner_user_id=p_actor_user_id and r.status='reserved' and r.lease_expires_at<=v_now;

  select r.* into v_creator_reservation
   from ai_network.ai_creator_studio_daily_token_reservations r
   where r.request_id=v_request_id for update;
  if found then
   if v_creator_reservation.owner_user_id<>p_actor_user_id
     or v_creator_reservation.usage_date<>v_usage_date
     or v_creator_reservation.job_id<>v_job_id then
    raise exception using errcode='23505',message='This Creator Studio request ID was already used for another owner, date or draft.';
   end if;
   if v_creator_reservation.status='reserved' and v_creator_reservation.lease_expires_at>v_now then
    return jsonb_build_object('reused',true,'requestId',v_request_id,'reservedTokens',v_creator_reservation.reserved_tokens);
   end if;
   if v_creator_reservation.status='settled' then
    return jsonb_build_object('completed',true,'reused',true,'requestId',v_request_id,'actualTokens',v_creator_reservation.actual_tokens);
   end if;
   raise exception using errcode='55000',message='This Creator Studio budget request has already been released and cannot be reused.';
  end if;

  select b.baseline_used_tokens into v_persisted_baseline
   from ai_network.ai_bot_daily_token_budgets b
   where b.owner_user_id=p_actor_user_id and b.usage_date=v_usage_date;
  select
   coalesce((select sum(e.total_tokens) from ai_network.ai_bot_usage_events e
    where e.owner_user_id=p_actor_user_id and e.usage_date=v_usage_date),0) +
   coalesce((select sum(e.total_tokens) from ai_network.ai_creator_studio_usage_events e
    where e.owner_user_id=p_actor_user_id and e.usage_date=v_usage_date),0)
   into v_actual_tokens;
  select
   coalesce((select sum(r.reserved_tokens) from ai_network.ai_bot_daily_token_reservations r
    join ai_network.ai_bot_chat_requests q on q.request_id=r.request_id
      and q.attempt_count=r.attempt_count and q.owner_user_id=r.owner_user_id
      and q.status='running' and q.lease_expires_at>v_now
    where r.owner_user_id=p_actor_user_id and r.usage_date=v_usage_date and r.status='reserved'),0) +
   coalesce((select sum(r.reserved_tokens) from ai_network.ai_creator_studio_daily_token_reservations r
    where r.owner_user_id=p_actor_user_id and r.usage_date=v_usage_date and r.status='reserved'
      and r.lease_expires_at>v_now),0)
   into v_reserved_tokens;
  if v_persisted_baseline+v_actual_tokens+v_reserved_tokens+v_reserve_tokens>v_daily_limit then
   raise exception using errcode='54000',message='This Creator Studio request would exceed the remaining shared daily AI token budget. No provider generation request was sent.';
  end if;

  insert into ai_network.ai_creator_studio_daily_token_reservations(
   owner_user_id,usage_date,request_id,job_id,reserved_tokens,status,lease_expires_at,created_at,updated_at
  ) values(p_actor_user_id,v_usage_date,v_request_id,v_job_id,v_reserve_tokens,'reserved',v_now+interval '5 minutes',v_now,v_now);
  return jsonb_build_object('reserved',true,'reused',false,'requestId',v_request_id,'reservedTokens',v_reserve_tokens);
 end if;

 if v_action='creator_complete_request' then
  if coalesce(v_payload->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
   raise exception using errcode='22023',message='A valid Creator Studio budget request ID is required.';
  end if;
  v_request_id:=(v_payload->>'request_id')::uuid;
  select r.usage_date into v_usage_date from ai_network.ai_creator_studio_daily_token_reservations r
   where r.request_id=v_request_id and r.owner_user_id=p_actor_user_id;
  if not found then raise exception using errcode='P0002',message='The Creator Studio budget reservation was not found.'; end if;
  perform 1 from ai_network.ai_bot_daily_token_budgets b
   where b.owner_user_id=p_actor_user_id and b.usage_date=v_usage_date for update;
  select r.* into v_creator_reservation from ai_network.ai_creator_studio_daily_token_reservations r
   where r.request_id=v_request_id and r.owner_user_id=p_actor_user_id for update;
  if not found then raise exception using errcode='P0002',message='The Creator Studio budget reservation was not found.'; end if;
  if v_creator_reservation.status='settled' then
   return jsonb_build_object('completed',true,'reused',true,'requestId',v_request_id,'actualTokens',v_creator_reservation.actual_tokens);
  end if;
  if v_creator_reservation.status<>'reserved' or v_creator_reservation.lease_expires_at<=v_now then
   raise exception using errcode='55000',message='The Creator Studio budget reservation is no longer active.';
  end if;

  v_provider:=lower(coalesce(v_payload->>'provider',''));
  v_model:=left(btrim(coalesce(v_payload->>'model','')),180);
  v_usage:=coalesce(v_payload->'usage','{}'::jsonb);
  if v_provider<>'openai' or char_length(v_model)<1 or jsonb_typeof(v_usage)<>'object' then
   raise exception using errcode='22023',message='A verified OpenAI model and measured Creator Studio usage are required.';
  end if;
  v_input_tokens:=greatest(0,coalesce(nullif(v_usage->>'input_tokens','')::integer,0));
  v_output_tokens:=greatest(0,coalesce(nullif(v_usage->>'output_tokens','')::integer,0));
  v_total_tokens:=greatest(0,coalesce(nullif(v_usage->>'total_tokens','')::integer,0));
  if v_total_tokens<1 or v_input_tokens+v_output_tokens>v_total_tokens then
   raise exception using errcode='22023',message='Valid measured OpenAI token usage is required to settle the Creator Studio reservation.';
  end if;

  insert into ai_network.ai_creator_studio_usage_events(
   owner_user_id,usage_date,request_id,job_id,provider,model,input_tokens,output_tokens,total_tokens,
   rejected_or_failed,provider_response_id,provider_request_id,created_at
  ) values(p_actor_user_id,v_creator_reservation.usage_date,v_request_id,v_creator_reservation.job_id,
   'openai',v_model,v_input_tokens,v_output_tokens,v_total_tokens,false,
   nullif(left(coalesce(v_payload->>'response_id',''),180),''),
   nullif(left(coalesce(v_payload->>'provider_request_id',''),180),''),v_now)
  on conflict(request_id) do nothing;

  update ai_network.ai_creator_studio_daily_token_reservations r set
   status='settled',actual_tokens=v_total_tokens,lease_expires_at=null,updated_at=v_now
   where r.request_id=v_request_id;
  return jsonb_build_object('completed',true,'reused',false,'requestId',v_request_id,
   'actualTokens',v_total_tokens,'reservationOverrun',v_total_tokens>v_creator_reservation.reserved_tokens);
 end if;

 if v_action='creator_fail_request' then
  if coalesce(v_payload->>'request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
   raise exception using errcode='22023',message='A valid Creator Studio budget request ID is required.';
  end if;
  v_request_id:=(v_payload->>'request_id')::uuid;
  select r.usage_date into v_usage_date from ai_network.ai_creator_studio_daily_token_reservations r
   where r.request_id=v_request_id and r.owner_user_id=p_actor_user_id;
  if not found then raise exception using errcode='P0002',message='The Creator Studio budget reservation was not found.'; end if;
  perform 1 from ai_network.ai_bot_daily_token_budgets b
   where b.owner_user_id=p_actor_user_id and b.usage_date=v_usage_date for update;
  select r.* into v_creator_reservation from ai_network.ai_creator_studio_daily_token_reservations r
   where r.request_id=v_request_id and r.owner_user_id=p_actor_user_id for update;
  if not found then raise exception using errcode='P0002',message='The Creator Studio budget reservation was not found.'; end if;
  if v_creator_reservation.status='settled' then
   return jsonb_build_object('failed',false,'completed',true,'billableUsageRecorded',true,'requestId',v_request_id);
  end if;
  if v_creator_reservation.status='released' then
   return jsonb_build_object('failed',true,'reused',true,'billableUsageRecorded',false,'requestId',v_request_id);
  end if;
  if v_creator_reservation.status<>'reserved' then
   raise exception using errcode='55000',message='The Creator Studio budget reservation is no longer active.';
  end if;

  v_error_code:=left(coalesce(v_payload->>'error_code','creator_generation_failed'),80);
  v_provider:=lower(coalesce(v_payload->>'provider',''));
  v_model:=left(btrim(coalesce(v_payload->>'model','')),180);
  v_usage:=coalesce(v_payload->'usage','{}'::jsonb);
  v_input_tokens:=greatest(0,coalesce(nullif(v_usage->>'input_tokens','')::integer,0));
  v_output_tokens:=greatest(0,coalesce(nullif(v_usage->>'output_tokens','')::integer,0));
  v_total_tokens:=greatest(0,coalesce(nullif(v_usage->>'total_tokens','')::integer,0));

  if v_provider='openai' and char_length(v_model)>0 and v_total_tokens>0
    and v_input_tokens+v_output_tokens<=v_total_tokens then
   insert into ai_network.ai_creator_studio_usage_events(
    owner_user_id,usage_date,request_id,job_id,provider,model,input_tokens,output_tokens,total_tokens,
    rejected_or_failed,provider_response_id,provider_request_id,created_at
   ) values(p_actor_user_id,v_creator_reservation.usage_date,v_request_id,v_creator_reservation.job_id,
    'openai',v_model,v_input_tokens,v_output_tokens,v_total_tokens,true,
    nullif(left(coalesce(v_payload->>'response_id',''),180),''),
    nullif(left(coalesce(v_payload->>'provider_request_id',''),180),''),v_now)
   on conflict(request_id) do nothing;
   update ai_network.ai_creator_studio_daily_token_reservations r set
    status='settled',actual_tokens=v_total_tokens,lease_expires_at=null,updated_at=v_now
    where r.request_id=v_request_id;
   return jsonb_build_object('failed',true,'billableUsageRecorded',true,'requestId',v_request_id,'actualTokens',v_total_tokens);
  end if;

  update ai_network.ai_creator_studio_daily_token_reservations r set
   status='released',actual_tokens=0,lease_expires_at=null,updated_at=v_now
   where r.request_id=v_request_id;
  return jsonb_build_object('failed',true,'billableUsageRecorded',false,'requestId',v_request_id);
 end if;

 if coalesce(v_payload->>'identity_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 or coalesce(v_payload->>'bot_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
  raise exception using errcode='22023',message='A valid AI identity and bot ID are required.';
 end if;
 v_identity_id:=(v_payload->>'identity_id')::uuid; v_bot_id:=(v_payload->>'bot_id')::uuid;
 select i.owner_user_id into v_identity_owner from ai_network.ai_identities i where i.identity_id=v_identity_id for share;
 if v_identity_owner is null or v_identity_owner<>p_actor_user_id then
  raise exception using errcode='42501',message='This AI identity does not belong to the signed-in Minglora owner.';
 end if;

 if v_action='get_conversation' then
  if nullif(v_payload->>'conversation_id','') is not null then
   v_conversation_id:=(v_payload->>'conversation_id')::uuid;
   select c.* into v_conversation from ai_network.ai_bot_conversations c
    where c.conversation_id=v_conversation_id and c.owner_user_id=p_actor_user_id and c.bot_id=v_bot_id and c.identity_id=v_identity_id;
  else
   select c.* into v_conversation from ai_network.ai_bot_conversations c
    where c.owner_user_id=p_actor_user_id and c.bot_id=v_bot_id and c.identity_id=v_identity_id and c.status='open'
    order by c.updated_at desc limit 1;
  end if;
  if not found then
   if nullif(v_payload->>'conversation_id','') is not null then
    raise exception using errcode='P0002',message='The requested AI bot conversation was not found.';
   end if;
   return jsonb_build_object('conversation',null,'messages','[]'::jsonb);
  end if;
  v_conversation_id:=v_conversation.conversation_id;
  select coalesce(jsonb_agg(q.item order by q.sequence_no),'[]'::jsonb) into v_messages
  from (
   select jsonb_build_object(
    'id',m.message_id,'ownerId',m.owner_user_id,'botId',m.bot_id,'identityId',m.identity_id,
    'conversationId',m.conversation_id,'requestId',m.request_id,'sequenceNo',m.sequence_no,'role',m.role,'content',m.content,
    'provider',m.provider,'providerModel',m.provider_model,'providerResponseId',m.provider_response_id,
    'providerRequestId',m.provider_request_id,'providerUsage',m.provider_usage,'moderation',m.moderation,
    'aiDisclosureRequired',m.ai_disclosure_required,'humanReviewRequired',m.human_review_required,
    'externalActionsTaken',m.external_actions_taken,'createdAt',m.created_at
   ) as item,m.sequence_no
   from ai_network.ai_bot_conversation_messages m where m.conversation_id=v_conversation_id and m.owner_user_id=p_actor_user_id
   order by m.sequence_no desc limit 20
  ) q;
  return jsonb_build_object('conversation',jsonb_build_object(
   'id',v_conversation.conversation_id,'ownerId',v_conversation.owner_user_id,'botId',v_conversation.bot_id,
   'identityId',v_conversation.identity_id,'status',v_conversation.status,'messageCount',v_conversation.message_count,
   'lastMessageAt',v_conversation.last_message_at,'createdAt',v_conversation.created_at,'updatedAt',v_conversation.updated_at
  ),'messages',v_messages);
 end if;

 if v_action='begin_request' then
  v_request_id:=nullif(v_payload->>'request_id','')::uuid; v_message:=btrim(coalesce(v_payload->>'message',''));
  v_message_hash:=lower(coalesce(v_payload->>'message_hash','')); v_conversation_id:=nullif(v_payload->>'conversation_id','')::uuid;
  v_usage_date:=coalesce(nullif(v_payload->>'usage_date','')::date,(timezone('UTC',v_now))::date);
  v_daily_limit:=coalesce(nullif(v_payload->>'daily_token_budget','')::integer,0);
  v_baseline_tokens:=coalesce(nullif(v_payload->>'baseline_used_tokens','')::integer,0);
  v_reserve_tokens:=coalesce(nullif(v_payload->>'reserve_tokens','')::integer,0);
  if v_request_id is null or char_length(v_message) not between 1 and 4000 or v_message_hash !~ '^[0-9a-f]{64}$' then
   raise exception using errcode='22023',message='A valid request ID, message and SHA-256 message hash are required.';
  end if;
  if v_daily_limit not between 1 and 100000000 or v_baseline_tokens not between 0 and 100000000 or v_reserve_tokens not between 1 and 100000000 then
   raise exception using errcode='22023',message='The daily token budget or reservation is invalid.';
  end if;
  if v_conversation_id is not null then
   select c.* into v_conversation from ai_network.ai_bot_conversations c
    where c.conversation_id=v_conversation_id and c.owner_user_id=p_actor_user_id and c.bot_id=v_bot_id
      and c.identity_id=v_identity_id and c.status='open' for update;
   if not found then raise exception using errcode='P0002',message='The selected AI bot conversation is unavailable.'; end if;
  end if;

  select r.* into v_request from ai_network.ai_bot_chat_requests r where r.request_id=v_request_id for update;
  if found then
   if v_request.owner_user_id<>p_actor_user_id or v_request.bot_id<>v_bot_id or v_request.identity_id<>v_identity_id
     or v_request.message_hash<>v_message_hash
     or (v_conversation_id is distinct from v_request.requested_conversation_id and v_conversation_id is distinct from v_request.conversation_id) then
    raise exception using errcode='23505',message='This request ID was already used for a different owner, bot, identity or message.';
   end if;
   if v_request.status='completed' then
    return jsonb_build_object('reused',true,'requestId',v_request_id,'attemptCount',v_request.attempt_count,'conversationId',v_request.conversation_id);
   end if;
   if v_request.status='running' and v_request.lease_expires_at>v_now then
    raise exception using errcode='55000',message='This chat request is already being processed. Wait for it to finish before retrying.';
   end if;
   update ai_network.ai_bot_daily_token_reservations r set status='released',updated_at=v_now
    where r.request_id=v_request_id and r.attempt_count=v_request.attempt_count and r.status='reserved';
   v_attempt:=v_request.attempt_count+1;
   update ai_network.ai_bot_chat_requests r set status='running',attempt_count=v_attempt,started_at=v_now,
    lease_expires_at=v_now+interval '5 minutes',completed_at=null,error_code='',error_message='',updated_at=v_now
    where r.request_id=v_request_id;
  else
   v_attempt:=1;
   insert into ai_network.ai_bot_chat_requests(
    request_id,owner_user_id,bot_id,identity_id,requested_conversation_id,conversation_id,message_hash,
    status,attempt_count,started_at,lease_expires_at,created_at,updated_at
   ) values (
    v_request_id,p_actor_user_id,v_bot_id,v_identity_id,v_conversation_id,v_conversation_id,v_message_hash,
    'running',v_attempt,v_now,v_now+interval '5 minutes',v_now,v_now
   );
  end if;

  insert into ai_network.ai_bot_daily_token_budgets(owner_user_id,usage_date,daily_limit_tokens,baseline_used_tokens)
   values(p_actor_user_id,v_usage_date,v_daily_limit,v_baseline_tokens)
   on conflict(owner_user_id,usage_date) do nothing;
  perform 1 from ai_network.ai_bot_daily_token_budgets b where b.owner_user_id=p_actor_user_id and b.usage_date=v_usage_date for update;
  update ai_network.ai_bot_daily_token_budgets b set daily_limit_tokens=v_daily_limit,
   baseline_used_tokens=greatest(b.baseline_used_tokens,v_baseline_tokens),updated_at=v_now
   where b.owner_user_id=p_actor_user_id and b.usage_date=v_usage_date;
  select b.baseline_used_tokens into v_persisted_baseline from ai_network.ai_bot_daily_token_budgets b
   where b.owner_user_id=p_actor_user_id and b.usage_date=v_usage_date;
  select
   coalesce((select sum(e.total_tokens) from ai_network.ai_bot_usage_events e
    where e.owner_user_id=p_actor_user_id and e.usage_date=v_usage_date),0) +
   coalesce((select sum(e.total_tokens) from ai_network.ai_creator_studio_usage_events e
    where e.owner_user_id=p_actor_user_id and e.usage_date=v_usage_date),0)
   into v_actual_tokens;
  select
   coalesce((select sum(r.reserved_tokens) from ai_network.ai_bot_daily_token_reservations r
    join ai_network.ai_bot_chat_requests q on q.request_id=r.request_id
      and q.attempt_count=r.attempt_count and q.owner_user_id=r.owner_user_id
      and q.status='running' and q.lease_expires_at>v_now
    where r.owner_user_id=p_actor_user_id and r.usage_date=v_usage_date and r.status='reserved'),0) +
   coalesce((select sum(r.reserved_tokens) from ai_network.ai_creator_studio_daily_token_reservations r
    where r.owner_user_id=p_actor_user_id and r.usage_date=v_usage_date and r.status='reserved'
      and r.lease_expires_at>v_now),0)
   into v_reserved_tokens;
  if v_persisted_baseline+v_actual_tokens+v_reserved_tokens+v_reserve_tokens>v_daily_limit then
   raise exception using errcode='54000',message='This conversation would exceed the remaining daily AI token budget. No provider generation request was sent.';
  end if;
  insert into ai_network.ai_bot_daily_token_reservations(
   owner_user_id,usage_date,request_id,attempt_count,bot_id,identity_id,reserved_tokens,status,created_at,updated_at
  ) values(p_actor_user_id,v_usage_date,v_request_id,v_attempt,v_bot_id,v_identity_id,v_reserve_tokens,'reserved',v_now,v_now);
  return jsonb_build_object('reused',false,'requestId',v_request_id,'attemptCount',v_attempt,'conversationId',v_conversation_id);
 end if;

 if v_action='complete_request' then
  v_request_id:=nullif(v_payload->>'request_id','')::uuid; v_attempt:=coalesce(nullif(v_payload->>'attempt_count','')::integer,0);
  select r.* into v_request from ai_network.ai_bot_chat_requests r
   where r.request_id=v_request_id and r.owner_user_id=p_actor_user_id and r.bot_id=v_bot_id and r.identity_id=v_identity_id for update;
  if not found then raise exception using errcode='P0002',message='AI bot chat request was not found.'; end if;
  if v_request.status='completed' then
   return jsonb_build_object('completed',true,'reused',true,'requestId',v_request_id,'attemptCount',v_request.attempt_count,'conversationId',v_request.conversation_id);
  end if;
  if v_request.status<>'running' or v_request.attempt_count<>v_attempt or v_request.lease_expires_at<=v_now then
   raise exception using errcode='55000',message='The AI bot chat request is no longer running under this lease.';
  end if;
  v_user_message:=btrim(coalesce(v_payload->>'user_message','')); v_assistant_message:=btrim(coalesce(v_payload->>'assistant_message',''));
  v_provider:=lower(coalesce(v_payload->>'provider','')); v_model:=left(btrim(coalesce(v_payload->>'model','')),180);
  v_moderation:=coalesce(v_payload->'moderation','{}'::jsonb); v_usage:=coalesce(v_payload->'usage','{}'::jsonb);
  if char_length(v_user_message) not between 1 and 4000 or char_length(v_assistant_message) not between 1 and 8000
    or v_provider<>'openai' or char_length(v_model)<1 or jsonb_typeof(v_moderation)<>'object'
    or coalesce(v_moderation->>'flagged','true')<>'false' or jsonb_typeof(v_usage)<>'object' then
   raise exception using errcode='22023',message='Only a complete, moderated OpenAI bot conversation exchange can be saved.';
  end if;
  v_input_tokens:=greatest(0,coalesce(nullif(v_usage->>'input_tokens','')::integer,0));
  v_output_tokens:=greatest(0,coalesce(nullif(v_usage->>'output_tokens','')::integer,0));
  v_total_tokens:=greatest(0,coalesce(nullif(v_usage->>'total_tokens','')::integer,0));
  if v_total_tokens<1 or v_input_tokens+v_output_tokens>v_total_tokens then
   raise exception using errcode='22023',message='Verified provider token usage is required to save this exchange.';
  end if;
  if v_request.conversation_id is null then
   insert into ai_network.ai_bot_conversations(owner_user_id,bot_id,identity_id,status,message_count,created_at,updated_at)
    values(p_actor_user_id,v_bot_id,v_identity_id,'open',0,v_now,v_now) returning * into v_conversation;
   v_conversation_id:=v_conversation.conversation_id;
  else
   select c.* into v_conversation from ai_network.ai_bot_conversations c
    where c.conversation_id=v_request.conversation_id and c.owner_user_id=p_actor_user_id and c.bot_id=v_bot_id
      and c.identity_id=v_identity_id and c.status='open' for update;
   if not found then raise exception using errcode='P0002',message='The AI bot conversation is no longer available.'; end if;
   v_conversation_id:=v_conversation.conversation_id;
  end if;
  insert into ai_network.ai_bot_conversation_messages(
   conversation_id,owner_user_id,bot_id,identity_id,request_id,sequence_no,role,content,provider,provider_model,
   provider_response_id,provider_request_id,provider_usage,moderation,ai_disclosure_required,
   human_review_required,external_actions_taken,created_at
  ) values
   (v_conversation_id,p_actor_user_id,v_bot_id,v_identity_id,v_request_id,v_conversation.message_count::bigint+1,'user',v_user_message,null,null,null,null,'{}'::jsonb,'{}'::jsonb,false,false,false,v_now),
   (v_conversation_id,p_actor_user_id,v_bot_id,v_identity_id,v_request_id,v_conversation.message_count::bigint+2,'assistant',v_assistant_message,'openai',v_model,
    nullif(left(coalesce(v_payload->>'response_id',''),180),''),nullif(left(coalesce(v_payload->>'provider_request_id',''),180),''),
    v_usage,v_moderation,true,true,false,v_now);
  update ai_network.ai_bot_conversations c set message_count=c.message_count+2,last_message_at=v_now,updated_at=v_now
   where c.conversation_id=v_conversation_id;
  select r.usage_date into v_usage_date from ai_network.ai_bot_daily_token_reservations r
   where r.request_id=v_request_id and r.attempt_count=v_attempt;
  if v_usage_date is null then raise exception using errcode='55000',message='The AI bot chat budget reservation is missing.'; end if;
  perform 1 from ai_network.ai_bot_daily_token_budgets b
   where b.owner_user_id=p_actor_user_id and b.usage_date=v_usage_date for update;
  insert into ai_network.ai_bot_usage_events(
   owner_user_id,bot_id,identity_id,conversation_id,request_id,attempt_count,usage_date,operation,provider,model,
   input_tokens,output_tokens,total_tokens,rejected_or_failed,created_at
  ) values(p_actor_user_id,v_bot_id,v_identity_id,v_conversation_id,v_request_id,v_attempt,v_usage_date,
   'bot_chat','openai',v_model,v_input_tokens,v_output_tokens,v_total_tokens,false,v_now)
   on conflict(request_id,attempt_count) do nothing;
  update ai_network.ai_bot_daily_token_reservations r set status='settled',actual_tokens=v_total_tokens,updated_at=v_now
   where r.request_id=v_request_id and r.attempt_count=v_attempt;
  update ai_network.ai_bot_chat_requests r set conversation_id=v_conversation_id,status='completed',
   completed_at=v_now,lease_expires_at=null,updated_at=v_now where r.request_id=v_request_id;
  insert into ai_network.ai_identity_audit_logs(identity_id,actor_type,actor_user_id,action,metadata)
   values(v_identity_id,'human_user',p_actor_user_id,'bot_chat_exchange_completed',
    jsonb_build_object('conversation_id',v_conversation_id,'request_id',v_request_id,'attempt_count',v_attempt,'total_tokens',v_total_tokens));
  return jsonb_build_object('completed',true,'reused',false,'requestId',v_request_id,'attemptCount',v_attempt,'conversationId',v_conversation_id);
 end if;

 if v_action='fail_request' then
  v_request_id:=nullif(v_payload->>'request_id','')::uuid; v_attempt:=coalesce(nullif(v_payload->>'attempt_count','')::integer,0);
  select r.* into v_request from ai_network.ai_bot_chat_requests r
   where r.request_id=v_request_id and r.owner_user_id=p_actor_user_id and r.bot_id=v_bot_id and r.identity_id=v_identity_id for update;
  if not found then raise exception using errcode='P0002',message='AI bot chat request was not found.'; end if;
  if v_request.status='completed' then return jsonb_build_object('failed',false,'completed',true,'conversationId',v_request.conversation_id); end if;
  if v_request.status<>'running' or v_request.attempt_count<>v_attempt then
   raise exception using errcode='55000',message='The AI bot chat request is no longer running under this attempt.';
  end if;
  v_error_code:=left(coalesce(v_payload->>'error_code','chat_failed'),80);
  v_error_message:=left(coalesce(v_payload->>'reason','The AI bot could not complete this reply.'),360);
  v_provider:=lower(coalesce(v_payload->>'provider','')); v_model:=left(btrim(coalesce(v_payload->>'model','')),180);
  v_usage:=coalesce(v_payload->'usage','{}'::jsonb);
  v_input_tokens:=greatest(0,coalesce(nullif(v_usage->>'input_tokens','')::integer,0));
  v_output_tokens:=greatest(0,coalesce(nullif(v_usage->>'output_tokens','')::integer,0));
  v_total_tokens:=greatest(0,coalesce(nullif(v_usage->>'total_tokens','')::integer,0));
  select r.usage_date into v_usage_date from ai_network.ai_bot_daily_token_reservations r
   where r.request_id=v_request_id and r.attempt_count=v_attempt;
  if v_usage_date is null then raise exception using errcode='55000',message='The AI bot chat budget reservation is missing.'; end if;
  perform 1 from ai_network.ai_bot_daily_token_budgets b
   where b.owner_user_id=p_actor_user_id and b.usage_date=v_usage_date for update;
  if v_provider='openai' and v_total_tokens>0 and char_length(v_model)>0 then
   insert into ai_network.ai_bot_usage_events(
    owner_user_id,bot_id,identity_id,conversation_id,request_id,attempt_count,usage_date,operation,provider,model,
    input_tokens,output_tokens,total_tokens,rejected_or_failed,created_at
   ) values(p_actor_user_id,v_bot_id,v_identity_id,v_request.conversation_id,v_request_id,v_attempt,v_usage_date,
    'bot_chat','openai',v_model,v_input_tokens,v_output_tokens,v_total_tokens,true,v_now)
    on conflict(request_id,attempt_count) do nothing;
  end if;
  update ai_network.ai_bot_daily_token_reservations r set
   status=case when v_provider='openai' and v_total_tokens>0 and char_length(v_model)>0 then 'settled' else 'released' end,
   actual_tokens=case when v_provider='openai' and v_total_tokens>0 and char_length(v_model)>0 then v_total_tokens else 0 end,
   updated_at=v_now where r.request_id=v_request_id and r.attempt_count=v_attempt;
  update ai_network.ai_bot_chat_requests r set status='failed',completed_at=v_now,lease_expires_at=null,
   error_code=v_error_code,error_message=v_error_message,updated_at=v_now where r.request_id=v_request_id;
  insert into ai_network.ai_identity_audit_logs(identity_id,actor_type,actor_user_id,action,metadata)
   values(v_identity_id,'human_user',p_actor_user_id,'bot_chat_request_failed',
    jsonb_build_object('request_id',v_request_id,'attempt_count',v_attempt,'error_code',v_error_code,
     'billable_tokens',case when v_provider='openai' then v_total_tokens else 0 end));
  return jsonb_build_object('failed',true,'requestId',v_request_id,'attemptCount',v_attempt,
   'billableUsageRecorded',(v_provider='openai' and v_total_tokens>0));
 end if;
 raise exception using errcode='22023',message='Unsupported AI bot chat command.';
end;
$function$;

revoke all on function public.minglora_ai_bot_chat_command(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.minglora_ai_bot_chat_command(text,uuid,jsonb) to service_role;

commit;
