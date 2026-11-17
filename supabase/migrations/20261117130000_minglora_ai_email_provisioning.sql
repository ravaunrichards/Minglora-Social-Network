-- Minglora AI mailboxes: virtual per-identity inboxes and Resend delivery.
-- Additive to the existing ai_network.ai_emails registry. No Supabase Auth users are created.
-- This migration is intentionally not applied to production from this change.

alter table ai_network.ai_emails
  add column if not exists mailbox_enabled boolean not null default false,
  add column if not exists mailbox_domain text,
  add column if not exists provisioned_at timestamptz,
  add column if not exists last_received_at timestamptz,
  add column if not exists last_sent_at timestamptz;

create table if not exists ai_network.ai_email_messages (
  message_id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references ai_network.ai_identities(identity_id) on delete cascade,
  email_id uuid not null references ai_network.ai_emails(email_id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  status text not null check (status in ('queued','sent','failed','received')),
  provider text not null default 'resend' check (provider in ('resend')),
  client_idempotency_key text,
  provider_email_id text,
  provider_event_id text,
  provider_message_id text,
  from_address text not null,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  bcc_addresses text[] not null default '{}',
  subject text not null default '',
  text_body text not null default '',
  html_body text not null default '',
  attachments jsonb not null default '[]'::jsonb,
  last_error text,
  read_at timestamptz,
  sent_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_email_messages_subject_length check (length(subject) <= 200),
  constraint ai_email_messages_body_length check (length(text_body) <= 24000 and length(html_body) <= 24000),
  constraint ai_email_messages_addresses_count check (
    cardinality(to_addresses) <= 20 and cardinality(cc_addresses) <= 20 and cardinality(bcc_addresses) <= 20
  ),
  constraint ai_email_messages_attachments_array check (jsonb_typeof(attachments) = 'array')
);

create unique index if not exists ai_email_messages_idempotency_uq
  on ai_network.ai_email_messages(email_id, client_idempotency_key)
  where client_idempotency_key is not null;
create unique index if not exists ai_email_messages_provider_inbound_uq
  on ai_network.ai_email_messages(email_id, provider, provider_email_id)
  where provider_email_id is not null and direction = 'inbound';
create index if not exists ai_email_messages_inbox_idx
  on ai_network.ai_email_messages(identity_id, email_id, created_at desc);
create index if not exists ai_email_messages_unread_idx
  on ai_network.ai_email_messages(identity_id, email_id, created_at desc)
  where read_at is null and direction = 'inbound';

alter table ai_network.ai_email_messages enable row level security;
revoke all on ai_network.ai_email_messages from public, anon, authenticated;
grant usage on schema ai_network to service_role;
grant select, insert, update on ai_network.ai_emails to service_role;
grant select, insert, update on ai_network.ai_email_messages to service_role;

create or replace function public.minglora_ai_email_command(
  p_action text,
  p_actor_user_id uuid default null,
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
  v_email_id uuid;
  v_message_id uuid;
  v_provider_email_id text;
  v_domain text;
  v_username text;
  v_address text;
  v_existing jsonb;
  v_result jsonb;
  v_to_address text;
  v_rows integer := 0;
  v_inserted_count integer := 0;
  v_identity_owner boolean := false;
  v_limit integer;
  v_offset integer;
  v_recipient_count integer;
  v_subject text;
  v_text_body text;
  v_email ai_network.ai_emails%rowtype;
  v_message ai_network.ai_email_messages%rowtype;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI email commands are restricted to the Minglora server runtime.';
  end if;
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'AI email command payload must be a JSON object.';
  end if;

  -- This command is callable without a human actor only after the Render runtime
  -- has verified the Resend Svix signature and fetched the authoritative inbound message.
  if v_action = 'ingest' then
    if p_actor_user_id is not null
       or coalesce(v_payload->>'verified_webhook', 'false') <> 'true'
       or coalesce(v_payload->>'provider', '') <> 'resend'
       or coalesce(v_payload->>'provider_email_id', '') = ''
       or jsonb_typeof(v_payload->'to_addresses') <> 'array' then
      raise exception using errcode = '42501', message = 'Verified Resend inbound email data is required.';
    end if;
    if length(coalesce(v_payload->>'text_body','')) > 24000
       or length(coalesce(v_payload->>'html_body','')) > 24000
       or length(coalesce(v_payload->>'subject','')) > 200 then
      raise exception using errcode = '22023', message = 'Inbound email exceeds the supported content limits.';
    end if;

    for v_to_address in
      select lower(trim(value)) from jsonb_array_elements_text(v_payload->'to_addresses') as item(value)
    loop
      if v_to_address !~* '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[a-z]{2,63}$' then
        continue;
      end if;
      select e.* into v_email
      from ai_network.ai_emails e
      where lower(e.email_address) = v_to_address
        and e.mailbox_enabled = true
        and e.provisioning_status = 'provisioned'
        and e.email_status = 'active'
        and e.email_provider = 'resend'
      limit 1;
      if not found then
        continue;
      end if;

      insert into ai_network.ai_email_messages (
        identity_id, email_id, direction, status, provider,
        provider_email_id, provider_event_id, provider_message_id,
        from_address, to_addresses, cc_addresses, bcc_addresses,
        subject, text_body, html_body, attachments, received_at
      )
      values (
        v_email.identity_id, v_email.email_id, 'inbound', 'received', 'resend',
        left(v_payload->>'provider_email_id', 160),
        nullif(left(coalesce(v_payload->>'provider_event_id',''), 180), ''),
        nullif(left(coalesce(v_payload->>'provider_message_id',''), 320), ''),
        left(coalesce(v_payload->>'from_address',''), 320),
        array(select jsonb_array_elements_text(v_payload->'to_addresses') limit 20),
        array(select jsonb_array_elements_text(coalesce(v_payload->'cc_addresses','[]'::jsonb)) limit 20),
        array(select jsonb_array_elements_text(coalesce(v_payload->'bcc_addresses','[]'::jsonb)) limit 20),
        left(coalesce(v_payload->>'subject',''), 200),
        left(coalesce(v_payload->>'text_body',''), 24000),
        left(coalesce(v_payload->>'html_body',''), 24000),
        case when jsonb_typeof(v_payload->'attachments')='array' then
          (select coalesce(jsonb_agg(value),'[]'::jsonb) from jsonb_array_elements(v_payload->'attachments') with ordinality where ordinality <= 20)
        else '[]'::jsonb end,
        coalesce(nullif(v_payload->>'received_at','')::timestamptz, now())
      )
      on conflict (email_id, provider, provider_email_id)
        where provider_email_id is not null and direction = 'inbound'
      do nothing;
      get diagnostics v_rows = row_count;
      if v_rows > 0 then
        update ai_network.ai_emails
        set last_received_at = now(), updated_at = now()
        where email_id = v_email.email_id;
        v_inserted_count := v_inserted_count + 1;
      end if;
    end loop;
    return jsonb_build_object('accepted', true, 'stored_count', v_inserted_count);
  end if;

  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora owner is required.';
  end if;
  if coalesce(v_payload->>'identity_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception using errcode = '22023', message = 'A valid AI identity ID is required.';
  end if;
  v_identity_id := (v_payload->>'identity_id')::uuid;

  if v_action = 'provision' then
    v_domain := lower(trim(coalesce(v_payload->>'domain','')));
    if coalesce(v_payload->>'domain_verified','false') <> 'true'
       or v_domain !~ '^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' then
      raise exception using errcode = '42501', message = 'A Resend-verified sending and receiving domain is required before mailbox provisioning.';
    end if;

    select n.username into v_username
    from ai_network.ai_identities i
    join ai_network.ai_names n on n.identity_id=i.identity_id
    where i.identity_id=v_identity_id and i.owner_user_id=p_actor_user_id
      and i.status in ('created','under_review','approved','active');
    if not found then
      raise exception using errcode = 'P0002', message = 'AI identity was not found or is not eligible for email provisioning.';
    end if;

    select e.* into v_email
    from ai_network.ai_emails e
    where e.identity_id=v_identity_id
      and e.email_provider='resend'
      and e.mailbox_domain=v_domain
      and e.mailbox_enabled=true
    order by e.created_at
    limit 1;
    if found then
      return jsonb_build_object(
        'email_id',v_email.email_id,'identity_id',v_email.identity_id,
        'email_address',v_email.email_address,'email_provider',v_email.email_provider,
        'mailbox_domain',v_email.mailbox_domain,'mailbox_enabled',v_email.mailbox_enabled,
        'provisioning_status',v_email.provisioning_status,'verification_status',v_email.verification_status,
        'email_status',v_email.email_status,'provisioned_at',v_email.provisioned_at,'reused',true
      );
    end if;

    v_address := lower(regexp_replace(coalesce(v_username,'ai'), '[^a-zA-Z0-9._-]', '', 'g'));
    v_address := left(v_address, 43) || '-' || left(replace(v_identity_id::text,'-',''), 12) || '@' || v_domain;
    insert into ai_network.ai_emails (
      identity_id,email_address,email_type,is_primary,verification_status,email_provider,
      provisioning_status,management_reference,email_status,mailbox_enabled,mailbox_domain,provisioned_at
    )
    values (
      v_identity_id,v_address,'work',
      not exists(select 1 from ai_network.ai_emails where identity_id=v_identity_id and is_primary),
      'unverified','resend','provisioned','resend-domain:'||v_domain,'active',true,v_domain,now()
    )
    returning * into v_email;

    insert into ai_network.ai_identity_audit_logs (
      identity_id,actor_type,actor_user_id,action,metadata
    ) values (
      v_identity_id,'human_user',p_actor_user_id,'ai_email_mailbox_provisioned',
      jsonb_build_object('email_id',v_email.email_id,'email_address',v_email.email_address,'provider','resend','domain',v_domain)
    );

    return jsonb_build_object(
      'email_id',v_email.email_id,'identity_id',v_email.identity_id,
      'email_address',v_email.email_address,'email_provider',v_email.email_provider,
      'mailbox_domain',v_email.mailbox_domain,'mailbox_enabled',v_email.mailbox_enabled,
      'provisioning_status',v_email.provisioning_status,'verification_status',v_email.verification_status,
      'email_status',v_email.email_status,'provisioned_at',v_email.provisioned_at,'reused',false
    );
  end if;

  select exists (
    select 1 from ai_network.ai_identities i
    where i.identity_id=v_identity_id and i.owner_user_id=p_actor_user_id
  ) into v_identity_owner;
  if not v_identity_owner then
    raise exception using errcode = 'P0002', message = 'AI identity was not found for this Minglora owner.';
  end if;

  if v_action = 'list' then
    return jsonb_build_object(
      'mailboxes',coalesce((
        select jsonb_agg(jsonb_build_object(
          'email_id',e.email_id,'email_address',e.email_address,'email_type',e.email_type,
          'is_primary',e.is_primary,'verification_status',e.verification_status,
          'email_provider',e.email_provider,'provisioning_status',e.provisioning_status,
          'email_status',e.email_status,'mailbox_enabled',e.mailbox_enabled,
          'mailbox_domain',e.mailbox_domain,'provisioned_at',e.provisioned_at,
          'last_received_at',e.last_received_at,'last_sent_at',e.last_sent_at
        ) order by e.mailbox_enabled desc,e.is_primary desc,e.created_at)
        from ai_network.ai_emails e where e.identity_id=v_identity_id
      ),'[]'::jsonb)
    );
  end if;

  if v_action = 'inbox' then
    v_email_id := nullif(v_payload->>'email_id','')::uuid;
    v_limit := least(greatest(coalesce(nullif(v_payload->>'limit','')::integer,30),1),50);
    v_offset := greatest(coalesce(nullif(v_payload->>'offset','')::integer,0),0);
    if v_email_id is null or not exists (
      select 1 from ai_network.ai_emails e
      where e.email_id=v_email_id and e.identity_id=v_identity_id
        and e.mailbox_enabled and e.provisioning_status='provisioned' and e.email_status='active'
    ) then
      raise exception using errcode = 'P0002', message = 'An active AI mailbox was not found for this identity.';
    end if;
    return jsonb_build_object(
      'email_id',v_email_id,
      'messages',coalesce((
        select jsonb_agg(to_jsonb(m) order by m.created_at desc)
        from (
          select * from ai_network.ai_email_messages
          where identity_id=v_identity_id and email_id=v_email_id
          order by created_at desc limit v_limit offset v_offset
        ) m
      ),'[]'::jsonb),
      'unread_count',(select count(*) from ai_network.ai_email_messages
        where identity_id=v_identity_id and email_id=v_email_id and direction='inbound' and read_at is null)
    );
  end if;

  if v_action = 'send_prepare' then
    v_email_id := nullif(v_payload->>'email_id','')::uuid;
    v_subject := trim(coalesce(v_payload->>'subject',''));
    v_text_body := coalesce(v_payload->>'text_body','');
    if jsonb_typeof(v_payload->'to_addresses') <> 'array' then
      raise exception using errcode = '22023', message = 'Email recipients must be supplied as an array.';
    end if;
    v_recipient_count := jsonb_array_length(v_payload->'to_addresses');
    if v_recipient_count < 1 or v_recipient_count > 10
       or exists(select 1 from jsonb_array_elements_text(v_payload->'to_addresses') r(value)
         where lower(trim(value)) !~* '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[a-z]{2,63}$') then
      raise exception using errcode = '22023', message = 'Enter between one and ten valid email recipients.';
    end if;
    if v_subject = '' or length(v_subject)>200 or length(v_text_body)<1 or length(v_text_body)>24000 then
      raise exception using errcode = '22023', message = 'Email subject and message are required; message text must be at most 24,000 characters.';
    end if;
    if v_email_id is null then
      raise exception using errcode = '22023', message = 'A valid AI mailbox email ID is required.';
    end if;
    select e.* into v_email
    from ai_network.ai_emails e
    where e.email_id=v_email_id and e.identity_id=v_identity_id
      and e.mailbox_enabled and e.provisioning_status='provisioned'
      and e.email_status='active' and e.email_provider='resend';
    if not found then
      raise exception using errcode = 'P0002', message = 'The AI mailbox is not active and provisioned.';
    end if;

    v_message_id := null;
    select m.* into v_message
    from ai_network.ai_email_messages m
    where m.email_id=v_email_id
      and m.client_idempotency_key=left(coalesce(v_payload->>'idempotency_key',''),180)
    limit 1;
    if found then
      if v_message.status <> 'sent' then
        update ai_network.ai_email_messages set status='queued',last_error=null,updated_at=now()
        where message_id=v_message.message_id returning * into v_message;
      end if;
      return jsonb_build_object(
        'message_id',v_message.message_id,'email_id',v_message.email_id,
        'from_address',v_message.from_address,'to_addresses',to_jsonb(v_message.to_addresses),
        'subject',v_message.subject,'text_body',v_message.text_body,
        'status',v_message.status,'provider_email_id',v_message.provider_email_id,
        'reused',true
      );
    end if;

    if length(trim(coalesce(v_payload->>'idempotency_key',''))) < 16 then
      raise exception using errcode = '22023', message = 'A stable email idempotency key is required.';
    end if;
    insert into ai_network.ai_email_messages (
      identity_id,email_id,direction,status,provider,client_idempotency_key,
      from_address,to_addresses,subject,text_body
    )
    values (
      v_identity_id,v_email_id,'outbound','queued','resend',
      left(trim(v_payload->>'idempotency_key'),180),v_email.email_address,
      array(select lower(trim(value)) from jsonb_array_elements_text(v_payload->'to_addresses') as item(value)),
      v_subject,v_text_body
    )
    returning * into v_message;
    return jsonb_build_object(
      'message_id',v_message.message_id,'email_id',v_message.email_id,
      'from_address',v_message.from_address,'to_addresses',to_jsonb(v_message.to_addresses),
      'subject',v_message.subject,'text_body',v_message.text_body,
      'status',v_message.status,'provider_email_id',v_message.provider_email_id,'reused',false
    );
  end if;

  if v_action in ('send_complete','send_fail') then
    v_message_id := nullif(v_payload->>'message_id','')::uuid;
    if v_message_id is null then
      raise exception using errcode = '22023', message = 'A valid email message ID is required.';
    end if;
    if v_action='send_complete' then
      v_provider_email_id := left(trim(coalesce(v_payload->>'provider_email_id','')),160);
      if v_provider_email_id='' then
        raise exception using errcode = '22023', message = 'The provider did not return a confirmed email ID.';
      end if;
      update ai_network.ai_email_messages m
      set status='sent',provider_email_id=v_provider_email_id,
          sent_at=coalesce(m.sent_at,now()),last_error=null,updated_at=now()
      from ai_network.ai_emails e
      where m.message_id=v_message_id and m.identity_id=v_identity_id
        and m.email_id=e.email_id and e.identity_id=v_identity_id
      returning m.* into v_message;
      if not found then
        raise exception using errcode = 'P0002', message = 'The outgoing email record was not found.';
      end if;
      update ai_network.ai_emails set last_sent_at=now(),updated_at=now() where email_id=v_message.email_id;
    else
      update ai_network.ai_email_messages
      set status='failed',last_error=left(coalesce(v_payload->>'error','Provider send failed.'),220),updated_at=now()
      where message_id=v_message_id and identity_id=v_identity_id and direction='outbound'
      returning * into v_message;
      if not found then
        raise exception using errcode = 'P0002', message = 'The outgoing email record was not found.';
      end if;
    end if;
    return jsonb_build_object('message_id',v_message.message_id,'status',v_message.status,'provider_email_id',v_message.provider_email_id);
  end if;

  if v_action = 'mark_read' then
    v_message_id := nullif(v_payload->>'message_id','')::uuid;
    update ai_network.ai_email_messages m
    set read_at=coalesce(read_at,now()),updated_at=now()
    where m.message_id=v_message_id and m.identity_id=v_identity_id
      and m.direction='inbound' and exists (
        select 1 from ai_network.ai_emails e
        where e.email_id=m.email_id and e.identity_id=v_identity_id
      )
    returning m.* into v_message;
    if not found then
      raise exception using errcode = 'P0002', message = 'The inbox message was not found.';
    end if;
    return jsonb_build_object('message_id',v_message.message_id,'read_at',v_message.read_at);
  end if;

  raise exception using errcode = '22023', message = 'Unsupported AI email command.';
end;
$function$;

revoke all on function public.minglora_ai_email_command(text,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_email_command(text,uuid,jsonb) to service_role;
