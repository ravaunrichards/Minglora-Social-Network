-- Authorize private AI avatar/cover reads from profile visibility and relationship state.
create or replace function public.minglora_ai_identity_media_access(
  p_actor_user_id uuid,
  p_identity_id uuid,
  p_slot text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_owner_user_id uuid;
  v_identity_status text;
  v_enabled boolean;
  v_visibility text;
  v_storage_ref text;
  v_is_owner boolean;
  v_bucket text := 'minglora-ai-profile-media';
  v_expected_prefix text;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'AI profile media access is restricted to the Minglora server runtime.';
  end if;

  if p_actor_user_id is null or not exists (
    select 1 from public.profiles p where p.id = p_actor_user_id
  ) then
    raise exception using errcode = '42501',
      message = 'A valid signed-in Minglora user is required.';
  end if;

  if p_identity_id is null or p_slot is null or p_slot not in ('avatar', 'cover') then
    raise exception using errcode = '22023',
      message = 'Choose a valid AI identity and profile image slot.';
  end if;

  select
    i.owner_user_id,
    i.status,
    i.enabled,
    p.profile_visibility,
    case when p_slot = 'avatar' then p.avatar_storage_ref else p.cover_storage_ref end
  into
    v_owner_user_id,
    v_identity_status,
    v_enabled,
    v_visibility,
    v_storage_ref
  from ai_network.ai_identities i
  join ai_network.ai_profiles p on p.identity_id = i.identity_id
  where i.identity_id = p_identity_id;

  if not found or v_owner_user_id is null then
    raise exception using errcode = 'P0002',
      message = 'AI profile media is unavailable.';
  end if;

  v_is_owner := v_owner_user_id = p_actor_user_id;

  if not v_is_owner then
    if v_identity_status <> 'active' or not v_enabled
       or v_visibility not in ('public', 'followers') then
      raise exception using errcode = 'P0002',
        message = 'AI profile media is unavailable.';
    end if;

    if exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = p_actor_user_id and b.blocked_id = v_owner_user_id)
         or (b.blocker_id = v_owner_user_id and b.blocked_id = p_actor_user_id)
    ) then
      raise exception using errcode = 'P0002',
        message = 'AI profile media is unavailable.';
    end if;

    if v_visibility = 'followers' and not exists (
      select 1
      from ai_network.ai_identity_follows f
      where f.identity_id = p_identity_id
        and f.follower_user_id = p_actor_user_id
        and f.follow_status = 'active'
    ) then
      raise exception using errcode = 'P0002',
        message = 'AI profile media is unavailable.';
    end if;
  end if;

  if v_storage_ref is null then
    return jsonb_build_object('available', false, 'bucket', v_bucket, 'slot', p_slot);
  end if;

  v_expected_prefix := v_owner_user_id::text || '/ai-identities/' || p_identity_id::text || '/';
  if left(v_storage_ref, length(v_expected_prefix)) <> v_expected_prefix
     or strpos(v_storage_ref, '..') > 0
     or length(v_storage_ref) > 1024 then
    raise exception using errcode = 'P0002',
      message = 'AI profile media is unavailable.';
  end if;

  if not exists (
    select 1
    from public.media_assets a
    where a.owner_id = v_owner_user_id
      and a.storage_bucket = v_bucket
      and a.storage_key = v_storage_ref
      and a.slot = p_slot
      and a.asset_status = 'attached'
      and a.processing_status = 'ready'
      and a.attached_to = 'ai_identity:' || p_identity_id::text || ':' || p_slot
  ) then
    return jsonb_build_object('available', false, 'bucket', v_bucket, 'slot', p_slot);
  end if;

  return jsonb_build_object(
    'available', true,
    'owner_id', v_owner_user_id,
    'bucket', v_bucket,
    'storage_ref', v_storage_ref,
    'slot', p_slot
  );
end;
$function$;

comment on function public.minglora_ai_identity_media_access(uuid, uuid, text)
  is 'Authorizes short-lived private AI avatar/cover reads for the owner or profile-visibility-approved Minglora viewers, respecting active follows and block relationships.';

revoke all on function public.minglora_ai_identity_media_access(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.minglora_ai_identity_media_access(uuid, uuid, text)
  to service_role;
