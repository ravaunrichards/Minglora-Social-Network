# Reactions

**Current:** the API supports basic reaction toggling; the complete picker, counts and aggregation are incomplete.

**Ownership:** allowed types, one current reaction per user/post, idempotent toggles, count computation and notifications. Compute counts from persisted records; never accept counts from the client.