-- Secure, owner-scoped attachment of verified Storage media to an AI identity profile.
-- AI identity media stays separate from the human owner's own avatar and cover.
create or replace function public.minglora_ai_identity_profile_media_update(
  p_actor_user_id uuid,
  p_identity_id uuid,
  p_slot text,
  p_storage_ref text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_identity ai_network.ai_identities%rowtype;
  v_profile ai_network.ai_profiles%rowtype;
  v_expected_bucket text;
  v_expected_prefix text;
  v_version bigint;
  v_snapshot jsonb;
  v_action text;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'AI profile media updates are restricted to the Minglora server runtime.';
  end if;
  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_user_id
  ) then
    raise exception using errcode = '42501', message = 'A valid signed-in Minglora owner is required.';
  end if;
  if p_identity_id is null or p_slot is null or p_slot not in ('avatar', 'cover') then
    raise exception using errcode = '22023', message = 'Choose a valid AI identity and profile image slot.';
  end if;

  select i.* into v_identity
  from ai_network.ai_identities i
  where i.identity_id = p_identity_id
    and i.owner_user_id = p_actor_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'AI identity was not found for this Minglora owner.';
  end if;

  select p.* into v_profile
  from ai_network.ai_profiles p
  where p.identity_id = p_identity_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'AI identity profile record was not found.';
  end if;

  v_expected_bucket := 'minglora-ai-profile-media';
  v_expected_prefix := p_actor_user_id::text || '/ai-identities/' || p_identity_id::text || '/';
  if p_storage_ref is null
     or left(p_storage_ref, length(v_expected_prefix)) <> v_expected_prefix
     or strpos(p_storage_ref, '..') > 0
     or length(p_storage_ref) > 1024 then
    raise exception using errcode = '22023', message = 'The AI profile image must use this identity owner-scoped Storage path.';
  end if;

  if not exists (
    select 1
    from public.media_assets a
    where a.owner_id = p_actor_user_id
      and a.storage_bucket = v_expected_bucket
      and a.storage_key = p_storage_ref
      and a.slot = p_slot
      and a.asset_status = 'attached'
      and a.processing_status = 'ready'
      and a.attached_to = 'ai_identity:' || p_identity_id::text || ':' || p_slot
  ) then
    raise exception using errcode = '23503', message = 'The uploaded image has not passed Minglora media verification.';
  end if;

  if (p_slot = 'avatar' and v_profile.avatar_storage_ref = p_storage_ref)
     or (p_slot = 'cover' and v_profile.cover_storage_ref = p_storage_ref) then
    return jsonb_build_object('identity', to_jsonb(v_identity), 'profile', to_jsonb(v_profile));
  end if;

  if p_slot = 'avatar' then
    update ai_network.ai_profiles
    set avatar_storage_ref = p_storage_ref, updated_at = now()
    where identity_id = p_identity_id;
    v_action := 'identity_avatar_updated';
  else
    update ai_network.ai_profiles
    set cover_storage_ref = p_storage_ref, updated_at = now()
    where identity_id = p_identity_id;
    v_action := 'identity_cover_updated';
  end if;

  update ai_network.ai_identities
  set updated_at = now()
  where identity_id = p_identity_id and owner_user_id = p_actor_user_id;

  select coalesce(max(v.version_number), 0) + 1
  into v_version
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
    p_identity_id, v_version, v_snapshot,
    'AI ' || p_slot || ' image reference updated.', p_actor_user_id
  );

  insert into ai_network.ai_identity_audit_logs (
    identity_id, actor_type, actor_user_id, action, metadata
  ) values (
    p_identity_id, 'human_user', p_actor_user_id, v_action,
    jsonb_build_object('slot', p_slot, 'storage_ref', p_storage_ref, 'version_number', v_version)
  );

  return v_snapshot;
end;
$function$;

comment on function public.minglora_ai_identity_profile_media_update(uuid, uuid, text, text)
  is 'Owner-scoped attachment of verified avatar/cover objects to AI identity profiles; never updates the human profile.';

revoke all on function public.minglora_ai_identity_profile_media_update(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.minglora_ai_identity_profile_media_update(uuid, uuid, text, text)
  to service_role;
