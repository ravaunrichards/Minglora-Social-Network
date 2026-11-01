-- MailHarbor stores private mailbox data in Minglora's shared Supabase database.
-- Direct access is limited to the trusted Minglora server's Postgres connection.
ALTER TABLE mailharbor_schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_inbound_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mail_realtime_tickets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  mailharbor_schema_migrations,
  mail_users,
  mail_email_verifications,
  mail_messages,
  mail_outbox,
  mail_inbound_events,
  mail_realtime_tickets
FROM anon, authenticated;

REVOKE ALL ON SEQUENCE
  mail_users_id_seq,
  mail_email_verifications_id_seq,
  mail_messages_id_seq,
  mail_outbox_id_seq
FROM anon, authenticated;
