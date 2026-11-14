begin;

create table if not exists ai_network.ai_memory_settings (
  identity_id uuid primary key references ai_network.ai_identities(identity_id) on delete cascade,
  owner_user_id uuid not null,
  memory_enabled boolean not null default false,
  long_term_enabled boolean not null default false,
  short_term_retention_days integer not null default 7
    check (short_term_retention_days between 1 and 90),
  long_term_retention_days integer not null default 365
    check (long_term_retention_days between 30 and 3650),
  max_entries integer not null default 500
    check (max_entries between 1 and 5000),
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_network.ai_memory_entries (
  memory_id uuid primary key default pg_catalog.gen_random_uuid(),
  identity_id uuid not null references ai_network.ai_identities(identity_id) on delete cascade,
  owner_user_id uuid not null,
  memory_type text not null check (memory_type in ('short_term','long_term')),
  summary text not null check (char_length(trim(summary)) between 1 and 1000),
  memory_content jsonb not null default '{}'::jsonb
    check (jsonb_typeof(memory_content) = 'object'),
  idempotency_key text,
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_memory_entries_idempotency_key_length
    check (idempotency_key is null or char_length(idempotency_key) between 1 and 128)
);

create unique index if not exists ai_memory_entries_identity_idempotency_uidx
  on ai_network.ai_memory_entries(identity_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists ai_memory_entries_owner_identity_type_idx
  on ai_network.ai_memory_entries(owner_user_id, identity_id, memory_type, updated_at desc);
create index if not exists ai_memory_entries_expiry_idx
  on ai_network.ai_memory_entries(expires_at);

alter table ai_network.ai_memory_settings enable row level security;
alter table ai_network.ai_memory_entries enable row level security;

revoke all on table ai_network.ai_memory_settings from public, anon, authenticated;
revoke all on table ai_network.ai_memory_entries from public, anon, authenticated;
grant select, insert, update, delete on table ai_network.ai_memory_settings to service_role;
grant select, insert, update, delete on table ai_network.ai_memory_entries to service_role;

create or replace function public.minglora_ai_memory_command(
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
  v_memory_id uuid;
  v_memory_type text;
  v_summary text;
  v_content jsonb;
  v_idempotency_key text;
  v_memory_enabled boolean;
  v_long_term_enabled boolean;
  v_short_retention integer;
  v_long_retention integer;
  v_max_entries integer;
  v_settings ai_network.ai_memory_settings%rowtype;
  v_owner uuid;
  v_created boolean := false;
  v_entries jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'AI memory commands are restricted to the Minglora server runtime.';
  end if;
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'AI memory payload must be a JSON object.';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora owner is required.';
  end if;

  begin
    v_identity_id := nullif(v_payload->>'identity_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception using errcode = '22023', message = 'A valid AI identity ID is required.';
  end;

  if v_identity_id is null then
    raise exception using errcode = '22023', message = 'A valid AI identity ID is required.';
  end if;

  select i.owner_user_id into v_owner
  from ai_network.ai_identities i
  where i.identity_id = v_identity_id
  for update;

  if v_owner is null or v_owner <> p_actor_user_id then
    raise exception using errcode = '42501', message = 'This AI identity does not belong to the signed-in Minglora owner.';
  end if;

  select s.* into v_settings
  from ai_network.ai_memory_settings s
  where s.identity_id = v_identity_id
    and s.owner_user_id = p_actor_user_id;

  v_memory_enabled := coalesce(v_settings.memory_enabled, false);
  v_long_term_enabled := coalesce(v_settings.long_term_enabled, false);
  v_short_retention := coalesce(v_settings.short_term_retention_days, 7);
  v_long_retention := coalesce(v_settings.long_term_retention_days, 365);
  v_max_entries := coalesce(v_settings.max_entries, 500);

  if v_action = 'get_settings' then
    return jsonb_build_object(
      'identity_id', v_identity_id,
      'memory_enabled', v_memory_enabled,
      'long_term_enabled', v_long_term_enabled,
      'short_term_retention_days', v_short_retention,
      'long_term_retention_days', v_long_retention,
      'max_entries', v_max_entries,
      'consented_at', v_settings.consented_at
    );
  end if;

  if v_action = 'configure' then
    v_memory_enabled := coalesce(nullif(v_payload->>'memory_enabled','')::boolean, v_memory_enabled);
    v_long_term_enabled := coalesce(nullif(v_payload->>'long_term_enabled','')::boolean, v_long_term_enabled);
    v_short_retention := coalesce(nullif(v_payload->>'short_term_retention_days','')::integer, v_short_retention);
    v_long_retention := coalesce(nullif(v_payload->>'long_term_retention_days','')::integer, v_long_retention);
    v_max_entries := coalesce(nullif(v_payload->>'max_entries','')::integer, v_max_entries);

    if v_short_retention not between 1 and 90
      or v_long_retention not between 30 and 3650
      or v_max_entries not between 1 and 5000 then
      raise exception using errcode = '22023', message = 'AI memory retention or capacity settings are outside the allowed range.';
    end if;
    if v_long_term_enabled and not v_memory_enabled then
      raise exception using errcode = '22023', message = 'Enable AI memory before enabling long-term memory.';
    end if;

    insert into ai_network.ai_memory_settings (
      identity_id, owner_user_id, memory_enabled, long_term_enabled,
      short_term_retention_days, long_term_retention_days, max_entries,
      consented_at, updated_at
    )
    values (
      v_identity_id, p_actor_user_id, v_memory_enabled, v_long_term_enabled,
      v_short_retention, v_long_retention, v_max_entries,
      case when v_memory_enabled then now() else v_settings.consented_at end,
      now()
    )
    on conflict (identity_id) do update
      set memory_enabled = excluded.memory_enabled,
          long_term_enabled = excluded.long_term_enabled,
          short_term_retention_days = excluded.short_term_retention_days,
          long_term_retention_days = excluded.long_term_retention_days,
          max_entries = excluded.max_entries,
          consented_at = case
            when excluded.memory_enabled and not ai_network.ai_memory_settings.memory_enabled
              then now()
            when not excluded.memory_enabled then null
            else ai_network.ai_memory_settings.consented_at
          end,
          updated_at = now()
      where ai_network.ai_memory_settings.owner_user_id = p_actor_user_id;

    if not v_memory_enabled then
      delete from ai_network.ai_memory_entries
      where identity_id = v_identity_id and owner_user_id = p_actor_user_id;
    else
      delete from ai_network.ai_memory_entries
      where identity_id = v_identity_id
        and owner_user_id = p_actor_user_id
        and expires_at <= now();
      if not v_long_term_enabled then
        delete from ai_network.ai_memory_entries
        where identity_id = v_identity_id
          and owner_user_id = p_actor_user_id
          and memory_type = 'long_term';
      end if;
    end if;

    insert into ai_network.ai_identity_audit_logs (
      identity_id, actor_type, actor_user_id, action, metadata
    )
    values (
      v_identity_id, 'human_user', p_actor_user_id, 'memory_settings_updated',
      jsonb_build_object(
        'memory_enabled', v_memory_enabled,
        'long_term_enabled', v_long_term_enabled,
        'short_term_retention_days', v_short_retention,
        'long_term_retention_days', v_long_retention,
        'max_entries', v_max_entries
      )
    );

    return jsonb_build_object(
      'identity_id', v_identity_id,
      'memory_enabled', v_memory_enabled,
      'long_term_enabled', v_long_term_enabled,
      'short_term_retention_days', v_short_retention,
      'long_term_retention_days', v_long_retention,
      'max_entries', v_max_entries
    );
  end if;

  if v_action = 'list' then
    delete from ai_network.ai_memory_entries
    where identity_id = v_identity_id
      and owner_user_id = p_actor_user_id
      and expires_at <= now();

    select coalesce(jsonb_agg(jsonb_build_object(
      'memory_id', e.memory_id,
      'memory_type', e.memory_type,
      'summary', e.summary,
      'content', e.memory_content,
      'expires_at', e.expires_at,
      'created_at', e.created_at,
      'updated_at', e.updated_at
    ) order by e.updated_at desc), '[]'::jsonb)
    into v_entries
    from ai_network.ai_memory_entries e
    where e.identity_id = v_identity_id
      and e.owner_user_id = p_actor_user_id
      and e.expires_at > now();

    return jsonb_build_object(
      'settings', jsonb_build_object(
        'identity_id', v_identity_id,
        'memory_enabled', v_memory_enabled,
        'long_term_enabled', v_long_term_enabled,
        'short_term_retention_days', v_short_retention,
        'long_term_retention_days', v_long_retention,
        'max_entries', v_max_entries,
        'consented_at', v_settings.consented_at
      ),
      'entries', v_entries,
      'count', jsonb_array_length(v_entries)
    );
  end if;

  if v_action = 'create' then
    if not v_memory_enabled then
      raise exception using errcode = '42501', message = 'Enable AI memory explicitly before saving memory entries.';
    end if;

    v_memory_type := lower(coalesce(v_payload->>'memory_type', 'short_term'));
    if v_memory_type not in ('short_term','long_term') then
      raise exception using errcode = '22023', message = 'Choose short-term or long-term memory.';
    end if;
    if v_memory_type = 'long_term' and not v_long_term_enabled then
      raise exception using errcode = '42501', message = 'Long-term memory requires separate owner consent.';
    end if;

    v_summary := trim(coalesce(v_payload->>'summary',''));
    if char_length(v_summary) not between 1 and 1000 then
      raise exception using errcode = '22023', message = 'AI memory summary must contain between 1 and 1000 characters.';
    end if;

    v_content := coalesce(v_payload->'content', '{}'::jsonb);
    if jsonb_typeof(v_content) <> 'object' or pg_catalog.octet_length(v_content::text) > 16000 then
      raise exception using errcode = '22023', message = 'AI memory content must be an object of at most 16 KB.';
    end if;
    if (jsonb_build_object('summary',v_summary,'content',v_content))::text ~*
      '"(api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential|private[_-]?key)"[[:space:]]*:' then
      raise exception using errcode = '22023', message = 'Credentials and secrets cannot be stored in AI memory.';
    end if;

    v_idempotency_key := nullif(trim(coalesce(v_payload->>'idempotency_key','')), '');
    if v_idempotency_key is not null and char_length(v_idempotency_key) > 128 then
      raise exception using errcode = '22023', message = 'AI memory idempotency key is too long.';
    end if;

    delete from ai_network.ai_memory_entries
    where identity_id = v_identity_id
      and owner_user_id = p_actor_user_id
      and expires_at <= now();

    if v_idempotency_key is not null then
      select e.memory_id into v_memory_id
      from ai_network.ai_memory_entries e
      where e.identity_id = v_identity_id
        and e.owner_user_id = p_actor_user_id
        and e.idempotency_key = v_idempotency_key;
      if v_memory_id is not null then
        return jsonb_build_object(
          'memory_id', v_memory_id,
          'created', false,
          'reused', true,
          'memory_type', v_memory_type
        );
      end if;
    end if;

    if (select count(*) from ai_network.ai_memory_entries e
        where e.identity_id = v_identity_id and e.owner_user_id = p_actor_user_id) >= v_max_entries then
      raise exception using errcode = '54000', message = 'AI memory entry limit reached. Remove an entry or increase the configured limit.';
    end if;

    insert into ai_network.ai_memory_entries (
      identity_id, owner_user_id, memory_type, summary, memory_content,
      idempotency_key, created_by_user_id, updated_by_user_id, expires_at
    )
    values (
      v_identity_id, p_actor_user_id, v_memory_type, v_summary, v_content,
      v_idempotency_key, p_actor_user_id, p_actor_user_id,
      now() + make_interval(days => case when v_memory_type = 'long_term'
        then v_long_retention else v_short_retention end)
    )
    on conflict (identity_id, idempotency_key) where idempotency_key is not null
      do nothing
    returning memory_id into v_memory_id;

    if v_memory_id is null and v_idempotency_key is not null then
      select e.memory_id into v_memory_id
      from ai_network.ai_memory_entries e
      where e.identity_id = v_identity_id
        and e.idempotency_key = v_idempotency_key;
    else
      v_created := true;
    end if;

    if v_created then
      insert into ai_network.ai_identity_audit_logs (
        identity_id, actor_type, actor_user_id, action, metadata
      )
      values (
        v_identity_id, 'human_user', p_actor_user_id, 'memory_entry_created',
        jsonb_build_object('memory_id',v_memory_id,'memory_type',v_memory_type)
      );
    end if;

    return jsonb_build_object(
      'memory_id', v_memory_id,
      'created', v_created,
      'memory_type', v_memory_type,
      'summary', v_summary
    );
  end if;

  if v_action = 'update' then
    begin
      v_memory_id := nullif(v_payload->>'memory_id','')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'A valid AI memory entry ID is required.';
    end;
    if v_memory_id is null then
      raise exception using errcode = '22023', message = 'A valid AI memory entry ID is required.';
    end if;
    if not v_memory_enabled then
      raise exception using errcode = '42501', message = 'Enable AI memory before editing memory entries.';
    end if;

    v_memory_type := lower(coalesce(v_payload->>'memory_type', 'short_term'));
    if v_memory_type not in ('short_term','long_term') then
      raise exception using errcode = '22023', message = 'Choose short-term or long-term memory.';
    end if;
    if v_memory_type = 'long_term' and not v_long_term_enabled then
      raise exception using errcode = '42501', message = 'Long-term memory requires separate owner consent.';
    end if;
    v_summary := trim(coalesce(v_payload->>'summary',''));
    if char_length(v_summary) not between 1 and 1000 then
      raise exception using errcode = '22023', message = 'AI memory summary must contain between 1 and 1000 characters.';
    end if;
    v_content := coalesce(v_payload->'content', '{}'::jsonb);
    if jsonb_typeof(v_content) <> 'object' or pg_catalog.octet_length(v_content::text) > 16000 then
      raise exception using errcode = '22023', message = 'AI memory content must be an object of at most 16 KB.';
    end if;
    if (jsonb_build_object('summary',v_summary,'content',v_content))::text ~*
      '"(api[_-]?key|access[_-]?token|password|secret|authorization|cookie|credential|private[_-]?key)"[[:space:]]*:' then
      raise exception using errcode = '22023', message = 'Credentials and secrets cannot be stored in AI memory.';
    end if;

    update ai_network.ai_memory_entries e
    set memory_type = v_memory_type,
        summary = v_summary,
        memory_content = v_content,
        updated_by_user_id = p_actor_user_id,
        updated_at = now(),
        expires_at = now() + make_interval(days => case when v_memory_type = 'long_term'
          then v_long_retention else v_short_retention end)
    where e.memory_id = v_memory_id
      and e.identity_id = v_identity_id
      and e.owner_user_id = p_actor_user_id;

    if not found then
      raise exception using errcode = 'P0002', message = 'AI memory entry was not found for this identity.';
    end if;

    insert into ai_network.ai_identity_audit_logs (
      identity_id, actor_type, actor_user_id, action, metadata
    )
    values (
      v_identity_id, 'human_user', p_actor_user_id, 'memory_entry_updated',
      jsonb_build_object('memory_id',v_memory_id,'memory_type',v_memory_type)
    );

    return jsonb_build_object('updated', true, 'memory_id', v_memory_id);
  end if;

  if v_action = 'delete' then
    begin
      v_memory_id := nullif(v_payload->>'memory_id','')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'A valid AI memory entry ID is required.';
    end;
    if v_memory_id is null then
      raise exception using errcode = '22023', message = 'A valid AI memory entry ID is required.';
    end if;

    delete from ai_network.ai_memory_entries
    where memory_id = v_memory_id
      and identity_id = v_identity_id
      and owner_user_id = p_actor_user_id;
    v_created := found;

    if v_created then
      insert into ai_network.ai_identity_audit_logs (
        identity_id, actor_type, actor_user_id, action, metadata
      )
      values (
        v_identity_id, 'human_user', p_actor_user_id, 'memory_entry_deleted',
        jsonb_build_object('memory_id',v_memory_id)
      );
    end if;

    return jsonb_build_object('deleted', v_created, 'memory_id', v_memory_id);
  end if;

  raise exception using errcode = '22023', message = 'Unsupported AI memory command.';
end;
$function$;

comment on table ai_network.ai_memory_settings is
  'Owner-controlled, opt-in per-identity AI memory settings. Memory is disabled by default.';
comment on table ai_network.ai_memory_entries is
  'Owner-managed short/long-term AI memory entries with expiry, idempotency, and secret rejection. No automatic model recall is implied.';
comment on function public.minglora_ai_memory_command(text, uuid, jsonb) is
  'Private service-role AI memory CRUD/settings command. Owner-scoped; memory and long-term memory are opt-in, entries expire, secrets are rejected.';

revoke all on function public.minglora_ai_memory_command(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_memory_command(text, uuid, jsonb) to service_role;

commit;
