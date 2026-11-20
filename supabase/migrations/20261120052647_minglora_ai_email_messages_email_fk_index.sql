-- Phase 3 FK index completion: supports email-message deletion checks and joins by email_id.
-- Additive and data-preserving.
begin;
create index if not exists ai_email_messages_email_id_idx
  on ai_network.ai_email_messages (email_id);
commit;
