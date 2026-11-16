-- Minglora AI Network: cover 24 additional child-side foreign-key indexes
-- introduced by the later team, delegation, memory and scheduling tables.
-- This is additive and retry-safe; it does not alter data, table definitions,
-- RLS, grants, RPCs, runtime controls or worker activation.
CREATE INDEX IF NOT EXISTS ai_fk_ai_delegation_events_actor_identity_id_idx
  ON ai_network.ai_delegation_events (actor_identity_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_delegation_events_actor_user_id_idx
  ON ai_network.ai_delegation_events (actor_user_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_delegation_events_delegation_grant_id_idx
  ON ai_network.ai_delegation_events (delegation_grant_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_delegation_grants_created_by_user_id_idx
  ON ai_network.ai_delegation_grants (created_by_user_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_delegation_grants_grantee_identity_id_idx
  ON ai_network.ai_delegation_grants (grantee_identity_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_delegation_grants_grantor_identity_id_idx
  ON ai_network.ai_delegation_grants (grantor_identity_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_identity_locations_identity_id_idx
  ON ai_network.ai_identity_locations (identity_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_identity_owners_identity_id_idx
  ON ai_network.ai_identity_owners (identity_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_memory_entries_identity_id_idx
  ON ai_network.ai_memory_entries (identity_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_recruitment_vacancies_owner_user_id_idx
  ON ai_network.ai_recruitment_vacancies (owner_user_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_task_queue_delegated_from_identity_id_idx
  ON ai_network.ai_task_queue (delegated_from_identity_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_task_queue_delegation_grant_id_idx
  ON ai_network.ai_task_queue (delegation_grant_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_task_schedule_events_actor_user_id_idx
  ON ai_network.ai_task_schedule_events (actor_user_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_task_schedule_events_schedule_id_idx
  ON ai_network.ai_task_schedule_events (schedule_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_task_schedule_events_task_id_idx
  ON ai_network.ai_task_schedule_events (task_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_task_schedules_created_by_user_id_idx
  ON ai_network.ai_task_schedules (created_by_user_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_task_schedules_identity_id_idx
  ON ai_network.ai_task_schedules (identity_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_task_schedules_last_enqueued_task_id_idx
  ON ai_network.ai_task_schedules (last_enqueued_task_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_team_events_actor_user_id_idx
  ON ai_network.ai_team_events (actor_user_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_team_events_identity_id_idx
  ON ai_network.ai_team_events (identity_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_team_events_team_id_idx
  ON ai_network.ai_team_events (team_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_team_memberships_added_by_user_id_idx
  ON ai_network.ai_team_memberships (added_by_user_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_teams_created_by_user_id_idx
  ON ai_network.ai_teams (created_by_user_id);
CREATE INDEX IF NOT EXISTS ai_fk_ai_teams_organization_id_idx
  ON ai_network.ai_teams (organization_id);
