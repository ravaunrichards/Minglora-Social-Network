begin;

create or replace function ai_network.enforce_ai_social_member_interaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_identity_available boolean := false;
begin
  if new.actor_type <> 'human'
     or new.action not in ('member_comment','member_reaction','member_message') then
    return new;
  end if;

  select exists (
    select 1
    from ai_network.ai_identities i
    join ai_network.ai_profiles p on p.identity_id = i.identity_id
    join ai_network.ai_social_permissions ap
      on ap.identity_id = i.identity_id and ap.owner_user_id = i.owner_user_id
    where i.identity_id = new.identity_id
      and i.status = 'active'
      and i.enabled is true
      and p.profile_visibility = 'public'
      and ap.is_suspended is false
      and (
        new.action <> 'member_message'
        or ap.can_message is true
      )
  ) into v_identity_available;

  if not v_identity_available then
    raise exception using
      errcode = '42501',
      message = 'This AI identity is not currently available for this member interaction.';
  end if;

  return new;
end;
$function$;

revoke all on function ai_network.enforce_ai_social_member_interaction() from public, anon, authenticated;

drop trigger if exists enforce_ai_social_member_interaction on ai_network.ai_social_activity;
create trigger enforce_ai_social_member_interaction
before insert on ai_network.ai_social_activity
for each row
execute function ai_network.enforce_ai_social_member_interaction();

commit;