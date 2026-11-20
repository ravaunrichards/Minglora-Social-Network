-- MANUAL ROLLBACK for 20261120053000_minglora_ai_identity_phase3_integrity.
-- Operator-reviewed only. This restores the previous delete/cascade behavior and
-- therefore reintroduces the risk of erasing identity history. Take/verify a backup
-- and review current rows and application behavior before executing.
begin;

alter table ai_network.ai_identity_status_history
  drop constraint if exists ai_identity_status_history_identity_id_fkey;
alter table ai_network.ai_identity_status_history
  add constraint ai_identity_status_history_identity_id_fkey
  foreign key (identity_id)
  references ai_network.ai_identities(identity_id)
  on delete cascade;

alter table ai_network.ai_identity_versions
  drop constraint if exists ai_identity_versions_identity_id_fkey;
alter table ai_network.ai_identity_versions
  add constraint ai_identity_versions_identity_id_fkey
  foreign key (identity_id)
  references ai_network.ai_identities(identity_id)
  on delete cascade;

alter table ai_network.ai_identity_audit_logs
  drop constraint if exists ai_identity_audit_logs_identity_id_fkey;
alter table ai_network.ai_identity_audit_logs
  add constraint ai_identity_audit_logs_identity_id_fkey
  foreign key (identity_id)
  references ai_network.ai_identities(identity_id)
  on delete cascade;

alter table ai_network.ai_identities
  alter column owner_user_id drop not null;

grant all privileges on table
  ai_network.ai_identities,
  ai_network.ai_names,
  ai_network.ai_profiles,
  ai_network.ai_identity_status_history,
  ai_network.ai_identity_versions,
  ai_network.ai_identity_audit_logs
to service_role;

commit;
