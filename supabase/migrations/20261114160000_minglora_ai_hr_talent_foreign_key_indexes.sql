-- Cover foreign keys on the additive AI HR talent tables.
-- Safe for existing/empty data. Indexes are additive and idempotent.

create index if not exists ai_performance_reviews_reviewer_user_idx
  on ai_network.ai_performance_reviews (reviewer_user_id);
create index if not exists ai_performance_reviews_finalized_by_user_idx
  on ai_network.ai_performance_reviews (finalized_by_user_id);

create index if not exists ai_performance_review_history_actor_user_idx
  on ai_network.ai_performance_review_history (actor_user_id);
create index if not exists ai_performance_review_history_review_fk_idx
  on ai_network.ai_performance_review_history (organization_id, review_id);

create index if not exists ai_succession_plans_role_position_fk_idx
  on ai_network.ai_succession_plans (organization_id, role_position_id);
create index if not exists ai_succession_plans_incumbent_employment_fk_idx
  on ai_network.ai_succession_plans (organization_id, incumbent_employment_id);
create index if not exists ai_succession_plans_successor_employment_fk_idx
  on ai_network.ai_succession_plans (organization_id, successor_employment_id);
create index if not exists ai_succession_plans_owner_user_idx
  on ai_network.ai_succession_plans (owner_user_id);
create index if not exists ai_succession_plans_created_by_user_idx
  on ai_network.ai_succession_plans (created_by_user_id);

create index if not exists ai_succession_plan_history_actor_user_idx
  on ai_network.ai_succession_plan_history (actor_user_id);
create index if not exists ai_succession_plan_history_plan_fk_idx
  on ai_network.ai_succession_plan_history (organization_id, plan_id);

create index if not exists ai_employee_promotions_identity_fk_idx
  on ai_network.ai_employee_promotions (identity_id);
create index if not exists ai_employee_promotions_previous_department_fk_idx
  on ai_network.ai_employee_promotions (organization_id, previous_department_id);
create index if not exists ai_employee_promotions_previous_position_fk_idx
  on ai_network.ai_employee_promotions (organization_id, previous_position_id);
create index if not exists ai_employee_promotions_new_department_fk_idx
  on ai_network.ai_employee_promotions (organization_id, new_department_id);
create index if not exists ai_employee_promotions_new_position_fk_idx
  on ai_network.ai_employee_promotions (organization_id, new_position_id);
create index if not exists ai_employee_promotions_supporting_review_fk_idx
  on ai_network.ai_employee_promotions (organization_id, supporting_review_id);
create index if not exists ai_employee_promotions_promoted_by_user_idx
  on ai_network.ai_employee_promotions (promoted_by_user_id);
