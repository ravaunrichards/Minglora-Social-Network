# Database functions

Use stored functions only for invariants that must be atomic under concurrency, such as relationship transitions, reaction upserts or outbox insertion. Validate inputs, use least privilege, and test duplicate requests, conflicting writes and rollback. No application behavior is implemented by this directory yet.