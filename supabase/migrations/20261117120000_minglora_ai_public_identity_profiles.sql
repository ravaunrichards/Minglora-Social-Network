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
  v_origin_location_public boolean := false;
  v_current_location_public boolean := false;
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

  v_is_owner := coalesce(v_identity.owner_user_id = p_actor_user_id, false);

  if not v_is_owner and exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = p_actor_user_id and b.blocked_id = v_identity.owner_user_id)
       or (b.blocker_id = v_identity.owner_user_id and b.blocked_id = p_actor_user_id)
  ) then
    raise exception using errcode = 'P0002', message = 'AI profile is unavailable.';
  end if;

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

    if v_profile.profile_visibility in ('followers', 'private') and not v_is_following then
      raise exception using errcode = 'P0002', message = 'AI profile is available to approved followers only.';
    elsif coalesce(v_profile.profile_visibility, 'hidden') not in ('public', 'followers', 'private') then
      raise exception using errcode = 'P0002', message = 'AI profile is unavailable.';
    end if;
  end if;

  select count(*) into v_follower_count
  from ai_network.ai_identity_follows f
  where f.identity_id = p_identity_id and f.follow_status = 'active';

  -- Keep profile-level location values behind the same explicit location-sharing
  -- consent as the structured public location list. Profile visibility alone does
  -- not imply consent to disclose country, parish, district, city or town.
  select exists (
    select 1 from ai_network.ai_identity_locations loc
    where loc.identity_id = p_identity_id
      and loc.location_type = 'origin'
      and loc.is_public is true
  ) into v_origin_location_public;

  select exists (
    select 1 from ai_network.ai_identity_locations loc
    where loc.identity_id = p_identity_id
      and loc.location_type = 'current'
      and loc.is_public is true
  ) into v_current_location_public;

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
      'country_of_origin', case when v_origin_location_public then v_profile.country_of_origin else null end,
      'current_country', case when v_current_location_public then v_profile.current_country else null end,
      'time_zone', case when v_current_location_public then v_profile.time_zone else null end,
      'state_province', case when v_current_location_public then v_profile.state_province else null end,
      'parish_county', case when v_current_location_public then v_profile.parish_county else null end,
      'district', case when v_current_location_public then v_profile.district else null end,
      'city', case when v_current_location_public then v_profile.city else null end,
      'town', case when v_current_location_public then v_profile.town else null end,
      'interests', to_jsonb(v_profile.interests),
      'hobbies', to_jsonb(v_profile.hobbies),
      'profession', v_profile.profession,
      'skills', to_jsonb(v_profile.skills),
      'qualifications', to_jsonb(v_profile.qualifications),
      'education', coalesce((
        select jsonb_agg(
          case
            when jsonb_typeof(item.value) = 'object' then jsonb_strip_nulls(jsonb_build_object(
              'qualification', case when jsonb_typeof(item.value->'qualification') in ('string','number') then item.value->'qualification' end,
              'degree', case when jsonb_typeof(item.value->'degree') in ('string','number') then item.value->'degree' end,
              'title', case when jsonb_typeof(item.value->'title') in ('string','number') then item.value->'title' end,
              'program', case when jsonb_typeof(item.value->'program') in ('string','number') then item.value->'program' end,
              'institution', case when jsonb_typeof(item.value->'institution') = 'string' then item.value->'institution' end,
              'school', case when jsonb_typeof(item.value->'school') = 'string' then item.value->'school' end,
              'organization', case when jsonb_typeof(item.value->'organization') = 'string' then item.value->'organization' end,
              'field_of_study', case when jsonb_typeof(item.value->'field_of_study') = 'string' then item.value->'field_of_study' end,
              'subject', case when jsonb_typeof(item.value->'subject') = 'string' then item.value->'subject' end,
              'specialization', case when jsonb_typeof(item.value->'specialization') = 'string' then item.value->'specialization' end,
              'start_year', case when jsonb_typeof(item.value->'start_year') in ('string','number') then item.value->'start_year' end,
              'start_date', case when jsonb_typeof(item.value->'start_date') = 'string' then item.value->'start_date' end,
              'end_year', case when jsonb_typeof(item.value->'end_year') in ('string','number') then item.value->'end_year' end,
              'end_date', case when jsonb_typeof(item.value->'end_date') = 'string' then item.value->'end_date' end,
              'description', case when jsonb_typeof(item.value->'description') = 'string' then item.value->'description' end
            ))
            else jsonb_build_object('qualification', item.value)
          end order by item.ordinality
        )
        from jsonb_array_elements(
          case when jsonb_typeof(v_profile.education) = 'array' then v_profile.education else '[]'::jsonb end
        ) with ordinality as item(value, ordinality)
      ), '[]'::jsonb),
      'personality', jsonb_strip_nulls(jsonb_build_object(
        'summary', case when jsonb_typeof(v_profile.personality->'summary') = 'string' then v_profile.personality->'summary' end,
        'traits', case when jsonb_typeof(v_profile.personality->'traits') = 'array' then (
          select coalesce(jsonb_agg(trait.safe_value order by trait.ordinality), '[]'::jsonb)
          from (
            select case when jsonb_typeof(item.value) = 'string' then item.value else item.value->'name' end as safe_value,
                   item.ordinality
            from jsonb_array_elements(v_profile.personality->'traits') with ordinality as item(value, ordinality)
            where jsonb_typeof(item.value) = 'string'
               or (jsonb_typeof(item.value) = 'object' and jsonb_typeof(item.value->'name') = 'string')
          ) trait
        ) else '[]'::jsonb end,
        'communication_style', case when jsonb_typeof(v_profile.personality->'communication_style') = 'string' then v_profile.personality->'communication_style' end,
        'tone', case when jsonb_typeof(v_profile.personality->'tone') = 'string' then v_profile.personality->'tone' end
      )),
      'voice_preferences', jsonb_strip_nulls(jsonb_build_object(
        'display_name', case when jsonb_typeof(v_profile.voice_preferences->'display_name') = 'string' then v_profile.voice_preferences->'display_name' end,
        'language', case when jsonb_typeof(v_profile.voice_preferences->'language') = 'string' then v_profile.voice_preferences->'language' end,
        'dialect', case when jsonb_typeof(v_profile.voice_preferences->'dialect') = 'string' then v_profile.voice_preferences->'dialect' end,
        'style', case when jsonb_typeof(v_profile.voice_preferences->'style') = 'string' then v_profile.voice_preferences->'style' end,
        'voice_type', case when jsonb_typeof(v_profile.voice_preferences->'voice_type') = 'string' then v_profile.voice_preferences->'voice_type' end
      )),
      'has_avatar', exists (
        select 1 from public.media_assets a
        where a.owner_id = v_identity.owner_user_id
          and a.storage_bucket = 'minglora-ai-profile-media'
          and a.storage_key = v_profile.avatar_storage_ref
          and a.slot = 'avatar'
          and a.asset_status = 'attached'
          and a.processing_status = 'ready'
          and a.attached_to = 'ai_identity:' || p_identity_id::text || ':avatar'
      ),
      'has_cover', exists (
        select 1 from public.media_assets a
        where a.owner_id = v_identity.owner_user_id
          and a.storage_bucket = 'minglora-ai-profile-media'
          and a.storage_key = v_profile.cover_storage_ref
          and a.slot = 'cover'
          and a.asset_status = 'attached'
          and a.processing_status = 'ready'
          and a.attached_to = 'ai_identity:' || p_identity_id::text || ':cover'
      )
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
