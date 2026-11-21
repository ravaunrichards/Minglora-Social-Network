-- Cover the foreign-key columns added by Phase 8.
-- These indexes support joins, referential checks and parent-row updates.

create index if not exists ai_employee_permission_grants_granted_by_idx
  on ai_network.ai_employee_permission_grants(granted_by_user_id);
create index if not exists ai_employee_permission_grants_revoked_by_idx
  on ai_network.ai_employee_permission_grants(revoked_by_user_id);

create index if not exists ai_employee_task_assignments_assigned_by_idx
  on ai_network.ai_employee_task_assignments(assigned_by_user_id);
create index if not exists ai_employee_task_assignments_org_employment_fk_idx
  on ai_network.ai_employee_task_assignments(organization_id,employment_id);
create index if not exists ai_employee_task_assignments_org_fk_idx
  on ai_network.ai_employee_task_assignments(organization_id);
create index if not exists ai_employee_task_assignments_permission_fk_idx
  on ai_network.ai_employee_task_assignments(owner_user_id,permission_grant_id);

create index if not exists ai_team_messages_author_identity_idx
  on ai_network.ai_team_messages(author_identity_id);
create index if not exists ai_team_messages_author_user_idx
  on ai_network.ai_team_messages(author_user_id);
create index if not exists ai_team_messages_org_author_employment_idx
  on ai_network.ai_team_messages(organization_id,author_employment_id);
create index if not exists ai_team_messages_org_idx
  on ai_network.ai_team_messages(organization_id);
create index if not exists ai_team_messages_reply_target_idx
  on ai_network.ai_team_messages(reply_to_message_id);

create index if not exists ai_employee_reports_org_employment_fk_idx
  on ai_network.ai_employee_reports(organization_id,employment_id);
create index if not exists ai_employee_reports_org_fk_idx
  on ai_network.ai_employee_reports(organization_id);
create index if not exists ai_employee_reports_org_manager_fk_idx
  on ai_network.ai_employee_reports(organization_id,manager_employment_id);
create index if not exists ai_employee_reports_team_fk_idx
  on ai_network.ai_employee_reports(owner_user_id,team_id);
create index if not exists ai_employee_reports_task_fk_idx
  on ai_network.ai_employee_reports(owner_user_id,task_id);
create index if not exists ai_employee_reports_reviewed_by_idx
  on ai_network.ai_employee_reports(reviewed_by_user_id);

create index if not exists ai_workforce_events_actor_identity_idx
  on ai_network.ai_workforce_events(actor_identity_id);
create index if not exists ai_workforce_events_actor_user_idx
  on ai_network.ai_workforce_events(actor_user_id);
create index if not exists ai_workforce_events_org_employment_fk_idx
  on ai_network.ai_workforce_events(organization_id,employment_id);
create index if not exists ai_workforce_events_org_fk_idx
  on ai_network.ai_workforce_events(organization_id);
create index if not exists ai_workforce_events_message_fk_idx
  on ai_network.ai_workforce_events(owner_user_id,message_id);
create index if not exists ai_workforce_events_report_fk_idx
  on ai_network.ai_workforce_events(owner_user_id,report_id);
create index if not exists ai_workforce_events_task_fk_idx
  on ai_network.ai_workforce_events(owner_user_id,task_id);
create index if not exists ai_workforce_events_team_fk_idx
  on ai_network.ai_workforce_events(owner_user_id,team_id);
