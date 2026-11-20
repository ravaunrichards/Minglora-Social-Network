-- Manual rollback for 20261120052647_minglora_ai_email_messages_email_fk_index.sql.
-- This only removes the supporting FK index; it does not change or delete rows.
begin;
drop index if exists ai_network.ai_email_messages_email_id_idx;
commit;
