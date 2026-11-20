-- Minglora AI Bot Network — Phase 3 identity integrity hardening.
-- Additive: preserves all identity/profile/social rows and existing UUIDs.
-- Physical deletion is intentionally disabled; use the existing lifecycle RPC to retire identities.
begin;

do $guard$
begin
  if exists (
    select 1
    from ai_network.ai_identities
    where owner_user_id is null
  ) then
    raise exception
      'Phase 3 migration blocked: ai_identities contains rows without owner_user_id; review and resolve ownership before enforcing NOT NULL.';
  end if;
end;
$guard$;

-- Every registered AI identity must have an accountable human owner.
alter table ai_network.ai_identities
  alter column owner_user_id set not null;

-- Preserve operational history if a privileged operator attempts to remove an identity.
alter table ai_network.ai_identity_status_history
  drop constraint if exists ai_identity_status_history_identity_id_fkey;
alter table ai_network.ai_identity_status_history
  add constraint ai_identity_status_history_identity_id_fkey
  foreign key (identity_id)
  references ai_network.ai_identities(identity_id)
  on delete restrict;

alter table ai_network.ai_identity_versions
  drop constraint if exists ai_identity_versions_identity_id_fkey;
alter table ai_network.ai_identity_versions
  add constraint ai_identity_versions_identity_id_fkey
  foreign key (identity_id)
  references ai_network.ai_identities(identity_id)
  on delete restrict;

alter table ai_network.ai_identity_audit_logs
  drop constraint if exists ai_identity_audit_logs_identity_id_fkey;
alter table ai_network.ai_identity_audit_logs
  add constraint ai_identity_audit_logs_identity_id_fkey
  foreign key (identity_id)
  references ai_network.ai_identities(identity_id)
  on delete restrict;

-- Runtime can create/read/update identities but cannot physically erase identity rows
-- or remove the required name/profile records. Use status='retired' instead.
revoke delete, truncate
  on table ai_network.ai_identities,
            ai_network.ai_names,
            ai_network.ai_profiles
  from service_role;

-- Identity history is append-only for the application runtime.
revoke update, delete, truncate
  on table ai_network.ai_identity_status_history,
            ai_network.ai_identity_versions,
            ai_network.ai_identity_audit_logs
  from service_role;

comment on table ai_network.ai_identities is
  'Canonical AI identity registry. Runtime physical deletion is prohibited; use the audited lifecycle transition to retired.';
comment on table ai_network.ai_identity_status_history is
  'Append-only AI identity lifecycle history; identity deletion is restricted.';
comment on table ai_network.ai_identity_versions is
  'Append-only AI identity version snapshots; identity deletion is restricted.';
comment on table ai_network.ai_identity_audit_logs is
  'Append-only AI identity audit events; identity deletion is restricted.';

commit;
