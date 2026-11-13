#!/usr/bin/env bash
set -euo pipefail

: "${POSTGRES_CONTAINER:?POSTGRES_CONTAINER must be the disposable CI PostgreSQL container ID}"

psql_in_container() {
  docker exec -i "$POSTGRES_CONTAINER" psql -U postgres -d minglora_ai_test -v ON_ERROR_STOP=1 "$@"
}

psql_in_container < tests/postgres/ai-network-bootstrap.sql

migrations=(
  supabase/migrations/20261108210000_minglora_ai_bot_network_foundation.sql
  supabase/migrations/20261109200000_minglora_ai_bot_durable_task_queue.sql
  supabase/migrations/20261109213000_minglora_ai_provider_assignment_rpcs.sql
  supabase/migrations/20261109220000_minglora_ai_email_identity_rpcs.sql
  supabase/migrations/20261109230000_minglora_ai_identity_discovery.sql
  supabase/migrations/20261109240000_minglora_ai_social_follow_and_saved_searches.sql
  supabase/migrations/20261109250000_minglora_ai_public_profile_safety.sql
  supabase/migrations/20261109251000_minglora_ai_report_review_rpcs.sql
  supabase/migrations/20261109252000_minglora_ai_bot_autonomy_modes.sql
  supabase/migrations/20261112180000_minglora_ai_bot_hr_relational_persistence.sql
  supabase/migrations/20261112203000_minglora_ai_bot_hr_manager_integrity.sql
)

for migration in "${migrations[@]}"; do
  echo "Applying disposable PostgreSQL migration: $migration"
  psql_in_container < "$migration"
done

echo "Running Minglora AI identity/provider/email/HR PostgreSQL smoke tests."
psql_in_container < tests/postgres/ai-network-smoke.sql
echo "All staged Minglora AI migrations executed successfully in disposable PostgreSQL."
