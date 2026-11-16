
-- Keep the dedicated runtime role non-login until its password is set
-- privately and the matching connection URL is added to the hosting secret store.
BEGIN;
ALTER ROLE minglora_runtime NOLOGIN;
COMMIT;
