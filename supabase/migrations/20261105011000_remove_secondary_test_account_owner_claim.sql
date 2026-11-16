-- Larry's separate personal/testing account must not carry a platform-owner JWT claim.
-- Preserve profile verification metadata and the account itself.
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) - 'role'
WHERE id = '28e1df97-3fe1-488e-bb84-bdc353c58653'::uuid
  AND lower(email) = 'larryjones2019ersky@gmail.com'
  AND raw_app_meta_data ? 'role';
