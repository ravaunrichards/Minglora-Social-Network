-- Remove retired in-app mailbox records from Minglora's shared runtime state.
-- The mailbox tables and APIs were held in the JSONB state document rather than
-- separate relational tables. Remove only those four module-owned collections.

update public.minglora_runtime_state
set state = state - array[
      'mailboxes',
      'mailMessages',
      'mailOAuthStates',
      'mailExternalAccounts'
    ]::text[],
    revision = revision + 1,
    updated_at = now()
where state_key = 'primary'
  and state ?| array[
    'mailboxes',
    'mailMessages',
    'mailOAuthStates',
    'mailExternalAccounts'
  ]::text[];
