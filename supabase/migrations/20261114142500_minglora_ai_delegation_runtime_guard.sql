-- Revalidate delegated authority whenever a queued task is approved or claimed.
-- Prevents a paused/revoked/expired grant from being approved or executed after the grant changes.

create or replace function ai_network.enforce_delegated_task_authority()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_grant_status text;
  v_grant_expiry timestamptz;
  v_grantor_identity_id uuid;
  v_grantee_identity_id uuid;
  v_team_status text;
  v_organization_id uuid;
begin
  if new.delegation_grant_id is null then
    return new;
  end if;

  if new.status not in ('queued','running') then
    return new;
  end if;

  select g.grant_status,g.expires_at,g.grantor_identity_id,g.grantee_identity_id,
         t.status,t.organization_id
    into v_grant_status,v_grant_expiry,v_grantor_identity_id,v_grantee_identity_id,
         v_team_status,v_organization_id
  from ai_network.ai_delegation_grants g
  join ai_network.ai_teams t
    on t.team_id=g.team_id and t.owner_user_id=g.owner_user_id
  where g.delegation_grant_id=new.delegation_grant_id
    and g.owner_user_id=new.owner_user_id;

  if not found
     or v_grant_status <> 'active'
     or v_grant_expiry <= now()
     or v_team_status <> 'active' then
    raise exception using errcode='42501',
      message='Delegated task authority is no longer active; the task cannot be approved or claimed.';
  end if;

  if new.delegated_from_identity_id is distinct from v_grantor_identity_id
     or new.identity_id is distinct from v_grantee_identity_id
     or new.requires_approval is distinct from true
     or new.approved_by_user_id is null then
    raise exception using errcode='42501',
      message='Delegated task approval or grant provenance is invalid.';
  end if;

  if not exists (
    select 1
    from ai_network.ai_team_memberships m
    where m.owner_user_id=new.owner_user_id
      and m.team_id=(select g.team_id from ai_network.ai_delegation_grants g
        where g.delegation_grant_id=new.delegation_grant_id)
      and m.identity_id=v_grantor_identity_id
      and m.member_role='lead'
      and m.membership_status='active'
  ) or not exists (
    select 1
    from ai_network.ai_team_memberships m
    where m.owner_user_id=new.owner_user_id
      and m.team_id=(select g.team_id from ai_network.ai_delegation_grants g
        where g.delegation_grant_id=new.delegation_grant_id)
      and m.identity_id=v_grantee_identity_id
      and m.member_role in ('member','observer')
      and m.membership_status='active'
  ) then
    raise exception using errcode='42501',
      message='Delegated task team membership is no longer valid.';
  end if;

  if not exists (
    select 1 from ai_network.ai_identities i
    where i.identity_id=v_grantor_identity_id
      and i.owner_user_id=new.owner_user_id and i.status='active' and i.enabled=true
  ) or not exists (
    select 1 from ai_network.ai_identities i
    where i.identity_id=v_grantee_identity_id
      and i.owner_user_id=new.owner_user_id and i.status='active' and i.enabled=true
      and i.supervision_level <> 'restricted_observation'
  ) then
    raise exception using errcode='42501',
      message='Delegated task identities are no longer active and eligible.';
  end if;

  if v_organization_id is not null and not exists (
    select 1
    from ai_network.ai_employment_records manager
    join ai_network.ai_employment_records report
      on report.manager_employment_id=manager.employment_id
      and report.organization_id=manager.organization_id
    where manager.organization_id=v_organization_id
      and manager.identity_id=v_grantor_identity_id
      and report.identity_id=v_grantee_identity_id
      and manager.employment_status='active'
      and report.employment_status='active'
  ) then
    raise exception using errcode='42501',
      message='Organizational delegated task reporting authority is no longer valid.';
  end if;

  return new;
end;
$function$;

revoke all on function ai_network.enforce_delegated_task_authority() from public,anon,authenticated;
grant execute on function ai_network.enforce_delegated_task_authority() to service_role;

drop trigger if exists ai_task_queue_delegation_authority_guard on ai_network.ai_task_queue;
create trigger ai_task_queue_delegation_authority_guard
before update of status on ai_network.ai_task_queue
for each row
execute function ai_network.enforce_delegated_task_authority();
