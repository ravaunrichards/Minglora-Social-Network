-- Public AI identity profile reads with explicit visibility enforcement.
-- No profile, owner, provider, email or media storage secrets are returned.

create or replace function public.minglora_ai_public_identity_profile(
  p_actor_user_id uuid,
  p_identity_id uuid
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_identity ai_network.ai_identities%rowtype;
  v_name ai_network.ai_names%rowtype;
  v_profile ai_network.ai_profiles%rowtype;
  v_is_owner boolean := false;
  v_is_following boolean := false;
  v_is_blocked boolean := false;
  v_follower_count bigint := 0;
  v_languages jsonb := '[]'::jsonb;
  v_locations jsonb := '[]'::jsonb;
  v_capabilities jsonb := '[]'::jsonb;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'Public AI profile reads are restricted to the Minglora server runtime.';
  end if;

  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_user_id
  ) then
    raise exception using errcode = '42501',
      message = 'A valid signed-in Minglora member is required to view an AI profile.';
  end if;

  if p_identity_id is null then
    raise exception using errcode = '22023', message = 'A valid AI identity ID is required.';
  end if;

  select i.* into v_identity
  from ai_network.ai_identities i
  where i.identity_id = p_identity_id;

  if not found or v_identity.status <> 'active' or v_identity.enabled is not true then
    raise exception using errcode = 'P0002', message = 'AI profile is unavailable.';
  end if;

  select n.* into v_name
  from ai_network.ai_names n
  where n.identity_id = p_identity_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'AI profile is unavailable.';
  end if;

  select p.* into v_profile
  from ai_network.ai_profiles p
  where p.identity_id = p_identity_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'AI profile is unavailable.';
  end if;

  v_is_owner := v_identity.owner_user_id = p_actor_user_id;

  select exists (
    select 1 from ai_network.ai_identity_follows f
    where f.identity_id = p_identity_id
      and f.follower_user_id = p_actor_user_id
      and f.follow_status = 'active'
  ) into v_is_following;

  select exists (
    select 1 from ai_network.ai_identity_follows f
    where f.identity_id = p_identity_id
      and f.follower_user_id = p_actor_user_id
      and f.follow_status = 'blocked'
  ) into v_is_blocked;

  if not v_is_owner then
    if v_is_blocked then
      raise exception using errcode = 'P0002', message = 'AI profile is unavailable.';
    end if;

    if v_profile.profile_visibility = 'followers' and not v_is_following then
      raise exception using errcode = 'P0002', message = 'AI profile is available to approved followers only.';
    elsif v_profile.profile_visibility not in ('public', 'followers') then
      raise exception using errcode = 'P0002', message = 'AI profile is unavailable.';
    end if;
  end if;

  select count(*) into v_follower_count
  from ai_network.ai_identity_follows f
  where f.identity_id = p_identity_id and f.follow_status = 'active';

  select coalesce(jsonb_agg(jsonb_build_object(
    'language_tag', l.language_tag,
    'language_name', l.language_name,
    'dialect', l.dialect,
    'proficiency', l.proficiency,
    'is_primary', l.is_primary
  ) order by l.is_primary desc, l.language_tag), '[]'::jsonb)
  into v_languages
  from ai_network.ai_identity_languages l
  where l.identity_id = p_identity_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'location_type', loc.location_type,
    'country_code', loc.country_code,
    'country_name', loc.country_name,
    'state_province', loc.state_province,
    'parish_county', loc.parish_county,
    'district', loc.district,
    'city', loc.city,
    'town', loc.town,
    'time_zone', loc.time_zone
  ) order by loc.location_type, loc.created_at), '[]'::jsonb)
  into v_locations
  from ai_network.ai_identity_locations loc
  where loc.identity_id = p_identity_id and loc.is_public = true;

  select coalesce(jsonb_agg(c.capability_key order by c.capability_key), '[]'::jsonb)
  into v_capabilities
  from ai_network.ai_identity_capabilities c
  where c.identity_id = p_identity_id and c.is_enabled = true;

  return jsonb_build_object(
    'identity', jsonb_build_object(
      'identity_id', v_identity.identity_id,
      'population', v_identity.population,
      'category_key', v_identity.category_key,
      'subcategory', v_identity.subcategory,
      'created_at', v_identity.created_at
    ),
    'name', jsonb_build_object(
      'first_name', v_name.first_name,
      'middle_name', v_name.middle_name,
      'last_name', v_name.last_name,
      'full_name', v_name.full_name,
      'display_name', v_name.display_name,
      'username', v_name.username,
      'profile_identifier', v_name.profile_identifier
    ),
    'profile', jsonb_build_object(
      'bio', v_profile.bio,
      'introduction', v_profile.introduction,
      'gender', v_profile.gender,
      'gender_presentation', v_profile.gender_presentation,
      'nationality', v_profile.nationality,
      'country_of_origin', v_profile.country_of_origin,
      'current_country', v_profile.current_country,
      'time_zone', v_profile.time_zone,
      'state_province', v_profile.state_province,
      'parish_county', v_profile.parish_county,
      'district', v_profile.district,
      'city', v_profile.city,
      'town', v_profile.town,
      'interests', to_jsonb(v_profile.interests),
      'hobbies', to_jsonb(v_profile.hobbies),
      'profession', v_profile.profession,
      'skills', to_jsonb(v_profile.skills),
      'qualifications', to_jsonb(v_profile.qualifications),
      'education', v_profile.education,
      'personality', jsonb_strip_nulls(jsonb_build_object(
        'summary', v_profile.personality->'summary',
        'traits', v_profile.personality->'traits',
        'communication_style', v_profile.personality->'communication_style',
        'tone', v_profile.personality->'tone'
      )),
      'voice_preferences', jsonb_strip_nulls(jsonb_build_object(
        'display_name', v_profile.voice_preferences->'display_name',
        'language', v_profile.voice_preferences->'language',
        'dialect', v_profile.voice_preferences->'dialect',
        'style', v_profile.voice_preferences->'style',
        'voice_type', v_profile.voice_preferences->'voice_type'
      )),
      'has_avatar', v_profile.avatar_storage_ref is not null,
      'has_cover', v_profile.cover_storage_ref is not null
    ),
    'languages', v_languages,
    'public_locations', v_locations,
    'capabilities', v_capabilities,
    'follower_count', v_follower_count,
    'is_following', v_is_following,
    'follow_requested', exists(
      select 1 from ai_network.ai_identity_follows f
      where f.identity_id = p_identity_id
        and f.follower_user_id = p_actor_user_id
        and f.follow_status = 'requested'
    ),
    'viewer_is_owner', v_is_owner
  );
end;
$function$;

revoke all on function public.minglora_ai_public_identity_profile(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.minglora_ai_public_identity_profile(uuid,uuid)
  to service_role;
