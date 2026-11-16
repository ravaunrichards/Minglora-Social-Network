-- Minglora AI identity profile editing.
-- Additive, owner-scoped profile registry and update APIs. Execution/provider state is unchanged.
-- Browser roles remain outside ai_network and cannot invoke either RPC.

grant select, update on ai_network.ai_identities, ai_network.ai_names, ai_network.ai_profiles to service_role;
grant select, insert, delete on ai_network.ai_identity_languages, ai_network.ai_identity_locations to service_role;
grant select, insert on ai_network.ai_identity_versions, ai_network.ai_identity_audit_logs to service_role;

create or replace function public.minglora_ai_identity_profile_registry(
  p_actor_user_id uuid,
  p_limit integer default 25,
  p_offset integer default 0,
  p_search text default ''
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := left(trim(coalesce(p_search, '')), 120);
  v_total bigint;
  v_rows jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI identity registry access is restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora owner is required.';
  end if;

  select count(*) into v_total
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

  select coalesce(jsonb_agg(q.record order by q.created_at desc), '[]'::jsonb)
    into v_rows
  from (
    select
      i.created_at,
      jsonb_build_object(
        'identity', to_jsonb(i),
        'name', to_jsonb(n),
        'profile', to_jsonb(p),
        'primary_email', (
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
        ),
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
      ) as record
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
    'identities', v_rows,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$function$;

comment on function public.minglora_ai_identity_profile_registry(uuid, integer, integer, text)
  is 'Owner-scoped AI identity registry including editable language and location relations.';

revoke all on function public.minglora_ai_identity_profile_registry(uuid, integer, integer, text) from public, anon, authenticated;
grant execute on function public.minglora_ai_identity_profile_registry(uuid, integer, integer, text) to service_role;

create or replace function public.minglora_ai_identity_profile_update(
  p_actor_user_id uuid,
  p_identity_id uuid,
  p_name jsonb,
  p_profile jsonb,
  p_languages jsonb default '[]'::jsonb,
  p_locations jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_identity ai_network.ai_identities%rowtype;
  v_name_row ai_network.ai_names%rowtype;
  v_profile_row ai_network.ai_profiles%rowtype;
  v_item jsonb;
  v_first_name text;
  v_middle_name text;
  v_last_name text;
  v_full_name text;
  v_display_name text;
  v_username text;
  v_gender text;
  v_visibility text;
  v_country_origin text;
  v_current_country text;
  v_time_zone text;
  v_language_tag text;
  v_language_name text;
  v_dialect text;
  v_proficiency text;
  v_is_primary boolean;
  v_primary_seen boolean := false;
  v_location_type text;
  v_country_code text;
  v_version bigint;
  v_snapshot jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI identity profile updates are restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora owner is required.';
  end if;
  if p_identity_id is null then
    raise exception using errcode = '22023', message = 'A valid AI identity ID is required.';
  end if;
  if jsonb_typeof(p_name) is distinct from 'object' or jsonb_typeof(p_profile) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'AI name and profile updates must be JSON objects.';
  end if;
  if jsonb_typeof(p_languages) is distinct from 'array' or jsonb_array_length(p_languages) > 50 then
    raise exception using errcode = '22023', message = 'AI language updates must be an array of at most 50 entries.';
  end if;
  if jsonb_typeof(p_locations) is distinct from 'array' or jsonb_array_length(p_locations) > 10 then
    raise exception using errcode = '22023', message = 'AI location updates must be an array of at most 10 entries.';
  end if;

  select i.* into v_identity
  from ai_network.ai_identities i
  where i.identity_id = p_identity_id
    and i.owner_user_id = p_actor_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'AI identity was not found for this Minglora owner.';
  end if;

  select n.* into v_name_row
  from ai_network.ai_names n
  where n.identity_id = p_identity_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'AI identity name record was not found.';
  end if;

  select p.* into v_profile_row
  from ai_network.ai_profiles p
  where p.identity_id = p_identity_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'AI identity profile record was not found.';
  end if;

  v_first_name := left(trim(coalesce(p_name->>'first_name', '')), 80);
  v_middle_name := left(trim(coalesce(p_name->>'middle_name', '')), 80);
  v_last_name := left(trim(coalesce(p_name->>'last_name', '')), 80);
  if v_first_name = '' or v_last_name = '' then
    raise exception using errcode = '22023', message = 'First name and last name are both required as separate fields.';
  end if;
  v_full_name := left(concat_ws(' ', v_first_name, nullif(v_middle_name, ''), v_last_name), 240);
  v_display_name := left(coalesce(nullif(trim(p_name->>'display_name'), ''), v_full_name), 120);
  if length(v_display_name) < 2 then
    raise exception using errcode = '22023', message = 'AI display name must contain at least two characters.';
  end if;
  v_username := lower(trim(coalesce(p_name->>'username', '')));
  if v_username !~ '^[a-z0-9_]{3,30}$' then
    raise exception using errcode = '22023', message = 'Username must contain 3 to 30 lowercase letters, numbers or underscores.';
  end if;

  v_gender := lower(coalesce(nullif(trim(p_profile->>'gender'), ''), v_profile_row.gender));
  if v_gender not in ('female', 'male', 'non_binary', 'other', 'prefer_not_to_say') then
    raise exception using errcode = '22023', message = 'Choose a supported AI gender option.';
  end if;
  v_visibility := lower(coalesce(nullif(trim(p_profile->>'profile_visibility'), ''), v_profile_row.profile_visibility));
  if v_visibility not in ('public', 'followers', 'private', 'hidden') then
    raise exception using errcode = '22023', message = 'Choose a supported AI profile visibility setting.';
  end if;
  v_country_origin := nullif(upper(trim(coalesce(p_profile->>'country_of_origin', ''))), '');
  v_current_country := nullif(upper(trim(coalesce(p_profile->>'current_country', ''))), '');
  if v_country_origin is not null and v_country_origin !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'Country of origin must use an ISO two-letter country code.';
  end if;
  if v_current_country is not null and v_current_country !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'Current country must use an ISO two-letter country code.';
  end if;
  v_time_zone := left(coalesce(nullif(trim(p_profile->>'time_zone'), ''), v_profile_row.time_zone, 'UTC'), 80);
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_time_zone) then
    raise exception using errcode = '22023', message = 'Choose a valid IANA time zone.';
  end if;

  if p_profile ? 'personality' and jsonb_typeof(p_profile->'personality') is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Personality settings must be a JSON object.';
  end if;
  if p_profile ? 'voice_preferences' and jsonb_typeof(p_profile->'voice_preferences') is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Voice preferences must be a JSON object.';
  end if;
  if p_profile ? 'education' and jsonb_typeof(p_profile->'education') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Education must be a JSON array.';
  end if;
  if p_profile ? 'interests' and jsonb_typeof(p_profile->'interests') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Interests must be an array.';
  end if;
  if p_profile ? 'hobbies' and jsonb_typeof(p_profile->'hobbies') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Hobbies must be an array.';
  end if;
  if p_profile ? 'qualifications' and jsonb_typeof(p_profile->'qualifications') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Qualifications must be an array.';
  end if;
  if p_profile ? 'skills' and jsonb_typeof(p_profile->'skills') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Skills must be an array.';
  end if;

  update ai_network.ai_names
  set first_name = v_first_name,
      middle_name = v_middle_name,
      last_name = v_last_name,
      full_name = v_full_name,
      display_name = v_display_name,
      username = v_username,
      updated_at = now()
  where identity_id = p_identity_id;

  update ai_network.ai_profiles
  set bio = left(coalesce(p_profile->>'bio', ''), 4000),
      introduction = left(coalesce(p_profile->>'introduction', ''), 2000),
      gender = v_gender,
      gender_presentation = left(coalesce(p_profile->>'gender_presentation', ''), 80),
      nationality = left(coalesce(p_profile->>'nationality', ''), 120),
      country_of_origin = v_country_origin,
      current_country = v_current_country,
      state_province = left(coalesce(p_profile->>'state_province', ''), 120),
      parish_county = left(coalesce(p_profile->>'parish_county', ''), 120),
      district = left(coalesce(p_profile->>'district', ''), 120),
      city = left(coalesce(p_profile->>'city', ''), 120),
      town = left(coalesce(p_profile->>'town', ''), 120),
      time_zone = v_time_zone,
      personality = case when p_profile ? 'personality' then p_profile->'personality' else personality end,
      interests = case when p_profile ? 'interests' then array(select jsonb_array_elements_text(p_profile->'interests')) else interests end,
      hobbies = case when p_profile ? 'hobbies' then array(select jsonb_array_elements_text(p_profile->'hobbies')) else hobbies end,
      education = case when p_profile ? 'education' then p_profile->'education' else education end,
      qualifications = case when p_profile ? 'qualifications' then array(select jsonb_array_elements_text(p_profile->'qualifications')) else qualifications end,
      profession = left(coalesce(p_profile->>'profession', ''), 180),
      skills = case when p_profile ? 'skills' then array(select jsonb_array_elements_text(p_profile->'skills')) else skills end,
      voice_preferences = case when p_profile ? 'voice_preferences' then p_profile->'voice_preferences' else voice_preferences end,
      profile_visibility = v_visibility,
      updated_at = now()
  where identity_id = p_identity_id;

  update ai_network.ai_identities
  set updated_at = now()
  where identity_id = p_identity_id and owner_user_id = p_actor_user_id;

  delete from ai_network.ai_identity_languages where identity_id = p_identity_id;
  for v_item in select value from jsonb_array_elements(p_languages) loop
    if jsonb_typeof(v_item) = 'string' then
      v_language_tag := trim(v_item #>> '{}');
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
      raise exception using errcode = '22023', message = 'Each AI language must be a language tag or language object.';
    end if;
    if v_language_tag !~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$' then
      raise exception using errcode = '22023', message = 'Each AI language must use a valid BCP 47 language tag.';
    end if;
    if v_proficiency not in ('native', 'fluent', 'professional', 'conversational', 'basic', 'learning') then
      raise exception using errcode = '22023', message = 'Choose a supported language proficiency.';
    end if;
    if v_is_primary and v_primary_seen then
      raise exception using errcode = '22023', message = 'Only one AI language may be marked primary.';
    end if;
    v_primary_seen := v_primary_seen or v_is_primary;
    insert into ai_network.ai_identity_languages (
      identity_id, language_tag, language_name, dialect, proficiency, is_primary
    ) values (
      p_identity_id, v_language_tag, v_language_name, v_dialect, v_proficiency, v_is_primary
    );
  end loop;

  delete from ai_network.ai_identity_locations where identity_id = p_identity_id;
  for v_item in select value from jsonb_array_elements(p_locations) loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception using errcode = '22023', message = 'Each AI location must be a JSON object.';
    end if;
    v_location_type := coalesce(v_item->>'location_type', 'current');
    if v_location_type not in ('origin', 'current', 'nationality', 'operating_region', 'other') then
      raise exception using errcode = '22023', message = 'Choose a supported AI location type.';
    end if;
    v_country_code := nullif(upper(trim(coalesce(v_item->>'country_code', ''))), '');
    if v_country_code is not null and v_country_code !~ '^[A-Z]{2}$' then
      raise exception using errcode = '22023', message = 'AI location country must use an ISO two-letter code.';
    end if;
    insert into ai_network.ai_identity_locations (
      identity_id, location_type, country_code, country_name,
      state_province, parish_county, district, city, town, time_zone, is_public
    ) values (
      p_identity_id,
      v_location_type,
      v_country_code,
      left(coalesce(v_item->>'country_name', ''), 120),
      left(coalesce(v_item->>'state_province', ''), 120),
      left(coalesce(v_item->>'parish_county', ''), 120),
      left(coalesce(v_item->>'district', ''), 120),
      left(coalesce(v_item->>'city', ''), 120),
      left(coalesce(v_item->>'town', ''), 120),
      left(coalesce(nullif(v_item->>'time_zone', ''), v_time_zone), 80),
      coalesce((v_item->>'is_public')::boolean, false)
    );
  end loop;

  select coalesce(max(v.version_number), 0) + 1 into v_version
  from ai_network.ai_identity_versions v
  where v.identity_id = p_identity_id;

  select jsonb_build_object(
    'identity', to_jsonb(i),
    'name', to_jsonb(n),
    'profile', to_jsonb(p),
    'languages', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.is_primary desc, l.language_tag)
      from ai_network.ai_identity_languages l where l.identity_id = i.identity_id
    ), '[]'::jsonb),
    'locations', coalesce((
      select jsonb_agg(to_jsonb(loc) order by loc.location_type, loc.created_at)
      from ai_network.ai_identity_locations loc where loc.identity_id = i.identity_id
    ), '[]'::jsonb)
  )
  into v_snapshot
  from ai_network.ai_identities i
  join ai_network.ai_names n on n.identity_id = i.identity_id
  join ai_network.ai_profiles p on p.identity_id = i.identity_id
  where i.identity_id = p_identity_id and i.owner_user_id = p_actor_user_id;

  insert into ai_network.ai_identity_versions (
    identity_id, version_number, snapshot, change_note, changed_by_user_id
  ) values (
    p_identity_id, v_version, v_snapshot, 'AI identity profile and language/location details updated.', p_actor_user_id
  );

  insert into ai_network.ai_identity_audit_logs (
    identity_id, actor_type, actor_user_id, action, metadata
  ) values (
    p_identity_id, 'human_user', p_actor_user_id, 'identity_profile_updated',
    jsonb_build_object('fields', jsonb_build_array('name','profile','languages','locations'), 'version_number', v_version)
  );

  return v_snapshot || jsonb_build_object(
    'primary_email', (
      select jsonb_build_object(
        'email_address', e.email_address,
        'verification_status', e.verification_status,
        'provisioning_status', e.provisioning_status
      )
      from ai_network.ai_emails e
      where e.identity_id = p_identity_id and e.is_primary = true
      limit 1
    )
  );
end;
$function$;

comment on function public.minglora_ai_identity_profile_update(uuid, uuid, jsonb, jsonb, jsonb, jsonb)
  is 'Server-only owner-scoped AI identity profile edit with language/location replacement, immutable identity ownership and version/audit records.';

revoke all on function public.minglora_ai_identity_profile_update(uuid, uuid, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.minglora_ai_identity_profile_update(uuid, uuid, jsonb, jsonb, jsonb, jsonb) to service_role;
