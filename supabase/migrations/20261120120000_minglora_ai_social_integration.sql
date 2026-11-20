-- Phase 7: private, owner-controlled social capabilities for canonical AI identities.
-- AI identities do not receive auth.users or public.profiles rows.
-- All social writes still pass through the Minglora server and are human-approved.

create table if not exists ai_network.ai_social_runtime_controls (
  singleton boolean primary key default true check (singleton = true),
  global_paused boolean not null default true,
  pause_reason text not null default 'AI social activity is paused until explicitly enabled by an administrator.',
  updated_by_user_id uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into ai_network.ai_social_runtime_controls (singleton, global_paused)
values (true, true)
on conflict (singleton) do nothing;

create table if not exists ai_network.ai_social_permissions (
  identity_id uuid primary key references ai_network.ai_identities(identity_id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  can_post boolean not null default false,
  can_comment boolean not null default false,
  can_react boolean not null default false,
  can_message boolean not null default false,
  can_ai_interact boolean not null default false,
  is_suspended boolean not null default true,
  require_human_approval boolean not null default true check (require_human_approval = true),
  max_posts_per_hour integer not null default 2 check (max_posts_per_hour between 0 and 5),
  max_comments_per_hour integer not null default 5 check (max_comments_per_hour between 0 and 10),
  max_reactions_per_hour integer not null default 10 check (max_reactions_per_hour between 0 and 20),
  max_messages_per_hour integer not null default 2 check (max_messages_per_hour between 0 and 5),
  max_ai_interactions_per_hour integer not null default 3 check (max_ai_interactions_per_hour between 0 and 10),
  granted_by_user_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_social_permissions_owner_idx
  on ai_network.ai_social_permissions (owner_user_id, updated_at desc);

create table if not exists ai_network.ai_social_member_consents (
  member_user_id uuid primary key references public.profiles(id) on delete cascade,
  allow_ai_messages boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists ai_network.ai_social_activity (
  activity_id uuid primary key default gen_random_uuid(),
  identity_id uuid references ai_network.ai_identities(identity_id) on delete set null,
  owner_user_id uuid references public.profiles(id) on delete set null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_type text not null check (actor_type in ('ai', 'human', 'admin', 'system')),
  action text not null check (action ~ '^[a-z][a-z0-9_.-]{1,80}$'),
  target_type text not null default '',
  target_id text not null default '',
  outcome text not null default 'authorized' check (outcome in ('authorized', 'completed', 'rejected', 'failed')),
  chain_id uuid,
  loop_depth integer not null default 0 check (loop_depth between 0 and 2),
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists ai_social_activity_idempotency_idx
  on ai_network.ai_social_activity (identity_id, action, idempotency_key)
  where identity_id is not null and idempotency_key is not null;

create index if not exists ai_social_activity_identity_time_idx
  on ai_network.ai_social_activity (identity_id, created_at desc);

create index if not exists ai_social_activity_owner_time_idx
  on ai_network.ai_social_activity (owner_user_id, created_at desc);

create index if not exists ai_social_activity_actor_time_idx
  on ai_network.ai_social_activity (actor_user_id, created_at desc);

alter table ai_network.ai_social_runtime_controls enable row level security;
alter table ai_network.ai_social_permissions enable row level security;
alter table ai_network.ai_social_member_consents enable row level security;
alter table ai_network.ai_social_activity enable row level security;

revoke all on table
  ai_network.ai_social_runtime_controls,
  ai_network.ai_social_permissions,
  ai_network.ai_social_member_consents,
  ai_network.ai_social_activity
from public, anon, authenticated;

grant select, insert, update, delete on table
  ai_network.ai_social_runtime_controls,
  ai_network.ai_social_permissions,
  ai_network.ai_social_member_consents,
  ai_network.ai_social_activity
to service_role;

create or replace function public.minglora_ai_social_command(
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
  v_target_identity_id uuid;
  v_target_user_id uuid;
  v_event_id uuid;
  v_chain_id uuid;
  v_loop_depth integer := 0;
  v_idempotency_key text;
  v_target_type text := '';
  v_target_id text := '';
  v_permission_key text;
  v_rate_limit integer;
  v_recent_count integer;
  v_identity ai_network.ai_identities%rowtype;
  v_permissions ai_network.ai_social_permissions%rowtype;
  v_controls ai_network.ai_social_runtime_controls%rowtype;
  v_visibility text;
  v_result jsonb;
  v_allow boolean;
  v_action_name text;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI social commands are restricted to the Minglora server runtime.';
  end if;
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'AI social command payload must be a JSON object.';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora member is required.';
  end if;

  if v_action = 'get_settings' then
    select * into v_controls from ai_network.ai_social_runtime_controls where singleton = true;
    select coalesce(jsonb_agg(jsonb_build_object(
      'identity_id', i.identity_id,
      'display_name', n.display_name,
      'username', n.username,
      'status', i.status,
      'enabled', i.enabled,
      'profile_visibility', p.profile_visibility,
      'permissions', case when ap.identity_id is null then jsonb_build_object(
        'can_post', false, 'can_comment', false, 'can_react', false,
        'can_message', false, 'can_ai_interact', false, 'is_suspended', true,
        'require_human_approval', true
      ) else to_jsonb(ap) - 'identity_id' - 'owner_user_id' - 'granted_by_user_id' end
    ) order by i.created_at desc), '[]'::jsonb)
    into v_result
    from ai_network.ai_identities i
    join ai_network.ai_names n on n.identity_id = i.identity_id
    join ai_network.ai_profiles p on p.identity_id = i.identity_id
    left join ai_network.ai_social_permissions ap
      on ap.identity_id = i.identity_id and ap.owner_user_id = p_actor_user_id
    where i.owner_user_id = p_actor_user_id;
    return jsonb_build_object(
      'controls', jsonb_build_object(
        'global_paused', coalesce(v_controls.global_paused, true),
        'pause_reason', coalesce(v_controls.pause_reason, 'AI social activity is paused.'),
        'updated_at', v_controls.updated_at
      ),
      'identities', coalesce(v_result, '[]'::jsonb)
    );
  end if;

  if v_action = 'list_public_profiles' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'identity_id', i.identity_id,
      'display_name', n.display_name,
      'username', n.username,
      'bio', p.bio,
      'introduction', p.introduction,
      'profession', p.profession,
      'interests', p.interests,
      'skills', p.skills,
      'avatar_storage_ref', p.avatar_storage_ref,
      'profile_visibility', p.profile_visibility,
      'ai_disclosure_required', true,
      'status', i.status,
      'enabled', i.enabled
    ) order by n.display_name), '[]'::jsonb)
    into v_result
    from ai_network.ai_identities i
    join ai_network.ai_names n on n.identity_id = i.identity_id
    join ai_network.ai_profiles p on p.identity_id = i.identity_id
    join ai_network.ai_social_permissions ap
      on ap.identity_id = i.identity_id
    where i.status = 'active'
      and i.enabled = true
      and p.profile_visibility = 'public'
      and ap.is_suspended = false;
    return jsonb_build_object('profiles', coalesce(v_result, '[]'::jsonb));
  end if;

  if v_action = 'get_member_consent' then
    select coalesce(c.allow_ai_messages, false)
    into v_allow
    from ai_network.ai_social_member_consents c
    where c.member_user_id = p_actor_user_id;
    return jsonb_build_object('allow_ai_messages', coalesce(v_allow, false));
  end if;

  if v_action = 'set_member_consent' then
    insert into ai_network.ai_social_member_consents (
      member_user_id, allow_ai_messages, updated_at
    ) values (
      p_actor_user_id,
      coalesce((v_payload->>'allow_ai_messages')::boolean, false),
      now()
    )
    on conflict (member_user_id) do update
      set allow_ai_messages = excluded.allow_ai_messages,
          updated_at = excluded.updated_at;
    return jsonb_build_object(
      'saved', true,
      'allow_ai_messages', coalesce((v_payload->>'allow_ai_messages')::boolean, false)
    );
  end if;

  if v_action = 'set_global_pause' then
    insert into ai_network.ai_social_runtime_controls (
      singleton, global_paused, pause_reason, updated_by_user_id, updated_at
    ) values (
      true,
      coalesce((v_payload->>'global_paused')::boolean, true),
      left(coalesce(nullif(trim(v_payload->>'pause_reason'), ''), 'AI social activity is paused by an administrator.'), 240),
      p_actor_user_id,
      now()
    )
    on conflict (singleton) do update
      set global_paused = excluded.global_paused,
          pause_reason = excluded.pause_reason,
          updated_by_user_id = excluded.updated_by_user_id,
          updated_at = excluded.updated_at;
    insert into ai_network.ai_social_activity (
      identity_id, owner_user_id, actor_user_id, actor_type, action, outcome, metadata
    ) values (
      null, p_actor_user_id, p_actor_user_id, 'admin',
      case when coalesce((v_payload->>'global_paused')::boolean, true) then 'global_pause' else 'global_resume' end,
      'completed',
      jsonb_build_object('pause_reason', left(coalesce(v_payload->>'pause_reason', ''), 240))
    );
    return jsonb_build_object(
      'global_paused', coalesce((v_payload->>'global_paused')::boolean, true),
      'updated', true
    );
  end if;

  if v_action in ('get_permissions', 'set_permissions') then
    if coalesce(v_payload->>'identity_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid AI identity ID is required.';
    end if;
    v_identity_id := (v_payload->>'identity_id')::uuid;
    select * into v_identity
    from ai_network.ai_identities i
    where i.identity_id = v_identity_id and i.owner_user_id = p_actor_user_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'AI identity was not found for this Minglora owner.';
    end if;

    if v_action = 'get_permissions' then
      select jsonb_build_object(
        'identity_id', v_identity.identity_id,
        'status', v_identity.status,
        'enabled', v_identity.enabled,
        'profile_visibility', p.profile_visibility,
        'permissions', case when ap.identity_id is null then jsonb_build_object(
          'can_post', false, 'can_comment', false, 'can_react', false,
          'can_message', false, 'can_ai_interact', false, 'is_suspended', true,
          'require_human_approval', true
        ) else to_jsonb(ap) - 'identity_id' - 'owner_user_id' - 'granted_by_user_id' end
      )
      into v_result
      from ai_network.ai_profiles p
      left join ai_network.ai_social_permissions ap
        on ap.identity_id = p.identity_id and ap.owner_user_id = p_actor_user_id
      where p.identity_id = v_identity_id;
      return coalesce(v_result, '{}'::jsonb);
    end if;

    v_visibility := nullif(v_payload->>'profile_visibility', '');
    if v_visibility is not null and v_visibility not in ('public', 'followers', 'private', 'hidden') then
      raise exception using errcode = '22023', message = 'AI profile visibility must be public, followers, private or hidden.';
    end if;
    if v_visibility is not null then
      update ai_network.ai_profiles
      set profile_visibility = v_visibility, updated_at = now()
      where identity_id = v_identity_id;
    end if;

    insert into ai_network.ai_social_permissions (
      identity_id, owner_user_id, can_post, can_comment, can_react,
      can_message, can_ai_interact, is_suspended, require_human_approval,
      max_posts_per_hour, max_comments_per_hour, max_reactions_per_hour,
      max_messages_per_hour, max_ai_interactions_per_hour,
      granted_by_user_id, updated_at
    ) values (
      v_identity_id, p_actor_user_id,
      coalesce((v_payload->>'can_post')::boolean, false),
      coalesce((v_payload->>'can_comment')::boolean, false),
      coalesce((v_payload->>'can_react')::boolean, false),
      coalesce((v_payload->>'can_message')::boolean, false),
      coalesce((v_payload->>'can_ai_interact')::boolean, false),
      coalesce((v_payload->>'is_suspended')::boolean, true),
      true,
      least(greatest(coalesce(nullif(v_payload->>'max_posts_per_hour', '')::integer, 2), 0), 5),
      least(greatest(coalesce(nullif(v_payload->>'max_comments_per_hour', '')::integer, 5), 0), 10),
      least(greatest(coalesce(nullif(v_payload->>'max_reactions_per_hour', '')::integer, 10), 0), 20),
      least(greatest(coalesce(nullif(v_payload->>'max_messages_per_hour', '')::integer, 2), 0), 5),
      least(greatest(coalesce(nullif(v_payload->>'max_ai_interactions_per_hour', '')::integer, 3), 0), 10),
      p_actor_user_id, now()
    )
    on conflict (identity_id) do update set
      owner_user_id = excluded.owner_user_id,
      can_post = excluded.can_post,
      can_comment = excluded.can_comment,
      can_react = excluded.can_react,
      can_message = excluded.can_message,
      can_ai_interact = excluded.can_ai_interact,
      is_suspended = excluded.is_suspended,
      require_human_approval = true,
      max_posts_per_hour = excluded.max_posts_per_hour,
      max_comments_per_hour = excluded.max_comments_per_hour,
      max_reactions_per_hour = excluded.max_reactions_per_hour,
      max_messages_per_hour = excluded.max_messages_per_hour,
      max_ai_interactions_per_hour = excluded.max_ai_interactions_per_hour,
      granted_by_user_id = excluded.granted_by_user_id,
      updated_at = excluded.updated_at;

    insert into ai_network.ai_social_activity (
      identity_id, owner_user_id, actor_user_id, actor_type, action, outcome, metadata
    ) values (
      v_identity_id, p_actor_user_id, p_actor_user_id, 'admin', 'permissions_updated', 'completed',
      jsonb_build_object(
        'can_post', coalesce((v_payload->>'can_post')::boolean, false),
        'can_comment', coalesce((v_payload->>'can_comment')::boolean, false),
        'can_react', coalesce((v_payload->>'can_react')::boolean, false),
        'can_message', coalesce((v_payload->>'can_message')::boolean, false),
        'can_ai_interact', coalesce((v_payload->>'can_ai_interact')::boolean, false),
        'is_suspended', coalesce((v_payload->>'is_suspended')::boolean, true)
      )
    );
    return jsonb_build_object('saved', true, 'identity_id', v_identity_id, 'profile_visibility', coalesce(v_visibility, (
      select p.profile_visibility from ai_network.ai_profiles p where p.identity_id = v_identity_id
    )));
  end if;

  if v_action = 'authorize' then
    if coalesce(v_payload->>'identity_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid AI identity ID is required.';
    end if;
    v_identity_id := (v_payload->>'identity_id')::uuid;
    v_action_name := lower(coalesce(v_payload->>'social_action', ''));
    v_target_type := left(coalesce(v_payload->>'target_type', ''), 40);
    v_target_id := left(coalesce(v_payload->>'target_id', ''), 180);
    v_idempotency_key := nullif(trim(v_payload->>'idempotency_key'), '');
    v_chain_id := nullif(v_payload->>'chain_id', '')::uuid;
    v_loop_depth := coalesce(nullif(v_payload->>'loop_depth', '')::integer, 0);

    if v_action_name not in ('post', 'comment', 'react', 'message', 'ai_interact') then
      raise exception using errcode = '22023', message = 'Unsupported AI social action.';
    end if;
    if v_loop_depth < 0 or v_loop_depth > 2 then
      raise exception using errcode = '42501', message = 'AI interaction depth limit exceeded.';
    end if;
    if coalesce((v_payload->>'human_approved')::boolean, false) is not true then
      raise exception using errcode = '42501', message = 'A human administrator must explicitly approve every AI social action.';
    end if;
    if v_idempotency_key is not null and length(v_idempotency_key) > 160 then
      raise exception using errcode = '22023', message = 'AI social idempotency key is too long.';
    end if;

    select * into v_identity
    from ai_network.ai_identities i
    where i.identity_id = v_identity_id and i.owner_user_id = p_actor_user_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'AI identity was not found for this Minglora owner.';
    end if;
    if v_identity.status <> 'active' or v_identity.enabled is not true then
      raise exception using errcode = '42501', message = 'The AI identity must be active and enabled before social participation.';
    end if;

    select * into v_controls
    from ai_network.ai_social_runtime_controls
    where singleton = true;
    if not found or v_controls.global_paused is true then
      raise exception using errcode = '42501', message = 'AI social activity is globally paused.';
    end if;

    select * into v_permissions
    from ai_network.ai_social_permissions ap
    where ap.identity_id = v_identity_id and ap.owner_user_id = p_actor_user_id
    for update;
    if not found or v_permissions.is_suspended is true then
      raise exception using errcode = '42501', message = 'AI social activity is suspended for this identity.';
    end if;
    if v_permissions.require_human_approval is not true then
      raise exception using errcode = '42501', message = 'Human approval is mandatory for AI social activity.';
    end if;

    v_permission_key := case v_action_name
      when 'post' then 'can_post'
      when 'comment' then 'can_comment'
      when 'react' then 'can_react'
      when 'message' then 'can_message'
      when 'ai_interact' then 'can_ai_interact'
    end;
    if not coalesce((to_jsonb(v_permissions)->>v_permission_key)::boolean, false) then
      raise exception using errcode = '42501', message = 'This AI identity does not have permission for that social action.';
    end if;

    if v_action_name = 'message' then
      if coalesce((v_payload->>'human_initiated')::boolean, false) is not true
        or coalesce(v_payload->>'recipient_user_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception using errcode = '42501', message = 'AI messages are allowed only in human-initiated conversations.';
      end if;
      v_target_user_id := (v_payload->>'recipient_user_id')::uuid;
      if not exists (
        select 1 from ai_network.ai_social_member_consents c
        where c.member_user_id = v_target_user_id and c.allow_ai_messages is true
      ) then
        raise exception using errcode = '42501', message = 'The Minglora member has not consented to AI messages.';
      end if;
    end if;

    if v_action_name = 'ai_interact' then
      if coalesce(v_payload->>'target_identity_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or v_loop_depth >= 2 or v_chain_id is null then
        raise exception using errcode = '42501', message = 'AI-to-AI interaction requires a valid chain and cannot exceed depth two.';
      end if;
      v_target_identity_id := (v_payload->>'target_identity_id')::uuid;
      if v_target_identity_id = v_identity_id then
        raise exception using errcode = '42501', message = 'An AI identity cannot interact with itself.';
      end if;
      if not exists (
        select 1
        from ai_network.ai_identities ti
        join ai_network.ai_profiles tp on tp.identity_id = ti.identity_id
        join ai_network.ai_social_permissions tap on tap.identity_id = ti.identity_id
        where ti.identity_id = v_target_identity_id
          and ti.status = 'active' and ti.enabled is true
          and tp.profile_visibility = 'public'
          and tap.is_suspended is false
          and tap.can_ai_interact is true
      ) then
        raise exception using errcode = '42501', message = 'The target AI identity is not publicly available for AI interaction.';
      end if;
      if exists (
        select 1 from ai_network.ai_social_activity a
        where a.chain_id = v_chain_id
          and a.identity_id = v_identity_id
          and a.target_id = v_target_identity_id::text
          and a.outcome in ('authorized', 'completed')
      ) then
        raise exception using errcode = '42501', message = 'This AI interaction chain has already visited that target.';
      end if;
    end if;

    v_rate_limit := case v_action_name
      when 'post' then v_permissions.max_posts_per_hour
      when 'comment' then v_permissions.max_comments_per_hour
      when 'react' then v_permissions.max_reactions_per_hour
      when 'message' then v_permissions.max_messages_per_hour
      when 'ai_interact' then v_permissions.max_ai_interactions_per_hour
    end;
    select count(*)::integer into v_recent_count
    from ai_network.ai_social_activity a
    where a.identity_id = v_identity_id
      and a.action = v_action_name
      and a.created_at > now() - interval '1 hour'
      and a.outcome in ('authorized', 'completed');
    if v_recent_count >= v_rate_limit then
      raise exception using errcode = '42900', message = 'AI social action rate limit reached for this identity.';
    end if;

    if v_idempotency_key is not null then
      select a.activity_id into v_event_id
      from ai_network.ai_social_activity a
      where a.identity_id = v_identity_id
        and a.action = v_action_name
        and a.idempotency_key = v_idempotency_key;
      if v_event_id is not null then
        return jsonb_build_object('authorized', true, 'reused', true, 'event_id', v_event_id);
      end if;
    end if;

    insert into ai_network.ai_social_activity (
      identity_id, owner_user_id, actor_user_id, actor_type, action,
      target_type, target_id, outcome, chain_id, loop_depth,
      idempotency_key, metadata
    ) values (
      v_identity_id, p_actor_user_id, p_actor_user_id, 'ai', v_action_name,
      v_target_type, v_target_id, 'authorized', v_chain_id, v_loop_depth,
      v_idempotency_key, jsonb_build_object('human_approved', true)
    ) returning activity_id into v_event_id;

    return jsonb_build_object('authorized', true, 'event_id', v_event_id, 'identity_id', v_identity_id);
  end if;

  if v_action = 'complete' then
    if coalesce(v_payload->>'event_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid AI social activity event is required.';
    end if;
    update ai_network.ai_social_activity a
    set outcome = 'completed', completed_at = now()
    where a.activity_id = (v_payload->>'event_id')::uuid
      and a.owner_user_id = p_actor_user_id
      and a.outcome = 'authorized'
    returning a.activity_id into v_event_id;
    if v_event_id is null then
      raise exception using errcode = 'P0002', message = 'The pending AI social activity event could not be completed.';
    end if;
    return jsonb_build_object('completed', true, 'event_id', v_event_id);
  end if;

  if v_action = 'record_member_activity' then
    if coalesce(v_payload->>'identity_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid AI identity ID is required for social activity tracking.';
    end if;
    v_identity_id := (v_payload->>'identity_id')::uuid;
    v_action_name := lower(coalesce(v_payload->>'social_action', ''));
    if v_action_name not in ('member_comment', 'member_reaction', 'member_message') then
      raise exception using errcode = '22023', message = 'Unsupported member-to-AI social activity.';
    end if;
    if not exists (
      select 1 from ai_network.ai_identities i
      where i.identity_id = v_identity_id
    ) then
      raise exception using errcode = 'P0002', message = 'AI identity was not found.';
    end if;
    select count(*)::integer into v_recent_count
    from ai_network.ai_social_activity a
    where a.identity_id = v_identity_id
      and a.actor_user_id = p_actor_user_id
      and a.action = v_action_name
      and a.created_at > now() - interval '10 minutes';
    if v_recent_count >= case when v_action_name = 'member_message' then 10 else 30 end then
      raise exception using errcode = '42900', message = 'Member-to-AI interaction rate limit reached.';
    end if;
    insert into ai_network.ai_social_activity (
      identity_id, owner_user_id, actor_user_id, actor_type, action,
      target_type, target_id, outcome, metadata
    ) values (
      v_identity_id,
      (select i.owner_user_id from ai_network.ai_identities i where i.identity_id = v_identity_id),
      p_actor_user_id,
      'human',
      v_action_name,
      left(coalesce(v_payload->>'target_type', ''), 40),
      left(coalesce(v_payload->>'target_id', ''), 180),
      'completed',
      '{}'::jsonb
    ) returning activity_id into v_event_id;
    return jsonb_build_object('recorded', true, 'event_id', v_event_id);
  end if;

  if v_action = 'history' then
    v_identity_id := nullif(v_payload->>'identity_id', '')::uuid;
    select coalesce(jsonb_agg(jsonb_build_object(
      'activity_id', a.activity_id,
      'identity_id', a.identity_id,
      'actor_type', a.actor_type,
      'actor_user_id', a.actor_user_id,
      'action', a.action,
      'target_type', a.target_type,
      'target_id', a.target_id,
      'outcome', a.outcome,
      'loop_depth', a.loop_depth,
      'created_at', a.created_at,
      'completed_at', a.completed_at,
      'metadata', a.metadata
    ) order by a.created_at desc), '[]'::jsonb)
    into v_result
    from ai_network.ai_social_activity a
    where a.owner_user_id = p_actor_user_id
      and (v_identity_id is null or a.identity_id = v_identity_id)
    limit 100;
    return jsonb_build_object('activity', coalesce(v_result, '[]'::jsonb));
  end if;

  raise exception using errcode = '22023', message = 'Unsupported AI social command.';
end;
$function$;

comment on function public.minglora_ai_social_command(text, uuid, jsonb)
  is 'Private Minglora AI social permissions, consent, global pause, atomic rate limits and metadata-only interaction history. AI identities never become auth.users or public.profiles.';

revoke all on function public.minglora_ai_social_command(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_social_command(text, uuid, jsonb) to service_role;
