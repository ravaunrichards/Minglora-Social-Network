-- Connect each MailHarbor mailbox to one authenticated Minglora member.
ALTER TABLE mail_users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE mail_users ADD COLUMN IF NOT EXISTS minglora_user_id TEXT;
ALTER TABLE mail_users ADD COLUMN IF NOT EXISTS minglora_username VARCHAR(30);
CREATE UNIQUE INDEX IF NOT EXISTS mail_users_minglora_user_idx ON mail_users(minglora_user_id);
