# Database access policies

Application authorization and database row-level security must agree. The schema migration is not sufficient for direct client access; no browser or mobile client should use privileged database credentials.

Before rollout, define and test row-level policies for each table using the chosen identity model. Include allowed and denied cases for anonymous viewers, owners, unrelated users, blocked users, group members and admins. Deny by default.