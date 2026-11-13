-- Minglora AI Network: server-only relational identity commands.
-- Additive only. Does not expose ai_network to anon/authenticated clients.
-- This migration is intentionally separate from provider activation and runtime execution.

begin;

-- Cover foreign-key lookups used by ownership, audit, history and provider routing.
create index if not exists ai_identities_created_by_user_idx
  on ai_network.ai_identities (created_by_user_id);
create index if not exists ai_identities_parent_identity_idx
  on ai_network.ai_identities (parent_identity_id);
create index if not exists ai_identity_audit_actor_identity_idx
  on ai_network.ai_identity_audit_logs (actor_identity_id);
create index if not exists ai_identity_audit_actor_user_idx
  on ai_network.ai_identity_audit_logs (actor_user_id);
create index if not exists ai_identity_owners_owner_identity_idx
  on ai_network.ai_identity_owners (owner_identity_id);
create index if not exists ai_identity_permissions_granted_by_identity_idx
  on ai_network.ai_identity_permissions (granted_by_identity_id);
create index if not exists ai_identity_permissions_granted_by_user_idx
  on ai_network.ai_identity_permissions (granted_by_user_id);
create index if not exists ai_identity_status_actor_identity_idx
  on ai_network.ai_identity_status_history (actor_identity_id);
create index if not exists ai_identity_status_actor_user_idx
  on ai_network.ai_identity_status_history (actor_user_id);
create index if not exists ai_identity_versions_changed_by_identity_idx
  on ai_network.ai_identity_versions (changed_by_identity_id);
create index if not exists ai_identity_versions_changed_by_user_idx
  on ai_network.ai_identity_versions (changed_by_user_id);
create index if not exists ai_provider_assignments_fallback_model_idx
  on ai_network.ai_provider_assignments (fallback_model_id);
create index if not exists ai_provider_assignments_provider_account_idx
  on ai_network.ai_provider_assignments (provider_account_id);

-- The service-role backend accesses the private schema; browser roles do not.
grant usage on schema ai_network to service_role;
grant select on ai_network.ai_categories to service_role;
grant select, insert on
  ai_network.ai_identities,
  ai_network.ai_names,
  ai_network.ai_profiles,
  ai_network.ai_emails,
  ai_network.ai_identity_locations,
  ai_network.ai_identity_languages,
  ai_network.ai_identity_owners,
  ai_network.ai_identity_status_history,
  ai_network.ai_identity_versions,
  ai_network.ai_identity_audit_logs
to service_role;
grant usage, select on all sequences in schema ai_network to service_role;

create or replace function public.minglora_ai_identity_command(
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
  v_name jsonb;
  v_profile jsonb;
  v_languages jsonb;
  v_locations jsonb;
  v_email jsonb;
  v_item jsonb;
  v_identity_id uuid;
  v_parent_identity_id uuid;
  v_existing_id uuid;
  v_population text;
  v_category_key text;
  v_first_name text;
  v_middle_name text;
  v_last_name text;
  v_full_name text;
  v_display_name text;
  v_username text;
  v_profile_identifier text;
  v_idempotency_key text;
  v_purpose text;
  v_gender text;
  v_status text;
  v_country_origin text;
  v_current_country text;
  v_primary_email text;
  v_language_tag text;
  v_language_name text;
  v_dialect text;
  v_proficiency text;
  v_is_primary boolean;
  v_primary_language_seen boolean := false;
  v_location_type text;
  v_country_code text;
  v_result jsonb;
  v_identities jsonb;
  v_total bigint;
  v_limit integer;
  v_offset integer;
  v_search text;
  v_created jsonb := '[]'::jsonb;
  v_failed jsonb := '[]'::jsonb;
  v_created_count integer := 0;
  v_failed_count integer := 0;
  v_index integer := 0;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI identity commands are restricted to the Minglora server runtime.';
  end if;
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'AI identity command payload must be a JSON object.';
  end if;

  if v_action = 'list_categories' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'category_key', c.category_key,
          'display_name', c.display_name,
          'description', c.description,
          'sort_order', c.sort_order
        ) order by c.sort_order, c.category_key
      ),
      '[]'::jsonb
    )
    into v_result
    from ai_network.ai_categories c
    where c.is_active = true;
    return v_result;
  end if;

  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora owner is required.';
  end if;

  if v_action = 'list' then
    v_limit := least(greatest(coalesce(nullif(v_payload->>'limit', '')::integer, 25), 1), 100);
    v_offset := greatest(coalesce(nullif(v_payload->>'offset', '')::integer, 0), 0);
    v_search := left(trim(coalesce(v_payload->>'search', '')), 120);

    select count(*)
    into v_total
    from ai_network.ai_identities i
    join ai_network.ai_names n on n.identity_id = i.identity_id
    where i.owner_user_id = p_actor_user_id
      and (
        v_search = ''
        or n.username ilike '%' || v_search || '%'
        or n.display_name ilike '%' || v_search || '%'
        or n.first_name ilike '%' || v_search || '%'
        or n.last_name ilike '%' || v_search || '%'
      );

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'identity', to_jsonb(q.i),
          'name', to_jsonb(q.n),
          'profile', to_jsonb(q.p),
          'primary_email', q.primary_email
        ) order by q.created_at desc
      ),
      '[]'::jsonb
    )
    into v_identities
    from (
      select
        i,
        n,
        p,
        i.created_at,
        (
          select jsonb_build_object(
            'email_address', e.email_address,
            'email_type', e.email_type,
            'verification_status', e.verification_status,
            'provisioning_status', e.provisioning_status,
            'email_status', e.email_status
          )
          from ai_network.ai_emails e
          where e.identity_id = i.identity_id and e.is_primary = true
          limit 1
        ) as primary_email
      from ai_network.ai_identities i
      join ai_network.ai_names n on n.identity_id = i.identity_id
      join ai_network.ai_profiles p on p.identity_id = i.identity_id
      where i.owner_user_id = p_actor_user_id
        and (
          v_search = ''
          or n.username ilike '%' || v_search || '%'
          or n.display_name ilike '%' || v_search || '%'
          or n.first_name ilike '%' || v_search || '%'
          or n.last_name ilike '%' || v_search || '%'
        )
      order by i.created_at desc
      limit v_limit offset v_offset
    ) q;
    return jsonb_build_object(
      'identities', v_identities,
      'total', v_total,
      'limit', v_limit,
      'offset', v_offset
    );
  end if;

  if v_action = 'get' then
    if coalesce(v_payload->>'identity_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception using errcode = '22023', message = 'A valid AI identity ID is required.';
    end if;
    select jsonb_build_object(
      'identity', to_jsonb(i),
      'name', to_jsonb(n),
      'profile', to_jsonb(p),
      'emails', coalesce((
        select jsonb_agg(jsonb_build_object(
          'email_id', e.email_id,
          'email_address', e.email_address,
          'email_type', e.email_type,
          'is_primary', e.is_primary,
          'verification_status', e.verification_status,
          'email_provider', e.email_provider,
          'provisioning_status', e.provisioning_status,
          'email_status', e.email_status,
          'last_verified_at', e.last_verified_at
        ) order by e.is_primary desc, e.created_at
        )
        from ai_network.ai_emails e
        where e.identity_id = i.identity_id
      ), '[]'::jsonb),
      'languages', coalesce((
        select jsonb_agg(to_jsonb(l) order by l.is_primary desc, l.language_tag)
        from ai_network.ai_identity_languages l
        where l.identity_id = i.identity_id
      ), '[]'::jsonb),
      'locations', coalesce((
        select jsonb_agg(to_jsonb(loc) order by loc.location_type, loc.created_at)
        from ai_network.ai_identity_locations loc
        where loc.identity_id = i.identity_id
      ), '[]'::jsonb)
    )
    into v_result
    from ai_network.ai_identities i
    join ai_network.ai_names n on n.identity_id = i.identity_id
    join ai_network.ai_profiles p on p.identity_id = i.identity_id
    where i.identity_id = (v_payload->>'identity_id')::uuid
      and i.owner_user_id = p_actor_user_id;
    if v_result is null then
      raise exception using errcode = 'P0002', message = 'AI identity was not found for this Minglora owner.';
    end if;
    return v_result;
  end if;

  if v_action = 'bulk_create' then
    if jsonb_typeof(v_payload->'items') <> 'array' then
      raise exception using errcode = '22023', message = 'Bulk AI identity creation requires an items array.';
    end if;
    if jsonb_array_length(v_payload->'items') < 1 or jsonb_array_length(v_payload->'items') > 100 then
      raise exception using errcode = '22023', message = 'A bulk request must contain between 1 and 100 AI identities.';
    end if;
    for v_item in select value from jsonb_array_elements(v_payload->'items') loop
      begin
        v_index := v_index + 1;
        v_result := public.minglora_ai_identity_command('create', p_actor_user_id, v_item);
        v_created := v_created || jsonb_build_array(v_result);
        v_created_count := v_created_count + 1;
      exception when others then
        v_failed := v_failed || jsonb_build_array(jsonb_build_object(
          'index', v_index,
          'idempotency_key', v_item->>'idempotency_key',
          'sqlstate', SQLSTATE,
          'error', left(SQLERRM, 240)
        ));
        v_failed_count := v_failed_count + 1;
      end;
    end loop;
    return jsonb_build_object(
      'created_count', v_created_count,
      'failed_count', v_failed_count,
      'created', v_created,
      'failed', v_failed
    );
  end if;

  if v_action <> 'create' then
    raise exception using errcode = '22023', message = 'Unsupported AI identity command.';
  end if;

  v_name := coalesce(v_payload->'name', '{}'::jsonb);
  v_profile := coalesce(v_payload->'profile', '{}'::jsonb);
  v_languages := coalesce(v_payload->'languages', '[]'::jsonb);
  v_locations := coalesce(v_payload->'locations', '[]'::jsonb);
  v_email := v_payload->'email';

  if jsonb_typeof(v_name) <> 'object' or jsonb_typeof(v_profile) <> 'object' then
    raise exception using errcode = '22023', message = 'AI name and profile must be JSON objects.';
  end if;
  if jsonb_typeof(v_languages) <> 'array' or jsonb_typeof(v_locations) <> 'array' then
    raise exception using errcode = '22023', message = 'AI languages and locations must be arrays.';
  end if;

  v_population := lower(coalesce(nullif(trim(v_payload->>'population'), ''), 'independent'));
  if v_population not in ('independent', 'organizational', 'specialized_service') then
    raise exception using errcode = '22023', message = 'Choose a supported AI population.';
  end if;
  v_category_key := lower(trim(coalesce(v_payload->>'category_key', '')));
  if v_category_key = '' or not exists (
    select 1 from ai_network.ai_categories c
    where c.category_key = v_category_key and c.is_active = true
  ) then
    raise exception using errcode = '22023', message = 'Choose an active Minglora AI category.';
  end if;

  v_first_name := left(trim(coalesce(v_name->>'first_name', '')), 80);
  v_middle_name := left(trim(coalesce(v_name->>'middle_name', '')), 80);
  v_last_name := left(trim(coalesce(v_name->>'last_name', '')), 80);
  if v_first_name = '' or v_last_name = '' then
    raise exception using errcode = '22023', message = 'First name and last name are both required as separate fields.';
  end if;
  v_full_name := left(coalesce(nullif(trim(v_name->>'full_name'), ''), concat_ws(' ', v_first_name, nullif(v_middle_name, ''), v_last_name)), 240);
  v_display_name := left(coalesce(nullif(trim(v_name->>'display_name'), ''), v_full_name), 120);
  v_username := lower(trim(coalesce(v_name->>'username', '')));
  if v_username !~ '^[a-z0-9_]{3,30}$' then
    raise exception using errcode = '22023', message = 'Username must contain 3 to 30 lowercase letters, numbers or underscores.';
  end if;
  v_idempotency_key := nullif(trim(v_payload->>'idempotency_key'), '');
  if v_idempotency_key is null or length(v_idempotency_key) < 8 or length(v_idempotency_key) > 160 then
    raise exception using errcode = '22023', message = 'A stable idempotency key between 8 and 160 characters is required.';
  end if;
  v_purpose := left(trim(coalesce(v_payload->>'purpose', '')), 1200);
  v_profile_identifier := left(
    coalesce(nullif(trim(v_name->>'profile_identifier'), ''), 'minglora-ai-' || replace(gen_random_uuid()::text, '-', '')),
    180
  );

  if nullif(trim(coalesce(v_payload->>'parent_identity_id', '')), '') is null then
    v_parent_identity_id := null;
  else
    v_parent_identity_id := (v_payload->>'parent_identity_id')::uuid;
    if not exists (
      select 1 from ai_network.ai_identities parent
      where parent.identity_id = v_parent_identity_id
        and parent.owner_user_id = p_actor_user_id
    ) then
      raise exception using errcode = '42501', message = 'Parent AI identity must belong to the same Minglora owner.';
    end if;
  end if;

  select i.identity_id into v_existing_id
  from ai_network.ai_identities i
  where i.owner_user_id = p_actor_user_id
    and i.idempotency_key = v_idempotency_key;
  if v_existing_id is not null then
    v_identity_id := v_existing_id;
    v_status := 'reused';
  else
    insert into ai_network.ai_identities (
      population, category_key, subcategory, owner_user_id, parent_identity_id,
      purpose, status, enabled, supervision_level, idempotency_key, created_by_user_id
    )
    values (
      v_population,
      v_category_key,
      left(trim(coalesce(v_payload->>'subcategory', '')), 80),
      p_actor_user_id,
      v_parent_identity_id,
      v_purpose,
      'created',
      false,
      'fully_supervised',
      v_idempotency_key,
      p_actor_user_id
    )
    on conflict (owner_user_id, idempotency_key) where idempotency_key is not null
    do nothing
    returning identity_id into v_identity_id;

    if v_identity_id is null then
      select i.identity_id into v_identity_id
      from ai_network.ai_identities i
      where i.owner_user_id = p_actor_user_id
        and i.idempotency_key = v_idempotency_key;
      v_status := 'reused';
    else
      v_status := 'created';
    end if;
  end if;

  if v_status = 'created' then
    insert into ai_network.ai_names (
      identity_id, first_name, middle_name, last_name,
      full_name, display_name, username, profile_identifier
    )
    values (
      v_identity_id, v_first_name, v_middle_name, v_last_name,
      v_full_name, v_display_name, v_username, v_profile_identifier
    );

    v_gender := lower(coalesce(nullif(v_profile->>'gender', ''), 'prefer_not_to_say'));
    if v_gender not in ('female', 'male', 'non_binary', 'other', 'prefer_not_to_say') then
      raise exception using errcode = '22023', message = 'Choose a supported AI gender option.';
    end if;
    v_country_origin := nullif(upper(trim(coalesce(v_profile->>'country_of_origin', ''))), '');
    v_current_country := nullif(upper(trim(coalesce(v_profile->>'current_country', ''))), '');

    insert into ai_network.ai_profiles (
      identity_id, bio, introduction, gender, gender_presentation, nationality,
      country_of_origin, current_country, state_province, parish_county,
      district, city, town, time_zone, personality, interests, hobbies,
      education, qualifications, profession, skills, voice_preferences,
      avatar_storage_ref, cover_storage_ref, profile_visibility, extra_profile_data
    )
    values (
      v_identity_id,
      left(coalesce(v_profile->>'bio', ''), 4000),
      left(coalesce(v_profile->>'introduction', ''), 2000),
      v_gender,
      left(coalesce(v_profile->>'gender_presentation', ''), 80),
      left(coalesce(v_profile->>'nationality', ''), 120),
      v_country_origin,
      v_current_country,
      left(coalesce(v_profile->>'state_province', ''), 120),
      left(coalesce(v_profile->>'parish_county', ''), 120),
      left(coalesce(v_profile->>'district', ''), 120),
      left(coalesce(v_profile->>'city', ''), 120),
      left(coalesce(v_profile->>'town', ''), 120),
      left(coalesce(v_profile->>'time_zone', 'UTC'), 80),
      case when jsonb_typeof(v_profile->'personality') = 'object' then v_profile->'personality' else '{}'::jsonb end,
      case when jsonb_typeof(v_profile->'interests') = 'array' then array(select jsonb_array_elements_text(v_profile->'interests')) else '{}'::text[] end,
      case when jsonb_typeof(v_profile->'hobbies') = 'array' then array(select jsonb_array_elements_text(v_profile->'hobbies')) else '{}'::text[] end,
      case when jsonb_typeof(v_profile->'education') = 'array' then v_profile->'education' else '[]'::jsonb end,
      case when jsonb_typeof(v_profile->'qualifications') = 'array' then array(select jsonb_array_elements_text(v_profile->'qualifications')) else '{}'::text[] end,
      left(coalesce(v_profile->>'profession', ''), 180),
      case when jsonb_typeof(v_profile->'skills') = 'array' then array(select jsonb_array_elements_text(v_profile->'skills')) else '{}'::text[] end,
      case when jsonb_typeof(v_profile->'voice_preferences') = 'object' then v_profile->'voice_preferences' else '{}'::jsonb end,
      nullif(v_profile->>'avatar_storage_ref', ''),
      nullif(v_profile->>'cover_storage_ref', ''),
      case when v_profile->>'profile_visibility' in ('public', 'followers', 'private', 'hidden') then v_profile->>'profile_visibility' else 'public' end,
      case when jsonb_typeof(v_profile->'extra_profile_data') = 'object' then v_profile->'extra_profile_data' else '{}'::jsonb end
    );

    insert into ai_network.ai_identity_owners (
      identity_id, owner_type, owner_user_id, role, is_primary
    )
    values (v_identity_id, 'human_user', p_actor_user_id, 'owner', true);

    for v_item in select value from jsonb_array_elements(v_languages) loop
      if jsonb_typeof(v_item) = 'string' then
        v_language_tag := v_item #>> '{}';
        v_language_name := v_language_tag;
        v_dialect := '';
        v_proficiency := 'conversational';
        v_is_primary := false;
      elsif jsonb_typeof(v_item) = 'object' then
        v_language_tag := trim(coalesce(v_item->>'language_tag', ''));
        v_language_name := left(coalesce(v_item->>'language_name', v_language_tag), 120);
        v_dialect := left(coalesce(v_item->>'dialect', ''), 120);
        v_proficiency := coalesce(v_item->>'proficiency', 'conversational');
        v_is_primary := coalesce((v_item->>'is_primary')::boolean, false);
      else
        raise exception using errcode = '22023', message = 'Each AI language must be a language tag or a language object.';
      end if;
      if v_language_tag !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*      insert into ai_network.ai_identity_languages (
        identity_id, language_tag, language_name, dialect, proficiency, is_primary
      )
      values (
        v_identity_id, v_language_tag, v_language_name, v_dialect, v_proficiency, v_is_primary
      );
    end loop;

    for v_item in select value from jsonb_array_elements(v_locations) loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception using errcode = '22023', message = 'Each AI location must be a JSON object.';
      end if;
      v_location_type := coalesce(v_item->>'location_type', 'current');
      v_country_code := nullif(upper(trim(coalesce(v_item->>'country_code', ''))), '');
      insert into ai_network.ai_identity_locations (
        identity_id, location_type, country_code, country_name,
        state_province, parish_county, district, city, town, time_zone, is_public
      )
      values (
        v_identity_id, v_location_type, v_country_code,
        left(coalesce(v_item->>'country_name', ''), 120),
        left(coalesce(v_item->>'state_province', ''), 120),
        left(coalesce(v_item->>'parish_county', ''), 120),
        left(coalesce(v_item->>'district', ''), 120),
        left(coalesce(v_item->>'city', ''), 120),
        left(coalesce(v_item->>'town', ''), 120),
        left(coalesce(v_item->>'time_zone', 'UTC'), 80),
        coalesce((v_item->>'is_public')::boolean, false)
      );
    end loop;

    if jsonb_typeof(v_email) = 'object' then
      v_primary_email := lower(trim(coalesce(v_email->>'email_address', '')));
      if v_primary_email <> '' then
        insert into ai_network.ai_emails (
          identity_id, email_address, email_type, is_primary,
          verification_status, email_provider, provisioning_status,
          management_reference, email_status
        )
        values (
          v_identity_id,
          v_primary_email,
          coalesce(v_email->>'email_type', 'primary'),
          true,
          'unverified',
          left(coalesce(v_email->>'email_provider', ''), 120),
          'not_requested',
          null,
          'active'
        );
      end if;
    elsif v_email is not null and jsonb_typeof(v_email) <> 'null' then
      raise exception using errcode = '22023', message = 'AI email identity must be a JSON object.';
    end if;

    insert into ai_network.ai_identity_status_history (
      identity_id, previous_status, new_status, reason,
      actor_type, actor_user_id
    )
    values (v_identity_id, null, 'created', 'AI identity created by its Minglora owner.', 'human_user', p_actor_user_id);

    insert into ai_network.ai_identity_versions (
      identity_id, version_number, snapshot, change_note, changed_by_user_id
    )
    values (
      v_identity_id,
      1,
      jsonb_build_object(
        'population', v_population,
        'category_key', v_category_key,
        'name', jsonb_build_object(
          'first_name', v_first_name, 'middle_name', v_middle_name,
          'last_name', v_last_name, 'full_name', v_full_name,
          'display_name', v_display_name, 'username', v_username
        ),
        'profile', v_profile
      ),
      'Initial AI identity record.',
      p_actor_user_id
    );

    insert into ai_network.ai_identity_audit_logs (
      identity_id, actor_type, actor_user_id, action, metadata
    )
    values (
      v_identity_id, 'human_user', p_actor_user_id, 'identity_created',
      jsonb_build_object('population', v_population, 'category_key', v_category_key, 'identity_label', 'AI')
    );
  end if;

  select jsonb_build_object(
    'identity', to_jsonb(i),
    'name', to_jsonb(n),
    'profile', to_jsonb(p),
    'primary_email', (
      select jsonb_build_object(
        'email_address', e.email_address,
        'verification_status', e.verification_status,
        'provisioning_status', e.provisioning_status
      )
      from ai_network.ai_emails e
      where e.identity_id = i.identity_id and e.is_primary = true
      limit 1
    ),
    'reused', v_status = 'reused'
  )
  into v_result
  from ai_network.ai_identities i
  join ai_network.ai_names n on n.identity_id = i.identity_id
  join ai_network.ai_profiles p on p.identity_id = i.identity_id
  where i.identity_id = v_identity_id
    and i.owner_user_id = p_actor_user_id;

  return v_result;
end;
$function$;

comment on function public.minglora_ai_identity_command(text, uuid, jsonb)
  is 'Server-only Minglora AI identity read/create commands. Uses the private ai_network schema without exposing it to browser roles.';

revoke all on function public.minglora_ai_identity_command(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_identity_command(text, uuid, jsonb) to service_role;

commit;
 then
        raise exception using errcode = '22023', message = 'An AI language tag is invalid.';
      end if;
      if v_is_primary then
        if v_primary_language_seen then
          raise exception using errcode = '22023', message = 'Only one AI language can be marked as primary.';
        end if;
        v_primary_language_seen := true;
      end if;
      insert into ai_network.ai_identity_languages (
        identity_id, language_tag, language_name, dialect, proficiency, is_primary
      )
      values (
        v_identity_id, v_language_tag, v_language_name, v_dialect, v_proficiency, v_is_primary
      );
    end loop;

    for v_item in select value from jsonb_array_elements(v_locations) loop
      if jsonb_typeof(v_item) <> 'object' then
        raise exception using errcode = '22023', message = 'Each AI location must be a JSON object.';
      end if;
      v_location_type := coalesce(v_item->>'location_type', 'current');
      v_country_code := nullif(upper(trim(coalesce(v_item->>'country_code', ''))), '');
      insert into ai_network.ai_identity_locations (
        identity_id, location_type, country_code, country_name,
        state_province, parish_county, district, city, town, time_zone, is_public
      )
      values (
        v_identity_id, v_location_type, v_country_code,
        left(coalesce(v_item->>'country_name', ''), 120),
        left(coalesce(v_item->>'state_province', ''), 120),
        left(coalesce(v_item->>'parish_county', ''), 120),
        left(coalesce(v_item->>'district', ''), 120),
        left(coalesce(v_item->>'city', ''), 120),
        left(coalesce(v_item->>'town', ''), 120),
        left(coalesce(v_item->>'time_zone', 'UTC'), 80),
        coalesce((v_item->>'is_public')::boolean, false)
      );
    end loop;

    if jsonb_typeof(v_email) = 'object' then
      v_primary_email := lower(trim(coalesce(v_email->>'email_address', '')));
      if v_primary_email <> '' then
        insert into ai_network.ai_emails (
          identity_id, email_address, email_type, is_primary,
          verification_status, email_provider, provisioning_status,
          management_reference, email_status
        )
        values (
          v_identity_id,
          v_primary_email,
          coalesce(v_email->>'email_type', 'primary'),
          true,
          'unverified',
          left(coalesce(v_email->>'email_provider', ''), 120),
          'not_requested',
          null,
          'active'
        );
      end if;
    elsif v_email is not null and jsonb_typeof(v_email) <> 'null' then
      raise exception using errcode = '22023', message = 'AI email identity must be a JSON object.';
    end if;

    insert into ai_network.ai_identity_status_history (
      identity_id, previous_status, new_status, reason,
      actor_type, actor_user_id
    )
    values (v_identity_id, null, 'created', 'AI identity created by its Minglora owner.', 'human_user', p_actor_user_id);

    insert into ai_network.ai_identity_versions (
      identity_id, version_number, snapshot, change_note, changed_by_user_id
    )
    values (
      v_identity_id,
      1,
      jsonb_build_object(
        'population', v_population,
        'category_key', v_category_key,
        'name', jsonb_build_object(
          'first_name', v_first_name, 'middle_name', v_middle_name,
          'last_name', v_last_name, 'full_name', v_full_name,
          'display_name', v_display_name, 'username', v_username
        ),
        'profile', v_profile
      ),
      'Initial AI identity record.',
      p_actor_user_id
    );

    insert into ai_network.ai_identity_audit_logs (
      identity_id, actor_type, actor_user_id, action, metadata
    )
    values (
      v_identity_id, 'human_user', p_actor_user_id, 'identity_created',
      jsonb_build_object('population', v_population, 'category_key', v_category_key, 'identity_label', 'AI')
    );
  end if;

  select jsonb_build_object(
    'identity', to_jsonb(i),
    'name', to_jsonb(n),
    'profile', to_jsonb(p),
    'primary_email', (
      select jsonb_build_object(
        'email_address', e.email_address,
        'verification_status', e.verification_status,
        'provisioning_status', e.provisioning_status
      )
      from ai_network.ai_emails e
      where e.identity_id = i.identity_id and e.is_primary = true
      limit 1
    ),
    'reused', v_status = 'reused'
  )
  into v_result
  from ai_network.ai_identities i
  join ai_network.ai_names n on n.identity_id = i.identity_id
  join ai_network.ai_profiles p on p.identity_id = i.identity_id
  where i.identity_id = v_identity_id
    and i.owner_user_id = p_actor_user_id;

  return v_result;
end;
$function$;

comment on function public.minglora_ai_identity_command(text, uuid, jsonb)
  is 'Server-only Minglora AI identity read/create commands. Uses the private ai_network schema without exposing it to browser roles.';

revoke all on function public.minglora_ai_identity_command(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_identity_command(text, uuid, jsonb) to service_role;
\n