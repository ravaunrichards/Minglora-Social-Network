-- Minglora AI Network: cover the 31 verified foreign keys missing a child-side index.
-- Additive only: no table, row, RLS, grant, function, or runtime-control changes.
-- Index column order exactly matches each audited foreign-key column order.
create index if not exists ai_departments_created_by_user_id_idx
  on ai_network.ai_departments (created_by_user_id);

create index if not exists ai_departments_department_key_idx
  on ai_network.ai_departments (department_key);

create index if not exists ai_departments_parent_department_idx
  on ai_network.ai_departments (organization_id, parent_department_id);

create index if not exists ai_employment_history_actor_identity_id_idx
  on ai_network.ai_employment_history (actor_identity_id);

create index if not exists ai_employment_history_actor_user_id_idx
  on ai_network.ai_employment_history (actor_user_id);

create index if not exists ai_employment_history_org_employment_idx
  on ai_network.ai_employment_history (organization_id, employment_id);

create index if not exists ai_employment_records_application_idx
  on ai_network.ai_employment_records (organization_id, application_id);

create index if not exists ai_employment_records_assigned_by_user_id_idx
  on ai_network.ai_employment_records (assigned_by_user_id);

create index if not exists ai_employment_records_manager_idx
  on ai_network.ai_employment_records (organization_id, manager_employment_id);

create index if not exists ai_employment_records_position_idx
  on ai_network.ai_employment_records (organization_id, position_id);

create index if not exists ai_employment_records_replaces_idx
  on ai_network.ai_employment_records (organization_id, replaces_employment_id);

create index if not exists ai_identity_follows_reviewed_by_user_id_idx
  on ai_network.ai_identity_follows (reviewed_by_user_id);

create index if not exists ai_organizations_created_by_user_id_idx
  on ai_network.ai_organizations (created_by_user_id);

create index if not exists ai_positions_created_by_user_id_idx
  on ai_network.ai_positions (created_by_user_id);

create index if not exists ai_positions_position_key_idx
  on ai_network.ai_positions (position_key);

create index if not exists ai_provider_assignment_history_actor_user_id_idx
  on ai_network.ai_provider_assignment_history (actor_user_id);

create index if not exists ai_recruitment_applications_vacancy_idx
  on ai_network.ai_recruitment_applications (organization_id, vacancy_id);

create index if not exists ai_recruitment_applications_reviewed_by_user_id_idx
  on ai_network.ai_recruitment_applications (reviewed_by_user_id);

create index if not exists ai_recruitment_applications_submitted_by_user_id_idx
  on ai_network.ai_recruitment_applications (submitted_by_user_id);

create index if not exists ai_recruitment_history_actor_user_id_idx
  on ai_network.ai_recruitment_history (actor_user_id);

create index if not exists ai_recruitment_history_application_idx
  on ai_network.ai_recruitment_history (organization_id, application_id);

create index if not exists ai_recruitment_history_vacancy_idx
  on ai_network.ai_recruitment_history (organization_id, vacancy_id);

create index if not exists ai_recruitment_vacancies_created_by_user_id_idx
  on ai_network.ai_recruitment_vacancies (created_by_user_id);

create index if not exists ai_recruitment_vacancies_department_idx
  on ai_network.ai_recruitment_vacancies (organization_id, department_id);

create index if not exists ai_recruitment_vacancies_position_idx
  on ai_network.ai_recruitment_vacancies (organization_id, position_id);

create index if not exists ai_task_approvals_owner_task_idx
  on ai_network.ai_task_approvals (owner_user_id, task_id);

create index if not exists ai_task_approvals_reviewed_by_user_id_idx
  on ai_network.ai_task_approvals (reviewed_by_user_id);

create index if not exists ai_task_events_actor_user_id_idx
  on ai_network.ai_task_events (actor_user_id);

create index if not exists ai_task_queue_approved_by_user_id_idx
  on ai_network.ai_task_queue (approved_by_user_id);

create index if not exists ai_task_queue_created_by_user_id_idx
  on ai_network.ai_task_queue (created_by_user_id);

create index if not exists ai_task_queue_organization_id_idx
  on ai_network.ai_task_queue (organization_id);
